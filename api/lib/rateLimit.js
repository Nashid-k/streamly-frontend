// api/lib/rateLimit.js — in-memory fixed-window rate limiter for serverless.
//
// Every public endpoint used to be unauthenticated and unlimited: a single
// visitor could burn the TMDB/Groq quotas or hammer /api/sync forever. Vercel
// functions are stateless, so an exact global limiter would need a shared
// store — but a per-warm-instance fixed window already defeats burst abuse
// cheaply and fairly (each cold start starts fresh, which is acceptable:
// abuse typically lands on warm instances).
//
// Usage:
//   const limit = rateLimit({ key: req, limit: 60, windowMs: 60_000 });
//   if (!limit.ok) { res.status(429).json(...); return; }
//
// The `keyFor` callback decides identity. Order of preference:
//   1. an authenticated subject (googleId / verified token)
//   2. the x-forwarded-for client IP Vercel injects (first hop)
//   3. "anon" (shared bucket — intentionally generous)

const buckets = new Map();
const MAX_TRACKED_KEYS = 5000;

function prune(now) {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, entry] of buckets) {
    if (entry.reset <= now) buckets.delete(key);
  }
  // Still oversized after expiry prune? Drop the oldest half.
  if (buckets.size >= MAX_TRACKED_KEYS) {
    const keys = [...buckets.keys()].slice(0, Math.floor(MAX_TRACKED_KEYS / 2));
    for (const key of keys) buckets.delete(key);
  }
}

export function clientIp(req) {
  const fwd = req.headers?.["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "anon";
}

/**
 * Fixed-window rate limit check.
 * @param {object} opts
 * @param {string|function} opts.key    bucket key or (req) => key
 * @param {number} [opts.limit=60]      max hits per window
 * @param {number} [opts.windowMs=60000] window length
 * @returns {{ ok: boolean, remaining: number, retryAfterSec: number }}
 */
export function rateLimit({ key, limit = 60, windowMs = 60_000 }) {
  const bucketKey = typeof key === "function" ? key() : String(key || "anon");
  const now = Date.now();
  prune(now);

  const entry = buckets.get(bucketKey);
  if (!entry || entry.reset <= now) {
    buckets.set(bucketKey, { count: 1, reset: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((entry.reset - now) / 1000)),
    };
  }
  return { ok: true, remaining: limit - entry.count, retryAfterSec: 0 };
}

/** Standard 429 responder with Retry-After. */
export function tooManyRequests(res, retryAfterSec) {
  res.setHeader("Retry-After", String(retryAfterSec));
  res.status(429).json({ success: false, message: "Too many requests — slow down." });
}
