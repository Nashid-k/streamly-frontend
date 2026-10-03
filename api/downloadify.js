// api/downloadify.js â€” browser-only download resolver (Vercel serverless).
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
//   resolvevidcore { type, id, season?, episode? }      -> { source, variants }
//   resolvezxc     { type, id, season?, episode?, server? } -> { source, variants, audioTracks }
//   manifest       { playlistUrl, refUrl }              -> { kind, initUrl, segments, duration }
//   playlist       { playlistUrl, refUrl }              -> raw m3u8 text (referer-supplied)
//   segment        { url, refUrl?, range: {start,max} } -> bytes (octet-stream)
//
// Byte transport notes (the reason this is different from the old version):
//   Â· Vercel caps a function's request/response body at 4.5MB. The previous
//     `segment` took a batch of 6 URLs and concatenated them â€” one 1080p
//     movie blew that cap instantly (413 FUNCTION_PAYLOAD_TOO_LARGE) and
//     nothing ever downloaded. Segments are now fetched ONE URL AT A TIME in
//     bounded Range chunks (â‰¤ ~3.5MB each); the client loops until the
//     server's `x-streamly-more` header says the file ended.
//   Â· CDN segments that are served with open CORS can be pulled straight from
//     the browser (zero serverless bandwidth); those that aren't go through
//     this range relay.
//
// Security:
//   Â· resolve accepts only allow-listed embed hosts (SSRF guard).
//   Â· EVERY upstream request â€” redirects included â€” is DNS-resolved and every
//     resolved address must be public (this closes the decimal/hex-IP literal
//     bypass like "http://2130706433/" that a string-based hostname blocklist
//     never sees).
//   Â· Response size caps bound bandwidth (a runaway "playlist" can't pull the
//     whole internet through us).
//   Â· Nothing is persisted; the function is a stateless pipe.
//   Â· Quality/HDR labels reflect what the host actually serves â€” we never
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
} from "../server/net.js";

export const config = { maxDuration: 60 };

const ALLOWED_EMBED_HOSTS = new Set([
  "cinesrc.st",
  "www.cinesrc.st",
  "vidlink.pro",
  "www.vidlink.pro",
  "2embed.cc",
  "www.2embed.cc",
  "vidcore.io",
  "www.vidcore.io",
  "peachify.top",
  "www.peachify.top",
  "vidup.to",
  "www.vidup.to",
  "embed.smashystream.com",
  "smashystream.com",
]);


/* Server 1's source catalogue. Vidrack's old `/api/sources/videasy` subpath died
   upstream 2026-09 (answers `{"sources":[]}` for every title) and silently
   dropped Server 1 to vidzen's single 720p fallback. Server 1 now resolves
   through vidrack's multi-provider aggregate API (see VIDRACK_SOURCES_API
   below) and vidzen remains a fallback. The old header note claiming an
   "incl. 4K" videasy ladder on moon.quietridge.top was stale: that subpath is
   gone, quietridge 403s at the root, and no 4K survives in this catalogue. */
const VIDZEN_SOURCES_API = "https://vidzen.fun/api/sources";
const VIDCORE_PLAYER_REFERER = "https://vidcore.io/";

