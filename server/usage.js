// server/usage.js — tiny daily usage ledger (PLAN.md P0.3).
//
// The plan's rule: "stop estimating, start knowing" — but also "counters, not
// logs", and NEVER a database write per request (this product is read-heavy
// by design). So counts accumulate in the warm instance's memory and flush to
// one Mongo document per UTC day with $inc, at most once every FLUSH_EVERY_MS.
//
// Honest limits, documented rather than hidden:
//  · Serverless instances are independent — counts are per warm instance and
//    merge only when each flushes, so the ledger is a FLOOR, not a total.
//    Free tiers bill per deployment anyway, so a floor is enough to see
//    "34% of budget" vs "we are about to die".
//  · A cold start that dies before flushing loses its window (≤1 min of
//    counts). Acceptable for a capacity dashboard.
//  · If Mongo is unconfigured or the flush fails, counts stay in memory and
//    the failure is logged — never thrown into the request path.

// Server-side diagnostics mirror the logger's `[Streamly][…]` convention —
// a failed flush must be visible in the Vercel function logs, never silent.
function warn(message, extra = {}) {
  console.warn(`[Streamly][usage] ${message}`, Object.keys(extra).length ? JSON.stringify(extra) : "");
}

const FLUSH_EVERY_MS = 60 * 1000;
const counters = new Map(); // scope -> number (current UTC day)
let ledgerDay = utcDay();
// Seeded at module load so the FIRST count never triggers a flush mid-request
// (a cold start's first viewer would otherwise pay the Mongo import latency).
// The first flush happens ~FLUSH_EVERY_MS after the instance wakes.
let lastFlushAt = Date.now();
let flushing = false;

function utcDay() {
  return new Date().toISOString().slice(0, 10);
}

/* Count one unit for a scope. Scopes are short fixed tokens — `dl`, `party`,
   `tmdb` — matching the rate-limit call sites, never raw request data. */
export function countUsage(scope) {
  if (typeof scope !== "string" || scope.length === 0 || scope.length > 24) return;
  const today = utcDay();
  if (today !== ledgerDay) {
    counters.clear(); // day rolled over mid-flight on this warm instance
    ledgerDay = today;
    lastFlushAt = 0;
  }
  counters.set(scope, (counters.get(scope) || 0) + 1);
  maybeFlush();
}

/* Throttled fire-and-forget flush from the count path. A stale rejection can
   never surface here: flushUsage owns its own catch, but the floating promise
   is still logged-loss-safe (flushUsage retains counts on failure). */
function maybeFlush() {
  if (Date.now() - lastFlushAt < FLUSH_EVERY_MS) return;
  flushUsage().catch(() => {
    // flushUsage already retained the counts and logged; nothing to rethrow.
  });
}

/* Best-effort flush: one upsert per UTC day, $inc the instance's window. */
export async function flushUsage(force = false) {
  if (flushing) return;
  if (!force && Date.now() - lastFlushAt < FLUSH_EVERY_MS) return;
  if (counters.size === 0) return;
  flushing = true;
  // Snapshot + clear BEFORE the await so counts arriving during the round
  // trip belong to the next flush and cannot be double-written.
  const day = ledgerDay;
  const snapshot = new Map(counters);
  counters.clear();
  try {
    const { connectToDatabase } = await import("./db.js");
    const { db } = await connectToDatabase();
    const inc = {};
    for (const [scope, n] of snapshot) inc[`days.${day}.${scope}`] = n;
    await db.collection("usage").updateOne({ _id: "daily" }, { $inc: inc }, { upsert: true });
    lastFlushAt = Date.now();
  } catch (error) {
    // Give the counts back so the next flush retries them (bounded: a
    // persistently dead Mongo must not grow memory — cap per scope).
    for (const [scope, n] of snapshot) {
      const current = (counters.get(scope) || 0) + n;
      counters.set(scope, Math.min(current, 1_000_000));
    }
    warn("Usage flush failed — counts retained in memory.", { message: error?.message });
  } finally {
    flushing = false;
  }
}

/* Read-side shape for /api/usage: today's counts per scope. Used by the
   Settings → System status row (PLAN.md P1.4). Returns zeros, never throws. */
export function todayCounts() {
  const day = utcDay();
  // The stored doc merges all instances; the in-memory map is this instance.
  return { day, local: Object.fromEntries(counters) };
}

export function _resetUsageForTests() {
  counters.clear();
  ledgerDay = utcDay();
  lastFlushAt = Date.now();
  flushing = false;
}
