// api/stream.js — same-origin media relay for playback (Vercel serverless).
//
// The web app has no backend: native ZXC/vidstuck playback is relayed through
// here by src/api/nativeHlsLoader.js so CORS/bot-walls don't apply and provider
// URL rotation stays a server concern. Bytes are proxied one request at a time;
// there is no download-assembly path anymore.
//
// Actions (POST JSON):
//   resolvezxc     { type, id, season?, episode?, server? } -> { source, variants, audioTracks }
//   zxcintro       { imdbId, tmdbId, season?, episode? } -> { ok, introEndSeconds|null, creditsStartSeconds|null, confidence|null }
//   playlist       { playlistUrl, refUrl? }              -> raw m3u8 text (referer-supplied)
//   segment        { url, refUrl?, range: {start,max} }  -> bytes (octet-stream)
//
// Retired actions (answer a clean 400 bad-action):
//   · `resolve` — the old embed-download resolver. Every embed host it served
//     (CineSrc, VidCore, 2embed, peachify, vidup and friends) was retired with
//     iframe playback; only the ZXC native path is left.
//   · `resolvevidcore` (Server 5, VidRack) — removed 2026-10-04: every ladder
//     row was AES-128 behind an api.dlproxy.com key host that 403s us, fatal to
//     hls.js.
//   · `manifest` — redundant now that hls.js parses playlists itself.
//
// Byte transport notes:
//   · Vercel caps a function's request/response body at ~4.5MB, so `segment`
//     fetches ONE URL AT A TIME in bounded Range chunks (≤ ~3.5MB each); the
//     client loops until the server's `x-streamly-more` header says the file
//     ended.
//
// Security:
//   · EVERY upstream request — redirects included — is DNS-resolved and every
//     resolved address must be public (server/ssrf.js; this closes the
//     decimal/hex-IP literal bypass like "http://2130706433/" that a
//     string-based hostname blocklist never sees).
//   · `playlist`/`segment` are further gated on the issued-host registry below
//     so this public endpoint cannot be used as an open proxy or SSRF tunnel:
//     only hosts a resolvezxc actually minted, hosts this instance has already
//     relayed, or the two trusted CDN origins are allowed.
//   · Response size caps bound bandwidth (a runaway "playlist" can't pull the
//     whole internet through us).
//   · Nothing is persisted; the function is a stateless pipe.

import crypto from "node:crypto";

import { parseMasterPlaylist } from "../src/utils/hlsPlaylist.js";
import { parseMpd, buildMasterPlaylist, buildMediaPlaylist } from "../server/dashToHls.js";
import { rateLimit, tooManyRequests, clientIp } from "../server/rateLimit.js";
import { countUsage } from "../server/usage.js";
import { assertPublicDestination } from "../server/ssrf.js";
import { logWarn, logError } from "../src/utils/debugLogger.js";
import {
  json,
  fetchUpstream,
  fetchRangeChunk,
  RANGE_CHUNK_BYTES,
} from "../server/net.js";

export const config = { maxDuration: 60 };

// Request bodies are tiny (an action + a URL + a range). Anything near this is
// garbage; refusing it before any relaying keeps the function from acting as a
// free proxy pipe for arbitrary payloads.
const MAX_REQUEST_BODY_BYTES = 512 * 1024;

/* NetMirror (net27.cc family) — REMOVED (user order, 2024-09). net27's video
   layer is per-IP 429-gated (bcdnxw CDN) and its auth is a Cloudflare
   challenge; the canonical-mirror family (net52/net51) mint real video URLs
   only for a per-session token issued behind an interactive challenge. No
   legitimate egress can stream them. The resolver, client provider, CSP
   entries and player branches were removed; CineSrc (iframe sources) |
   VidCore | Videasy | VidVid remain the playback paths. */

/* ── ZXC / vidstuck third-party provider ────────────────────────────────
   zxcstream.icu is a thin shell around a vidstuck.xyz JW Player embed; every
   real stream is behind vidstuck's own two-step backend, so we mint and read
   it server-side exactly like VidCore and serve the bytes ourselves.

   The contract, read off the shipped client chunk (vidstuck's `queryFn`):

1. `POST /backend/fuckoffniggawtaf` with
      `{tmdbId, media_type, path[, season, episode]}` -> `{ token, ts }`. This
      endpoint is SELF-ORIGIN ONLY: a correct body with any other (or missing)
      `Origin` header answers 500 "Internal Server Error" — verified across a
      header matrix, where only `Origin: https://vidstuck.xyz` returned 200. So
      the origin we send is not cosmetic; it is the whole gate.

      THE PATH IS NOT STABLE, and each rename killed every row at once (they all
      share this one mint), so it lives in a named constant and the discover
      method is recorded below:

        2026-10-03  `/backend/meow`  -> `/backend/fuckyou`
        2026-10-05  `/backend/fuckyou` -> `/backend/fuckoffniggawtf`
        2026-10-06  `/backend/fuckoffniggawtf` -> `/backend/fuckoffniggawtaf`

      `meow` was never an endpoint at all: it is one of their SERVER names
      ("Ursa", `path=meow`). A 404 here fails the mint, so all four servers
      report "no playable source" simultaneously — which reads like a network
      outage but is one renamed string.

      HOW TO RE-DISCOVER after the next rename (no guessing): both dead paths
      answer the Next.js HTML 404 page, and `/backend/servers/{path}` stays
      400 "missing params", so neither is a usable signal. Fetch the embed page
      for the title and read the current path off the shipped client chunk:
        GET /embed/movie/<tmdbId>  ->  extract src=".../_next/static/chunks/*.js"
        grep those chunks for "/backend/" -> the mint is the single POST
      Candidate found 2026-10-05: `/backend/fuckoffniggawtf`. Verified live
      before changing this line: old path 404 (HTML page), new path 200
      `{token, ts}`, and centaurus/andromeda/atlas/meow all answer
      `success=true` with a 200 manifest. (`milkyway` still answers
      `success=true` there too, but its manifest 403s, so it is retired.)
      Candidate found 2026-10-06: `/backend/fuckoffniggawtaf` (one `a`
      inserted before the `f`), read off the shipped chunks of
      `GET /embed/movie/27205` by the same procedure. Verified live before
      changing this line: old path 404, new path 200
      `{"token":"379cb…","ts":1791304881605}`.

   2. `GET /backend/servers/{path}?…` with a dozen OBFUSCATED query names
      (hex strings, mapped below) plus the token/ts from step 1, and optionally
      `dubCode`/`dubType` to pick an audio language. Answers
      `{ success, links: [{ type: "hls"|"dash", link, resolution }], dubs: [...] }`.
      Every `link` is AES-256-CBC encrypted with a hardcoded passphrase using
      CryptoJS's OpenSSL envelope (`Salted__` + 8-byte salt, key/IV derived by
      EVP_BytesToKey with MD5 and ONE round). `decryptZxcLink` below is that
      derivation, and it is the only reason this works — the ciphertext is
      opaque without it.

   The four servers, and why they need different handling:
     · andromeda / centaurus -> `type: "dash"`. MPD, not HLS. Transcoded to an
       fMP4 HLS ladder by server/dashToHls.js (manifest only — no media bytes
       are re-encoded, the segments are already CMAF).
     · atlas  -> `type: "hls"` behind vidstuck's own `/backend/servers/atlas/edge`
       relay, so its relative `link` must be resolved against the origin.
     · meow    -> `type: "hls"` direct off a Cloudflare worker. This row is
       "Ursa" upstream and REPLACES the retired `milkyway`, whose manifest answers
       403 through this function and so could never play.

   MULTI-AUDIO is centaurus-only (`dubSupport`), and it is per-MANIFEST, not
   per-adaptation-set: `dubCode`/`dubType` swap which language the returned MPD's
   single audio AdaptationSet carries. That is why dubs ship as SIBLING master
   URLs (`audioTracks: [{label, uri}]`, the sibling-stream convention the player already
   implements) instead of `#EXT-X-MEDIA` rows in one master.

   Honesty gates: the advertised `dubs`
   list overstates reality. Verified live against tmdb 1101383 — `hi` and `ta`
   are listed but their MPDs answer HTTP 427 ("Fetch failed"), and the one
   subtitle row (`es`, `dubType=1`) answers "No sources found". So every dub is
   individually minted and its manifest fetched before it may reach the Audio
   menu; a dub that cannot produce an MPD is dropped, never listed. */

