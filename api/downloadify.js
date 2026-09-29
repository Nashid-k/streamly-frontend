// api/downloadify.js — browser-only download resolver (Vercel serverless).
//
// The web app has no backend and no direct media URLs: every server is a
// third-party iframe. To let viewers download a title "like a browser
// download" we resolve the embed host's HLS playlist here (server-side, so
// CORS/bot-walls don't apply) and proxy the media bytes back. The browser
// then saves the assembled bytes to disk with the File System Access API
// (incremental write) or a Blob download fallback.
//
// Actions (POST JSON):
//   resolve        { embedUrl }                         -> { source, variants }
//   resolvevidsrc  { type, id, season?, episode? }      -> { source, variants }
//   resolvevidcore { type, id, season?, episode? }      -> { source, variants }
//   resolvenhd     { type, id, season?, episode? }      -> { source, variants, audioTracks }
//   resolvezxc     { type, id, season?, episode?, server? } -> { source, variants, audioTracks }
//   manifest       { playlistUrl, refUrl }              -> { kind, initUrl, segments, duration }
//   playlist       { playlistUrl, refUrl }              -> raw m3u8 text (referer-supplied)
//   segment        { url, refUrl?, range: {start,max} } -> bytes (octet-stream)
//
// Byte transport notes (the reason this is different from the old version):
//   · Vercel caps a function's request/response body at 4.5MB. The previous
//     `segment` took a batch of 6 URLs and concatenated them — one 1080p
//     movie blew that cap instantly (413 FUNCTION_PAYLOAD_TOO_LARGE) and
//     nothing ever downloaded. Segments are now fetched ONE URL AT A TIME in
//     bounded Range chunks (≤ ~3.5MB each); the client loops until the
//     server's `x-streamly-more` header says the file ended.
//   · CDN segments that are served with open CORS can be pulled straight from
//     the browser (zero serverless bandwidth); those that aren't go through
//     this range relay.
//
// Security:
//   · resolve accepts only allow-listed embed hosts (SSRF guard).
//   · EVERY upstream request — redirects included — is DNS-resolved and every
//     resolved address must be public (this closes the decimal/hex-IP literal
//     bypass like "http://2130706433/" that a string-based hostname blocklist
//     never sees).
//   · Response size caps bound bandwidth (a runaway "playlist" can't pull the
//     whole internet through us).
//   · Nothing is persisted; the function is a stateless pipe.
//   · Quality/HDR labels reflect what the host actually serves — we never
//     upscale or transcode, and DRM-protected renditions cannot be saved.

import crypto from "node:crypto";

import {
  parseMasterPlaylist,
  parseMediaPlaylist,
  resolveUrl,
} from "../src/utils/downloadQuality.js";
import { parseMpd, buildMasterPlaylist, buildMediaPlaylist } from "../server/dashToHls.js";
import { rateLimit, tooManyRequests, clientIp } from "../server/rateLimit.js";
import { countUsage } from "../server/usage.js";
import { assertPublicDestination } from "../server/ssrf.js";
import { logWarn } from "../src/utils/debugLogger.js";
import {
  json,
  fetchUpstream,
  fetchRangeChunk,
  RANGE_CHUNK_BYTES,
  MAX_TEXT_BYTES,
} from "../server/net.js";

export const config = { maxDuration: 60 };

const ALLOWED_EMBED_HOSTS = new Set([
  "cinesrc.st",
  "www.cinesrc.st",
  "vidlink.pro",
  "www.vidlink.pro",
  "2embed.cc",
  "www.2embed.cc",
  "vidsrcme.ru",
  "www.vidsrcme.ru",
  "vidcore.io",
  "www.vidcore.io",
  "peachify.top",
  "www.peachify.top",
  "vidup.to",
  "www.vidup.to",
  "embed.smashystream.com",
  "smashystream.com",
]);


// Server 5 (VidCore) sources catalogue. vidcore.org/embed resolves entirely
// server-side — no browser involved. The "videasy" API lists a
// title's whole quality ladder (incl. 4K) as DIRECT HLS URLs; the m3u8s sit
// on moon.quietridge.top and their fMP4 segments on paperorbit.top (open
// CORS + Range, so the existing manifest/segment relay handles them). Every
// upstream wants the VidCore player as referer — fetchUpstream supplies it.
const VIDCORE_SOURCES_API = "https://vidrack.created.app/api/sources/videasy";
const VIDZEN_SOURCES_API = "https://vidzen.fun/api/sources";
const VIDCORE_PLAYER_REFERER = "https://vidcore.io/";

/* Approximate per-render bitrate for Videasy's qualities. The Videasy API
   does not publish BANDWIDTH, so the sheet's `~size` / `x Mbps` hints are
   derived from a conservative H.264 table — a documented estimate, never a
   claim about the actual encoding. */
