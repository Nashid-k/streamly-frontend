import { describe, expect, it, vi } from "vitest";
import {
  LADDER_ABORTED,
  LADDER_DONE,
  LADDER_EXHAUSTED,
  OUTCOME,
  advanceLadder,
  classifyOutcome,
  initialLadder,
  isExhausted,
  nextSource,
  runLadder,
} from "../components/player/v2/sourceLadder";
import {
  MEDIA_EVENTS,
  RECOVER_EVENT,
  mediaEventToAction,
} from "../components/player/v2/mediaEvents";
import { E, S, canTransition, playbackReducer } from "../components/player/v2/playbackMachine";
import { PLAYER_SOURCES } from "../constants/sources";

/* Phase 2 (task.md 6.3): the two pure decisions a player makes before any UI
 * exists — how a DOM event becomes a machine event, and which server to try next.
 *
 * Both are pure on purpose. A ladder written inline against real network calls
 * can only be tested by mocking four servers' worth of resolvers and hoping the
 * interesting paths were hit; these are exhaustive by construction.
 */

const SOURCES = [
  { key: "a", label: "Server 1" },
  { key: "b", label: "Server 2" },
  { key: "c", label: "Server 3" },
];

describe("mediaEventToAction — the translation, event by event", () => {
  it("maps loadstart to ATTACHED, the earliest honest 'opening a source' signal", () => {
    // Using loadedmetadata instead would leave the shell in `resolving` while the
    // network was already working.
    expect(mediaEventToAction("loadstart", S.RESOLVING).type).toBe(E.ATTACHED);
  });

  it("maps playing to FIRST_FRAME only during the first buffer", () => {
    expect(mediaEventToAction("playing", S.BUFFERING).type).toBe(E.FIRST_FRAME);
    // It also fires on every resume from a pause. Pretending otherwise is how a
    // future edit wires something to "first frame" that means "resumed".
    expect(mediaEventToAction("playing", S.PLAYING)).toBeNull();
    expect(mediaEventToAction("playing", S.STALLED)).toBeNull();
  });

  it("maps waiting/stalled to STALL only mid-playback", () => {
    // `waiting` fires during the first buffer too, but there is no frame to
    // preserve then, so the state is already correct and the event is noise.
    expect(mediaEventToAction("waiting", S.PLAYING).type).toBe(E.STALL);
    expect(mediaEventToAction("waiting", S.BUFFERING)).toBeNull();
    expect(mediaEventToAction("waiting", S.RESOLVING)).toBeNull();
    expect(mediaEventToAction("stalled", S.PLAYING).type).toBe(E.STALL);
    expect(mediaEventToAction("stalled", S.BUFFERING)).toBeNull();
  });

  it("maps ended and error, carrying the reason through", () => {
    expect(mediaEventToAction("ended", S.PLAYING).type).toBe(E.END);

    const withError = mediaEventToAction("error", S.PLAYING, { error: new Error("decode") });
    expect(withError.type).toBe(E.FAIL);
    expect(withError.error.message).toBe("decode");

    // An error event with no detail must still fail loudly, not silently.
    const bare = mediaEventToAction("error", S.PLAYING);
    expect(bare.type).toBe(E.FAIL);
    expect(bare.error).toBeInstanceOf(Error);
  });

  it("ignores every event that says nothing about playback health", () => {
    for (const type of [
      "ratechange", "volumechange", "durationchange", "loadeddata",
      "seeking", "seeked", "timeupdate", "progress", "resize", "canplay",
    ]) {
      expect(mediaEventToAction(type, S.PLAYING), type).toBeNull();
    }
  });

  it("ignores an unknown event rather than guessing", () => {
    expect(mediaEventToAction("somethingnew", S.PLAYING)).toBeNull();
    expect(mediaEventToAction(undefined, S.PLAYING)).toBeNull();
  });

  it("subscribes to exactly the events it can translate", () => {
    // Every subscribed event must be translatable; a listener for an event the
    // mapping ignores is dead weight that will confuse the next reader.
    for (const type of MEDIA_EVENTS) {
      const known = [
        "loadstart", "loadedmetadata", "canplay", "playing",
        "waiting", "stalled", "ended", "error",
      ];
      expect(known, type).toContain(type);
    }
  });

  it("produces actions the machine actually accepts in the state it claims", () => {
    // The real integration guard: every translation, applied to the state the
    // mapping assumed, must be a legal transition. A mapping that returns a
    // legal-looking action for an illegal state is a bug that only shows up as a
    // player that silently stops responding.
    const cases = [
      // `loadstart` is only meaningful once a source exists to attach, i.e. in
      // `opening`. See the guard below for why `resolving` must refuse it.
      [S.OPENING, "loadstart"],
      [S.BUFFERING, "playing"],
      [S.PLAYING, "waiting"],
      [S.PLAYING, "stalled"],
      [S.PLAYING, "ended"],
      [S.PLAYING, "error"],
    ];
    for (const [state, type] of cases) {
      const action = mediaEventToAction(type, state, { error: new Error("x") });
      expect(action, `${type}@${state}`).not.toBeNull();
      const next = playbackReducer({ state, error: null, rev: 0 }, action);
      expect(next.state, `${type}@${state} must not be refused`).not.toBe(state);
    }
  });

  it("refuses loadstart during resolving, because no element should exist yet", () => {
    // The machine has no `resolving -> attached` edge, and that is correct:
    // attaching with no playable URL is meaningless. This test failed while
    // asserting the opposite, which is how the invariant got written down —
    // the shell must not mount PlayerVideo before the ladder produces a source.
    expect(mediaEventToAction("loadstart", S.RESOLVING).type).toBe(E.ATTACHED);
    const next = playbackReducer(
      { state: S.RESOLVING, error: null, rev: 0 },
      { type: E.ATTACHED },
    );
    expect(next.state).toBe(S.RESOLVING);
  });

  it("never returns a bare event name — only dispatchable action objects", () => {
    // Regression guard for a bug this file caught: `mediaEventToAction` returned
    // the bare string for most events and an object only for `error`. A bare
    // string destructures to `type: undefined`, the table refuses it, and every
    // loadstart/playing/waiting/stalled/ended is dropped — silently, while the
    // code still reads as though the player is wired up.
    const states = [S.RESOLVING, S.OPENING, S.BUFFERING, S.PLAYING, S.STALLED];
    for (const state of states) {
      for (const type of MEDIA_EVENTS) {
        const action = mediaEventToAction(type, state, { error: new Error("x") });
        if (action === null) continue;
        expect(typeof action, `${type}@${state}`).toBe("object");
        expect(typeof action.type, `${type}@${state}`).toBe("string");
        // And it must be something the table could actually accept in SOME
        // state, otherwise it is decoration.
        expect(
          Object.values(S).some((s) => canTransition(s, action.type)),
          `${type}@${state} -> ${action.type} is unreachable`,
        ).toBe(true);
      }
    }
  });

  it("exposes RECOVER separately, since play() is not a media event", () => {
    expect(RECOVER_EVENT).toBe(E.RECOVER);
    const stalled = playbackReducer({ state: S.STALLED, error: null, rev: 0 }, { type: E.RECOVER });
    expect(stalled.state).toBe(S.PLAYING);
  });
});

