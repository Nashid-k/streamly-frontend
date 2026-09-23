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
//   resolve       { embedUrl }                          -> { source, variants }
//   resolvevidsrc { type, id, season?, episode? }       -> { source, variants }
//   manifest      { playlistUrl, refUrl }               -> { kind, initUrl, segments, duration }
//   segment       { url, refUrl?, range: {start,max} }  -> bytes (octet-stream)
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

import { lookup } from "node:dns/promises";
import net from "node:net";
import {
  parseMasterPlaylist,
  parseMediaPlaylist,
  resolveUrl,
} from "../src/utils/downloadQuality.js";
import { rateLimit, tooManyRequests, clientIp } from "./lib/rateLimit.js";

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

// Vercel hard-caps function response bodies at 4.5MB; keep well under with
// headroom for headers/JSON overhead.
const RANGE_CHUNK_BYTES = 3.5 * 1024 * 1024;
const MAX_TEXT_BYTES = 1.5 * 1024 * 1024;

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function json(res, status, body) {
  res.status(status).setHeader("content-type", "application/json");
  res.send(JSON.stringify(body));
}

function isBlockedHost(hostname) {
  const h = String(hostname || "").toLowerCase();
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "169.254.169.254" || h.startsWith("169.254.")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  if (/^\[?f[cd][0-9a-f]{2}:/i.test(h)) return true;
  return false;
}

function ipv4ToInt(ip) {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isPrivateIpV4(ip) {
  const n = ipv4ToInt(ip);
  // 0/8, 10/8, 127/8, 169.254/16, 172.16/12, 192.168/16, 100.64/10, 198.18/15,
  // 224/4 multicast + higher reserved, 255.255.255.255.
  if (n === 0xffffffff) return true;
  if ((n >>> 24) === 0) return true;
  if ((n >>> 24) === 127) return true;
  if ((n >>> 24) === 10) return true;
  if ((n >>> 16) === 0xa9fe) return true;
  if ((n >>> 20) === 0xac1) return true;
  if ((n >>> 16) === 0xc0a8) return true;
  if ((n >>> 22) === 0x644) return true;
  if ((n >>> 16) >= 0xc612 && (n >>> 16) <= 0xc633) return true;
  if ((n >>> 28) >= 0xe) return true;
  return false;
}

function isPrivateIpV6(ip) {
  const lower = String(ip).toLowerCase();
  if (lower === "::" || lower === "::1") return true;
  if (/^f[cd][0-9a-f]{2}/.test(lower)) return true; // fc00::/7 ULA
  if (/^fe8/.test(lower)) return true; // fe80::/10 link-local
  const v4 = lower.split(":").pop();
  if (v4 && v4.includes(".")) return isPrivateIpV4(v4);
  return false;
}

function isPrivateIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateIpV4(ip);
  if (v === 6) return isPrivateIpV6(ip);
  return true; // unparseable hostname masquerading as IP -> block
}

/* SSRF hardening — DNS-resolving destination check. The string blocklist above
   catches "169.254.169.254" and friends, but NOT literal encodings:
   "http://2130706433/" (127.0.0.1) or "http://0177.0.0.1/" — getaddrinfo may
   interpret them as loopback and a name-based check never sees the IP. We
   therefore resolve the hostname (all addresses) and require every address to
   be a public IP. Called for the FIRST hop AND every redirect target. */
async function assertPublicDestination(urlStr) {
  const u = new URL(urlStr);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("blocked protocol");
  const hostname = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!hostname) throw new Error("blocked host");
  if (isBlockedHost(hostname)) throw new Error(`blocked host: ${hostname}`);

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error(`blocked host: ${hostname}`);
    return u.toString();
  }

  let records;
  try {
    records = await lookup(hostname, { all: true });
  } catch {
    throw new Error(`blocked host: ${hostname}`);
  }
  if (!records || records.length === 0) throw new Error(`blocked host: ${hostname}`);
  for (const record of records) {
    if (isPrivateIp(record.address)) throw new Error(`blocked host: ${hostname}`);
  }
  return u.toString();
}

/* SSRF hardening: the old fetch used redirect:"follow", so any allow-listed
   host could 302 the function into fetching 169.254.169.254 / internal IPs —
   the hostname blocklist never saw the redirect target. We now follow hops
   MANUALLY and re-validate every destination against the private-IP rules. */
const MAX_REDIRECTS = 5;

function fetchNoRedirect(url, opts) {
  return fetch(url, { ...opts, redirect: "manual" });
}

function baseHeaders() {
  return {
    "user-agent": getRandomUA(),
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not:A=Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "same-origin",
    "sec-fetch-user": "?1",
  };
}

async function followRedirects(url, headers, signal, as) {
  let current = url;
  let upstream = await fetchNoRedirect(current, { headers, signal });
  for (let hop = 0; hop < MAX_REDIRECTS && upstream.status >= 300 && upstream.status < 400; hop += 1) {
    const location = upstream.headers.get("location");
    if (!location) throw new Error("Redirect without location");
    current = await assertPublicDestination(new URL(location, current).toString());
    upstream = await fetchNoRedirect(current, { headers, signal });
  }
  if (!upstream.ok) {
    const err = new Error(`Upstream ${upstream.status}`);
    err.status = upstream.status;
    throw err;
  }
  if (as === "buffer") {
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > RANGE_CHUNK_BYTES) throw new Error("upstream response too large");
    return buf;
  }
  const text = await upstream.text();
  if (text.length > MAX_TEXT_BYTES) throw new Error("upstream response too large");
  return text;
}