function videasyBandwidth(height) {
  const table = { 2160: 16000000, 1440: 9000000, 1080: 6000000, 720: 2500000, 480: 1200000, 360: 800000, 240: 500000 };
  return table[height] || 0;
}
// Pull playlist URLs out of embed HTML/JS, including JSON- and URL-escaped
// forms hosts like to use to defeat naive scrapers.
function extractPlaylistUrls(html, baseUrl) {
  const normalized = String(html || "")
    .replace(/\\u002f/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/%2f/gi, "/");
  const found = new Set();

  const absRe = /https?:\/\/[^"'\\\s<>()]+?\.m3u8[^"'\\\s<>()]*/gi;
  const relRe = /["'(](\/[^"'\\\s<>()]+?\.m3u8[^"'\\\s<>()]*)/gi;
  const mp4Re = /https?:\/\/[^"'\\\s<>()]+?\.mp4[^"'\\\s<>()]*/gi;

  let m;
  while ((m = absRe.exec(normalized)) !== null) found.add(m[0]);
  while ((m = relRe.exec(normalized)) !== null) found.add(resolveUrl(baseUrl, m[1]));
  while ((m = mp4Re.exec(normalized)) !== null) found.add(m[0]);

  return {
    playlists: [...found].filter((u) => /\.m3u8(\?|$)/i.test(u)),
    files: [...found].filter((u) => /\.mp4(\?|$)/i.test(u)),
  };
}

function extractIframeSrcs(html, baseUrl) {
  const srcs = new Set();
  const re = /<iframe[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(String(html || ""))) !== null) {
    srcs.add(resolveUrl(baseUrl, m[1].replace(/\\u002f/gi, "/").replace(/\\\//g, "/")));
  }
  return [...srcs];
}

/* Deepest-first: embed page -> (nested player page) -> master playlist. */
async function resolveFromEmbed(embedUrl, depth = 0) {
  const html = await fetchUpstream(embedUrl, { referer: embedUrl });
  const { playlists, files } = extractPlaylistUrls(html, embedUrl);

  if (playlists.length > 0) return { playlists, files, refUrl: embedUrl };

  if (depth < 2) {
    for (const src of extractIframeSrcs(html, embedUrl)) {
      try {
        const nested = await resolveFromEmbed(src, depth + 1);
        if (nested.playlists.length > 0 || nested.files.length > 0) return nested;
      } catch {
        // dead iframe — try the next one
      }
    }
  }
  return { playlists, files, refUrl: embedUrl };
}

async function handleResolve(body, res) {
  const embedUrl = String(body.embedUrl || "").trim();
  let parsed;
  try {
    parsed = new URL(embedUrl);
  } catch {
    json(res, 400, { ok: false, error: "Invalid embed URL", code: "bad-url" });
    return;
  }
  if (parsed.protocol !== "https:" || !ALLOWED_EMBED_HOSTS.has(parsed.hostname.toLowerCase())) {
    json(res, 403, { ok: false, error: "Embed host not allowed", code: "host-not-allowed" });
    return;
  }

  let resolved;
  try {
    resolved = await resolveFromEmbed(embedUrl);
  } catch (error) {
    json(res, 502, {
      ok: false,
      error: `Could not read embed page: ${error?.message || "unknown"}`,
      code: "embed-fetch-failed",
    });
    return;
  }

  // Direct file (rare, but the cleanest possible download).
  if (resolved.files.length > 0 && resolved.playlists.length === 0) {
    json(res, 200, {
      ok: true,
      source: { kind: "file", url: resolved.files[0], refUrl: resolved.refUrl },
      variants: [
        {
          uri: resolved.files[0],
          direct: true,
          bandwidth: 0,
          width: 0,
          height: 0,
          framerate: 0,
          codecs: "",
          hdr: false,
        },
      ],
    });
    return;
  }

  if (resolved.playlists.length === 0) {
    json(res, 200, { ok: false, error: "No downloadable stream found on this server", code: "no-source" });
    return;
  }

  // Fetch the first master; if it has no STREAM-INF rows it is the media
  // playlist itself (single rendition).
  let masterUrl = resolved.playlists[0];
  let variants = [];
  for (const candidate of resolved.playlists) {
    try {
      const text = await fetchUpstream(candidate, { referer: resolved.refUrl });
      const list = parseMasterPlaylist(text, candidate);
      if (list.length > 0) {
        masterUrl = candidate;
        variants = list;
        break;
      }
    } catch {
      // try the next candidate
    }
  }

  if (variants.length === 0) {
    json(res, 200, { ok: false, error: "Playlist could not be read", code: "no-source" });
    return;
  }

  json(res, 200, {
    ok: true,
    source: { kind: "hls", url: masterUrl, refUrl: resolved.refUrl },
    variants,
  });
}

/* ── VidSrc third-party provider ────────────────────────────────────────
   VidSrc exposes a REAL, parseable HLS ladder: its embed page carries a JSON
   `var Q = {...}` with a signed token; /pl/api.php?a=sources turns that into
   concrete servers, and `a=race&refs=...` returns the winning server's direct
   stream URL (/_stream?id=...) without the fingerprint-gated `a=play`. The
   master's highest ladder rows are crypto-wrapped (cap.php → 403 "unavailable"
   for scripts) so only the plain _stream renditions are served. Media segments
   ride VidSrc's opaque relay (pchrelay.videm.xyz), which gates on the owning
   player's origin — the segment fetcher picks that origin up from the 403's
   access-control-allow-origin header and retries from there, so real bytes
   come back. Still offer Copy/Open as the hand-off to the user's own tools:
   the source is real and useful regardless of byte-save availability. */

function extractVarObject(html, varName) {
  const re = new RegExp(`(?:var|const)\\s+${varName}\\s*=\\s*\\{`, "i");
  const idx = String(html || "").search(re);
  if (idx < 0) return null;
  const open = String(html).indexOf("{", idx);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < html.length; i += 1) {
    const ch = html[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return html.slice(open, i + 1);
    }
  }
  return null;
}

function sanitizeJsonish(raw) {
  return String(raw || "").replace(/,\s*([}\]])/g, "$1").replace(/:\s*undefined(?=[,}\]])/g, ":null");
}

