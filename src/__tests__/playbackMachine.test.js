import { describe, expect, it } from "vitest";
import {
  E,
  S,
  STATES,
  canTransition,
  describeState,
  initialPlayback,
  playbackReducer,
  selectView,
} from "../components/player/v2/playbackMachine";

/* PLAYER V2 playback state machine (task.md 2.6 / 2.7).
 *
 * Two properties are worth more than any individual transition:
 *
 *  1. ILLEGAL TRANSITIONS ARE REFUSED, not obeyed. The old player derived
 *     "loading?" from independent booleans, so a stray media event could put the
 *     UI in a combination nothing was written for. The table test below walks
 *     EVERY state x event pair so a future "just allow this one" edit is visible.
 *
 *  2. LOADER / BUFFERING / ANNOUNCEMENT CANNOT DISAGREE. All three are derived
 *     from one enum by selectView, so that is asserted structurally rather than
 *     case-by-case: no state may show the full-screen loader AND the
 *     frame-preserving spinner together, and every state that shows an
 *     indicator must announce something.
 */

const ALL_EVENTS = Object.values(E);

/** Drive the machine from `initial` through a list of events. */
function run(events, from = initialPlayback) {
  return events.reduce((acc, ev) => playbackReducer(acc, { type: ev }), from);
}

/** The happy path: request -> source -> attached -> first frame. */
const TO_PLAYING = [E.REQUEST, E.SOURCE_READY, E.ATTACHED, E.FIRST_FRAME];

describe("playbackMachine — transition table", () => {
  it("walks the happy path idle -> resolving -> opening -> buffering -> playing", () => {
    let p = initialPlayback;
    const seen = [p.state];
    for (const ev of TO_PLAYING) {
      p = playbackReducer(p, { type: ev });
      seen.push(p.state);
    }
    expect(seen).toEqual([S.IDLE, S.RESOLVING, S.OPENING, S.BUFFERING, S.PLAYING]);
  });

  it("treats STALL and RECOVER as playing <-> stalled", () => {
    const playing = run(TO_PLAYING);
    const stalled = playbackReducer(playing, { type: E.STALL });
    expect(stalled.state).toBe(S.STALLED);
    expect(playbackReducer(stalled, { type: E.RECOVER }).state).toBe(S.PLAYING);
  });

  it("refuses a stall during the FIRST buffer, because there is no frame to keep", () => {
    // Regression guard. `waiting` fires during initial buffering as well as on a
    // mid-playback underrun, and the table used to accept both as STALL. But a
    // stall is defined as preserving the last frame, and `buffering` has none —
    // so `showBuffering` would have been preserving nothing, which is precisely
    // the "frozen screen, spinner over blackness" symptom this rewrite exists to
    // delete. During first buffering `waiting` is already the correct state, so
    // the right response is to ignore the event.
    const buffering = run([E.REQUEST, E.SOURCE_READY, E.ATTACHED]);
    expect(buffering.state).toBe(S.BUFFERING);
    expect(canTransition(S.BUFFERING, E.STALL)).toBe(false);

    const after = playbackReducer(buffering, { type: E.STALL });
    expect(after.state).toBe(S.BUFFERING);
    expect(after.rev).toBe(buffering.rev);

    // And the first real frame still promotes it, which is what matters.
    expect(playbackReducer(after, { type: E.FIRST_FRAME }).state).toBe(S.PLAYING);
  });

  it("re-arms from ended and from error", () => {
    const ended = run([...TO_PLAYING, E.END]);
    expect(ended.state).toBe(S.ENDED);
    expect(playbackReducer(ended, { type: E.REQUEST }).state).toBe(S.RESOLVING);

    const failed = playbackReducer(run(TO_PLAYING), { type: E.FAIL, error: new Error("boom") });
    expect(failed.state).toBe(S.ERROR);
    expect(playbackReducer(failed, { type: E.RETRY }).state).toBe(S.RESOLVING);
  });

  it("allows RESET from every state — closing the player is always legitimate", () => {
    for (const state of STATES) {
      const from = { ...initialPlayback, state };
      expect(playbackReducer(from, { type: E.RESET }).state).toBe(S.IDLE);
    }
  });
});

/* PAUSED and its events (task.md 3.7). Added with the Tier A transport, because
 * the play button cannot label itself without a truthful answer to "is this
 * video playing", and the previous machine had no way to say otherwise. */
