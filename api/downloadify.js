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

import {
  parseMasterPlaylist,
  parseMediaPlaylist,
  resolveUrl,
} from "../src/utils/downloadQuality.js";
import { rateLimit, tooManyRequests, clientIp } from "./lib/rateLimit.js";
import { assertPublicDestination } from "./lib/ssrf.js";
import {
  json,
  fetchUpstream,
  fetchRangeChunk,
  RANGE_CHUNK_BYTES,
  MAX_TEXT_BYTES,
} from "./lib/net.js";

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
          uri: s.url,
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
    const text = await fetchUpstream(playlistUrl, {
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