/* Server 1 resolves through VIDRACK'S OWN aggregate API, deliberately NOT
   `vidcore.io`. Two separate things are in play and they must not be conflated:

   1. `vidcore.io` is the only 4K source anywhere in this catalogue. Its page
      token -> enc-dec -> servers/stream exchange yields a real ladder up to
      `2160p` (Horizon -> i-arch-400.jerso441ceg.com, plus Supreme/Prime/Orbit/
      Premiere 4K). It works from a normal IP â€” but it refuses Vercel's egress
      outright: `vidcore.io/movie/27205` answers 403 from BOTH `iad1` and `bom1`,
      while enc-dec.app, vidsrc.buzz, vidstuck.xyz and example.com answer 200
      from the same function. Replaying `server/net.js` `baseHeaders()` verbatim
      returns 200 for every pooled UA and every single-header-drop combination,
      so our header set is not the cause: the block covers Vercel's AWS ranges as
      a whole and no region pin avoids it. Hence Server 1 was dead in production.

   2. `vidrack.created.app` is a DIFFERENT host and not behind that block. It
      answers the same `{ serverSources: [...] }` aggregate its embedded player
      calls from `/embed/movie/:id` chunks, and sends `ACAO: *`. Commit da5bd23
      swapped this call for direct `vidcore.io` extraction, which is what broke
      Server 1; restoring it is what this constant is for.

   MEASURED CEILING â€” read before trusting a quality label here: this aggregate
   does NOT do 4K. Audited 2026-10-03 by fetching every master it lists, for both
   shapes â€” movie 27205 tops out at **800p** (its whole ladder is 800/536/534/
   532/356/266) and TV 1399 S1E1 reaches **1080p** on a later probe. Nothing
   anywhere answered 2160. Rows the aggregate LABELS "1080p" are frequently 800p
   in fact, so heights are only ever taken from the playlist text, never from the
   label. Its `/api/servers` advertises 10 backends (ipcloud, vidapi, moviebox,
   fsonline, videasy, vidrift1/2, xpass, tcloud, vidnest) but `server=` is
   ignored â€” all ten return the identical 28 sources â€” and `quality=2160p`,
   `maxQuality=4k` and `hls=4k` are ignored too. `src/constants/sources.js`
   advertises the observed 1080p ceiling, not 4K. */
const VIDRACK_SOURCES_API = "https://vidrack.created.app/api/sources";

/* Vidrack resolve timing + warm cache. The deadlines are chosen around
   measured reality (2026-09): vidrack's aggregate answers in 13-25s (it walks
   several upstream providers per call), vidzen's two-step chain in ~2-4s. The
   full pass must stay inside this function's maxDuration (60s â€” vercel.json
   and the export config below agree). The cache is keyed per title/episode
   and deliberately short-TTL: the cached URLs are short-lived SIGNED tokens,
   so a stale entry dies at the player's playability probe, not silently;
   four minutes keeps that window small while still absorbing the client's
   immediate phase:"full" follow-up and other viewers of the same title. */
const VIDRACK_TIMEOUT_FAST_MS = 8500;
const VIDRACK_TIMEOUT_FULL_MS = 28000;
const VIDRACK_FAST_DEADLINE_MS = 9500;
/* Per-row playability gate (playlist + AES key). Short on purpose: it runs on
   up to 6 rows in parallel and must not eat the fast phase's window; the warm
   cache means a repeat viewer pays it zero times. */
const VIDRACK_ROW_VERIFY_MS = 4000;
const VIDRACK_CACHE_TTL_MS = 4 * 60 * 1000;
const vidrackCache = new Map(); // "type:id:s:e" -> { source, variants, at }

/* Bandwidth hint for a ladder row we synthesise from an upstream QUALITY LABEL
   rather than from a real master playlist. hls.js uses this only to order/seed
   its own ABR when no BANDWIDTH attribute exists; it is never a claim about what
   the host serves. Heights come from the label, which the VIDRACK_SOURCES_API
   comment shows is marketing â€” but since these rows are label-only by
   construction, the hint follows the label and the UI label is what it is.
   Real masters parse their own BANDWIDTH via parseMasterPlaylist instead. */
function vidrackLabelBandwidth(height) {
  const table = {
    2160: 16000000,
    1440: 9000000,
    1080: 6000000,
    720: 2500000,
    480: 1200000,
    360: 800000,
    240: 500000,
  };
  return table[height] || 0;
}

function vidrackCacheKey(type, id, season, episode) {
  return `${type}:${id}:${season || ""}:${episode || ""}`;
}

function readVidrackCache(key) {
  const hit = vidrackCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > VIDRACK_CACHE_TTL_MS) {
    vidrackCache.delete(key);
    return null;
  }
  return hit;
}

