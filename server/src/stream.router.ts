import express, { Request, Response, Router } from "express";

/* ── M3U8 URL rewriter ────────────────────────────────────────── */
function resolveUrl(url: string, base: string): string {
  try {
    if (url.startsWith("http://") || url.startsWith("https://")) return url;
    if (url.startsWith("//")) return "https:" + url;
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

function rewriteM3u8(content: string, originalUrl: string, proxyBase: string): string {
  const baseUrl = originalUrl.substring(0, originalUrl.lastIndexOf("/") + 1);
  return content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      // Rewrite URI="..." in tags (#EXT-X-KEY, #EXT-X-MAP, etc.)
      if (trimmed.startsWith("#") && /URI="/.test(trimmed)) {
        return trimmed.replace(/URI="([^"]+)"/g, (_, uri: string) => {
          const abs = resolveUrl(uri, baseUrl);
          return `URI="${proxyBase}${encodeURIComponent(abs)}"`;
        });
      }
      // Rewrite URL lines (variant playlists, segments)
      if (!trimmed.startsWith("#") && !trimmed.startsWith("<")) {
        const abs = resolveUrl(trimmed, baseUrl);
        return `${proxyBase}${encodeURIComponent(abs)}`;
      }
      return line;
    })
    .join("\n");
}

/* ── NetMirror static resolver ────────────────────────────────
   NetMirror (net77.cc) serves a CORS-open multi-audio HLS master per
   title, but its JSON lookups (search.php / playlist.php) send no CORS
   headers, so they must run server-side. Pure HTTP — no Playwright. */
const NETMIRROR_TM_PARAM = "1724829817"; // static, reusable per NetMirror archive
let netmirrorMirrorCache: { base: string | null; time: number } = { base: null, time: 0 };