async function handleResolveVidsrc(body, res) {
  const type = body.type === "tv" ? "tv" : "movie";
  const tmdbId = String(body.id || "").trim();
  if (!/^\d{1,12}$/.test(tmdbId)) {
    json(res, 400, { ok: false, error: "Invalid TMDB id", code: "bad-id" });
    return;
  }
  const season = String(body.season ?? "").trim();
  const episode = String(body.episode ?? "").trim();

  const embedUrl =
    `https://vidsrc.buzz/embed/${type}/${tmdbId}` +
    (type === "tv" && season
      ? `?autoPlay=true&s=${encodeURIComponent(season)}&e=${encodeURIComponent(episode)}`
      : "?autoPlay=true");

  // VidSrc's WAF throttles in bursts (403 "unavailable" for a stretch, then
  // open again). Retry with a FRESH embed token and a short backoff per round
  // instead of hammering the same signed request — the burst clears faster
  // when we give it breathing room.
  const apiBase = "https://vidsrc.buzz/pl/api.php";
  let servers = [];
  for (let attempt = 0; attempt < 4 && servers.length === 0; attempt += 1) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 1500 * attempt));

    let Q = null;
    try {
      const html = await fetchUpstream(embedUrl, { referer: embedUrl });
      const rawQ = extractVarObject(html, "Q");
      if (rawQ) {
        try {
          Q = JSON.parse(sanitizeJsonish(rawQ));
        } catch {
          Q = null;
        }
      }
    } catch {
      // next round
    }
    const token = Q?.t;
    if (!token) continue;
    const qType = String(Q.type || type);
    const qId = String(Q.id || tmdbId);
    const qS = Q.s ? String(Q.s) : season;
    const qE = Q.e ? String(Q.e) : episode;

    try {
      const sourcesUrl =
        `${apiBase}?a=sources&type=${encodeURIComponent(qType)}` +
        `&id=${encodeURIComponent(qId)}&s=${encodeURIComponent(qS)}` +
        `&e=${encodeURIComponent(qE)}&t=${encodeURIComponent(token)}`;
      const raw = await fetchUpstream(sourcesUrl, { referer: embedUrl });
      const data = JSON.parse(raw);
      if (Array.isArray(data?.servers)) servers = data.servers;
    } catch {
      // next round — WAF burst
    }
  }

  if (servers.length === 0) {
    json(res, 200, { ok: false, error: "VidSrc source list unavailable", code: "no-source" });
    return;
  }

  // Race the first few refs through `a=race` — the server answers with the
  // winning server's DIRECT stream URL, avoiding the fingerprint-gated
  // `a=play` endpoint ("unavailable" for scripted calls).
  const RACE_W = 6;
  const refs = servers.filter((s) => s?.ref).slice(0, RACE_W).map((s) => s.ref);
  if (refs.length === 0) {
    json(res, 200, { ok: false, error: "VidSrc returned no sources", code: "no-source" });
    return;
  }

  try {
    const raceUrl = `${apiBase}?a=race&refs=${encodeURIComponent(refs.join(","))}`;
    const raceRaw = await fetchUpstream(raceUrl, { referer: embedUrl });
    const race = JSON.parse(raceRaw);
    const candidate = (race?.cands || []).find((c) => c?.url);
    if (!candidate) {
      json(res, 200, { ok: false, error: "VidSrc race produced no stream", code: "no-source" });
      return;
    }
    // candidate.url is relative ("/_stream?id=...") unless absolute — resolve.
    const masterUrl = resolveUrl("https://vidsrc.buzz/", candidate.url);
    const masterText = await fetchUpstream(masterUrl, { referer: embedUrl });
    // Highest ladder rows are crypto-wrapped (cap.php) and 403 for scripts —
    // serve only the plain _stream renditions so the client never points at a
    // URL that cannot produce bytes.
    const variants = parseMasterPlaylist(masterText, masterUrl).filter(
      (v) => v?.uri && !/cap\.php/i.test(v.uri),
    );
    if (variants.length > 0) {
      json(res, 200, {
        ok: true,
        source: { kind: "hls", url: masterUrl, refUrl: embedUrl },
        variants,
      });
      return;
    }
  } catch {
    // fall through to no-source
  }

  json(res, 200, { ok: false, error: "No downloadable stream found via VidSrc", code: "no-source" });
}