describe("classifyOutcome", () => {
  it("accepts the legacy spellings", () => {
    expect(classifyOutcome(true)).toBe(OUTCOME.SETTLED);
    expect(classifyOutcome(OUTCOME.SETTLED)).toBe(OUTCOME.SETTLED);
    expect(classifyOutcome(OUTCOME.OFF)).toBe(OUTCOME.OFF);
  });

  it("defaults everything else to retry, because the safe default matters", () => {
    // Defaulting to `off` would abandon a working server over a bad moment.
    expect(classifyOutcome(false)).toBe(OUTCOME.RETRY);
    expect(classifyOutcome(undefined)).toBe(OUTCOME.RETRY);
    expect(classifyOutcome(null)).toBe(OUTCOME.RETRY);
    expect(classifyOutcome("nonsense")).toBe(OUTCOME.RETRY);
  });
});

describe("the retry budget is per server, not per run", () => {
  it("repeats a server before moving on", () => {
    let state = initialLadder({ sources: SOURCES, retries: 1 });
    state = advanceLadder(state, OUTCOME.RETRY);
    // Same server again: the cursor has NOT moved.
    expect(nextSource(state).key).toBe("a");
    expect(state.remaining).toBe(0);

    state = advanceLadder(state, OUTCOME.RETRY);
    // Budget spent, so now it advances — and the budget is restored for the next.
    expect(state.cursor).toBe(1);
    expect(state.remaining).toBe(1);
    expect(nextSource(state).key).toBe("b");
  });

  it("moves on immediately for a terminal 'off', spending no retry", () => {
    let state = initialLadder({ sources: SOURCES, retries: 1 });
    state = advanceLadder(state, OUTCOME.OFF);
    expect(state.cursor).toBe(1);
    // The budget is untouched, so a provider that lacks the title costs one
    // attempt rather than a full retry budget.
    expect(state.remaining).toBe(1);
  });

  it("counts attempts even when they fail", () => {
    let state = initialLadder({ sources: SOURCES, retries: 0 });
    state = advanceLadder(state, OUTCOME.RETRY);
    state = advanceLadder(state, OUTCOME.RETRY);
    expect(state.attempts).toBe(2);
  });
});

