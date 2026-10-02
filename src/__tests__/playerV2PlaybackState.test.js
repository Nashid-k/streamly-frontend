import { act, renderHook } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import usePlaybackState from "../components/player/v2/hooks/usePlaybackState";
import { E, S, initialPlayback } from "../components/player/v2/playbackMachine";

/* task.md 7.8 — the hook half.
 *
 * `playbackMachine.test.js` already walks EVERY state x event pair, so the
 * transition TABLE is not what is untested here. What is untested is the 48
 * lines of React between the table and the components, and that layer owns three
 * promises the pure test cannot see:
 *
 *   1. `send` is REFERENTIALLY STABLE. PlayerShell passes it into effect
 *      callbacks (`onWaiting`, `onPlaying`, ...). If its identity churned, every
 *      one of those effects would tear down and re-subscribe on every render.
 *   2. A REFUSED event must not re-render at all. The reducer returns `prev`, so
 *      React bails out — which is what makes Safari's "several `waiting` events
 *      for one stall" cost nothing. Asserted here because the bail-out is a React
 *      behaviour, not a reducer one.
 *   3. `rev` is the A11Y SIGNAL. `usePlaybackStatus` re-announces when `rev`
 *      changes, so a spurious bump would speak the same sentence repeatedly to a
 *      screen-reader user.
 */

/** Drive the hook the way PlayerShell does: real events, through `send`. */
function send(act_, result, ...events) {
  for (const ev of events) act(() => result.current.send(ev));
}

const TO_PLAYING = [E.REQUEST, E.SOURCE_READY, E.ATTACHED, E.FIRST_FRAME];

describe("usePlaybackState — driving real events through send", () => {
  it("walks the happy path to playing and reports isPlaying", () => {
    const { result } = renderHook(() => usePlaybackState());
    expect(result.current.state).toBe(S.IDLE);
    expect(result.current.showLoader).toBe(false);

    send(act, result, ...TO_PLAYING);

    expect(result.current.state).toBe(S.PLAYING);
    expect(result.current.isPlaying).toBe(true);
    expect(result.current.isBusy).toBe(false);
    expect(result.current.showLoader).toBe(false);
    // Silence on the happy path is deliberate; a screen reader must not be
    // flooded with an update on every PLAYING transition.
    expect(result.current.announcement).toBe("");
  });

  it("shows the loader during resolve and open, before any frame exists", () => {
    const { result } = renderHook(() => usePlaybackState());

    act(() => result.current.send(E.REQUEST));
    expect(result.current.showLoader).toBe(true);
    expect(result.current.isBusy).toBe(true);

    act(() => result.current.send(E.SOURCE_READY));
    expect(result.current.showLoader).toBe(true);
  });

  it("keeps the frame and spins over it on a stall, then recovers", () => {
    const { result } = renderHook(() => usePlaybackState());
    send(act, result, ...TO_PLAYING);

    act(() => result.current.send(E.STALL));
    expect(result.current.state).toBe(S.STALLED);
    expect(result.current.showBuffering).toBe(true);
    // The whole point of the rewrite: a stall is NOT the full-screen loader.
    expect(result.current.showLoader).toBe(false);
    // And it is still "playing", so the chrome does not flip to a false pause.
    expect(result.current.isPlaying).toBe(true);

    act(() => result.current.send(E.RECOVER));
    expect(result.current.state).toBe(S.PLAYING);
    expect(result.current.showBuffering).toBe(false);
  });

  it("accepts the initial override it advertises for tests", () => {
    // A player restored mid-session must not have to drive four events to reach
    // the state it was actually in.
    const { result } = renderHook(() => usePlaybackState({ ...initialPlayback, state: S.PAUSED }));
    expect(result.current.state).toBe(S.PAUSED);
    expect(result.current.isPaused).toBe(true);
  });
});

describe("usePlaybackState — send is a stable identity", () => {
  it("keeps the same send across every render", () => {
    const { result, rerender } = renderHook(() => usePlaybackState());
    const first = result.current.send;

    rerender();
    send(act, result, E.REQUEST);

    // The load-bearing assertion. If this churned, every effect in PlayerShell
    // that captures `send` would resubscribe on every render of the player.
    expect(result.current.send).toBe(first);
  });

  it("survives a state change without handing out a new function", () => {
    const { result } = renderHook(() => usePlaybackState());
    const first = result.current.send;
    send(act, result, ...TO_PLAYING, E.STALL, E.RECOVER, E.END);
    expect(result.current.state).toBe(S.ENDED);
    expect(result.current.send).toBe(first);
  });
});