/* VidCore (Server 5). No browser mint: vidcore.org/embed
   resolves from a static sources catalogue whose "videasy" API lists the
   title's whole quality ladder as direct HLS URLs (Videasy mirrors, incl. 4K).
   Fallback — a title the videasy API doesn't carry is asked of the vidzen.fun
   catalogue (same page queries it), whose stream tokens are host-relative
   /api/stream/{token} masters. Both want the VidCore player's referer; the
   m3u8/segment relay then works unchanged (segments are open-CORS fMP4). */
async function handleResolveVidcore(body, res) {
  const type = body.type === "tv" ? "tv" : "movie";
  const tmdbId = String(body.id || "").trim();
  if (!/^\d{1,12}$/.test(tmdbId)) {
    json(res, 400, { ok: false, error: "Invalid TMDB id", code: "bad-id" });
    return;
  }
  const season = String(body.season ?? "").trim();
  const episode = String(body.episode ?? "").trim();
  const referer = VIDCORE_PLAYER_REFERER;

  /* Videasy ladder — each entry is a per-quality MEDIA playlist (a direct
     m3u8 on moon.quietridge.top), so each source maps 1:1 to a sheet row.
     Sources come pre-sorted high→low from the API; we sort defensively. */
  const tryVideasy = async () => {
    const api = new URL(VIDCORE_SOURCES_API);
    api.searchParams.set("id", tmdbId);
    api.searchParams.set("type", type);
    if (type === "tv") {
      if (!season || !episode) throw new Error("tv needs season/episode");
      api.searchParams.set("season", season);
      api.searchParams.set("episode", episode);
    }
    const text = await fetchUpstream(api.toString(), { referer });
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.sources)) return null;
    const variants = data.sources
      .filter((s) => s?.url && /\.m3u8/i.test(s.url) && !/cap\.php/i.test(s.url))
      .map((s) => {
        const quality = String(s.quality || "").toLowerCase();
        const height = Number.parseInt(quality.replace(/\D/g, ""), 10) || 0;
        return {
          // A source list entry may be relative to the videasy origin even
          // though every observed entry is absolute; handing the player a
          // relative "URL" would dead-end every relay call ("Bad ?url=
          // target"). Absolutize server-side with the same resolver the
          // manifest parsers use (resolveUrl from downloadQuality).
          uri: resolveUrl(api.toString(), s.url),
          bandwidth: videasyBandwidth(height),
          width: 0,
          height,
          framerate: 0,
          codecs: "",
          hdr: false,
        };
      })
      .sort((a, b) => b.height - a.height);
    if (variants.length === 0) return null;
    /* The hidden base-track (`-v1`) altUri derivation lived here ("Audio 2");
       REMOVED 2024-09: the swap played as muted video in the player, so the
       alternate-audio toggle was removed with it. Videasy titles stream their
       listed `-v1-a1` track only. */
    return {
      variants,
      source: { kind: "hls", url: variants[0].uri, refUrl: referer },
    };
  };

  /* vidzen.fun fallback — the same catalogue the page polls alongside
     videasy. Its stream token may be a single-rendition media playlist or a
     real master ladder; parseMasterPlaylist handles both. */
  const tryVidzen = async () => {
    const api = new URL(VIDZEN_SOURCES_API);
    api.searchParams.set("type", type);
    api.searchParams.set("id", tmdbId);
    if (type === "tv") {
      if (!season || !episode) throw new Error("tv needs season/episode");
      api.searchParams.set("season", season);
      api.searchParams.set("episode", episode);
    }
    const text = await fetchUpstream(api.toString(), { referer });
    const data = JSON.parse(text);
    const first = (data?.sources || []).find((s) => s?.url);
    if (!first?.url) return null;
    const masterUrl = new URL(first.url, VIDZEN_SOURCES_API).toString();
    const masterText = await fetchUpstream(masterUrl, { referer });
    const variants = parseMasterPlaylist(masterText, masterUrl).filter((v) => v?.uri);
    if (variants.length === 0 || !variants[0].uri) return null;
    return {
      variants,
      source: { kind: "hls", url: masterUrl, refUrl: referer },
    };
  };

  // Videasy is the primary (4K-ready, segments stream freely); vidzen covers
  // titles videasy doesn't carry. Either failure is honest — no fake ladder.
  const primary = await tryVideasy().catch(() => null);
  if (primary) {
    json(res, 200, { ok: true, source: primary.source, variants: primary.variants });
    return;
  }
  const fallback = await tryVidzen().catch(() => null);
  if (fallback) {
    json(res, 200, { ok: true, source: fallback.source, variants: fallback.variants });
    return;
  }
  json(res, 200, { ok: false, error: "No downloadable stream found via VidCore", code: "no-source" });
}

