import { useCallback, useEffect, useRef, useState } from "react";

/**
 * PLAYER V2 resume offer (task.md 5.1).
 *
 * ── The gap this closes ─────────────────────────────────────────────────────
 * v2 read NEITHER `watchedEntry` (it was an unused prop) NOR any saved position,
 * so a viewer returning to a title was shown the start of the episode after
 * waiting out the whole source ladder. The legacy player did offer a resume
 * card, but only AFTER `MANIFEST_PARSED` + `play()` — so the viewer stared at a
 * loading stage for ~20s before being told where they had left off.
 *
 * The offer is therefore raised on MOUNT, before the stream resolves: the choice
 * is available from the first frame the loader is on screen. The chosen position
 * is held as a pending seek and applied when the element reaches
 * `HAVE_METADATA`, because assigning `currentTime` before then throws in some
 * engines and is silently ignored in others.
 *
 * ── Why the offer is DERIVED, not stored, in the blocked cases ──────────────
 * A party GUEST follows the host's playhead, so a local resume offer would fight
 * it (the legacy skipped it for the same reason). An entry within the last 8% of
 * the title is "finished" and must start over rather than resume into the
 * credits. Both are computed from props/state during render and gate the
 * exposed offer, so neither needs an effect that sets state — the countdown
 * simply stops when the offer stops being visible.
 *
 * ── Why the seek is applied here, not in the shell ──────────────────────────
 * task.md 2.5 makes the shell compose-only. Reading the element, waiting for its
 * metadata and writing `currentTime` is playback logic, so it lives in this
 * hook beside the state it drives.
 */

/** The legacy gate (`NativePlayerView.jsx:106`): how long the card waits before
 *  auto-resuming. Kept identical so the two players feel the same while the
 *  feature flag still routes some viewers to the old one. */
export const RESUME_WAIT_SECONDS = 8;

/** An entry past this fraction of the runtime is "watched", not "paused", and
 *  resuming into the credits is worse than starting over. Matches the legacy
 *  `at >= dur * 0.92` guard. */
const FINISHED_FRACTION = 0.92;

/**
 * @param watchedEntry  continue-watching entry ({ timestamp } in seconds) or null.
 * @param videoNode     the mounted `<video>`, as a React value, so the metadata
 *                      effect can depend on it. Null until the ladder resolves.
 * @param mediaKey      identifies the title/episode; a change re-arms the offer.
 * @param enabled       false for a party guest (the host owns the playhead).
 * @param duration      the element's duration as React state, for the finished check.
 * @param seekTo        imperative seek from `usePlayerControls`.
 * @param waitSeconds   test seam for the countdown.
 * @returns {{ offer, chooseResume, chooseRestart }}
 */
export default function useResumeOffer({
  watchedEntry,
  videoNode,
  mediaKey = "",
  enabled = true,
  duration = 0,
  seekTo,
  waitSeconds = RESUME_WAIT_SECONDS,
} = {}) {
  const at = Number(watchedEntry?.timestamp) || 0;
  const [offer, setOffer] = useState(null);
  /* The title/episode that already raised an offer. An entry can be rewritten by
   * the progress sink while the offer is on screen (it reports the NEW playhead),
   * and re-raising on every write would make the card impossible to dismiss. */
  const handledKeyRef = useRef(null);
  /* A chosen resume that the element could not accept yet. Held in a ref because
   * it is acted on by an event listener, not by a render. */
  const pendingSeekRef = useRef(null);

  /* Raise the offer as soon as the player mounts (5.1) — that is the whole point
   * of moving it off `MANIFEST_PARSED`. A later-arriving `watchedEntry` (the
   * continue-watching query resolves after the player opens) raises it too,
   * because the key has not been handled yet. */
  useEffect(() => {
    if (!enabled || at <= 0) return;
    if (handledKeyRef.current === mediaKey) return;
    handledKeyRef.current = mediaKey;
    setOffer({ at, left: waitSeconds });
  }, [enabled, at, mediaKey, waitSeconds]);

  /* Apply a pending seek once the element can accept one. `HAVE_METADATA` (1) is
   * the earliest point `currentTime` is reliably settable and the duration used
   * for clamping is known. Re-runs whenever the node changes (a source swap
   * mounts a new element and re-fires `loadedmetadata`). */
  const applyPending = useCallback(() => {
    if (!videoNode) return;
    if ((videoNode.readyState ?? 0) < 1) return;
    const pending = pendingSeekRef.current;
    if (pending == null) return;
    pendingSeekRef.current = null;
    seekTo?.(pending);
  }, [videoNode, seekTo]);

  useEffect(() => {
    if (!videoNode) return undefined;
    applyPending();
    videoNode.addEventListener("loadedmetadata", applyPending);
    videoNode.addEventListener("durationchange", applyPending);
    return () => {
      videoNode.removeEventListener("loadedmetadata", applyPending);
      videoNode.removeEventListener("durationchange", applyPending);
    };
  }, [videoNode, applyPending]);

  /* Finished entries must not be offered. Derived, so the moment the duration
   * arrives (usually a tick after the card appears) a nearly-watched title drops
   * the card instead of seeking into the credits. */
  const finished = duration > 0 && at > 0 && at >= duration * FINISHED_FRACTION;
  const visibleOffer = enabled && !finished ? offer : null;

  const chooseResume = useCallback(
    (seconds) => {
      const target = Number(seconds);
      pendingSeekRef.current = Number.isFinite(target) ? target : null;
      setOffer(null);
      applyPending();
    },
    [applyPending],
  );

  const chooseRestart = useCallback(() => {
    pendingSeekRef.current = null;
    setOffer(null);
  }, []);

  /* Countdown to the legacy auto-resume. Keyed on the VISIBLE offer, so a card
   * hidden by the finished/party gates stops ticking rather than auto-seeking
   * behind the viewer's back. Each tick re-runs this effect with the new `left`,
   * which is why the whole offer is the dependency and not `left` alone.
   *
   * The commit happens INSIDE the timer, not synchronously in the effect body:
   * the final tick is what crosses the line, so it is the tick that should seek.
   * That also keeps this effect from calling `setState` during the effect pass
   * itself, which React warns about for good reason. */
  useEffect(() => {
    if (!visibleOffer) return undefined;
    const timer = setTimeout(() => {
      if (visibleOffer.left <= 1) {
        chooseResume(visibleOffer.at);
        return;
      }
      setOffer((current) => (current ? { ...current, left: current.left - 1 } : current));
    }, 1000);
    return () => clearTimeout(timer);
  }, [visibleOffer, chooseResume]);

  return { offer: visibleOffer, chooseResume, chooseRestart };
}