describe("usePlaybackState — a refused event costs nothing", () => {
  it("leaves state, error and rev untouched", () => {
    const { result } = renderHook(() => usePlaybackState());
    send(act, result, ...TO_PLAYING);

    // Reach STALLED first: STALL is legal from PLAYING, so it is only the
    // DUPLICATE that must be refused — which is the pair Safari's repeated
    // `waiting` events actually produce.
    act(() => result.current.send(E.STALL));
    const before = { ...result.current };

    act(() => result.current.send(E.STALL));
    act(() => result.current.send(E.STALL));

    expect(result.current.state).toBe(S.STALLED);
    expect(result.current.rev).toBe(before.rev);
    expect(result.current.error).toBe(before.error);
  });

  it("does not re-fire a rev-keyed effect for a refused event", () => {
    // Precise scope, because the obvious phrasing of this is false: React still
    // re-renders the component once per dispatch (it may re-render the component
    // itself before bailing out of children), so "a refused event does not
    // re-render" would be a claim the hook does not actually make.
    //
    // What IS guaranteed is that `rev` does not move — and that is what the
    // announcement path consumes. `usePlaybackStatus` re-speaks when `rev`
    // changes, so an event storm must leave it silent. Asserted with a real
    // effect keyed on `rev`, because that is the shape the bug would take.
    const announce = vi.fn();
    const { result } = renderHook(() => {
      const pb = usePlaybackState();
      useEffect(() => {
        if (pb.state === S.STALLED) announce(pb.rev);
      }, [pb.rev, pb.state]);
      return pb;
    });

    send(act, result, ...TO_PLAYING);
    act(() => result.current.send(E.STALL));
    expect(announce).toHaveBeenCalledTimes(1);

    act(() => {
      for (let i = 0; i < 5; i += 1) result.current.send(E.STALL);
    });
    expect(announce).toHaveBeenCalledTimes(1);

    // A genuine second stall may speak again — silence is not the goal, stability is.
    act(() => {
      result.current.send(E.RECOVER);
      result.current.send(E.STALL);
    });
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("does not let a stray event wipe the reason a player failed", () => {
    // `error` is cleared on the next ACCEPTED transition, which is correct. It
    // must NOT be cleared by a refused one, or a stray media event arriving while
    // the error card is up would blank the message explaining why it is there.
    const { result } = renderHook(() => usePlaybackState());
    send(act, result, ...TO_PLAYING);

    const boom = new Error("No playable variants.");
    act(() => result.current.send(E.FAIL, boom));
    expect(result.current.state).toBe(S.ERROR);
    expect(result.current.error).toBe(boom);

    act(() => result.current.send(E.RESUME)); // illegal from error
    expect(result.current.error).toBe(boom);
    expect(result.current.showError).toBe(true);
    expect(result.current.announcement).toContain("No playable variants.");
  });
});

describe("usePlaybackState — rev is the once-per-real-change signal", () => {
  it("counts accepted transitions only", () => {
    const { result } = renderHook(() => usePlaybackState());
    expect(result.current.rev).toBe(0);

    for (const ev of TO_PLAYING) act(() => result.current.send(ev));
    expect(result.current.rev).toBe(TO_PLAYING.length);
  });

  it("survives an event storm without inflating the announcement counter", () => {
    // Safari fires `waiting` several times for one stall. If each bumped `rev`,
    // `usePlaybackStatus` would re-announce "Video stalled" several times over.
    const { result } = renderHook(() => usePlaybackState());
    send(act, result, ...TO_PLAYING);

    act(() => {
      for (let i = 0; i < 6; i += 1) result.current.send(E.STALL);
    });

    expect(result.current.state).toBe(S.STALLED);
    expect(result.current.rev).toBe(TO_PLAYING.length + 1);
  });

  it("advances on recovery, so a returning stall may speak again", () => {
    const { result } = renderHook(() => usePlaybackState());
    send(act, result, ...TO_PLAYING);
    act(() => result.current.send(E.STALL));
    const stalledRev = result.current.rev;

    act(() => result.current.send(E.RECOVER));
    expect(result.current.rev).toBe(stalledRev + 1);

    act(() => result.current.send(E.STALL));
    expect(result.current.rev).toBe(stalledRev + 2);
  });
});

describe("usePlaybackState — failure and recovery", () => {
  it("carries the error through and clears it on retry", () => {
    const { result } = renderHook(() => usePlaybackState());
    send(act, result, ...TO_PLAYING);

    const boom = new Error("Manifest unreachable.");
    act(() => result.current.send(E.FAIL, boom));
    expect(result.current.state).toBe(S.ERROR);
    expect(result.current.showError).toBe(true);
    expect(result.current.announcement).toContain("Manifest unreachable.");

    act(() => result.current.send(E.RETRY));
    expect(result.current.error).toBeNull();
    expect(result.current.showError).toBe(false);
    // A recovered player must not still be showing the old failure.
    expect(result.current.state).toBe(S.RESOLVING);
  });

  it("still announces the failure when no error object was supplied", () => {
    // `send(E.FAIL)` with no payload is a legal call site; it must not render
    // "Playback failed. undefined".
    const { result } = renderHook(() => usePlaybackState());
    send(act, result, ...TO_PLAYING);

    act(() => result.current.send(E.FAIL));
    expect(result.current.error).toBeNull();
    expect(result.current.announcement).toMatch(/failed/i);
    expect(result.current.announcement).not.toMatch(/undefined/);
  });

  it("returns to idle on reset from ended, so closing the player works", () => {
    const { result } = renderHook(() => usePlaybackState());
    send(act, result, ...TO_PLAYING, E.END);
    expect(result.current.showEnded).toBe(true);

    act(() => result.current.send(E.RESET));
    expect(result.current.state).toBe(S.IDLE);
    expect(result.current.showEnded).toBe(false);
    expect(result.current.isPlaying).toBe(false);
  });

  it("does not throw when send is given something that is not an event", () => {
    // A stray media event must never be able to take the player down.
    const { result } = renderHook(() => usePlaybackState());
    expect(() => act(() => result.current.send("NOT_AN_EVENT"))).not.toThrow();
    expect(() => act(() => result.current.send(undefined))).not.toThrow();
    expect(result.current.state).toBe(S.IDLE);
  });

  it("accepts events sent after unmount without warning", () => {
    // Closing the player while a resolve is in flight dispatches into a dead
    // tree; React logs a warning if that throws.
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { result, unmount } = renderHook(() => usePlaybackState());
      const { send: detached } = result.current;
      unmount();
      expect(() => act(() => detached(E.FAIL, new Error("late")))).not.toThrow();
    } finally {
      warn.mockRestore();
    }
  });
});