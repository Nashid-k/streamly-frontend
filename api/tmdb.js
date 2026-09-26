// api/tmdb.js — same-origin TMDB proxy (Vercel serverless function).
import { withLog } from '../server/logger.js';
import { rateLimit, tooManyRequests, clientIp } from '../server/rateLimit.js';
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
    // Same-origin only. CORS '*' turned this proxy into a free TMDB relay for
    // every third-party site on the internet, draining OUR api key quota.
    // No Access-Control-Allow-Origin is emitted: same-origin callers (the app
    // itself) never need CORS, and browsers block every cross-origin read.
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

    // Per-IP burst guard: 120 catalog lookups/min is far above any real
    // viewer's browsing rate (rails prefetch + search + details ≈ 20/min).
    const limit = rateLimit({ key: () => `tmdb:${clientIp(req)}`, limit: 120, windowMs: 60_000 });
    if (!limit.ok) {
      tooManyRequests(res, limit.retryAfterSec);
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
    // Edge-cache only genuine catalog hits. Caching 401/404/429 bodies at the
    // edge (the old behavior) served stale errors for 5 minutes after a
    // transient upstream failure.
    //
    // The TTL is the biggest latency lever in the whole app. A cold Home load
    // asks for ~20-90 catalogue paths, and every POP caches independently: with
    // a 5-minute TTL each visitor in a quiet region paid origin + lambda cold
    // start on every one of them, which is where the "fast in one country,
    // 600ms+ in another" gap came from. 30 minutes + a day of
    // stale-while-revalidate means a miss is served instantly from a neighbouring
    // POP's revalidate and refreshes in the background, and trending/catalogue
    // data genuinely does not move faster than that.
    if (upstream.status === 200) {
      res.setHeader('cache-control', 'public, s-maxage=1800, stale-while-revalidate=86400');
    } else {
      res.setHeader('cache-control', 'no-store');
    }
    res.send(body);
  } catch (error) {
    res
      .status(502)
      .json({ status_message: `TMDB proxy failed: ${error?.message || 'unknown'}`, status_code: 502 });
  }
});