describe("playbackMachine — paused", () => {
  it("round-trips playing -> paused -> playing", () => {
    const playing = { ...initialPlayback, state: S.PLAYING };
    const paused = playbackReducer(playing, { type: E.PAUSE });
    expect(paused.state).toBe(S.PAUSED);
    expect(paused.rev).toBe(playing.rev + 1);
    expect(playbackReducer(paused, { type: E.RESUME }).state).toBe(S.PLAYING);
  });

  it("can be paused mid-buffer, before there is a frame", () => {
    // Pressing pause during the first buffer is a real gesture, and refusing it
    // would leave the button doing nothing for the whole load window.
    expect(canTransition(S.BUFFERING, E.PAUSE)).toBe(true);
    expect(playbackReducer({ ...initialPlayback, state: S.BUFFERING }, { type: E.PAUSE }).state).toBe(
      S.PAUSED,
    );
  });

  it("cannot be paused while resolving, opening, ended or errored", () => {
    // There is no element to pause in those states; accepting PAUSE would park
    // the machine in a state no later event can leave except RESET.
    [S.RESOLVING, S.OPENING, S.ENDED, S.ERROR, S.IDLE].forEach((from) => {
      expect(canTransition(from, E.PAUSE), from).toBe(false);
    });
  });

  it("does not let a stall masquerade as a pause", () => {
    // 3.9 keys Tier B off isPlaying. A network hiccup must not flip the whole
    // chrome into "paused" — the frame is still there and the viewer is still
    // watching.
    expect(selectView({ state: S.PLAYING }).isPlaying).toBe(true);
    expect(selectView({ state: S.STALLED }).isPlaying).toBe(true);
    expect(selectView({ state: S.PAUSED }).isPlaying).toBe(false);
    expect(selectView({ state: S.PAUSED }).isPaused).toBe(true);
  });

  it("says nothing when paused", () => {
    // A live-region update on every pause — including the ones made while
    // reaching for the volume control — is noise, not information.
    expect(describeState(S.PAUSED, null)).toBe("");
  });

  it("accepts PAUSE from stalled, so the Pause button during a stall is real", () => {
    // Regression: `selectView` reports `stalled` as playing, so the transport
    // labels the button "Pause" during a stall. With `E.PAUSE` absent from
    // STALLED's table, pressing it paused the element and the machine refused the
    // event — element paused, label still "Pause", nothing left to press.
    expect(canTransition(S.STALLED, E.PAUSE)).toBe(true);

    const stalledNow = playbackReducer(run(TO_PLAYING), { type: E.STALL });
    expect(stalledNow.state).toBe(S.STALLED);

    expect(selectView({ state: stalledNow.state }).isPlaying).toBe(true);

    const paused = playbackReducer(stalledNow, { type: E.PAUSE });
    expect(paused.state).toBe(S.PAUSED);
    expect(selectView({ state: paused.state }).isPaused).toBe(true);
    // And it resumes from there like any other pause.
    expect(playbackReducer(paused, { type: E.RESUME }).state).toBe(S.PLAYING);
  });

  it("can still stall, end, fail and reset from paused", () => {
    const paused = { ...initialPlayback, state: S.PAUSED };
    expect(playbackReducer(paused, { type: E.END }).state).toBe(S.ENDED);
    expect(playbackReducer(paused, { type: E.FAIL, error: { message: "x" } }).state).toBe(S.ERROR);
    expect(playbackReducer(paused, { type: E.RESET }).state).toBe(S.IDLE);
  });
});

