import { useCallback, useEffect, useRef } from "react";

/**
 * Persist the playhead to the parent (task.md 5.25).
 *
 * ── Why this exists at all ─────────────────────────────────────────────────
 * `TitleDetailsPage` has always passed v2 a `watchedEntry` (where to resume)
 * and an `onProgressChange` (where to save), and v2 read **neither**. So a
 * viewer could watch ten minutes, close the player, reopen the title and be
 * offered nothing: the position was written by the legacy path only, and v2
 * discarded it on unmount. This is the outgoing half; `watchedEntry` is the
 * incoming half and belongs with 5.1.
 *
 * ── Why the flush is an UNMOUNT cleanup ────────────────────────────────────
 * The overlay is closed by the PARENT flipping its own state
 * (`onClose={() => setIsPlaying(false)}`), which unmounts the shell. There is
 * no "close" callback the shell is guaranteed to receive first, so the only
 * point that always runs on every close path — Escape, Back, the top-bar
 * button, an episode change, a route change — is effect cleanup. Doing the
 * save from a key handler alone would miss every other way out.
 *
 * ── Why `latestRef` and not `getCurrentTime()` in the cleanup ──────────────
 * By the time the cleanup runs the `<video>` may already be detached, and
 * `videoRef.current` is then null, so an imperative read would save 0 over a
 * real position. The subscription below keeps the last delivered time in a
 * ref, which survives the element. (The frame-rate channel 5.15 gives us the
 * value for free; no new clock.)
 *
 * The parent still owns the "is this worth saving" rule (`t > 10`), but the
 * `minSeconds` gate is repeated here so an open-then-immediately-close does
 * not call the sink at all rather than calling it with 0 to be rejected.
 */
export default function usePlayerProgress({
  subscribePlayhead,
  onProgressChange,
  minSeconds = 10,
} = {}) {
  const latestRef = useRef(0);
  /* The sink is captured in a ref because the parent passes a fresh arrow on
   * every render; depending on it directly would re-run the unmount effect and
   * flush on every parent render, not on unmount. */
  const sinkRef = useRef(onProgressChange);

  useEffect(() => {
    sinkRef.current = onProgressChange;
  }, [onProgressChange]);

  useEffect(() => {
    if (typeof subscribePlayhead !== "function") return undefined;
    return subscribePlayhead((seconds) => {
      if (Number.isFinite(seconds)) latestRef.current = seconds;
    });
  }, [subscribePlayhead]);

  const flush = useCallback(() => {
    const sink = sinkRef.current;
    if (typeof sink !== "function") return;
    const seconds = latestRef.current;
    if (!Number.isFinite(seconds) || seconds < minSeconds) return;
    sink(Math.floor(seconds));
  }, [minSeconds]);

  useEffect(() => () => flush(), [flush]);

  return { flush, latestTime: () => latestRef.current };
}
