// api/downloadify.js — browser-only download resolver (Vercel serverless).
//
// The web app has no backend and no direct media URLs: every server is a
// third-party iframe. To let viewers download a title "like a browser
// download" we resolve the embed host's HLS playlist here (server-side, so
// CORS/bot-walls don't apply) and proxy the media segments back. The browser
// then saves the assembled bytes to disk with the File System Access API
// (incremental write) or a Blob download fallback.
//
// Actions (POST JSON):
//   resolve  { embedUrl }                     -> { variants: [...] }  (HLS master ladder)
//   manifest { playlistUrl }                  -> { kind, initUrl, segments, duration }
//   segment  { urls: [...] }                  -> concatenated bytes (application/octet-stream)
//
// Notes:
//   · resolve accepts only allow-listed embed hosts (SSRF guard).
//   · manifest/segment block private/metadata IPs but otherwise follow the
//     playlist's own CDN hosts.
//   · Nothing is persisted; the function is a stateless pipe.
//   · Quality/HDR labels reflect what the host actually serves — we never
//     upscale or transcode, and DRM-protected renditions cannot be saved.

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

/* SSRF hardening: the old fetch used redirect:"follow", so any allow-listed
   host could 302 the function into fetching 169.254.169.254 / internal IPs —
   the hostname blocklist never saw the redirect target. We now follow hops
   MANUALLY and re-validate every destination against the private-IP rules. */
const MAX_REDIRECTS = 5;

async function fetchNoRedirect(url, opts) {
  return fetch(url, { ...opts, redirect: "manual" });
}

function assertSafeDestination(urlStr) {
  const u = new URL(urlStr);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("blocked protocol");
  if (isBlockedHost(u.hostname)) throw new Error(`blocked host: ${u.hostname}`);
  return u.toString();
}

async function fetchUpstream(url, { as = "text", timeoutMs = 12000, referer, retryCount = 0, redirectCount = 0 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      "user-agent": getRandomUA(),
      accept: as === "text" ? "*/*" : "*/*",
      "accept-language": "en-US,en;q=0.9",
      "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not:A=Brand";v="99"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "document",
      "sec-fetch-mode": "navigate",
      "sec-fetch-site": "same-origin",
      "sec-fetch-user": "?1",
    };
    if (referer) {
      headers.referer = referer;
      headers["referrer-policy"] = "strict-origin-when-cross-origin";
    }

    const upstream = await fetchNoRedirect(url, { headers, signal: controller.signal });

    // Re-validate every redirect target — this closes the SSRF redirect gap.
    if (upstream.status >= 300 && upstream.status < 400) {
      clearTimeout(timer);
      const location = upstream.headers.get("location");
      if (!location) throw new Error("Redirect without location");
      if (redirectCount >= MAX_REDIRECTS) throw new Error("Too many redirects");
      const nextUrl = assertSafeDestination(new URL(location, url).toString());
      return fetchUpstream(nextUrl, { as, timeoutMs, referer, retryCount, redirectCount: redirectCount + 1 });
    }

    if (!upstream.ok) {
      // Retry with different user agent on 403/429
      if ((upstream.status === 403 || upstream.status === 429) && retryCount < 3) {
        clearTimeout(timer);
        console.log(`[downloadify] Retry ${retryCount + 1}/3 for ${url} with status ${upstream.status}`);
        return fetchUpstream(url, { as, timeoutMs, referer, retryCount: retryCount + 1, redirectCount });
      }
      const err = new Error(`Upstream ${upstream.status}`);
      err.status = upstream.status;
      throw err;
    }
    if (as === "buffer") {
      const ab = await upstream.arrayBuffer();
      return Buffer.from(ab);
    }
    return await upstream.text();
  } finally {
    clearTimeout(timer);
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
        const parsed = new URL(src);
        const nested = await resolveFromEmbed(parsed.toString(), depth + 1);
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

async function handleManifest(body, res) {
  const playlistUrl = String(body.playlistUrl || "").trim();
  try {
    const u = new URL(playlistUrl);
    if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("bad protocol");
    if (isBlockedHost(u.hostname)) throw new Error("blocked host");
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
  const urls = Array.isArray(body.urls) ? body.urls.slice(0, 12) : [];
  if (urls.length === 0) {
    json(res, 400, { ok: false, error: "No segment URLs", code: "bad-request" });
    return;
  }
  for (const url of urls) {
    try {
      const u = new URL(url);
      if (isBlockedHost(u.hostname)) throw new Error("blocked host");
    } catch {
      json(res, 400, { ok: false, error: "Invalid segment URL", code: "bad-url" });
      return;
    }
  }

  try {
    const referer = body.refUrl ? String(body.refUrl) : undefined;
    const buffers = await Promise.all(
      urls.map((url) => fetchUpstream(url, { as: "buffer", referer, timeoutMs: 15000 })),
    );
    const out = Buffer.concat(buffers);
    res.status(200).setHeader("content-type", "application/octet-stream");
    res.setHeader("cache-control", "no-store");
    res.send(out);
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

  // Segment downloads are bandwidth-heavy — a tighter window than the others.
  const limit = rateLimit({ key: () => `dl:${clientIp(req)}`, limit: 30, windowMs: 60_000 });
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