/* NetMirror (net27.cc family) — REMOVED (user order, 2024-09). net27's video
   layer is per-IP 429-gated (bcdnxw CDN) and its auth is a Cloudflare
   challenge; the canonical-mirror family (net52/net51) mint real video URLs
   only for a per-session token issued behind an interactive challenge. No
   legitimate egress can stream them. The resolver, client provider, CSP
   entries and player branches were removed; CineSrc (iframe sources) |
   VidCore | Videasy | VidVid remain the playback paths. */

/* ── NHD Embed third-party provider ─────────────────────────────────────
   NHD (https://nhdapi.com) aggregates 8 upstream providers behind one JW
   Player embed (`/movie/{tmdbId}`, `/tv/{tmdbId}/{s}/{e}`) with a Server
   switcher and — for dubbed titles — a real Audio language switcher.
   Scraped server-side exactly like VidCore so our own player serves the
   bytes instead of their iframe:

   1. GET the embed page (no key needed, plays with ads in a browser) and
      read its per-title `var API_PATH` + `var API_KEY` (the /api/* JSON
      answers `invalid or missing API key` without it; the key differs per
      title, verified live: 579974 vs 299534).
   2. GET `{API_PATH}?_ts=…&key=…[&provider=…|&exclude=…]` with the embed
      page as referer. The answer is `{ success, playUrl, kind, provider,
      audioTracks }` where `playUrl` is a tokenized
      `nhdapi.streamfinder.st/api/hls?t=…` URL and `audioTracks` — when
      present — is a list of SIBLING full-stream URLs
      (`[{ label, playUrl }]`, one HLS manifest per dub), never
      `#EXT-X-MEDIA` renditions inside one manifest.
   3. Every minted token is VERIFIED before it is served (one cheap GET of
      the manifest must answer a real m3u8): a mint is NOT guaranteed
      playable — meowtvru (nxsha.space) extractions come out born-403 some
      of the time (their own player survives that only through its
      exclude-and-retry recovery ladder, read off their embed source), and
      `fresh=1` re-mints can land non-HLS kinds or poison the upstream's
      cached extraction, so `fresh` is never sent by us. The ladder mirrors
      theirs: meowtvru first (the only provider whose extractions carry
      `audioTracks` — per their player source "every other provider serves
      exactly one"), then the all-provider race, then the race with
      meowtvru excluded. Dub siblings are verified individually too — a
      healthy main mint can still ship dead dub tokens.

   Only `kind === "hls"` extractions are served: `kind === "mp4"` titles
   have no HLS ladder for the native pipeline (its NetMirror mp4 branch
   was removed) or the manifest→segment downloader, so they answer an
   honest `no-source` instead of a URL nothing can play. Tokens are
   time-scoped (a captured `t=…` 502s minutes later) but NOT single-use —
   the verify GET and the player's first fetch of the same token both
   answer — so resolve fresh per playback; the player's token-refresh
   re-resolve already does this. The streamfinder host answers CORS *
   headerless (verified live), so no referer rides on playback. */
const NHD_EMBED_BASE = "https://nhdapi.com";
const NHD_MULTI_AUDIO_PROVIDER = "meowtvru";

function extractNhdPageKey(html) {
  const text = String(html || "");
  const pathMatch = /var\s+API_PATH\s*=\s*"([^"]+)"/.exec(text);
  const keyMatch = /var\s+API_KEY\s*=\s*"([^"]+)"/.exec(text);
  const apiPath = pathMatch?.[1] || null;
  const apiKey = keyMatch?.[1] || null;
  if (!apiPath || !apiKey || !apiPath.startsWith("/api/")) return null;
  return { apiPath, apiKey };
}

async function fetchNhdExtraction(key, embedUrl, { provider, exclude } = {}) {
  const api = new URL(NHD_EMBED_BASE + key.apiPath);
  api.searchParams.set("_ts", String(Date.now()));
  if (provider) api.searchParams.set("provider", provider);
  if (exclude) api.searchParams.set("exclude", exclude);
  api.searchParams.set("key", key.apiKey);
  const text = await fetchUpstream(api.toString(), { referer: embedUrl });
  const data = JSON.parse(text);
  if (!data || data.success !== true || !data.playUrl) return null;
  return data;
}

