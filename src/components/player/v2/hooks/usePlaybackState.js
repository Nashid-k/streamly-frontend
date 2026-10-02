import { useCallback, useMemo, useReducer } from "react";
import {
  initialPlayback,
  playbackReducer,
  selectView,
} from "../playbackMachine";

/**
 * The one playback state the whole player reads (task.md 2.4 / 2.7).
 *
 * Thin by design. Every decision — loader, buffering spinner, announcement,
 * `isPlaying` — is derived in `selectView` from the reducer's single enum, so
 * this hook owns state and nothing else. Two components cannot disagree about
 * whether the player is busy, because there is only one answer.
 *
 * `rev` is exposed for effects that must fire once per REAL change (log once,
 * announce once). It does not increment on a refused transition, which matters
 * because Safari can fire `waiting` several times for one stall.
 *
 * @param {object} [initial] override for tests
 * @returns {{
 *   state: string,
 *   isPlaying: boolean,
 *   isBusy: boolean,
 *   showLoader: boolean,
 *   showBuffering: boolean,
 *   showEnded: boolean,
 *   showError: boolean,
 *   announcement: string,
 *   error: unknown,
 *   rev: number,
 *   send: (event: string, error?: unknown) => void,
 * }}
 */
export default function usePlaybackState(initial = initialPlayback) {
  const [playback, dispatch] = useReducer(playbackReducer, initial);

  const send = useCallback((event, error = null) => {
    dispatch({ type: event, error });
  }, []);

  // Memoised so `selectView` is not recomputed (it allocates) on every render.
  // Note what this does and does NOT buy: the returned object below is a fresh
  // spread every render, so this hook's *return value* is never referentially
  // stable. That is fine because the only consumer destructures primitives
  // (`PlayerShell.jsx:129`) — but do not read this memo as a guarantee for a
  // future consumer that wants to pass the whole view to a memoised child.
  const view = useMemo(() => selectView(playback), [playback]);

  return { ...view, error: playback.error, rev: playback.rev, send };
}

export { E, S, initialPlayback, playbackReducer, selectView } from "../playbackMachine";
