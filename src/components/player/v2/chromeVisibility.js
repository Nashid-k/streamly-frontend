import { S } from "./playbackMachine";

/**
 * When the chrome may auto-hide (task.md 3.8).
 *
 * Pure, and the whole point of the item is in the gates below. "Hide after 2.6
 * seconds of idle" is the easy half; the half that actually decides whether the
 * player is pleasant is the list of things that must NOT be allowed to hide it.
 * Each gate exists because getting it wrong is a specific, recognisable failure:
 *
 *   1. Focus inside — a keyboard user who tabs into the transport must not have
 *      it dissolve underneath them mid-press. This is also the machine-readable
 *      twin of the 3.5 `:focus-within` rule: CSS makes it LOOK right, this
 *      makes `data-chrome` tell the truth.
 *   2. Sheet open — hiding the transport out from under an open settings panel
 *      strands the control that opened it.
 *   3. Pointer inside a chrome layer — the classic one: the viewer's cursor is
 *      resting on the scrubber, they stop moving to read the time, and the bar
 *      they are about to drag disappears. Pointer *movement* resets the timer,
 *      but a stationary cursor produces no events at all, so movement alone
 *      cannot save this.
 *   4. Not actually playing — paused, ended, errored and every loading state all
 *      need the controls visible, because the viewer's next action is on them.
 *      Hiding them is how a player becomes un-pausable.
 *
 * `stalled` counts as playing on purpose: the frame is preserved and the viewer
 * is still watching, so flipping to "paused" chrome during a network hiccup is a
 * false signal. Same reasoning as `selectView().isPlaying`.
 */

/** The idle window. 2.6s, named once so a test asserts the number rather than
 *  re-typing it, and so 3.8's tuning is one edit. */
export const CHROME_IDLE_MS = 2600;

export function canAutoHide({
  state,
  hasFocus = false,
  sheetOpen = false,
  pointerInChrome = false,
} = {}) {
  if (hasFocus) return false;
  if (sheetOpen) return false;
  if (pointerInChrome) return false;
  return state === S.PLAYING || state === S.STALLED;
}

/** The states where hiding is never right, named so a future regression reports
 *  itself here instead of failing vaguely in the hook. Exhaustive by design —
 *  `playerV2Chrome.test.jsx` asserts this list covers every state except
 *  `playing` and `stalled`, so adding a state without deciding its policy is a
 *  test failure rather than a silent default. */
export const NEVER_HIDE_STATES = Object.freeze([
  S.IDLE,
  S.RESOLVING,
  S.OPENING,
  S.BUFFERING,
  /* `paused` is the state this whole item is about: a paused player whose
   * controls faded out has no reachable play button, which is the failure mode
   * 3.8 exists to avoid. */
  S.PAUSED,
  S.ENDED,
  S.ERROR,
]);