async function discoverNetmirrorMirror(): Promise<string> {
  const MIRROR_TTL = 60 * 60 * 1000; // 1h — mirrors rotate
  const cached = netmirrorMirrorCache;
  if (cached.base && Date.now() - cached.time < MIRROR_TTL) return cached.base;
  const defaultBase = "https://net77.cc";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch("https://netmirror.gg/", {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    clearTimeout(t);
    const html = await res.text();
    // netmirror.gg is the master seat; it links the live mirror (net77.cc etc.)
    const m = html.match(/https?:\/\/(net[a-z0-9]+\.cc)/i) || html.match(/\b(net[a-z0-9]+\.cc)\b/i);
    netmirrorMirrorCache = { base: m ? `https://${m[1]}` : defaultBase, time: Date.now() };
  } catch {
    netmirrorMirrorCache = { base: defaultBase, time: Date.now() };
  }
  return netmirrorMirrorCache.base as string;
}

async function netmirrorSearch(base: string, title: string) {
  const res = await fetch(`${base}/search.php?s=${encodeURIComponent(title)}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`NetMirror search failed (${res.status})`);
  const data = await res.json();
  // type:1 is the "Top Searches" fallback (no real hit); type:0 has real results
  const results = Array.isArray(data?.searchResult) ? data.searchResult : [];
  const hit = results.find((r: any) => typeof r?.id === "string") || results[0];
  return hit ? { id: hit.id, name: hit.t || title } : null;
}

async function netmirrorPlaylist(base: string, id: string) {
  const res = await fetch(
    `${base}/playlist.php?id=${encodeURIComponent(id)}&t=&tm=${NETMIRROR_TM_PARAM}`,
    {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!res.ok) throw new Error(`NetMirror playlist failed (${res.status})`);
  const data = await res.json();
  // NetMirror returns a top-level ARRAY of player configs; the first is the title
  const entry = Array.isArray(data) ? data[0] : data;
  const sources = Array.isArray(entry?.sources) ? entry.sources : [];
  // "Full HD" master = the source WITHOUT a ?q= quality suffix
  const fullHd = sources.find((s: any) => s?.file && !s.file.includes("?q=")) || sources[0];
  if (!fullHd?.file) return null;
  const abs = /^https?:/.test(fullHd.file) ? fullHd.file : base + fullHd.file;
  const captions = (Array.isArray(entry?.tracks) ? entry.tracks : [])
    .filter((t: any) => (t?.kind === "captions" || t?.kind === "subtitles") && t?.file)
    .map((t: any) => ({
      label: t.label || "English",
      url: t.file.startsWith("//") ? `https:${t.file}` : /^https?:/.test(t.file) ? t.file : base + t.file,
    }));
  const thumbnails = (Array.isArray(entry?.tracks) ? entry.tracks : [])
    .filter((t: any) => /thumb/i.test(t?.kind || "") && t?.file)
    .map((t: any) => (t.file.startsWith("//") ? `https:${t.file}` : /^https?:/.test(t.file) ? t.file : base + t.file));
  return { streamUrl: abs, captions, thumbnails };
}

async function netmirrorAudioLanguages(text: string) {
  const langs: { language: string; name: string }[] = [];
  for (const m of text.matchAll(/#EXT-X-MEDIA:TYPE=AUDIO[^\n]*/g)) {
    const line = m[0];
    const language = (line.match(/LANGUAGE="([^"]*)"/) || [])[1] || "";
    const name = (line.match(/NAME="([^"]*)"/) || [])[1] || language || "Unknown";
    if (language || name) langs.push({ language, name });
  }
  return langs;
}

/* Lightweight liveness probe: a Cloudflare-fronted media origin answers 2xx to a
   Range'd GET when it is alive, and 5xx/523 when it is not. */
async function netmirrorMediaAlive(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", Range: "bytes=0-2047" },
      signal: AbortSignal.timeout(6000),
    });
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

/* Verify the master's media chain is actually playable RIGHT NOW before handing
   it to the player. NetMirror's media CDN (nm-cdn*.top) has repeatedly died
   while the site shell + captions + thumbnails stay up; never serve a broken
   master. */
async function netmirrorPreflight(masterUrl: string) {
  try {
    const res = await fetch(masterUrl, {
      headers: { "User-Agent": "Mozilla/5.0", Range: "bytes=0-4095" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return { ok: false, reason: `master http ${res.status}` };
    const text = await res.text();
    const mediaUrls = [...text.matchAll(/https?:\/\/[^\s"']+/g)].map((m) => m[0]);
    if (mediaUrls.length === 0) return { ok: false, reason: "no media urls in master" };
    const alive = await Promise.all(mediaUrls.slice(0, 6).map((u) => netmirrorMediaAlive(u)));
    const idx = alive.findIndex(Boolean);
    if (idx < 0) return { ok: false, reason: "media hosts unreachable" };
    const verified = mediaUrls[idx];
    return {
      ok: true,
      audioLanguages: netmirrorAudioLanguages(text),
      mediaHost: new URL(verified).hostname,
    };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "preflight error" };
  }
}

/* CORS Proxy — fetches any URL server-side. For m3u8 content, rewrites internal
   URLs so sub-playlists and segments route through this proxy. Pure HTTP. */
export function createStreamRouter(): Router {
  const router = express.Router();

  const cache = new Map<string, { data: any; time: number; ttl?: number }>();
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const CACHE_MAX_ENTRIES = 500; // hard cap — evict oldest beyond this

  const cacheGet = (key: string) => {
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.time > (entry.ttl || CACHE_TTL)) {
      cache.delete(key);
      return undefined;
    }
    return entry.data;
  };
  const cacheSet = (key: string, data: any, ttl?: number) => {
    cache.set(key, { data, time: Date.now(), ttl });
    while (cache.size > CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  };

  router.get("/api/netmirror/thumbnails", async (req: Request, res: Response) => {
    const { title, type = "movie" } = req.query;
    if (!title) return res.status(400).json({ error: "title is required" });

    const cacheKey = `netmirror-thumbs:${title}:${type}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    try {
      const discovered = await discoverNetmirrorMirror();
      const candidates: string[] = [];
      const pushMirror = (m: string) => {
        if (/^https:\/\/(net[a-z0-9]+\.cc)$/i.test(m || "") && !candidates.includes(m)) candidates.push(m);
      };
      pushMirror(discovered);
      pushMirror("https://net77.cc");
      pushMirror("https://net52.cc");

      for (const base of candidates) {
        const hit = await netmirrorSearch(base, String(title)).catch(() => null);
        if (!hit) continue;
        const pl = await netmirrorPlaylist(base, hit.id).catch(() => null);
        if (!pl) continue;
        const data = {
          title,
          contentId: hit.id,
          mirror: base,
          thumbnails: pl.thumbnails || [],
        };
        cacheSet(cacheKey, data, 10 * 60 * 1000); // mirrors rotate hourly
        return res.json(data);
      }

      return res.status(404).json({ error: "No NetMirror thumbnail metadata found", thumbnails: [] });
    } catch (error: any) {
      console.error("[NETMIRROR THUMBS] error:", error?.message);
      res.status(500).json({ error: error?.message });
    }
  });

  router.get("/api/netmirror", async (req: Request, res: Response) => {
    const { title, type = "movie", mirror } = req.query;
    if (!title) return res.status(400).json({ error: "title is required" });

    const cacheKey = `netmirror:${title}:${type}`;
    const cached = cacheGet(cacheKey);
    if (cached) return res.json({ ...cached, cached: true });

    try {
      const discovered = await discoverNetmirrorMirror();
      const candidates: string[] = [];
      const pushMirror = (m: string) => {
        if (/^https:\/\/(net[a-z0-9]+\.cc)$/i.test(m || "") && !candidates.includes(m)) candidates.push(m);
      };
      pushMirror(String(mirror || ""));
      pushMirror(discovered);
      pushMirror("https://net77.cc");
      pushMirror("https://net52.cc");

      for (const base of candidates) {
        const hit = await netmirrorSearch(base, String(title)).catch(() => null);
        if (!hit) continue;
        const pl = await netmirrorPlaylist(base, hit.id).catch(() => null);
        if (!pl) continue;
        const pf = await netmirrorPreflight(pl.streamUrl);
        if (!pf.ok) continue;

        const data = {
          title,
          contentId: hit.id,
          mirror: base,
          provider: "netmirror",
          streamUrl: pl.streamUrl,
          corsOpen: true,
          audioLanguages: pf.audioLanguages,
          mediaHost: pf.mediaHost,
          subtitles: pl.captions,
          thumbnails: pl.thumbnails,
        };
        cacheSet(cacheKey, data, 90 * 1000); // CDN flaps — don't cache success long
        return res.json(data);
      }

      const msg = {
        error: "NetMirror is temporarily unavailable (no reachable media host)",
        unreachable: true,
        mirror: candidates[0] || discovered,
        attempted: candidates,
      };
      console.warn(`[NETMIRROR] unreachable for "${title}" via [${candidates.join(", ")}]`);
      return res.status(503).json(msg);
    } catch (error: any) {
      console.error("[NETMIRROR] error:", error?.message);
      res.status(500).json({ error: error?.message });
    }
  });

  router.get("/api/proxy", async (req: Request, res: Response) => {
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "url query param required" });

    try {
      const upstreamHeaders: Record<string, string> = {};
      if (req.headers.range) upstreamHeaders["Range"] = String(req.headers.range);
      if (req.headers["if-range"]) upstreamHeaders["If-Range"] = String(req.headers["if-range"]);
      // Session-token CDNs (ice.bright67 "thunder") reject bare requests and can
      // answer 522 without a normal UA. Plain direct CDNs keep default headers.
      const upstreamHost = (() => {
        try {
          return new URL(String(url)).hostname;
        } catch {
          return "";
        }
      })();
      if (/bright67|ice\./.test(upstreamHost)) {
        upstreamHeaders["User-Agent"] =
          "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36";
        upstreamHeaders["Referer"] = "https://cinesrc.st/";
        upstreamHeaders["Origin"] = "https://cinesrc.st";
      }

      const response = await fetch(String(url), { headers: upstreamHeaders });
      const contentType = response.headers.get("content-type") || "application/octet-stream";

      // Read the first chunk so we can detect m3u8 by content signature, then
      // STREAM the rest — never buffer a whole segment/variant.
      const reader = (
        response.body as unknown as ReadableStream<Uint8Array>
      ).getReader();
      const { value: firstChunk } = await reader.read();
      const head = Buffer.from(firstChunk || []).toString("utf8", 0, 64);
      const isM3u8 =
        head.trimStart().startsWith("#EXTM3U") ||
        contentType.includes("mpegurl") ||
        contentType.includes("x-mpegurl");

      if (isM3u8) {
        let body = Buffer.alloc(0);
        if (firstChunk) body = Buffer.concat([body, Buffer.from(firstChunk)]);
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          body = Buffer.concat([body, Buffer.from(value)]);
        }
        const text = body.toString("utf8");
        const proxyBase = `${req.protocol}://${req.get("host")}/api/proxy?url=`;
        const rewritten = rewriteM3u8(text, String(url), proxyBase);
        res.set("Content-Type", "application/vnd.apple.mpegurl");
        res.set("Content-Length", String(Buffer.byteLength(rewritten)));
        res.send(rewritten);
      } else {
        res.status(response.status);
        const cr = response.headers.get("content-range");
        if (cr) res.set("Content-Range", cr);
        const cl = response.headers.get("content-length");
        if (cl) res.set("Content-Length", cl);
        res.set("Content-Type", contentType);
        if (firstChunk) res.write(Buffer.from(firstChunk));
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      }
    } catch (e: any) {
      console.error("[PROXY] error:", e?.message);
      if (!res.headersSent) res.status(500).json({ error: e?.message });
      else res.end();
    }
  });

  router.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  return router;
}