import { logEmptyData, logError } from '../../utils/debugLogger';

export function logServiceError(method, error, context) {
  logError('movieService', `${method} failed — rail/page using this will render empty.`, error, context);
}

export function warnIfEmpty(method, list, context) {
  if (!list || (Array.isArray(list) && list.length === 0)) {
    logEmptyData('movieService', `${method} returned 0 items — check TMDB response / filters.`, context);
  }
  return list;
}

// Turn a Promise.allSettled result into the fulfilled values, logging every
// rejection (no silent failures). Throws the FIRST rejection when nothing
// fulfilled, so a rail reaches React Query's error state (which callers like
// HomePage already report) instead of silently rendering empty — an all-Settled
// sweep that continues past every failure both hid the outage and lied in the
// "0 items" log.
export function collectSettled(results, method, context = {}) {
  const values = [];
  let firstError = null;
  for (const res of results || []) {
    if (res.status === 'fulfilled') {
      values.push(res.value);
    } else {
      if (!firstError) firstError = res.reason;
      logServiceError(method, res.reason, context);
    }
  }
  if (values.length === 0 && firstError) throw firstError;
  return values;
}

// Bounded form of Promise.allSettled for catalogue sweeps. Tasks are lazy so
// only `limit` requests are in flight at once, but the returned array keeps the
// original order and settled shape that collectSettled/callers already expect.
export async function settledWithConcurrency(tasks, limit = 4) {
  const results = new Array(tasks.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await tasks[index]() };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  const workers = Math.min(Math.max(limit, 1), tasks.length);
  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

// Helper: detect if a TMDB id refers to a TV show
export function isTvId(id) {
  if (typeof id !== 'string') return false;
  return id.startsWith('tmdb-tv-') || id.startsWith('tv-') || id.includes('-tv-');
}

export function rawId(id) {
  if (typeof id === 'string') {
    // Strip everything before the first number
    const match = id.match(/\d+$/);
    if (match) return match[0];
  }
  return id;
}