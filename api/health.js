// api/health.js — cheap liveness probe for the keepalive cron.
//
// Deliberately shallow: it proves the function itself is deployed and
// reachable. Dependency checks (Mongo, TMDB) belong in diagnostics, not here —
// a health probe that fails when an unrelated dependency is down teaches the
// cron to warm nothing.
//
// `vercel.json` gives this function its own budget and region. It is NOT the
// SPA `/health` path: that one resolves to index.html through the catch-all
// rewrite and warms no function at all.

import { withLog } from '../server/logger.js';

export default withLog(function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ ok: false, error: 'Method not allowed', code: 'method' });
    return;
  }

  res.status(200).json({
    ok: true,
    service: 'streamly',
    ts: new Date().toISOString(),
  });
});