/* The verify gate: a minted NHD token must answer a real m3u8 before we
   offer it to the player — a born-403 token would otherwise surface as a
   black-screen source instead of a clean failover to the next attempt. */
async function verifyNhdPlaylist(url) {
  try {
    const text = await fetchUpstream(url);
    return text.startsWith("#EXTM3U");
  } catch {
    return false;
  }
}

async function handleResolveNhd(body, res) {
  const type = body.type === "tv" ? "tv" : "movie";
  const tmdbId = String(body.id || "").trim();
  if (!/^\d{1,12}$/.test(tmdbId)) {
    json(res, 400, { ok: false, error: "Invalid TMDB id", code: "bad-id" });
    return;
  }
  const season = String(body.season ?? "").trim();
  const episode = String(body.episode ?? "").trim();

  const embedUrl =
    type === "tv"
      ? `${NHD_EMBED_BASE}/tv/${tmdbId}/${season || "1"}/${episode || "1"}`
      : `${NHD_EMBED_BASE}/movie/${tmdbId}`;

  let page;
  try {
    page = await fetchUpstream(embedUrl, { referer: embedUrl });
  } catch {
    page = null;
  }
  const key = page ? extractNhdPageKey(page) : null;
  if (!key) {
    json(res, 200, { ok: false, error: "No downloadable stream found via NHD", code: "no-source" });
    return;
  }

  // Their own ladder, with the verify gate on every rung: meowtvru (multi-
  // audio), the all-provider race, then their recovery move — the race with
  // meowtvru excluded. A rung whose mint fails verification is skipped, not
  // served; running the ladder dry is an honest no-source.
  const attempts = [
    { provider: NHD_MULTI_AUDIO_PROVIDER },
    {},
    { exclude: NHD_MULTI_AUDIO_PROVIDER },
  ];
  for (const params of attempts) {
    let data = null;
    try {
      data = await fetchNhdExtraction(key, embedUrl, params);
    } catch {
      data = null;
    }
    if (!data || data.kind !== "hls") continue;
    if (!(await verifyNhdPlaylist(data.playUrl))) continue;
    // Dub siblings are verified one by one: a healthy main mint can still
    // carry dead dub tokens, and an unplayable dub must never reach the
    // Audio menu (the player probes again before switching, but the menu
    // should only ever list tracks that can actually play).
    const audioTracks = [];
    for (const t of Array.isArray(data.audioTracks) ? data.audioTracks : []) {
      if (!t?.playUrl || !t?.label) continue;
      if (await verifyNhdPlaylist(t.playUrl)) {
        audioTracks.push({ label: String(t.label), uri: String(t.playUrl) });
      }
    }
    json(res, 200, {
      ok: true,
      source: { kind: "hls", url: data.playUrl, refUrl: "" },
      variants: [
        {
          uri: data.playUrl,
          bandwidth: 0,
          width: 0,
          height: 0,
          framerate: 0,
          codecs: "",
          hdr: false,
        },
      ],
      provider: data.provider || params.provider || "",
      audioTracks,
    });
    return;
  }
  json(res, 200, { ok: false, error: "No downloadable stream found via NHD", code: "no-source" });
}

/* ── ZXC / vidstuck third-party provider ────────────────────────────────
   zxcstream.icu is a thin shell around a vidstuck.xyz JW Player embed; every
   real stream is behind vidstuck's own two-step backend, so we mint and read
   it server-side exactly like VidCore/NHD and serve the bytes ourselves.

   The contract, read off the shipped client chunk (vidstuck's `queryFn`):

   1. `POST /backend/meow` with `{tmdbId, media_type, path[, season, episode]}`
      -> `{ token, ts }`. This endpoint is SELF-ORIGIN ONLY: a correct body with
      any other (or missing) `Origin` header answers 500 "Internal Server
      Error" — verified across a header matrix, where only
      `Origin: https://vidstuck.xyz` returned 200. So the origin we send is not
      cosmetic; it is the whole gate.

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
     · milkyway -> `type: "hls"` direct off a Cloudflare worker.

   MULTI-AUDIO is centaurus-only (`dubSupport`), and it is per-MANIFEST, not
   per-adaptation-set: `dubCode`/`dubType` swap which language the returned MPD's
   single audio AdaptationSet carries. That is why dubs ship as SIBLING master
   URLs (`audioTracks: [{label, uri}]`, the NHD convention the player already
   implements) instead of `#EXT-X-MEDIA` rows in one master.

   Honesty gates, in the same spirit as the NHD ladder: the advertised `dubs`
   list overstates reality. Verified live against tmdb 1101383 — `hi` and `ta`
   are listed but their MPDs answer HTTP 427 ("Fetch failed"), and the one
   subtitle row (`es`, `dubType=1`) answers "No sources found". So every dub is
   individually minted and its manifest fetched before it may reach the Audio
   menu; a dub that cannot produce an MPD is dropped, never listed. */