async function fetchUpstream(url, { as = "text", timeoutMs = 12000, referer, retryCount = 0 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const safeUrl = await assertPublicDestination(url);
    const headers = baseHeaders();
    if (referer) {
      headers.referer = referer;
      headers["referrer-policy"] = "strict-origin-when-cross-origin";
    }

    try {
      return await followRedirects(safeUrl, headers, controller.signal, as);
    } catch (error) {
      // Retry with a different user agent on transient 403/429 responses.
      if (as !== "buffer" && error?.status && (error.status === 403 || error.status === 429) && retryCount < 3) {
        return fetchUpstream(url, { as, timeoutMs, referer, retryCount: retryCount + 1 });
      }
      throw error;
    }
  } finally {
    clearTimeout(timer);
  }
}

/* Range-chunked segment fetch. The upstream is asked for `bytes=start-(start+max-1)`
   and the response is capped at `max`; `more` tells the caller whether more
   bytes follow (derived from content-range when the server sends one, else the
   "exactly full chunk" heuristic — the client breaks on a subsequent empty
   chunk, so any one-off guess resolves safely).
   Some CDNs gate on the referer of their owning player (e.g. VidSrc's opaque
   relay expects https://xplayer.videm.xyz/). Their 403 declares the expected
   origin in access-control-allow-origin, so we retry once from that origin —
   it's only used as a request header, which adds no SSRF surface. */
async function fetchRangeChunk(url, { start = 0, max = RANGE_CHUNK_BYTES, referer } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const safeUrl = await assertPublicDestination(url);

    const attempt = async (ref) => {
      const headers = baseHeaders();
      headers.range = `bytes=${start}-${start + max - 1}`;
      if (ref) {
        headers.referer = ref;
        headers.origin = new URL(ref).origin;
      }
      let current = safeUrl;
      let upstream = await fetchNoRedirect(current, { headers, signal: controller.signal });
      for (let hop = 0; hop < MAX_REDIRECTS && upstream.status >= 300 && upstream.status < 400; hop += 1) {
        const location = upstream.headers.get("location");
        if (!location) throw new Error("Redirect without location");
        current = await assertPublicDestination(new URL(location, current).toString());
        upstream = await fetchNoRedirect(current, { headers, signal: controller.signal });
      }
      return upstream;
    };

    let upstream = await attempt(referer);
    if (upstream.status === 403 && referer) {
      const declared = upstream.headers.get("access-control-allow-origin");
      if (declared && declared !== "*" && !/^null$/i.test(declared) && declared !== new URL(referer).origin) {
        upstream = await attempt(declared);
      }
    }

    // At a file boundary a range past the end comes back 416 — that's the
    // "more=false" signal, not an error (the chunk at an exact multiple of
    // the chunk size legitimately over-requests once).
    if (upstream.status === 416) {
      const totalMatch = /bytes\s+\*\/(\d+)/i.exec(upstream.headers.get("content-range") || "");
      const total = totalMatch ? Number(totalMatch[1]) : NaN;
      if (Number.isFinite(total) && start >= total) {
        return { bytes: Buffer.alloc(0), more: false };
      }
      throw new Error("Upstream 416");
    }
    if (!upstream.ok) throw new Error(`Upstream ${upstream.status}`);

    // Some CDNs answer 200 and ignore Range entirely. If the whole file fits
    // in the slice we can still serve it; otherwise we cannot seek, so a clear
    // error beats a silently-corrupted or looped download.
    if (upstream.status !== 206 && start > 0) throw new Error("Upstream ignores range requests");
    let contentLength = Number(upstream.headers.get("content-length") || 0) || 0;

    let buffer = Buffer.from(await upstream.arrayBuffer());
    let truncated = false;
    if (buffer.length > max) {
      buffer = buffer.subarray(0, max);
      truncated = true;
    }
    if (upstream.status !== 206 && contentLength > max && buffer.length === max) {
      throw new Error("Upstream ignores range requests");
    }
    contentLength = Math.max(contentLength, buffer.length);

    const contentRange = upstream.headers.get("content-range") || "";
    const more = truncated || moreFromContentRange(contentRange, start, max, buffer.length, contentLength);
    return { bytes: buffer, more };
  } finally {
    clearTimeout(timer);
  }
}

function moreFromContentRange(contentRange, start, max, got, contentLength) {
  const m = /bytes\s+\d+-\d+\/(\d+)/i.exec(contentRange);
  if (m) {
    const total = Number(m[1]);
    if (Number.isFinite(total) && total > 0) return start + got < total;
  }
  // No content-range (or a non-seekable 200 body): a full-cap chunk plus a
  // known content-length means the file outlived this slice; otherwise we got
  // everything the file (or this range response) had to give.
  if (contentLength > got) return true;
  return got === max;
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

  // Segment downloads are bandwidth-heavy. The old 30/min window was too tight
  // for a real movie (hundreds of chunks) — 600/min still caps a runaway loop
  // while letting a sequential client finish one title.
  const limit = rateLimit({ key: () => `dl:${clientIp(req)}`, limit: 600, windowMs: 60_000 });
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
      case "manifest":
        await handleManifest(body, res);
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