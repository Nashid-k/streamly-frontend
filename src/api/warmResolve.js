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
// default server (VidCore) — a manual server pick must resolve that server,
// not a warm VidCore token minted for the menu highlight. A consumed promise
// that rejects is the player's ordinary resolve failure; the retry ladder is
// already around it.
//
// OWNERSHIP (task.md S1.1a). The caller's `signal` is a *start* gate, never a
// kill switch. The arming caller is the details page, whose lifetime is shorter
// than the warm's usefulness: pressing play unmounts its effect (isPlaying flips
// -> cleanup) while the player is *already awaiting the promise it was handed*.
// If the caller's abort could reach that promise it would reject the player's
// own await, `takeWarmResolve` has already cleared the one-shot entry, and the
// ladder re-resolves from zero — the warm is paid for and thrown away and start
// gets SLOWER. So the request runs on an internal controller, and the handover
// DETACHES the caller's abort. Ownership moves exactly once, at take time.

import { downloadService } from "./downloadService";

const WARM_TTL_MS = 4 * 60 * 1000; // tokens are time-scoped — never serve stale

/* `entry` is the whole warm record, replaced wholesale so the async catch can
   identity-check `warm === entry` instead of comparing a promise captured in a
   TDZ-prone closure:
     { key, at, promise, controller, detachCaller }
   `controller` is the signal the request actually runs on. `detachCaller()`
   severs the arming caller's abort link and is safe to call repeatedly. */
let warm = null;

export function warmResolveKey({ type, id, season, episode }) {
  return `${type === "tv" ? "tv" : "movie"}|${id}|${type === "tv" ? `${season}|${episode}` : "-"}`;
}

/* Fire the warm resolve for a title. Concurrent/duplicate calls for the same
   key coalesce into one network request; a stale entry for another key is
   dropped. Never throws — a failed warm is silently retried by the player's
   own resolve path (logged here so the burn is observable). */
export function warmResolve(args, { signal } = {}) {
  const key = warmResolveKey(args);
  if (warm?.promise && warm.key === key && Date.now() - warm.at < WARM_TTL_MS) {
    return warm.promise;
  }
  if (signal?.aborted) return null;
  // Superseding an entry for another title severs its caller link, so a stale
  // details page can no longer abort work nobody is waiting on.
  warm?.detachCaller();

  const controller = new AbortController();
  const onCallerAbort = () => {
    // Identity-guarded: only the CURRENT owner may cancel. After the handover
    // the caller is detached, so this cannot fire against a handed-over warm.
    if (warm?.controller === controller) controller.abort();
  };
  const detachCaller = () => {
    signal?.removeEventListener?.("abort", onCallerAbort);
  };
  signal?.addEventListener?.("abort", onCallerAbort, { once: true });

  const entry = { key, at: Date.now(), promise: null, controller, detachCaller };
  warm = entry;
  entry.promise = downloadService
    .resolveVidcore(args, { signal: controller.signal })
    .catch((error) => {
      // A rejected warm would poison the handover, so a failure drops the whole
      // entry and the player re-resolves on its own.
      entry.detachCaller();
      if (warm === entry) warm = null;
      throw error;
    });
  // The fire-and-forget path (details page) never awaits this promise, so the
  // rejection must be marked handled HERE — the player's consumer attaches its
  // own handler when it takes the token over.
  entry.promise.catch(() => {});
  return entry.promise;
}

/* Player-side handover: consume the warm token if it matches this title AND
   the default server. One-shot: the second call gets null. */
export function takeWarmResolve(args, { sourceKey } = {}) {
  const entry = warm;
  if (!entry?.promise || entry.key !== warmResolveKey(args)) return null;
  if (Date.now() - entry.at >= WARM_TTL_MS) {
    entry.detachCaller();
    warm = null;
    return null;
  }
  // Only the auto-rotation default (null pick) or an explicit VidCore pick may
  // consume the warm VidCore token. Any other pick must resolve its own server.
  if (sourceKey && sourceKey !== "vidcore") return null;
  // Aborted BEFORE handover (the details page went away and nobody took it):
  // handing the player a dead promise would fail its await and push the ladder
  // to the next provider for no reason. Let it resolve its own instead.
  if (entry.controller?.signal.aborted) {
    entry.detachCaller();
    warm = null;
    return null;
  }
  // OWNERSHIP TRANSFER: from here the player owns this promise. The arming
  // caller's abort is severed, so its later unmount cannot reject the player's
  // await. (task.md S1.1a)
  entry.detachCaller();
  warm = null;
  return entry.promise;
}

export function _resetWarmResolveForTests() {
  warm?.detachCaller();
  warm = null;
}