const ZXC_ORIGIN = "https://vidstuck.xyz";
const ZXC_SERVERS = ["andromeda", "centaurus", "atlas", "milkyway"];
// The servers that answer with a DASH manifest, and the one that carries dubs.
const ZXC_DASH_SERVERS = new Set(["andromeda", "centaurus"]);
const ZXC_DUB_SERVER = "centaurus";

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

// How many provider links we will probe per plain-HLS server. atlas/milkyway
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

/* Title/year/date/imdbId are advisory — the servers endpoint resolves with
   blanks, verified — but they are sent when their detail lookup succeeds so the
   provider sees the same request the browser makes. Never fatal. */
async function zxcTitleMeta({ type, tmdbId, refererPath }) {
  try {
    const text = await fetchUpstream(`${ZXC_ORIGIN}/backend/tmdb/details/${type}/${tmdbId}?language=en-US`, {
      referer: `${ZXC_ORIGIN}${refererPath}`,
      extraHeaders: zxcHeaders(refererPath, { json: true }),
    });
    const data = JSON.parse(text);
    return {
      title: String(data?.title || ""),
      date: String(data?.release_date || data?.last_air_date || ""),
      year: (() => {
        const d = String(data?.release_date || data?.last_air_date || "");
        return /^\d{4}/.test(d) ? d.slice(0, 4) : "";
      })(),
      imdbId: String(data?.imdb_id || ""),
    };
  } catch (error) {
    // The ZXC params are advisory upstream — a blank title/year still resolves,
    // so this degrades instead of failing the whole resolve.
    logWarn("zxc", "title metadata lookup failed, continuing with blank params", {
      message: error?.message,
    });
    return { title: "", date: "", year: "", imdbId: "" };
  }
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
  const text = await fetchUpstream(`${ZXC_ORIGIN}/backend/meow`, {
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
      return {
        // atlas hands back a vidstuck-relative relay path; the rest are absolute.
        url: url2.startsWith("/") ? `${ZXC_ORIGIN}${url2}` : url2,
        kind: String(l.type || "").toLowerCase(),
        resolution: Number(l.resolution) || 0,
      };
    })
    .filter(Boolean);
  if (links.length === 0) throw new Error("no link survived decryption");
  return { links, dubs: Array.isArray(data.dubs) ? data.dubs : [] };
}

/* The replayable URL of a generated playlist. Carries the whole title/server/dub
   identity so `handlePlaylist`/`handleManifest` can rebuild it from scratch. */
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
   marker URL replays instead of caching. */