function writeVidrackCache(key, { source, variants }) {
  vidrackCache.set(key, { source, variants, at: Date.now() });
  // Bounded working set: drop the oldest entry when the map outgrows itself.
  while (vidrackCache.size > 32) {
    vidrackCache.delete(vidrackCache.keys().next().value);
  }
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
        // dead iframe â€” try the next one
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

/* VidCore (Server 5). No browser mint: vidcore.org/embed
   resolves from a static sources catalogue whose "videasy" API lists the
   title's whole quality ladder as direct HLS URLs (Videasy mirrors, incl. 4K).
   Fallback â€” a title the videasy API doesn't carry is asked of the vidzen.fun
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

  /* VIDRACK AGGREGATE (the restored Server 1 ladder). The old videasy path
     (`/api/sources/videasy`) died upstream in 2026-09 â€” it answers
     `{"sources":[]}` for EVERY title now, which silently dropped Server 1 to
     vidzen's single 720p fallback (user: "not even has 1080p"). Vidrack's own
     player (chunks of /embed/movie/:id) calls `/api/sources?id&type[&season
     &episode]` and receives `{ serverSources: [{url, type, quality, label,
     provider, headers}], sseUrl, mode }` â€” a MULTI-PROVIDER aggregate.
     URLs minted by upstream providers are short-lived SIGNED tokens â€” this
     function fetches nothing but the source LIST, and the player fetches
     playlists through the normal manifest/segment actions within the token's
life. Each entry becomes its own ladder row, but "listed" is NOT "playable"
      and that distinction is load-bearing: a row whose playlist we can parse but
      whose AES-128 `#EXT-X-KEY` we CANNOT fetch hangs the player with a live
      timer and no picture (the manifest parsed, so duration/position are real,
      but not one fragment or key ever lands). That was the reported "timer shows,
      video does not" failure on this row, and it happened because this gate did
      not exist â€” the old note here claimed "the player's own playability probe
      does the real gate", which is false: hls.js treats a key failure as fatal
      and the viewer just sees a dead player. So every row we are about to
      PUBLISH is now measured: playlist readable, and when it is encrypted, the
      key actually fetchable. Unplayable rows are dropped before they can reach
      the menu; if nothing survives, the resolver returns null and the rotation
      ladder moves on honestly instead of dead-ending.

     CEILING: up to 800p, NOT 4K â€” see the VIDRACK_SOURCES_API comment for the
     audit behind that. Rows are built from upstream LABELS because most entries
     are label-only stubs rather than real masters, so the label is carried
     through verbatim and never upgraded; `sources.js` states the honest
     ceiling so nothing here over-promises. */
  /* Per-row playability, measured before a row is published. Playlist must
      read, and an AES-128 playlist must have a key we can actually fetch â€” the
      dlproxy family mints `/v1/key/...` URLs that our own egress can be refused
      on, and an unfetchable key is a dead player with a running timer. */
   const rowIsPlayable = async (row) => {
     let text = "";
     try {
       text = await fetchUpstream(row.uri, { referer, timeoutMs: VIDRACK_ROW_VERIFY_MS });
     } catch {
       return false;
     }
     /* `fetchUpstream` surfaces a non-2xx body instead of throwing on it, so the
        status alone cannot be trusted here: a 403 body would otherwise read as a
        perfectly good keyless playlist. A real HLS playlist always opens with
        #EXTM3U â€” an error page, a challenge, or a JSON blob never does. */
     if (!/#EXTM3U/i.test(text)) return false;
     const keyTag = /#EXT-X-KEY:([^\r\n]*)/i.exec(text);
     if (!keyTag) return true;
     if (/METHOD\s*=\s*NONE/i.test(keyTag[1])) return true;
     const keyUri = /URI\s*=\s*"([^"]+)"/i.exec(keyTag[1]);
     if (!keyUri) return false;
     try {
       await fetchRangeChunk(new URL(keyUri[1], row.uri).toString(), {
         start: 0,
         max: 64,
         referer,
       });
       return true;
     } catch {
       return false;
     }
   };

   const tryVidrack = async ({ timeoutMs = VIDRACK_TIMEOUT_FULL_MS } = {}) => {
    const api = new URL(VIDRACK_SOURCES_API);
    api.searchParams.set("id", tmdbId);
    api.searchParams.set("type", type);
    if (type === "tv") {
      if (!season || !episode) throw new Error("tv needs season/episode");
      api.searchParams.set("season", season);
      api.searchParams.set("episode", episode);
    }
    const text = await fetchUpstream(api.toString(), { referer, timeoutMs });
    const data = JSON.parse(text);
    const entries = Array.isArray(data?.serverSources) ? data.serverSources : [];
    /* Quality label â†’ height. "Auto"/"HD"/"FHDp" mark masters (an Auto master
       IS a quality ladder â€” hls.js ABR walks its rungs), so they keep height 0
       and ride the master branch of the player; precise labels ("1080p") map
       to their numeric rung. Deduped: vidrack lists mirror hosts of the same
       encode as separate rows, which would show the same picture twice. */
    const seen = new Map();
    for (const s of entries) {
      const raw = String(s?.url || "");
      if (!raw || !/^https?:\/\//i.test(raw)) continue;
      if (s?.type && s.type !== "hls") continue;
      if (!/\.m3u8([?#]|$)/i.test(raw) && !s?.quality) continue;
      const q = String(s?.quality || "Auto").trim();
      const m = /(\d{3,4})\s*p/i.exec(q);
      const height = m ? Number(m[1]) : 0;
      /* Key = rung + host + provider tag: vidrack lists mirror hosts of the
         same encode as separate rows (same picture twice), but two DIFFERENT
         providers on one host (or one provider with two rungs) are real
         choices and must both survive. */
      const key = `${height}|${new URL(raw).hostname}|${String(s?.provider || s?.label || q)}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        uri: raw,
        bandwidth: height ? vidrackLabelBandwidth(height) : 0,
        width: 0,
        height,
        framerate: 0,
        codecs: "",
        hdr: false,
        label: q,
      });
    }
    const rows = Array.from(seen.values());
    const masters = rows.filter((r) => r.height === 0);
    /* One row per DISTINCT rung height â€” the aggregate lists several encodes of
       the same rung, and the player already collapses rows by label, so extra
       rows of one height would only crowd out a different rung. */
    const byHeight = new Map();
    for (const r of rows) {
      if (r.height > 0 && !byHeight.has(r.height)) byHeight.set(r.height, r);
    }
    const rungs = [...byHeight.values()].sort((a, b) => b.height - a.height);
    /* A master (a real ABR ladder) takes index 0 so the default is the best
       encode, but the labelled rungs are guaranteed a slot BEHIND it. The live
       aggregate returns ~20 "Auto" masters for a typical title, so a plain
       "masters first, then slice(6)" filled every slot with height-0 rows and
       the viewer's quality menu collapsed to a single "Auto" entry with no
       manual choice â€” which is not what "multiple qualities" claims. */
const candidates = [...masters.slice(0, 1), ...rungs, ...masters.slice(1)].slice(0, 6);
     if (candidates.length === 0) return null;
     /* Gate the rows we are about to publish, in parallel: one playlist fetch
        each, plus one 64-byte key fetch for any encrypted row. Unplayable rows
        are dropped, so the viewer's menu only ever lists something that plays.
        `null` when nothing survives hands the title to the rotation ladder. */
     const gated = await Promise.all(candidates.map((row) => rowIsPlayable(row)));
     const variants = candidates.filter((_row, i) => gated[i]);
     if (variants.length === 0) return null;
     const best = variants[0];
    return {
      variants,
      source: { kind: "hls", url: best.uri, refUrl: referer },
    };
  };

  /* vidzen.fun fallback â€” the same catalogue the page polls alongside
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

  /* Vidrack is primary but SLOW: its aggregate answers in 13-25s in the wild.
     The previous version awaited it under fetchUpstream's 12s default
     timeout â€” so EVERY real request aborted into vidzen's 2Ã—800p ladder.
     That was the whole "Server 1 lost its quality" bug. The resolve is now
     TWO-PHASED:

     Â· default (fast): race vidrack against the quick vidzen chain and return
       whichever lands first â€” vidzen answers in seconds, flagged
       `upgradeable` so the client knows a richer ladder exists; vidrack
       usually wins only from the warm cache (instant, `cached: true`).
     Â· phase:"full": wait out vidrack's WHOLE ladder (28s budget, inside this
       function's maxDuration) and answer with it, or an honest `no-upgrade`.
     A `ladder-pending` verdict (neither answered in the window) is retryable:
     the client re-asks with phase:"full" instead of the viewer paying the
     same wait twice. Either failure mode is still honest â€” no fake ladder. */
  const cacheKey = vidrackCacheKey(type, tmdbId, season, episode);
  const cached = readVidrackCache(cacheKey);
  if (cached) {
    json(res, 200, { ok: true, source: cached.source, variants: cached.variants, ladderSource: "vidrack", cached: true });
    return;
  }

  if (body.phase === "full") {
    // Only vidrack runs here: the fast phase already put SOMETHING on
    // screen, so this call exists purely to fetch the richer ladder.
    try {
      const full = await tryVidrack({ timeoutMs: VIDRACK_TIMEOUT_FULL_MS });
      if (full) {
        writeVidrackCache(cacheKey, full);
        json(res, 200, { ok: true, source: full.source, variants: full.variants, ladderSource: "vidrack" });
        return;
      }
    } catch {
      // fall through â€” "no upgrade" is the honest answer, not a 5xx
    }
    json(res, 200, { ok: false, error: "VidCore full ladder unavailable", code: "no-upgrade" });
    return;
  }

  const vidrackP = tryVidrack({ timeoutMs: VIDRACK_TIMEOUT_FAST_MS })
    .then((v) => {
      // Prime the warm cache even when vidzen wins the race: the client's
      // background phase:"full" call (or the next viewer) then lands on it.
      if (v) writeVidrackCache(cacheKey, v);
      return v;
    })
    .catch(() => null);
  const vidzenP = tryVidzen().catch(() => null);
  // Only a NON-NULL result may win the race â€” a null must not resolve it.
  const firstWin = (p, tag) => p.then((v) => (v ? [tag, v] : new Promise(() => {})));
  const bothSettled = Promise.all([vidrackP, vidzenP]).then(() => ["both-done", null]);
  const deadline = new Promise((r) => setTimeout(() => r(["deadline", null]), VIDRACK_FAST_DEADLINE_MS));
  const [tag, result] = await Promise.race([
    firstWin(vidrackP, "vidrack"),
    firstWin(vidzenP, "vidzen"),
    bothSettled,
    deadline,
  ]);
  if (result) {
    json(res, 200, {
      ok: true,
      source: result.source,
      variants: result.variants,
      ladderSource: tag,
      // vidzen is the 800p ceiling â€” tell the client the 4K-capable vidrack
      // ladder may still be fetchable via phase:"full". undefined when
      // vidrack itself won.
      upgradeable: tag === "vidzen" || undefined,
    });
    return;
  }
  if (tag === "both-done") {
    // Both catalogues DEFINITIVELY answered (any outcome) with nothing
    // usable - that is an honest no-source, not a wait: fail over now.
    json(res, 200, { ok: false, error: "No downloadable stream found via VidCore", code: "no-source" });
    return;
  }
  // The deadline fired while at least one catalogue was STILL walking its
  // upstreams (vidrack takes 13-25s). A retryable verdict beats making the
  // viewer sit through the same wait twice inside one request - the client
  // re-asks with phase:"full", which waits out the whole aggregate.
  json(res, 200, {
    ok: false,
    error: "VidCore is still aggregating sources",
    code: "ladder-pending",
    upgradeable: true,
  });
}

/* NetMirror (net27.cc family) â€” REMOVED (user order, 2024-09). net27's video
   layer is per-IP 429-gated (bcdnxw CDN) and its auth is a Cloudflare
   challenge; the canonical-mirror family (net52/net51) mint real video URLs
   only for a per-session token issued behind an interactive challenge. No
   legitimate egress can stream them. The resolver, client provider, CSP
   entries and player branches were removed; CineSrc (iframe sources) |
   VidCore | Videasy | VidVid remain the playback paths. */

/* â”€â”€ ZXC / vidstuck third-party provider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
   zxcstream.icu is a thin shell around a vidstuck.xyz JW Player embed; every
   real stream is behind vidstuck's own two-step backend, so we mint and read
   it server-side exactly like VidCore and serve the bytes ourselves.

   The contract, read off the shipped client chunk (vidstuck's `queryFn`):

   1. `POST /backend/fuckyou` with `{tmdbId, media_type, path[, season, episode]}`
      -> `{ token, ts }`. This endpoint is SELF-ORIGIN ONLY: a correct body with
      any other (or missing) `Origin` header answers 500 "Internal Server
      Error" â€” verified across a header matrix, where only
      `Origin: https://vidstuck.xyz` returned 200. So the origin we send is not
      cosmetic; it is the whole gate.

      PATH RENAMED UPSTREAM 2026-10-03 (why every ZXC row was dead): this used to
      be `POST /backend/meow`, which now answers 404 â€” "meow" is no longer an
      endpoint, it is one of their SERVER names ("Ursa", `path=meow`). Re-scraping
      the shipped embed chunk (`ext/static/chunks/1jckevlg2_ail.js`) shows the
      mint moved to `/backend/fuckyou` with the identical body and the identical
      `{token, ts}` reply. Verified live before changing this line: old path 404,
new path 200 `{token, ts}`, and centaurus/andromeda/atlas/meow then resolve
       `success=true` on `/backend/servers/{path}`. (`milkyway` still answers
       `success=true` there too, but its manifest 403s, so it is retired.)

   2. `GET /backend/servers/{path}?â€¦` with a dozen OBFUSCATED query names
      (hex strings, mapped below) plus the token/ts from step 1, and optionally
      `dubCode`/`dubType` to pick an audio language. Answers
      `{ success, links: [{ type: "hls"|"dash", link, resolution }], dubs: [...] }`.
      Every `link` is AES-256-CBC encrypted with a hardcoded passphrase using
      CryptoJS's OpenSSL envelope (`Salted__` + 8-byte salt, key/IV derived by
      EVP_BytesToKey with MD5 and ONE round). `decryptZxcLink` below is that
      derivation, and it is the only reason this works â€” the ciphertext is
      opaque without it.

   The four servers, and why they need different handling:
     Â· andromeda / centaurus -> `type: "dash"`. MPD, not HLS. Transcoded to an
       fMP4 HLS ladder by server/dashToHls.js (manifest only â€” no media bytes
       are re-encoded, the segments are already CMAF).
     Â· atlas  -> `type: "hls"` behind vidstuck's own `/backend/servers/atlas/edge`
       relay, so its relative `link` must be resolved against the origin.
     Â· meow    -> `type: "hls"` direct off a Cloudflare worker. This row is
       "Ursa" upstream and REPLACES the retired `milkyway`, whose manifest answers
       403 through this function and so could never play.

   MULTI-AUDIO is centaurus-only (`dubSupport`), and it is per-MANIFEST, not
   per-adaptation-set: `dubCode`/`dubType` swap which language the returned MPD's
   single audio AdaptationSet carries. That is why dubs ship as SIBLING master
   URLs (`audioTracks: [{label, uri}]`, the sibling-stream convention the player already
   implements) instead of `#EXT-X-MEDIA` rows in one master.

   Honesty gates: the advertised `dubs`
   list overstates reality. Verified live against tmdb 1101383 â€” `hi` and `ta`
   are listed but their MPDs answer HTTP 427 ("Fetch failed"), and the one
   subtitle row (`es`, `dubType=1`) answers "No sources found". So every dub is
   individually minted and its manifest fetched before it may reach the Audio
   menu; a dub that cannot produce an MPD is dropped, never listed. */

const ZXC_ORIGIN = "https://vidstuck.xyz";
/* Upstream's own server list, read off the shipped client chunk
   (`gN.SERVERS`): Andromeda "Smooth Playback & HD", Centaurus "Multi Audio
   Support" (the only one with `dubSupport`), Atlas "Alternative", and Ursa
   "Alternative" â€” whose PATH is literally `meow`. `milkyway` is GONE: it is no
   longer in their list and its manifest answers 403 through our function
   ("manifest unreadable: Upstream 403"), so it was dropped rather than left as
   a row that can never play. */
const ZXC_SERVERS = ["andromeda", "centaurus", "atlas", "meow"];
// The servers that answer with a DASH manifest, and the one that carries dubs.
const ZXC_DASH_SERVERS = new Set(["andromeda", "centaurus"]);
const ZXC_DUB_SERVER = "centaurus";

/* The obfuscated parameter names the client sends. Read straight off the
   shipped bundle's `uo/up/ug/uf/uh/ul/uu/ud/uc/um` constants â€” renaming any of
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

// How many provider links we will probe per plain-HLS server. atlas/meow
// hand back 2-3 links that are alternate encodes or mirrors of ONE runtime, not
// a quality ladder, so we pick a single one â€” the bound only stops a
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

/* CryptoJS.AES.decrypt(ciphertext, passphrase).toString(enc.Utf8) â€” the
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

/* Title/year/date/imdbId are advisory â€” the servers endpoint resolves with
   blanks, verified â€” but they are sent when their detail lookup succeeds so the
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
    // The ZXC params are advisory upstream â€” a blank title/year still resolves,
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
  const text = await fetchUpstream(`${ZXC_ORIGIN}/backend/fuckyou`, {
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
   fetch â€” the cost a single generated playlist request costs, which is why the
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
  // #EXTINF total, different segment granularity and bitrate â€” measured at
  // ~1.4 Mbps vs ~0.5 Mbps on Reacher S1E1) and meow ships several masters
  // that are byte-identical mirrors of one 640x360 encode. Publishing all of
  // them as "variants" would show the user the same picture three times, so we
  // pick ONE â€” but we probe them in order and fall through, because a dead
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
    // twice. DO NOT hard-cap to 8: some titles carry 11+ type-0 dubs â€” the cap
    // silently truncated Telugu/ptbr/esla etc.
    // Only an explicitly provider-flagged row is the original. If the payload
    // carries no flag (older provider responses) we must NOT guess a winner â€”
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
    // A master has no segments of its own â€” the download sheet always asks for a
    // concrete rendition, so asking for the master is a client bug and gets a
    // clear answer instead of a silent empty segment list.
    if (zxcTarget.view === ZXC_VIEW_MASTER) {
      json(res, 400, {
        ok: false,
        error: "Master playlist has no segments â€” resolve a rendition first",
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
  // absent). Default CORS exposes neither, so every JS read was null â€” that
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
  // legit title needs hundreds of requests fast â€” but 1800/min (30/s) still
  // caps a runaway loop while letting the parallel client finish one title.
  const limit = rateLimit({ key: () => `dl:${clientIp(req)}`, limit: 1800, windowMs: 60_000 });
  // Capacity ledger (PLAN.md P0.3): one in-memory increment per relay call;
  // batched Mongo flush â€” never a DB write in the request path.
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
      case "resolvevidcore":
        await handleResolveVidcore(body, res);
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
