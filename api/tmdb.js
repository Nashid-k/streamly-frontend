// api/tmdb.js — same-origin TMDB proxy (Vercel serverless function).
//
// Why this exists: some ISPs (e.g. in India) block api.themoviedb.org outright
// (DNS/IP level). Browsers calling TMDB directly fail on those networks while
// the app looks "broken" on mobile or other devices.
// Calling our own origin works on every device because the upstream request
// leaves from Vercel's network, not the visitor's.
// The client (src/api/tmdbClient.js) uses this proxy first and falls back
// to direct TMDB when no function is deployed (plain static hosting).
//
// Pure passthrough: path + query (including api_key) are forwarded as-is.
// The key stays public, exactly as with direct calls — this proxy buys
// reachability, not secrecy.

const TMDB_BASE = 'https://api.themoviedb.org/3';

export default async function handler(req, res) {
  try {
    // Enable CORS so any client origin can reach the proxy
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    if (req.method !== 'GET') {
      res.status(405).json({ status_message: 'Method not allowed', status_code: 405 });
      return;
    }

    // Extract resource path:
    // 1. From req.query.path (set by vercel.json rewrite /api/tmdb/(.*) -> /api/tmdb?path=$1)
    // 2. Or parse from req.url as fallback
    let resource = '';
    if (req.query?.path) {
      const segs = req.query.path;
      resource = Array.isArray(segs) ? segs.join('/') : String(segs || '');
    }
    if (!resource && req.url) {
      try {
        const u = new URL(req.url, 'http://localhost');
        const p = u.pathname.replace(/^\/api\/tmdb\/?/, '');
        if (p) resource = p;
      } catch {
        // ignore
      }
    }

    resource = resource.replace(/^\/+/, '');

    if (!resource || resource.includes('..')) {
      res.status(400).json({ status_message: 'Bad TMDB path', status_code: 400 });
      return;
    }

    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query || {})) {
      if (k === 'path' || v === undefined) continue;
      if (Array.isArray(v)) v.forEach((x) => params.append(k, String(x)));
      else params.append(k, String(v));
    }

    // Fallback key if omitted by client
    if (!params.has('api_key')) {
      const fallbackKey =
        process.env.VITE_TMDB_API_KEY ||
        process.env.TMDB_API_KEY ||
        '522f1f08eda5e03bf93100ba29471d5d';
      if (fallbackKey) {
        params.set('api_key', fallbackKey);
      }
    }

    const upstream = await fetch(`${TMDB_BASE}/${resource}?${params.toString()}`, {
      headers: { accept: 'application/json' },
    });
    const body = await upstream.text();
    res.status(upstream.status);
    res.setHeader('content-type', upstream.headers.get('content-type') || 'application/json');
    // Edge-cache catalog responses briefly to cut repeat upstream hits.
    res.setHeader('cache-control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.send(body);
  } catch (error) {
    res
      .status(502)
      .json({ status_message: `TMDB proxy failed: ${error?.message || 'unknown'}`, status_code: 502 });
  }
}
