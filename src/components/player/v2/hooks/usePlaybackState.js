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

  // Memoised so the view object is referentially stable across renders when
  // nothing changed. Without this every consumer re-renders on every parent
  // render, which is the sort of thing that quietly reintroduces jank.
  const view = useMemo(() => selectView(playback), [playback]);

  return { ...view, error: playback.error, rev: playback.rev, send };
}

export { E, S, initialPlayback, playbackReducer, selectView } from "../playbackMachine";