async function zxcDashManifest(target) {
  const { meta, dubCode, dubType } = target;
  const { links } = await zxcServerLinks(meta, { server: meta.server, dubCode, dubType });
  const dash = links.find((l) => l.kind === "dash") || links[0];
  if (!dash?.url) throw new Error("no dash manifest for this server");
  const xml = await fetchUpstream(dash.url, {
    referer: `${ZXC_ORIGIN}${meta.refererPath}`,
    extraHeaders: zxcHeaders(meta.refererPath),
  });
  const manifest = parseMpd(xml);
  if (!manifest) throw new Error("manifest is not a transcodable MPD");
  return { manifest, refUrl: `${ZXC_ORIGIN}${meta.refererPath}` };
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
  const titleMeta = await zxcTitleMeta({ type, tmdbId, refererPath });
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
  // ~1.4 Mbps vs ~0.5 Mbps on Reacher S1E1) and milkyway ships three masters
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
        audioTracks: [],
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

  // Dubs: sibling masters, each verified by actually minting + transcoding it.
  const audioTracks = [];
  if (server === ZXC_DUB_SERVER && Array.isArray(data.dubs)) {
    const seen = new Set();
    // Filter to type-0 (audio). Drop the "original" row if present (it's the
    // native soundtrack already served by the master) to avoid duplicate labels,
    // and also dedupe by (lanCode/type) when the provider lists the same pair
    // twice. DO NOT hard-cap to 8: some titles carry 11+ type-0 dubs — the cap
    // silently truncated Telugu/ptbr/esla etc.
    // Only an explicitly provider-flagged row is the original. If the payload
    // carries no flag (older provider responses) we must NOT guess a winner —
    // dropping an arbitrary first row would silently hide a real dub.
    const originalKey = data.dubs.find((d) => d?.original && d?.lanCode) || null;
    const originalKeyStr = originalKey ? `${originalKey.lanCode}/${String(originalKey.type ?? "0")}` : null;
    const candidates = data.dubs
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
  }

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

async function handleManifest(body, res) {
  const playlistUrl = String(body.playlistUrl || "").trim();
  try {
    const u = new URL(playlistUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad protocol");
    await assertPublicDestination(u.toString());
  } catch {
    json(res, 400, { ok: false, error: "Invalid playlist URL", code: "bad-url" });
    return;
  }

  // A ZXC marker URL is transcoded from the provider's MPD rather than fetched.
  const zxcTarget = parseZxcPlaylistUrl(playlistUrl);
  if (zxcTarget) {
    // A master has no segments of its own — the download sheet always asks for a
    // concrete rendition, so asking for the master is a client bug and gets a
    // clear answer instead of a silent empty segment list.
    if (zxcTarget.view === ZXC_VIEW_MASTER) {
      json(res, 400, {
        ok: false,
        error: "Master playlist has no segments — resolve a rendition first",
        code: "bad-url",
      });
      return;
    }
    let text;
    try {
      text = await handleZxcPlaylist(playlistUrl);
    } catch (error) {
      json(res, 502, {
        ok: false,
        error: `Manifest transcode failed: ${error?.message || "unknown"}`,
        code: "manifest-fetch-failed",
      });
      return;
    }
    const parsed = parseMediaPlaylist(text, playlistUrl);
    json(res, 200, {
      ok: true,
      kind: parsed.kind,
      initUrl: parsed.initUrl,
      segments: parsed.segments.map((s) => s.url),
      duration: parsed.duration,
      count: parsed.count,
    });
    return;
  }

  try {
    const text = await fetchUpstream(playlistUrl, { referer: body.refUrl || playlistUrl });
    const parsed = parseMediaPlaylist(text, playlistUrl);
    json(res, 200, {
      ok: true,
      kind: parsed.kind,
      initUrl: parsed.initUrl,
      segments: parsed.segments.map((s) => s.url),
      duration: parsed.duration,
      count: parsed.count,
    });
  } catch (error) {
    json(res, 502, {
      ok: false,
      error: `Playlist fetch failed: ${error?.message || "unknown"}`,
      code: "manifest-fetch-failed",
    });
  }
}

/* Raw playlist relay for native HLS playback (prototype). Unlike `manifest`
   (which parses into JSON), this returns the playlist TEXT so an MSE player
   (hls.js) can parse levels/audio itself. Same SSRF validation + referer
   supply as the manifest path: manifest hosts that gate on the owning
   player's origin (e.g. VidCore's moon.quietridge.top) 403 a browser fetch,
   so the server fetches with the source's refUrl and hands the text back.
   Playlists are small; the MAX_TEXT_BYTES cap in fetchUpstream still binds. */
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

  try {
    // A ZXC marker URL is transcoded from the provider's MPD rather than fetched,
    // and the result is byte-for-byte the m3u8 hls.js expects.
    const text = parseZxcPlaylistUrl(playlistUrl)
      ? await handleZxcPlaylist(playlistUrl)
      : await fetchUpstream(playlistUrl, {
          referer: body.refUrl ? String(body.refUrl) : playlistUrl,
        });
    res.status(200);
    res.setHeader("content-type", "application/vnd.apple.mpegurl");
    res.setHeader("cache-control", "no-store");
    res.send(text);
  } catch (error) {
    json(res, 502, {
      ok: false,
      error: `Playlist fetch failed: ${error?.message || "unknown"}`,
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

  const start = Math.max(0, Math.floor(Number(body.range?.start) || 0));
  const max = Math.min(Math.max(1, Math.floor(Number(body.range?.max) || RANGE_CHUNK_BYTES)), RANGE_CHUNK_BYTES);
  const referer = body.refUrl ? String(body.refUrl) : undefined;

  try {
    const { bytes, more } = await fetchRangeChunk(url, { start, max, referer });
    res.status(200);
    res.setHeader("content-type", "application/octet-stream");
    res.setHeader("cache-control", "no-store");
    res.setHeader("content-length", String(bytes.length));
    res.setHeader("x-streamly-more", more ? "1" : "0");
    res.send(bytes);
  } catch (error) {
    json(res, 502, {
      ok: false,
      error: `Segment fetch failed: ${error?.message || "unknown"}`,
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

  try {
    switch (body.action) {
      case "resolve":
        await handleResolve(body, res);
        return;
      case "resolvevidsrc":
        await handleResolveVidsrc(body, res);
        return;
      case "resolvevidcore":
        await handleResolveVidcore(body, res);
        return;
      case "resolvenhd":
        await handleResolveNhd(body, res);
        return;
      case "resolvezxc":
        await handleResolveZxc(body, res);
        return;
      case "manifest":
        await handleManifest(body, res);
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
    json(res, 500, {
      ok: false,
      error: `downloadify failed: ${error?.message || "unknown"}`,
      code: "internal",
    });
  }
}