const ZXC_ORIGIN = "https://vidstuck.xyz";
/* THE MINT PATH. Read off the shipped embed chunk, NOT guessed, and upstream
   renames it periodically (see the contract note above for the rename history
   and for the re-discovery procedure). Every row shares this one call, so when
   it 404s all four servers fail together and the player reports "no playable
   source" for every option at once. That is the signature to recognise: a
   simultaneous four-row failure is almost always this constant, never four
   coincidental provider outages. */
const ZXC_MINT_PATH = "/backend/fuckoffniggawtaf";
/* Upstream's own server list, read off the CURRENT shipped embed chunk
   (module 53557 `gN.SERVERS`, re-verified 2026-10-05): Orion "Multi Audio
   Support" (`dubSupport`), Andromeda "Smooth Playback & HD", Centaurus
   "Multi Audio Support" (`dubSupport`), Atlas "Alternative", and Ursa
   "Alternative" — whose PATH is literally `meow`. `milkyway` is GONE: it is
   no longer in their list and its manifest answers 403 through our function
   ("manifest unreadable: Upstream 403"), so it was dropped rather than left
   as a row that can never play. An older chunk variant listed only
   andromeda/centaurus/atlas/milkyway (no orion) — the roster ROTATES, so a
   simultaneous all-row failure is the mint path, but a single-row failure
   can be a rotated server name: re-read `gN.SERVERS` first. */
const ZXC_SERVERS = ["andromeda", "centaurus", "atlas", "meow", "orion"];
// The servers that answer with a DASH manifest, and the ones that carry dubs
// (both `dubSupport` rows in the current chunk).
const ZXC_DASH_SERVERS = new Set(["andromeda", "centaurus"]);
const ZXC_DUB_SERVERS = new Set(["centaurus", "orion"]);

/* The obfuscated parameter names the client sends. Read straight off the
   shipped bundle's `uo/up/ug/uf/uh/ul/uu/ud/uc/um` constants — renaming any of
   them makes the request fail closed. */
const ZXC_PARAM = {
  tmdbId: "a7f39c821d604e5b9c71f36e1547b",
  mediaType: "c285f91ab306d28147a35632e816b",
  path: "6b491e7253ad84d392e7561a9384c",
  season: "d8427b59ce30684a2f957c3613e85b",
  episode: "91c6e4a728503d1f785c92346b713d",
  ts: "61d9a5274c8e3b29afd6384c291e6",
  token: "c492f7a183d6502b1e7436c538a716d",
  title: "5e28c9147a306d1e829f3674b392a1",
  year: "b731e6c94f08269d725f8341c306e",
  date: "e164932c50216a39e5814b3027",
};
const ZXC_LINK_KEY = "7f4c9e2a81d63b05c4f7a9e8126d3b50e1a8c7f23d9465ab0c6e9f1d4a7b832c";
const ZXC_IMDB_PARAM = "f35a8c19d674b3265e871c4933a725f";
const ZXC_LATEST_DATE_PARAM = "e16932c543416ad739e5814b3027";

// Our own playlist marker. A generated playlist has to be ADDRESSABLE, because
// hls.js asks for it by URL (the loader posts `{action:"playlist", playlistUrl}`)
// and the download sheet asks the same way. Rather than mint opaque signed state
// we store, the marker rides ON the provider's own servers URL: the URL replays
// the exact request, the handler re-mints a fresh token, and the function stays
// the stateless pipe it documents itself to be.
const ZXC_MARKER = { marker: "zx", value: "streamly", view: "zv", rep: "zr" };
const ZXC_VIEW_MASTER = "master";
const ZXC_VIEW_MEDIA = "media";

