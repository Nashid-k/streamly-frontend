import { useEffect } from "react";
import { S } from "../playbackMachine";
import { STATUS_KIND } from "../statusMachine";
import usePlayerStatus from "./usePlayerStatus";

/**
 * Feeds the status line from playback state (task.md 2.9).
 *
 * This mapping is the actual feature, so it lives in its own hook rather than in
 * `PlayerShell`'s body. `PlayerShell` mounts at a fixed entry state (`resolving`),
 * which means a mapping written inline there could not be tested for the states
 * that matter — an untested branch is a branch nobody wrote on purpose. Here the
 * state is a parameter, so every state is reachable from a test.
 *
 * ── Which states get words, and why ──────────────────────────────────────────
 * Only states whose wording adds something the visuals cannot:
 *
 *   error    Nothing on screen explains a failure; the message IS the UI.
 *            Persistent (`ttlMs: 0`), because a message that vanishes before the
 *            viewer looks up from the remote has told them nothing.
 *   stalled  The frame is preserved, so there is no loader — a quiet screen with
 *            frozen video needs words. Self-clearing, because it resolves.
 *
 * Everything else is deliberately silent:
 *   resolving / opening / buffering  the full-screen loader is already up and its
 *                                   live region already speaks. A status line
 *                                   would say the same sentence twice.
 *   ended     gets the UpNextCard in Phase 3.
 *   idle      nothing is happening, by definition.
 *   playing   silence is the point.
 */
export default function usePlaybackStatus(state, rev, announcement, options) {
  const status = usePlayerStatus(options);

  useEffect(() => {
    if (state === S.ERROR) {
      status.push(announcement, STATUS_KIND.ERROR, "playback-error", 0);
    } else if (state === S.STALLED) {
      status.push(announcement, STATUS_KIND.WARN, "playback-stalled");
    }
    // `status` is stable across renders (useCallback over dispatch), so listing
    // it would not loop; it is omitted deliberately to keep the dependency list
    // equal to the inputs that can actually change the message.
  }, [state, rev, announcement]); // eslint-disable-line react-hooks/exhaustive-deps

  return status;
}
