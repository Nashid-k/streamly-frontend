/**
 * DOM media events -> playback machine events.
 *
 * ── Why this is a separate pure module ──────────────────────────────────────
 * A `<video>` element fires a small, fixed vocabulary of events, and every one
 * of them has to be translated into exactly one machine event — or none. Getting
 * that translation wrong is how players end up claiming to be playing while
 * frozen, or announcing "buffering" over a perfectly good frame.
 *
 * It is pure and React-free so the whole mapping can be tested by handing it
 * event names and a state, with no DOM, no element and no clock. The alternative
 * — attaching listeners in a component and asserting on rendered output — cannot
 * distinguish "the mapping is wrong" from "the component did not re-render", and
 * those two bugs need completely different fixes.
 *
 * ── The three judgement calls, all deliberate ───────────────────────────────
 *
 * 1. `waiting` is NOT always a stall. It fires during the first buffer as well as
 *    on a mid-playback underrun, and the machine already models those differently
 *    (`buffering` has no frame; `stalled` preserves one). This mapping trusts the
 *    current state to disambiguate, which is why it needs the state as an input.
 *
 * 2. `playing` is the first-frame signal, not a resume. The HTML spec fires it on
 *    every resume from a pause too, so dispatching `FIRST_FRAME` unconditionally
 *    would be harmless (the transition is refused outside `buffering`) but
 *    pretending the distinction does not exist is how a future edit wires
 *    something to "first frame" that actually means "resumed".
 *
 * 3. Events that carry no state meaning return null and are ignored, rather than
 *    being mapped to something approximate. `ratechange`, `volumechange`,
 *    `durationchange`, `seeking`, `seeked`, `timeupdate` and friends are real
 *    events that say nothing about whether playback is healthy.
 */

import { E, S } from "./playbackMachine";

/** Events that say something about whether playback is healthy. */
export const MEDIA_EVENTS = Object.freeze([
  "loadstart",
  "loadedmetadata",
  "canplay",
  "playing",
  "waiting",
  "stalled",
  "ended",
  "error",
]);

/**
 * Translate one DOM event name into a machine ACTION, given the current state.
 *
 * Always an object, never a bare event name. An earlier draft returned the bare
 * string for most cases and an object only for `error`, which is a trap that
 * fails silently rather than loudly: `dispatch("ATTACHED")` destructures to
 * `type: undefined`, the transition table refuses it, and every one of
 * loadstart/playing/waiting/stalled/ended is dropped while the code still reads
 * as though it works. The integration test in `playerV2Source.test.js` exists to
 * catch exactly this — a translation that produces an action the machine refuses.
 *
 * @param {string} type DOM event name.
 * @param {string} state current machine state.
 * @param {{ error?: unknown }} [detail] for `error`, the MediaError or Error.
 * @returns {{ type: string, error?: unknown }|null} an action, or null to ignore.
 */
export function mediaEventToAction(type, state, detail = {}) {
  switch (type) {
    /* ── Attachment ──────────────────────────────────────────────────────── */
    // `loadstart` fires when the element is told to fetch. That is the earliest
    // honest "we are opening a source" signal; using `loadedmetadata` here would
    // leave the shell in `resolving` while the network was already working.
    // It is only legal from `opening` — attaching with no source is meaningless,
    // so the shell must not mount the element before the ladder produces one.
    case "loadstart":
      return { type: E.ATTACHED };

    /* ── First frame ─────────────────────────────────────────────────────── */
    // Fires when playback actually begins after being paused, and when it
    // resumes. Inside `buffering` it can only mean the first frame arrived.
    case "playing":
      return state === S.BUFFERING ? { type: E.FIRST_FRAME } : null;

    /* ── Underrun ────────────────────────────────────────────────────────── */
    case "waiting":
      // Only a genuine mid-playback underrun. During the first buffer the state
      // is already correct, so there is nothing to change — see note 1.
      return state === S.PLAYING ? { type: E.STALL } : null;

    case "stalled":
      // The browser's own "fetching is taking too long". Same reasoning: it is
      // meaningful only once there is a frame worth preserving.
      return state === S.PLAYING ? { type: E.STALL } : null;

    /* ── Terminal ────────────────────────────────────────────────────────── */
    case "ended":
      return { type: E.END };

    case "error":
      // Never dispatched bare: without a reason the failure is unactionable, and
      // `error` is the one event where the payload IS the message.
      return { type: E.FAIL, error: detail.error ?? new Error("Playback failed") };

    default:
      return null;
  }
}

/**
 * The resume signal, which is NOT a media event.
 *
 * `RECOVER` is dispatched by the player calling `play()` after a stall resolved,
 * not by the element — so it is exposed separately rather than being smuggled
 * through `mediaEventToAction`.
 */
export const RECOVER_EVENT = E.RECOVER;