/* Issued-host registry — the fine-grained gate behind the open-relay fix.
   `playlist`/`segment` are public, so without a gate they relay ANY public URL
   (a free open proxy for anonymous callers), and SSRF resolution alone cannot
   see that. Resolution: a host is allowed when
     · its REGISTRABLE DOMAIN (last two labels — which already groups rotating
       sibling subdomains like cdn1.x/cdn2.x into one admission) is in the
       registry, or
     · it is one of the two always-trusted origins:
         vidstuck.xyz   — the ZXC provider origin itself (every marker/master/
                          media playlist URL we generate lives there)
         b-cdn.net      — a dedicated media CDN platform whose subdomains
                          rotate per title
   The registry is populated by:
     · `resolvezxc` issuing EVERY upstream host it touches (decrypted links,
       the DASH MPD host, and hosts referenced inside parsed playlists/MPDs),
     · a successful `playlist`/`segment` relay re-issuing the host it just
       served (self-bootstrap), so provider CDN rotation that only shows up
       mid-session is admitted the moment the client actually reaches it.
   Registration holds for a bounded TTL and is purely in-memory: other warm
   instances are cold — a fresh instance admits nothing but the two trusted
   origins until it has served its first resolve, which is exactly the fence we
   want (an open relay is a many-instances problem, so it must right by every
   instance's own memory, not by a global allowlist that can never keep up). */
const ISSUED_HOST_TTL_MS = 30 * 60_000;
const ALWAYS_ALLOWED_HOST_ROOTS = new Set(["vidstuck.xyz", "b-cdn.net"]);
const issuedHostRoots = new Map(); // registrable domain -> issuedAt
const issuedHostNames = new Map(); // exact hostname -> issuedAt

function registrableDomain(hostname) {
  const labels = String(hostname || "").toLowerCase().split(".");
  return labels.length >= 2 ? labels.slice(-2).join(".") : labels[0] || "";
}

function issueHost(rawUrl) {
  let hostname;
  try {
    hostname = new URL(String(rawUrl || "")).hostname.toLowerCase();
  } catch {
    return;
  }
  const now = Date.now();
  issuedHostNames.set(hostname, now);
  issuedHostRoots.set(registrableDomain(hostname), now);
}

/* Admit every host a parsed m3u8/MPD body references. */
function issueHostsInText(text) {
  const re = /https?:\/\/[^\s"'<>\\]+/gi;
  let m;
  while ((m = re.exec(String(text || ""))) !== null) issueHost(m[0]);
}

function pruneIssuedHosts() {
  const now = Date.now();
  for (const [host, at] of issuedHostRoots) if (now - at > ISSUED_HOST_TTL_MS) issuedHostRoots.delete(host);
  for (const [host, at] of issuedHostNames) if (now - at > ISSUED_HOST_TTL_MS) issuedHostNames.delete(host);
}

function isHostIssued(rawUrl) {
  let hostname;
  try {
    hostname = new URL(String(rawUrl || "")).hostname.toLowerCase();
  } catch {
    return false;
  }
  const root = registrableDomain(hostname);
  if (ALWAYS_ALLOWED_HOST_ROOTS.has(root)) return true;
  pruneIssuedHosts();
  if (issuedHostRoots.has(root) || issuedHostNames.has(hostname)) return true;
  return false;
}

/* MPD cache: dedupe upstream burst during playlist load */
const MPD_CACHE_TTL_MS = 30_000;
const MPD_CACHE_MAX = 60;
const mpdCache = new Map();

function zxcMpdCacheKey(meta, dubCode, dubType) {
  // season/episode are part of the identity: a TV key that omitted them would
  // serve the S1E1 MPD to the S1E3 request (same tmdbId/server/shape) and the
  // wrong episode would play with byte-identical URLs — undetectable at the
  // manifest layer. Movies carry empty strings for both, which leaves their
  // dedupe behaviour unchanged.
  return [meta.type, meta.tmdbId, meta.server, meta.season || "", meta.episode || "", dubCode || "", dubType || ""].join("|");
}

function takeMpdCache(key) {
  const hit = mpdCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > MPD_CACHE_TTL_MS) {
    mpdCache.delete(key); return null;
  }
  return hit.result;
}

function setMpdCache(key, result) {
  mpdCache.set(key, { at: Date.now(), result });
  while (mpdCache.size > MPD_CACHE_MAX) {
    const oldest = mpdCache.keys().next().value;
    mpdCache.delete(oldest);
  }
}

export function clearZxcMpdCache() { mpdCache.clear(); }

/* Title metadata cache: /backend/tmdb/details is the same for every server
   row (same tmdb ID), so resolvezxc calls for the other four servers after the
   first all re-fetch identical data. A 30s TTL mirrors the MPD cache: enough to
   ride a playlist-load burst, short enough to pick up a re-release date. */
const ZXC_TITLE_TTL_MS = 30_000;
const ZXC_TITLE_CACHE_MAX = 60;
const titleMetaCache = new Map();

export function clearZxcTitleMetaCache() { titleMetaCache.clear(); }

function zxcTitleMetaKey({ type, tmdbId }) {
  return `${type}|${tmdbId}`;
}

// How many provider links we will probe per plain-HLS server. atlas/meow
// hand back 2-3 links that are alternate encodes or mirrors of ONE runtime, not
// a quality ladder, so we pick a single one — the bound only stops a
// pathological payload from fanning out without limit.
const ZXC_MAX_HLS_LINKS = 4;

function zxcEmbedPath({ type, tmdbId, season, episode }) {
  if (type === "tv") return `/embed/tv/${tmdbId}/${encodeURIComponent(season || "1")}/${encodeURIComponent(episode || "1")}`;
  return `/embed/movie/${tmdbId}`;
}

function zxcHeaders(refererPath, { json: asJson = false } = {}) {
  const headers = {
    origin: ZXC_ORIGIN,
    referer: `${ZXC_ORIGIN}${refererPath}`,
    accept: asJson ? "application/json, text/plain, */*" : "*/*",
  };
  if (asJson) headers["content-type"] = "application/json";
  return headers;
}

/* CryptoJS.AES.decrypt(ciphertext, passphrase).toString(enc.Utf8) — the
   OpenSSL envelope: "Salted__" + 8-byte salt, then AES-256-CBC with key and IV
   derived from passphrase+salt by iterated MD5 (EVP_BytesToKey, 1 round).
   Node has no OpenSSL-format EVP_BytesToKey, so it is spelled out here; a raw
   ciphertext (no salt header) is passed through unchanged. */
