// src/api/warmResolve.js — pre-mint the default server's stream token while
// the viewer is still on the details page (PLAN.md P0.4).
//
// The player's cold start is the one surface that cannot be instant: resolve
// (PoW mint upstream) → probe → manifest is 2–5s of honest waiting. The
// resolve leg is the longest, and it is predictable — the details page knows
// type/id/season/episode and that the viewer is one tap from Watch — so it is
// started the moment the page opens (debounced, cache-first).
//
// Contract with the player: `takeWarmResolve` hands over the promise AT MOST
// ONCE (the player is the only consumer), and only for the SAME title AND the
// default server — a manual server pick must resolve that server, not a warm
// token minted for the default row. A consumed promise that rejects is the
// player's ordinary resolve failure; the retry ladder is already around it.
//
// The default row is read from `sources.js`, NEVER a literal key: the default
// moved from `vidcore` to `zxc-centaurus`, and a hardcoded "vidcore" here used to
// warm a server the player would then refuse to consume (and vice versa).

import { DEFAULT_SOURCE_KEY, sourceByKey } from "../constants/sources";

const WARM_TTL_MS = 4 * 60 * 1000; // tokens are time-scoped — never serve stale
const warm = {
  key: null,
  at: 0,
  promise: null,
};

export function warmResolveKey({ type, id, season, episode }) {
  return `${type === "tv" ? "tv" : "movie"}|${id}|${type === "tv" ? `${season}|${episode}` : "-"}`;
}

/* Fire the warm resolve for a title. Concurrent/duplicate calls for the same
   key coalesce into one network request; a stale entry for another key is
   dropped. Never throws — a failed warm is silently retried by the player's
   own resolve path (logged here so the burn is observable). */
export function warmResolve(args, { signal } = {}) {
  const key = warmResolveKey(args);
  if (warm.promise && warm.key === key && Date.now() - warm.at < WARM_TTL_MS) {
    return warm.promise;
  }
  if (signal?.aborted) return null;
  warm.key = key;
  warm.at = Date.now();
  const def = sourceByKey(DEFAULT_SOURCE_KEY);
  warm.promise = (def ? def.resolve(args, { signal }) : Promise.reject(new Error("no default source")))
    .catch((error) => {
      // A rejected warm would poison takeWarmResolve's one-shot handover, so
      // a failure clears the entry — the player re-resolves on its own.
      if (warm.promise === captured) {
        warm.promise = null;
        warm.key = null;
      }
      throw error;
    });
  const captured = warm.promise;
  // The fire-and-forget path (details page) never awaits this promise, so the
  // rejection must be marked handled HERE — the player's consumer attaches its
  // own handler when it takes the token over.
  warm.promise.catch(() => {});
  return warm.promise;
}

/* Player-side handover: consume the warm token if it matches this title AND
   the default server. One-shot: the second call gets null. */
export function takeWarmResolve(args, { sourceKey } = {}) {
  if (!warm.promise || warm.key !== warmResolveKey(args)) return null;
  if (Date.now() - warm.at >= WARM_TTL_MS) {
    warm.promise = null;
    warm.key = null;
    return null;
  }
  // Only the auto-rotation default (null pick) or an explicit pick of the default
  // row may consume the warm token. Any other pick must resolve its own server.
  if (sourceKey && sourceKey !== DEFAULT_SOURCE_KEY) return null;
  const promise = warm.promise;
  warm.promise = null;
  warm.key = null;
  return promise;
}

export function _resetWarmResolveForTests() {
  warm.key = null;
  warm.at = 0;
  warm.promise = null;
}