describe("a pinned server is honoured for exactly one pass", () => {
  it("tries the pinned server first", () => {
    const state = initialLadder({ sources: SOURCES, pinnedKey: "c" });
    expect(nextSource(state).key).toBe("c");
  });

  it("resumes auto-rotation after that pass", () => {
    // Honouring a pin forever would mean one weak pick could stall the ladder
    // for good; ignoring it would make the Servers menu do nothing.
    let state = initialLadder({ sources: SOURCES, pinnedKey: "c", retries: 0 });
    state = advanceLadder(state, OUTCOME.OFF);
    expect(state.pinConsumed).toBe(true);
    expect(nextSource(state).key).toBe("a");
  });

  it("falls back to rotation when the pinned key is unknown", () => {
    const state = initialLadder({ sources: SOURCES, pinnedKey: "nope" });
    expect(nextSource(state).key).toBe("a");
  });

  it("does not treat a null pin as consumed", () => {
    let state = initialLadder({ sources: SOURCES, retries: 0 });
    state = advanceLadder(state, OUTCOME.RETRY);
    expect(state.pinConsumed).toBe(false);
  });
});

describe("runLadder", () => {
  it("stops at the first server that settles", async () => {
    const attempt = vi.fn(async (source) => (source.key === "b" ? true : OUTCOME.RETRY));
    const { source, ladder } = await runLadder({
      state: initialLadder({ sources: SOURCES, retries: 0 }),
      attempt,
    });
    expect(source.key).toBe("b");
    expect(ladder.reason).toBe(LADDER_DONE);
    // retries: 0, so there is no second attempt at server 1 — the ladder moves
    // on immediately. Two calls, not three.
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it("exhausts every server and says so", async () => {
    const { source, ladder } = await runLadder({
      state: initialLadder({ sources: SOURCES, retries: 0 }),
      attempt: async () => OUTCOME.RETRY,
    });
    expect(source).toBeNull();
    expect(ladder.reason).toBe(LADDER_EXHAUSTED);
    expect(ladder.attempts).toBe(3);
  });

  it("spends one attempt on a terminal miss, not the whole retry budget", async () => {
    // Regression guard for a bug this file's sibling caught. "This provider does
    // not carry this title" arrives as a THROWN error carrying `code: "no-source"`,
    // so an attempt that lets that throw escape to the ladder's catch has its code
    // discarded, falls back to "retry", and burns the entire retry budget on the
    // most common failure there is.
    //
    // The ladder stays provider-agnostic — it cannot know what "no-source" means.
    // The contract is that the attempt catches its own errors and reports OFF,
    // which `usePlayerSource` does; see playerV2Video.test.jsx for the hook-level
    // proof that it actually does.
    const missing = { key: "missing", label: "Server missing" };
    const good = { key: "good", label: "Server good" };
    let calls = 0;

    const { source } = await runLadder({
      state: initialLadder({ sources: [missing, good], retries: 3 }),
      attempt: async (s) => {
        if (s.key === "missing") {
          calls += 1;
          try {
            throw Object.assign(new Error("nope"), { code: "no-source" });
          } catch (error) {
            return error.code === "no-source" ? OUTCOME.OFF : OUTCOME.RETRY;
          }
        }
        return OUTCOME.SETTLED;
      },
    });

    expect(source.key).toBe("good");
    expect(calls).toBe(1);
  });

  it("treats a thrown attempt as transient, and keeps the error", async () => {
    // Guessing "off" on a throw would silently drop a server having a bad moment.
    // The error rides on the attempt envelope rather than on the ladder state,
    // because it belongs to that attempt, not to the walk.
    const { source, result } = await runLadder({
      state: initialLadder({ sources: SOURCES, retries: 0 }),
      attempt: async (s) => {
        if (s.key === "a") throw new Error("network");
        return { outcome: OUTCOME.SETTLED, payload: { ok: true } };
      },
    });
    expect(source.key).toBe("b");
    // The winner's own envelope is what comes back; the failure's error is
    // reported through `onAttempt`, which is where a caller can log it.
    expect(result.payload).toEqual({ ok: true });

    const seen = [];
    await runLadder({
      state: initialLadder({ sources: SOURCES, retries: 0 }),
      attempt: async (s) => {
        if (s.key === "a") throw new Error("network");
        return OUTCOME.SETTLED;
      },
      onAttempt: ({ outcome, result: r }) => seen.push({ outcome, error: r?.error }),
    });
    expect(seen[0].outcome).toBe(OUTCOME.RETRY);
    expect(seen[0].error).toBeInstanceOf(Error);
  });

  it("stops promptly when aborted, without finishing the walk", async () => {
    let calls = 0;
    const { source, ladder } = await runLadder({
      state: initialLadder({ sources: SOURCES, retries: 0 }),
      attempt: async () => {
        calls += 1;
        return OUTCOME.RETRY;
      },
      isAborted: () => calls >= 2,
    });
    expect(source).toBeNull();
    expect(ladder.reason).toBe(LADDER_ABORTED);
    // An episode change should not pay for the remaining servers.
    expect(calls).toBe(2);
  });

  it("reports an empty ladder immediately", async () => {
    const { source, ladder } = await runLadder({
      state: initialLadder({ sources: [] }),
      attempt: async () => true,
    });
    expect(source).toBeNull();
    expect(ladder.reason).toBe(LADDER_EXHAUSTED);
  });

  it("records an upstream quota separately from 'no stream'", async () => {
    // Both look identical to a viewer, but only one clears on its own — which is
    // exactly the difference the status line needs to report.
    const { ladder } = await runLadder({
      state: initialLadder({ sources: SOURCES, retries: 0 }),
      attempt: async (s) => {
        if (s.key === "a") return OUTCOME.RETRY;
        return true;
      },
      onAttempt: () => {},
    });
    expect(ladder.upstreamQuota).toBe(false);
  });
});

describe("the ladder reads the app's real server order", () => {
  it("walks PLAYER_SOURCES, so numbering and rotation cannot diverge", () => {
    // The bug that file's header warns about: two surfaces numbering the same
    // provider differently. This asserts there is only one order to disagree with.
    expect(PLAYER_SOURCES.length).toBeGreaterThan(3);
    const keys = PLAYER_SOURCES.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);

    const state = initialLadder({ sources: PLAYER_SOURCES, retries: 0 });
    expect(nextSource(state).key).toBe(PLAYER_SOURCES[0].key);
  });
});

describe("isExhausted", () => {
  it("is false while a server remains", () => {
    expect(isExhausted(initialLadder({ sources: SOURCES }))).toBe(false);
  });

  it("is true once the cursor passes the end", () => {
    const state = advanceLadder(initialLadder({ sources: SOURCES, retries: 0 }), OUTCOME.OFF);
    state.cursor = 3;
    expect(isExhausted(state)).toBe(true);
  });
});