function decryptZxcLink(ciphertext, passphrase) {
  const raw = Buffer.from(String(ciphertext || ""), "base64");
  if (raw.length === 0) throw new Error("empty link ciphertext");
  if (raw.subarray(0, 8).toString("latin1") !== "Salted__") return raw.toString("utf8");

  const salt = raw.subarray(8, 16);
  const body = raw.subarray(16);
  const chunks = [];
  let previous = Buffer.alloc(0);
  let collected = 0;
  // 32-byte key + 16-byte IV, MD5 digest per block.
  while (collected < 48) {
    const digest = crypto.createHash("md5").update(previous).update(passphrase, "utf8").update(salt).digest();
    chunks.push(digest);
    previous = digest;
    collected += digest.length;
  }
  const keyMaterial = Buffer.concat(chunks);
  const decipher = crypto.createDecipheriv("aes-256-cbc", keyMaterial.subarray(0, 32), keyMaterial.subarray(32, 48));
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/* Title/year/date/imdbId are MANDATORY upstream, not advisory. Measured across
   a field matrix on movie 27205 (2026-10-05): `/backend/servers/{path}` answers
   400 "missing params" unless title AND year AND date are all present. Dropping
   any ONE of the three fails centaurus, atlas and meow; `title+date` without
   `year` still passes centaurus but fails atlas/meow, so the only safe reading
   is that all three are required.

   That inverts the old behaviour, which swallowed a failed lookup and returned
   blanks on the belief that blanks were harmless. They were not: a blank title
   is an instant 400, so a single flaky TMDB call turned into "no playable
   source" on every server, with the real cause nowhere in the message. The
   lookup now propagates, and `imdbId` stays optional (an absent imdb_id changes
   nothing upstream). `title` is read for BOTH types on purpose — this endpoint
   normalises a series' `name` into `title`, so the old movie-only concern does
   not apply here. For TV, `last_air_date` is also carried as `latestDate`
   because the shipped client sends it and episode freshness depends on it. */
async function zxcTitleMeta({ type, tmdbId, refererPath }) {
  const cacheKey = zxcTitleMetaKey({ type, tmdbId });
  const cached = titleMetaCache.get(cacheKey);
  if (cached && Date.now() - cached.at < ZXC_TITLE_TTL_MS) return cached.meta;
  const text = await fetchUpstream(`${ZXC_ORIGIN}/backend/tmdb/details/${type}/${tmdbId}?language=en-US`, {
    referer: `${ZXC_ORIGIN}${refererPath}`,
    extraHeaders: zxcHeaders(refererPath, { json: true }),
  });
  const data = JSON.parse(text);
  const date = String(data?.release_date || data?.last_air_date || "");
  const meta = {
    title: String(data?.title || ""),
    date,
    year: /^\d{4}/.test(date) ? date.slice(0, 4) : "",
    imdbId: String(data?.imdb_id || ""),
  };
  if (type === "tv") meta.latestDate = String(data?.last_air_date || "");
  // Fail here, loudly, rather than at the servers endpoint 400 lines below with a
  // message that names neither the cause nor the fix. A blank field is a hard
  // upstream rejection, so "no metadata" and "no playable source" must not be
  // the same error the player sees.
  const missing = ["title", "year", "date"].filter((k) => !meta[k]);
  if (missing.length > 0) {
    throw new Error(`title metadata incomplete (missing ${missing.join(", ")}) for tmdb ${tmdbId}`);
  }
  titleMetaCache.set(cacheKey, { at: Date.now(), meta });
  while (titleMetaCache.size > ZXC_TITLE_CACHE_MAX) {
    const oldest = titleMetaCache.keys().next().value;
    titleMetaCache.delete(oldest);
  }
  return meta;
}

/* Step 1: mint a token. Fails closed on anything but a 200 with a token. */
async function zxcMint({ type, tmdbId, server, season, episode, refererPath }) {
  const payload = {
    [ZXC_PARAM.tmdbId]: tmdbId,
    [ZXC_PARAM.mediaType]: type,
    [ZXC_PARAM.path]: server,
  };
  if (type === "tv") {
    payload[ZXC_PARAM.season] = String(season || "");
    payload[ZXC_PARAM.episode] = String(episode || "");
  }
  const text = await fetchUpstream(`${ZXC_ORIGIN}${ZXC_MINT_PATH}`, {
    method: "POST",
    body: JSON.stringify(payload),
    referer: `${ZXC_ORIGIN}${refererPath}`,
    extraHeaders: zxcHeaders(refererPath, { json: true }),
  });
  const data = JSON.parse(text);
  if (!data?.token || data?.ts === undefined) throw new Error("token mint returned no token");
  return { token: String(data.token), ts: String(data.ts) };
}

/* Step 2: the servers endpoint. `link` is decrypted here so nothing upstream of
   this function ever sees ciphertext. */
async function zxcServerLinks(meta, { server, dubCode, dubType } = {}) {
  const { token, ts } = await zxcMint({ ...meta, server });
  const query = new URLSearchParams({
    [ZXC_PARAM.tmdbId]: meta.tmdbId,
    [ZXC_PARAM.path]: server,
    [ZXC_PARAM.mediaType]: meta.type,
    [ZXC_PARAM.ts]: ts,
    [ZXC_PARAM.token]: token,
    [ZXC_PARAM.title]: meta.title,
    [ZXC_PARAM.year]: meta.year,
    [ZXC_PARAM.date]: meta.date,
  });
  if (meta.type === "tv") {
    query.set(ZXC_PARAM.season, String(meta.season || ""));
    query.set(ZXC_PARAM.episode, String(meta.episode || ""));
    if (meta.latestDate) query.set(ZXC_LATEST_DATE_PARAM, meta.latestDate);
  }
  if (dubCode) {
    query.set("dubCode", String(dubCode));
    query.set("dubType", String(dubType ?? "0"));
  }
  if (meta.imdbId) query.set(ZXC_IMDB_PARAM, meta.imdbId);

  const url = `${ZXC_ORIGIN}/backend/servers/${server}?${query.toString()}`;
  const text = await fetchUpstream(url, {
    referer: `${ZXC_ORIGIN}${meta.refererPath}`,
    extraHeaders: zxcHeaders(meta.refererPath, { json: true }),
  });
  const data = JSON.parse(text);
  if (data?.success !== true || !Array.isArray(data.links)) throw new Error("servers endpoint returned no links");

  const links = data.links
    .filter((l) => l?.link)
    .map((l) => {
      let url2;
      try {
        url2 = decryptZxcLink(l.link, ZXC_LINK_KEY);
      } catch {
        return null;
      }
      // atlas hands back a vidstuck-relative relay path; the rest are absolute.
      const url = url2.startsWith("/") ? `${ZXC_ORIGIN}${url2}` : url2;
      // Issue this host so the playlist/segment relay will admit it later
      // (see the issued-host registry above).
      issueHost(url);
      return {
        url,
        kind: String(l.type || "").toLowerCase(),
        resolution: Number(l.resolution) || 0,
      };
    })
    .filter(Boolean);
  if (links.length === 0) throw new Error("no link survived decryption");
  return { links, dubs: Array.isArray(data.dubs) ? data.dubs : [] };
}

/* The replayable URL of a generated playlist. Carries the whole title/server/dub
   identity so `handlePlaylist` can rebuild it from scratch. */
function zxcPlaylistUrl(meta, { server, dubCode, dubType, view, representationId }) {
  const query = new URLSearchParams({
    [ZXC_PARAM.tmdbId]: meta.tmdbId,
    [ZXC_PARAM.mediaType]: meta.type,
    [ZXC_PARAM.path]: server,
    [ZXC_PARAM.title]: meta.title,
    [ZXC_PARAM.year]: meta.year,
    [ZXC_PARAM.date]: meta.date,
    [ZXC_MARKER.marker]: ZXC_MARKER.value,
    [ZXC_MARKER.view]: view,
  });
  if (meta.type === "tv") {
    query.set(ZXC_PARAM.season, String(meta.season || ""));
    query.set(ZXC_PARAM.episode, String(meta.episode || ""));
    // Carried so a REPLAYED playlist asks for the same episode freshness the
    // original resolve did, instead of silently resolving the newest one.
    if (meta.latestDate) query.set(ZXC_LATEST_DATE_PARAM, String(meta.latestDate));
  }
  if (dubCode) {
    query.set("dubCode", String(dubCode));
    query.set("dubType", String(dubType ?? "0"));
  }
  if (representationId !== undefined) query.set(ZXC_MARKER.rep, String(representationId));
  return `${ZXC_ORIGIN}/backend/servers/${server}?${query.toString()}`;
}

/* The inverse. Returns null for ANY url that is not one of ours, so a caller's
   ordinary playlist URL keeps its existing meaning untouched. */
function parseZxcPlaylistUrl(rawUrl) {
  let url;
  try {
    url = new URL(String(rawUrl || ""));
  } catch {
    return null;
  }
  if (url.origin !== ZXC_ORIGIN) return null;
  if (url.searchParams.get(ZXC_MARKER.marker) !== ZXC_MARKER.value) return null;

  const view = url.searchParams.get(ZXC_MARKER.view) || "";
  if (view !== ZXC_VIEW_MASTER && view !== ZXC_VIEW_MEDIA) return null;
  const server = url.searchParams.get(ZXC_PARAM.path) || "";
  if (!ZXC_SERVERS.includes(server)) return null;
  const type = url.searchParams.get(ZXC_PARAM.mediaType) === "tv" ? "tv" : "movie";
  const tmdbId = url.searchParams.get(ZXC_PARAM.tmdbId) || "";
  if (!/^\d{1,12}$/.test(tmdbId)) return null;

  return {
    meta: {
      type,
      tmdbId,
      server,
      title: url.searchParams.get(ZXC_PARAM.title) || "",
      year: url.searchParams.get(ZXC_PARAM.year) || "",
      date: url.searchParams.get(ZXC_PARAM.date) || "",
      imdbId: "",
      season: url.searchParams.get(ZXC_PARAM.season) || "",
      episode: url.searchParams.get(ZXC_PARAM.episode) || "",
      latestDate: url.searchParams.get(ZXC_LATEST_DATE_PARAM) || "",
      refererPath: zxcEmbedPath({
        type,
        tmdbId,
        season: url.searchParams.get(ZXC_PARAM.season) || "",
        episode: url.searchParams.get(ZXC_PARAM.episode) || "",
      }),
    },
    view,
    representationId: url.searchParams.get(ZXC_MARKER.rep),
    dubCode: url.searchParams.get("dubCode") || "",
    dubType: url.searchParams.get("dubType") || "",
  };
}

/* MPD in, transcoded ladder out. One mint + one servers call + one manifest
   fetch — the cost a single generated playlist request costs, which is why the
   marker URL replays instead of caching. NOW also caches the parsed MPD
   (see mpdCache above) so rapid parallel playlist loads collapse to one
   upstream trip instead of triggering a provider 429 burst. */
async function zxcDashManifest(target) {
  const { meta, dubCode, dubType } = target;
  const key = zxcMpdCacheKey(meta, dubCode, dubType);
  const cached = takeMpdCache(key);
  if (cached) return cached;

  const { links } = await zxcServerLinks(meta, { server: meta.server, dubCode, dubType });
  const dash = links.find((l) => l.kind === "dash") || links[0];
  if (!dash?.url) throw new Error("no dash manifest for this server");
  const xml = await fetchUpstream(dash.url, {
    referer: `${ZXC_ORIGIN}${meta.refererPath}`,
    extraHeaders: zxcHeaders(meta.refererPath),
  });
  const manifest = parseMpd(xml);
  if (!manifest) throw new Error("manifest is not a transcodable MPD");
  // Issue the MPD host AND every host its segment/init templates reference, so
  // the segment relay admits the CDN that actually carries this title's bytes
  // (they are absolute per the dashToHls contract, template placeholders and
  // all — `$Number$` only appears in the path, never the hostname).
  issueHost(dash.url);
  issueHostsInText(xml);
  const result = { manifest, refUrl: `${ZXC_ORIGIN}${meta.refererPath}` };
  setMpdCache(key, result);
  return result;
}

function zxcGeneratedPlaylist(target) {
  return target.view === ZXC_VIEW_MASTER ? buildMasterPlaylist : buildMediaPlaylist;
}

async function handleZxcPlaylist(rawUrl) {
  const target = parseZxcPlaylistUrl(rawUrl);
  if (!target) return null;
  const { manifest } = await zxcDashManifest(target);
  const build = zxcGeneratedPlaylist(target);
  if (target.view === ZXC_VIEW_MASTER) {
    return build(manifest, (representationId) => zxcPlaylistUrl(target.meta, {
      server: target.meta.server,
      dubCode: target.dubCode,
      dubType: target.dubType,
      view: ZXC_VIEW_MEDIA,
      representationId,
    }));
  }
  const rep =
    manifest.video.find((r) => r.id === target.representationId) ||
    manifest.audio.find((r) => r.id === target.representationId);
  if (!rep) throw new Error("no such representation in this manifest");
  return build(rep);
}

/* Dubs: sibling masters, each verified by actually minting + transcoding it.
   Shared by BOTH resolve branches: a dub-support server (orion, centaurus)
   can hand back HLS links on one title and DASH on the next, and taking the
   HLS early-return without checking dubs would silently drop Hindi/Tamil
   tracks the provider does carry. Filter to type-0 (audio). Drop the
   "original" row if present (it's the native soundtrack already served by
   the master) to avoid duplicate labels, and also dedupe by (lanCode/type)
   when the provider lists the same pair twice. DO NOT hard-cap to 8: some
   titles carry 11+ type-0 dubs — the cap silently truncated Telugu/ptbr/esla
   etc. Only an explicitly provider-flagged row is the original. If the
   payload carries no flag (older provider responses) we must NOT guess a
   winner — dropping an arbitrary first row would silently hide a real dub. */
async function verifyZxcDubs(meta, server, dubs) {
  const audioTracks = [];
  if (!ZXC_DUB_SERVERS.has(server) || !Array.isArray(dubs)) return audioTracks;
  const seen = new Set();
  const originalKey = dubs.find((d) => d?.original && d?.lanCode) || null;
  const originalKeyStr = originalKey ? `${originalKey.lanCode}/${String(originalKey.type ?? "0")}` : null;
  const candidates = dubs
    .filter((d) => d?.lanCode && String(d.type ?? "0") === "0")
    .filter((d) => {
      const key = `${d.lanCode}/${String(d.type ?? "0")}`;
      if (originalKeyStr && key === originalKeyStr) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const verified = await Promise.all(
    candidates.map(async (dub) => {
      const uri = zxcPlaylistUrl(meta, {
        server,
        dubCode: String(dub.lanCode),
        dubType: String(dub.type ?? "0"),
        view: ZXC_VIEW_MASTER,
      });
      try {
        await zxcDashManifest({
          meta: { ...meta, server },
          dubCode: String(dub.lanCode),
          dubType: String(dub.type ?? "0"),
        });
        return { label: String(dub.lanName || dub.lanCode), uri };
      } catch (error) {
        // Advertised but dead upstream (the 427 rows). Never listed.
        logWarn("zxc", `dropping dead ${server} dub ${dub.lanCode}/${dub.type}`, {
          message: error?.message,
        });
        return null;
      }
    }),
  );
  for (const track of verified) if (track) audioTracks.push(track);
  return audioTracks;
}

async function handleResolveZxc(body, res) {
  const type = body.type === "tv" ? "tv" : "movie";
  const tmdbId = String(body.id || "").trim();
  if (!/^\d{1,12}$/.test(tmdbId)) {
    json(res, 400, { ok: false, error: "Invalid TMDB id", code: "bad-id" });
    return;
  }
  const season = String(body.season ?? "").trim();
  const episode = String(body.episode ?? "").trim();
  const requested = String(body.server || "").trim().toLowerCase();
  // An unknown server name is a client bug, not a title problem: answer 400
  // rather than silently resolving a different server than the viewer picked.
  if (requested && !ZXC_SERVERS.includes(requested)) {
    json(res, 400, { ok: false, error: "Unknown ZXC server", code: "bad-server" });
    return;
  }
  const server = requested || "centaurus";

  const refererPath = zxcEmbedPath({ type, tmdbId, season, episode });

  let titleMeta;
  try {
    titleMeta = await zxcTitleMeta({ type, tmdbId, refererPath });
  } catch (error) {
    // A failed TMDB lookup is OUR upstream failing, not the title being
    // unstreamable. `upstream` (not `no-source`) so the player can say so
    // instead of telling the viewer every server has no source for this title.
    logWarn("zxc", "title metadata lookup failed before resolve", { message: error?.message });
    json(res, 200, {
      ok: false,
      error: `Could not load title details for tmdb ${tmdbId}: ${error?.message || "unknown"}`,
      code: "upstream",
    });
    return;
  }
  const meta = {
    type,
    tmdbId,
    season,
    episode,
    refererPath,
    title: titleMeta.title,
    year: titleMeta.year,
    date: titleMeta.date,
    imdbId: titleMeta.imdbId,
    latestDate: titleMeta.latestDate,
  };

  let data;
  try {
    data = await zxcServerLinks(meta, { server });
  } catch (error) {
    json(res, 200, {
      ok: false,
      error: `ZXC ${server} returned no stream: ${error?.message || "unknown"}`,
      code: "no-source",
    });
    return;
  }

  const refUrl = `${ZXC_ORIGIN}${refererPath}`;
  // Plain-HLS servers hand back MORE THAN ONE link, and they are not a quality
  // ladder: atlas ships two media playlists for the SAME runtime (identical
  // #EXTINF total, different segment granularity and bitrate — measured at
  // ~1.4 Mbps vs ~0.5 Mbps on Reacher S1E1) and meow ships several masters
  // that are byte-identical mirrors of one 640x360 encode. Publishing all of
  // them as "variants" would show the user the same picture three times, so we
  // pick ONE — but we probe them in order and fall through, because a dead
  // first link must not kill a title that has a working mirror behind it.
  const hlsLinks = data.links.filter((l) => l.kind === "hls").slice(0, ZXC_MAX_HLS_LINKS);

  if (!ZXC_DASH_SERVERS.has(server) && hlsLinks.length > 0) {
    let playable = null;
    for (const link of hlsLinks) {
      let text = "";
      try {
        text = await fetchUpstream(link.url, { referer: refUrl, extraHeaders: zxcHeaders(refererPath) });
      } catch (err) {
        logWarn("zxc", `${server} HLS link ${link.url.slice(0, 48)} failed`, { message: err?.message });
        continue;
      }
      // Issue the playlist host and any hosts it references so the segment
      // relay admits this source's media CDN once the player starts.
      issueHost(link.url);
      issueHostsInText(text);
      if (!text.startsWith("#EXTM3U")) {
        logWarn("zxc", `${server} HLS link ${link.url.slice(0, 48)} is not a playlist`);
        continue;
      }
      // Some HLS servers already publish a real ladder; do not flatten it to a
      // single "Auto" rung when the master playlist is present. A multi-rung
      // master always beats a single rendition, whatever the provider ordered.
      const levels = text.includes("#EXT-X-STREAM-INF") ? parseMasterPlaylist(text, link.url) : [];
      if (playable === null || levels.length > playable.levels.length) {
        playable = { link, levels };
        if (levels.length > 1) break;
      }
    }
    if (playable) {
      const { link, levels } = playable;
      // A dub-support server can serve HLS links on a title that ALSO has
      // dubs (orion does both across titles) — verify and attach them here
      // too, or the HLS early-return below would drop real Hindi/Tamil tracks.
      const audioTracks = await verifyZxcDubs(meta, server, data.dubs);
      json(res, 200, {
        ok: true,
        source: {
          kind: "hls",
          url: link.url,
          refUrl,
          multiLevelMaster: levels.length > 1 ? true : undefined,
        },
        variants:
          levels.length > 0
            ? levels
            : [
                {
                  uri: link.url,
                  bandwidth: 0,
                  width: 0,
                  height: link.resolution || 0,
                  framerate: 0,
                  codecs: "",
                  hdr: false,
                },
              ],
        server,
        audioTracks,
      });
      return;
    }
  }

  // DASH servers: the ladder is only real once the MPD has been transcoded, so
  // fetch it here rather than claiming rungs the player would discover broken.
  let manifest;
  try {
    ({ manifest } = await zxcDashManifest({ meta: { ...meta, server }, dubCode: "", dubType: "" }));
  } catch (error) {
    json(res, 200, {
      ok: false,
      error: `ZXC ${server} manifest unreadable: ${error?.message || "unknown"}`,
      code: "no-source",
    });
    return;
  }
  if (manifest.video.length === 0) {
    json(res, 200, { ok: false, error: `ZXC ${server} has no video rendition`, code: "no-source" });
    return;
  }

  const masterUrl = zxcPlaylistUrl(meta, { server, view: ZXC_VIEW_MASTER });
  const variants = manifest.video.map((rep) => ({
    uri: zxcPlaylistUrl(meta, { server, view: ZXC_VIEW_MEDIA, representationId: rep.id }),
    bandwidth: rep.bandwidth,
    width: rep.width,
    height: rep.height,
    framerate: rep.frameRate,
    codecs: rep.codecs,
    hdr: false,
  }));

  // Dubs: sibling masters, each verified by actually minting + transcoding it
  // (shared helper — same rules as the HLS branch above).
  const audioTracks = await verifyZxcDubs(meta, server, data.dubs);

  json(res, 200, {
    ok: true,
    // A transcoded MPD needs its levels + audio group in ONE url so hls.js can
    // ABR and mux; the variants list stays for the quality menu.
    source: { kind: "hls", url: masterUrl, refUrl, multiLevelMaster: true },
    variants,
    server,
    audioTracks,
  });
}

/* ZXC intro/outro boundaries (`zxcintro`). Upstream's own per-title skip data:
   `GET /backend/intro?imdbId=&season=&episode=&tmdbId=` — NO mint, just the
   vidstuck `Origin` (verified live: GoT S1E1 intro 437→531s, outro
   3631.5→3699.5s; Breaking Bad S1E1 outro 3431→3500s). Shape:
   `{intro:{start_sec,end_sec,…}|null, recap, outro:{…}|null, post_credits}`.
   TV-only in practice: without season+episode upstream answers "Missing
   params", and movie queries come back all-null — so movies short-circuit
   to a miss without spending the call. A miss is `{ok:true}` with null
   bounds (same honesty rule as SkipDB's 200-full-of-nulls): a missing
   record is not a failure and must never fail playback or the skip UI —
   the player falls back to its other sources. */
async function handleZxcIntro(body, res) {
  const imdbId = String(body.imdbId || "").trim();
  const tmdbId = String(body.tmdbId || "").trim();
  const season = String(body.season ?? "").trim();
  const episode = String(body.episode ?? "").trim();
  // TMDB id is the addressable key; a title correctly carrying none does not
  // get punished — it gets a miss (see below).
  if (!/^\d{1,12}$/.test(tmdbId)) {
    json(res, 400, { ok: false, error: "Invalid TMDB id", code: "bad-id" });
    return;
  }
  const miss = { ok: true, introEndSeconds: null, creditsStartSeconds: null, confidence: null };
  // Movies have no season/episode and upstream has no movie records — a call
  // would only burn a request to learn that. TV carries S/E. And without a
  // well-formed imdbId (movies, some TV rows) upstream answers "Missing
  // params", which is upstream saying "no record", not the client being
  // wrong — so both are a miss, never a 400.
  if (!/^tt\d{4,12}$/.test(imdbId) || !season || !episode) {
    json(res, 200, miss);
    return;
  }
  const url =
    `${ZXC_ORIGIN}/backend/intro?imdbId=${encodeURIComponent(imdbId)}` +
    `&season=${encodeURIComponent(season)}&episode=${encodeURIComponent(episode)}` +
    `&tmdbId=${encodeURIComponent(tmdbId)}`;
  let data;
  try {
    const text = await fetchUpstream(url, {
      referer: `${ZXC_ORIGIN}/embed/tv/${tmdbId}/${encodeURIComponent(season)}/${encodeURIComponent(episode)}`,
      extraHeaders: zxcHeaders(`/embed/tv/${tmdbId}/${season}/${episode}`),
    });
    data = JSON.parse(text);
  } catch {
    json(res, 200, miss);
    return;
  }
  const introEnd = Number(data?.intro?.end_sec);
  const creditsStart = Number(data?.outro?.start_sec);
  json(res, 200, {
    ok: true,
    introEndSeconds: Number.isFinite(introEnd) && introEnd > 0 ? introEnd : null,
    /* `> 0`, never `>= 0`: upstream's "no outro" sentinel is 0, and forwarding it
       verbatim hands every client a credits boundary at the first second of the
       episode — an orange scrubber and a permanently-visible Skip Credits pill. */
    creditsStartSeconds: Number.isFinite(creditsStart) && creditsStart > 0 ? creditsStart : null,
    confidence: Number.isFinite(Number(data?.intro?.confidence)) ? Number(data.intro.confidence) : null,
  });
}

/* Raw playlist relay for native HLS playback. Returns the playlist TEXT so an
   MSE player (hls.js) can parse levels/audio itself. Same SSRF validation +
   referer supply as `segment`: manifest hosts that gate on the owning player's
   origin 403 a browser fetch, so the server fetches with the source's refUrl
   and hands the text back. Admitted hosts are those this instance issued (see
   the issued-host registry above); unknown hosts are refused before any
   network I/O. Playlists are small; the MAX_TEXT_BYTES cap in fetchUpstream
   still binds. */
async function handlePlaylist(body, res) {
  const playlistUrl = String(body.playlistUrl || "").trim();
  try {
    const u = new URL(playlistUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad protocol");
    await assertPublicDestination(u.toString());
  } catch {
    json(res, 400, { ok: false, error: "Invalid playlist URL", code: "bad-url" });
    return;
  }
  // Open-relay fence: a public URL on a host this instance never touched gets
  // no network I/O at all. Anything a resolvezxc mints (marker URLs included —
  // they live on vidstuck.xyz) or a successful relay has already served passes.
  if (!isHostIssued(playlistUrl)) {
    json(res, 403, { ok: false, error: "Relay host not authorized this instance", code: "host-not-issued" });
    return;
  }

  try {
    // A ZXC marker URL is transcoded from the provider's MPD rather than fetched,
    // and the result is byte-for-byte the m3u8 hls.js expects.
    let text;
    if (parseZxcPlaylistUrl(playlistUrl)) {
      text = await handleZxcPlaylist(playlistUrl);
    } else {
      text = await fetchUpstream(playlistUrl, {
        referer: body.refUrl ? String(body.refUrl) : playlistUrl,
      });
      // Self-bootstrap: a playlist the client actually reached admits its own
      // host (and every host its body references) for the rest of the window,
      // so provider CDN rotation that only shows up mid-session keeps playing.
      issueHost(playlistUrl);
      issueHostsInText(text);
    }
    res.status(200);
    res.setHeader("content-type", "application/vnd.apple.mpegurl");
    res.setHeader("cache-control", "no-store");
    res.send(text);
  } catch (error) {
    logWarn("stream", "playlist relay failed", { message: error?.message });
    json(res, 502, {
      ok: false,
      error: "Playlist fetch failed",
      code: "manifest-fetch-failed",
    });
  }
}

async function handleSegment(body, res) {
  const url = String(body.url || "").trim();
  if (!url) {
    json(res, 400, { ok: false, error: "No segment URL", code: "bad-request" });
    return;
  }
  try {
    await assertPublicDestination(url);
  } catch {
    json(res, 400, { ok: false, error: "Invalid segment URL", code: "bad-url" });
    return;
  }
  // Open-relay fence for bytes, same registry as `playlist`. A segment on a
  // host this instance never issued (and that isn't a trusted CDN root) is
  // refused before a single byte leaves the server.
  if (!isHostIssued(url)) {
    json(res, 403, { ok: false, error: "Relay host not authorized this instance", code: "host-not-issued" });
    return;
  }

  const start = Math.max(0, Math.floor(Number(body.range?.start) || 0));
  const max = Math.min(Math.max(1, Math.floor(Number(body.range?.max) || RANGE_CHUNK_BYTES)), RANGE_CHUNK_BYTES);
  const referer = body.refUrl ? String(body.refUrl) : undefined;

  try {
    const { bytes, more } = await fetchRangeChunk(url, { start, max, referer });
    // Self-bootstrap (same as `playlist`): a served byte stream is the
    // strongest evidence a host is legit — admit it for the window.
    issueHost(url);
    res.status(200);
    res.setHeader("content-type", "application/octet-stream");
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-length", String(bytes.length));
    res.setHeader("x-streamly-more", more ? "1" : "0");
    res.send(bytes);
  } catch (error) {
    logWarn("stream", "segment relay failed", { message: error?.message });
    json(res, 502, {
      ok: false,
      error: "Segment fetch failed",
      code: "segment-fetch-failed",
    });
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  // The relay contract reads x-streamly-more ("does a slice continue past what
  // we just got?") and content-range (slice derivation when the header is
  // absent). Default CORS exposes neither, so every JS read was null — that
  // mattered for any cross-origin caller slicing over simple requests.
  res.setHeader(
    "Access-Control-Expose-Headers",
    "x-streamly-more, content-range, content-length",
  );

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    json(res, 405, { ok: false, error: "Method not allowed", code: "method" });
    return;
  }

  // Segment downloads are bandwidth-heavy. The client now fetches up to 4
  // segments concurrently and each segment costs 1-3 Range requests, so a
  // legit title needs hundreds of requests fast — but 1800/min (30/s) still
  // caps a runaway loop while letting the parallel client finish one title.
  const limit = rateLimit({ key: () => `dl:${clientIp(req)}`, limit: 1800, windowMs: 60_000 });
  // Capacity ledger (PLAN.md P0.3): one in-memory increment per relay call;
  // batched Mongo flush — never a DB write in the request path.
  countUsage("dl");
  if (!limit.ok) {
    tooManyRequests(res, limit.retryAfterSec);
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  if (!body || typeof body !== "object") body = {};

  // Byte-exact cap for both transport shapes (raw string and the parsed object
  // the dev middleware already hands us). The rule is about bytes on the wire,
  // so it measures the serialized payload, not the string length.
  const bodyBytes = typeof req.body === "string" ? Buffer.byteLength(req.body) : Buffer.byteLength(JSON.stringify(body));
  if (bodyBytes > MAX_REQUEST_BODY_BYTES) {
    json(res, 413, { ok: false, error: "Request body too large", code: "too-large" });
    return;
  }

  try {
    // Retired actions (`resolve`, `resolvevidcore`, `manifest`) fall through to
    // the 400 bad-action default below — the header comment documents why.
    switch (body.action) {
      case "resolvezxc":
        await handleResolveZxc(body, res);
        return;
      case "zxcintro":
        await handleZxcIntro(body, res);
        return;
      case "playlist":
        await handlePlaylist(body, res);
        return;
      case "segment":
        await handleSegment(body, res);
        return;
      default:
        json(res, 400, { ok: false, error: "Unknown action", code: "bad-action" });
    }
  } catch (error) {
    // Never echo internals to the caller — log them server-side instead.
    logError("stream", "handler failed", { message: error?.message });
    json(res, 500, {
      ok: false,
      error: "Internal server error",
      code: "internal",
    });
  }
}
