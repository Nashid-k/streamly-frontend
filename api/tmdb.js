// api/tmdb.js — same-origin TMDB proxy (Vercel serverless function).
import { withLog } from './lib/logger.js';
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

export default withLog(async function handler(req, res) {
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

    // Fallback key: inject the server-side key ONLY when the client omitted one.
    // (An empty `api_key=` param is still "present" — tmdbClient now omits the
    // param entirely when it has no client key, so this branch targets exactly
    // the "deploy has env or client key missing" cases.)
    const clientKey = params.get('api_key');
    if (!clientKey) {
      const serverKey =
        process.env.TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || '';
      if (serverKey) {
        params.set('api_key', serverKey);
      } else {
        // No key anywhere: fail loudly with a proxy-gateway 503 so the client's
        // tmdbClient treats this as "proxy unusable" and falls back to direct
        // TMDB (which logs 401 guidance). Never hard-code a secret here.
        res
          .status(503)
          .json({
            status_message:
              'TMDB api_key missing — set TMDB_API_KEY / VITE_TMDB_API_KEY in Vercel env.',
            status_code: 503,
          });
        return;
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
});
