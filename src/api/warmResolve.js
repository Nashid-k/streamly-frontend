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
// auto (no-pick) path — any manual server pick must resolve its own server, not
// a warm token minted without one. A consumed promise that rejects is the
// player's ordinary resolve failure; the retry ladder is already around it.
//
// The warm mount is `AUTO_SOURCE` (no server named), NOT a literal default row:
// the default moved from `vidcore` to `zxc-orion` and a hardcoded key here
// used to warm a server the player would then refuse to consume. Warming auto
// also means a dead backend cannot waste the warm leg — the server picks a
// live one internally.

import { AUTO_SOURCE, PLAYER_SOURCES } from "../constants/sources";
import { hasFreshResolve } from "./streamResolve";

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
  warm.promise = AUTO_SOURCE.resolve(args, { signal })
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
  // The warm token was minted for the AUTO path, so ONLY a no-pick play may
  // consume it. Any explicit pick — even of the default row — must resolve its
  // own server live, or the viewer would watch the server auto chose while the
  // menu claims the one they tapped.
  if (sourceKey) return null;
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

/* Servers-menu prefetch: warm the resolve for every row the viewer might tap,
   so a switch starts almost instantly instead of paying mint -> servers -> MPD
   after the click. This is the same "do the work before it is needed" idea as
   the details-page warm, extended to the switch surface.

   Bounded on purpose: rows already freshly cached are skipped, and at most
   `MAX_PREFETCH_IN_FLIGHT` resolves run at once, so opening the menu cannot
   recreate the request burst whose 429 once cascaded into series playback.
   Because streamResolve caches the PROMISE, a prefetch that is still running
   when the viewer taps that row is COALESCED with the player's own resolve —
   the click joins the in-flight request rather than starting a second one.

   Returns a cancel function; it stops NEW rows from starting but cannot abort a
   request already in flight (that request fills the cache for the upcoming
   click, which is the point). */
const MAX_PREFETCH_IN_FLIGHT = 2;

export function prefetchSources(args, { skipKey } = {}) {
  let cancelled = false;
  const rows = PLAYER_SOURCES.filter((s) => s.key !== skipKey && !hasFreshResolve({ ...args, prefer: s.server }));
  let active = 0;
  let index = 0;
  const pump = () => {
    if (cancelled) return;
    while (active < MAX_PREFETCH_IN_FLIGHT && index < rows.length) {
      const row = rows[index];
      index += 1;
      active += 1;
      // Wrap in Promise.resolve: a resolver stub (tests) or a synchronous throw
      // must not break the pump.
      Promise.resolve()
        .then(() => row.resolve(args))
        .catch(() => {})
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };
  pump();
  return () => {
    cancelled = true;
  };
}