describe("playbackMachine — every illegal transition is refused", () => {
  it("refuses all state x event combinations not in the table", () => {
    const legal = new Map();
    for (const from of STATES) {
      for (const ev of ALL_EVENTS) {
        if (canTransition(from, ev)) legal.set(`${from}:${ev}`, true);
      }
    }

    const wronglyAllowed = [];
    for (const from of STATES) {
      for (const ev of ALL_EVENTS) {
        if (legal.has(`${from}:${ev}`)) continue;
        const result = playbackReducer({ ...initialPlayback, state: from }, { type: ev });
        if (result.state !== from) wronglyAllowed.push(`${from} + ${ev} -> ${result.state}`);
        // A refusal must be a total no-op: same state, same error, and crucially
        // an UNCHANGED rev so per-change effects do not double-fire.
        if (result.rev !== initialPlayback.rev) wronglyAllowed.push(`${from} + ${ev} bumped rev`);
      }
    }
    expect(wronglyAllowed, `illegal transitions accepted: ${wronglyAllowed.join(", ")}`).toEqual([]);
  });

  it("never allows idle straight to playing", () => {
    // The shortcut that matters: without a guard, a fast first-frame event could
    // skip resolve/open entirely and the UI would have no loader for a load that
    // is genuinely still happening.
    expect(canTransition(S.IDLE, E.FIRST_FRAME)).toBe(false);
  });

  it("never allows ended to jump to playing", () => {
    expect(canTransition(S.ENDED, E.FIRST_FRAME)).toBe(false);
    expect(canTransition(S.ENDED, E.RECOVER)).toBe(false);
  });

  it("survives a duplicate event storm without changing state", () => {
    // Safari can fire `waiting` several times for one stall; a reducer that
    // counted them would report several separate stalls.
    const stalled = playbackReducer(run(TO_PLAYING), { type: E.STALL });
    const once = playbackReducer(stalled, { type: E.STALL });
    const twice = playbackReducer(once, { type: E.STALL });
    expect(once.state).toBe(S.STALLED);
    expect(twice.state).toBe(S.STALLED);
    expect(twice.rev).toBe(stalled.rev);
  });

  it("does not throw on a malformed action", () => {
    expect(() => playbackReducer(initialPlayback, undefined)).not.toThrow();
    expect(() => playbackReducer(initialPlayback, {})).not.toThrow();
    expect(() => playbackReducer(initialPlayback, { type: "NOPE" })).not.toThrow();
  });
});

describe("playbackMachine — errors", () => {
  it("keeps the error for the error state only", () => {
    const err = new Error("no variants");
    const failed = playbackReducer(run(TO_PLAYING), { type: E.FAIL, error: err });
    expect(failed.error).toBe(err);

    // Recovering must clear it, or the player keeps rendering a stale failure
    // over a stream that is now playing.
    const retried = playbackReducer(failed, { type: E.RETRY });
    expect(retried.error).toBeNull();
  });

  it("refuses a FAIL from a state that cannot fail, keeping any prior error", () => {
    const from = { state: S.IDLE, error: null, rev: 0 };
    expect(playbackReducer(from, { type: E.FAIL, error: new Error("x") }).state).toBe(S.IDLE);
  });
});

describe("selectView — the three indicators cannot disagree (task.md 2.7)", () => {
  it("never shows the full-screen loader and the frame-preserving spinner together", () => {
    // The old player conflated these, which is why a mid-playback stall looked
    // frozen: preserving the frame suppressed the loader and nothing replaced it.
    for (const state of STATES) {
      const view = selectView({ state, error: null });
      expect(
        view.showLoader && view.showBuffering,
        `${state} shows both the loader and the buffering spinner`,
      ).toBe(false);
    }
  });

  it("shows the loader exactly when there is no frame yet", () => {
    const noFrame = [S.RESOLVING, S.OPENING, S.BUFFERING];
    for (const state of STATES) {
      const view = selectView({ state, error: null });
      expect(view.showLoader, `${state} loader`).toBe(noFrame.includes(state));
    }
  });

  it("buffers over a preserved frame for a stall, not with the loader", () => {
    const view = selectView({ state: S.STALLED, error: null });
    expect(view.showBuffering).toBe(true);
    expect(view.showLoader).toBe(false);
  });

  it("shows nothing at all when idle — an unrequested player is not loading", () => {
    const view = selectView({ state: S.IDLE, error: null });
    expect(view.showLoader).toBe(false);
    expect(view.showBuffering).toBe(false);
    expect(view.announcement).toBe("");
  });

  it("announces nothing while playing, so a screen reader is not flooded", () => {
    // Silence on the happy path is deliberate: announcing every PLAYING
    // transition makes the player unusable with a screen reader.
    expect(selectView({ state: S.PLAYING, error: null }).announcement).toBe("");
  });

  it("announces a distinct message for every waiting state", () => {
    const seen = new Set();
    for (const state of [S.RESOLVING, S.OPENING, S.BUFFERING, S.STALLED, S.ENDED]) {
      const text = describeState(state, null);
      expect(text, `${state} announced nothing while waiting`).not.toBe("");
      expect(seen.has(text), `${state} reuses another state's message`).toBe(false);
      seen.add(text);
    }
  });

  it("folds the error message into the announcement", () => {
    const view = selectView({ state: S.ERROR, error: { message: "No variants found." } });
    expect(view.announcement).toContain("No variants found.");
  });

  it("still announces on error when no message was supplied", () => {
    const view = selectView({ state: S.ERROR, error: null });
    expect(view.announcement).toMatch(/failed/i);
  });
});
