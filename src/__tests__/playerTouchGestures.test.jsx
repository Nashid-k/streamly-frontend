// The touch surface of the player: a right-third press-and-hold is 2x, and a
// double tap on either edge is a ±10s seek. Both share one handler, and both
// were broken in ways that only show up on a real phone:
//
//  1. `hold2xRef` was declared and never assigned, so every "is a hold live?"
//     branch read false. Releasing a hold left the element at 2x, and no tap, no
//     pause and no seek could bring it back — the picture played fast until the
//     media was rebuilt.
//  2. The arm delay (420ms) is longer than a double tap (~100ms), so BOTH taps of
//     a double tap landed in the right-third hold branch, which swallows the
//     gesture as "not a tap": double-tap forward never seeked at all.
//
// jsdom's media element is inert and its clock is real, so the element is stubbed
// after mount and the whole run is pinned to a fixed fake "now" — that keeps
// `performance.now()` (the double-tap window uses it) in step with the fake
// timers, and gives the player's own mount-time progress a frozen baseline.
import { describe, expect, it, beforeAll, beforeEach, afterEach, afterAll, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { stubMediaElement, touches as touch } from "../test/mediaHarness";

/* Mounting this 2,700-line player costs a few hundred ms on its own, and under
   the parallel full-suite load the cold import can push a single test past
   vitest's 5s default. The assertions themselves are instant; the budget is for
   the component, so it is raised here rather than tightening the tests. */
const MOUNT_BUDGET_MS = 30_000;

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

let now = 1_800_000_000_000;
beforeEach(() => {
  now = 1_800_000_000_000;
  vi.useFakeTimers({ now });
  /* IS_TOUCH and the media queries behind it are read once at module load, so the
     environment has to look like a phone BEFORE the player module is imported. */
  vi.stubGlobal("matchMedia", (query) => ({
    matches: /hover: none|pointer: coarse/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

afterAll(() => {
  // Later suites in this worker must load the real media-query implementation.
  vi.resetModules();
});

const mount = async () => {
  const mod = await import("../components/NativePlayerView");
  return render(
    <mod.default type="movie" id="550" title="Fight Club" onClose={() => {}} />,
  );
};

/* Touch geometry in jsdom is a lie by default: getBoundingClientRect() is all
   zeros, so `zoneOf` would divide by a zero width and every gesture would be
   ignored. Pin a real 300px-wide surface, and let the shared harness supply the
   rest (a live clock/rate/seeking flag plus the `canplay` that clears the
   buffering gate — while buffering, EDGE zones are deliberately dead, so
   without it every edge gesture is ignored for reasons unrelated to the test). */
const stubSurface = (container) => stubMediaElement(container, { width: 300, height: 600 });
const RIGHT = 280; // right third of 300
const LEFT = 20; // left third
const CENTER = 150;

const press = (v, x, y = 300) =>
  fireEvent.touchStart(v, { touches: touch(x, y), changedTouches: touch(x, y) });
const release = (v, x, y = 300) =>
  fireEvent.touchEnd(v, { touches: [], changedTouches: touch(x, y) });

/* Both gesture clocks advance together: real time for the arm timer (fake
   timers) and the `performance.now()` reading the double-tap window compares. */
const advance = (ms) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe("touch hold-to-2x", { timeout: MOUNT_BUDGET_MS }, () => {
  it("runs 2x after the arm delay and restores the rate on release", async () => {
    const { container } = await mount();
    const v = stubSurface(container);

    press(v, RIGHT);
    advance(500);
    expect(v.playbackRate).toBe(2);

    release(v, RIGHT);
    // The regression: this stayed at 2 forever because hold2xRef was never set.
    expect(v.playbackRate).toBe(1);
  });

  it("does not toggle play/pause when the hold is released", async () => {
    const { container } = await mount();
    const v = stubSurface(container);

    press(v, RIGHT);
    advance(500);
    release(v, RIGHT);
    advance(1000);
    expect(v.pause).not.toHaveBeenCalled();
  });

  it("restores the pre-hold speed the viewer chose in Settings", async () => {
    const { container } = await mount();
    const v = stubSurface(container);
    /* 1.5x is a real row in the Settings speed panel, and the element already
       carries it before the hold begins — which is the order a viewer produces:
       they picked the speed, then hold to skim. Releasing must give the 1.5x
       back, never the transient 2x and never a hardcoded 1x. */
    v.playbackRate = 1.5;

    press(v, RIGHT);
    advance(500);
    expect(v.playbackRate).toBe(2);

    release(v, RIGHT);
    expect(v.playbackRate).toBe(1.5);
  });

  it("restores the rate when the release gesture is lost", async () => {
    // An OS gesture or a backgrounded tab can swallow the touchend entirely.
    const { container } = await mount();
    const v = stubSurface(container);

    press(v, RIGHT);
    advance(500);
    expect(v.playbackRate).toBe(2);

    v.paused = true;
    advance(600); // one safety-net tick
    expect(v.playbackRate).toBe(1);
  });

  it("a pending arm is cancelled when the same touch becomes a volume drag", async () => {
    const { container } = await mount();
    const v = stubSurface(container);

    press(v, RIGHT);
    // A vertical drag on that side is a volume gesture, not a hold: the pending
    // arm must be dropped or the drag would end up playing at 2x.
    fireEvent.touchMove(v, { touches: touch(RIGHT, 260) });
    fireEvent.touchMove(v, { touches: touch(RIGHT, 200) });
    advance(500);
    expect(v.playbackRate).toBe(1);
  });
});

describe("touch double-tap seek", { timeout: MOUNT_BUDGET_MS }, () => {
  it("seeks forward on a double tap in the right third", async () => {
    const { container } = await mount();
    const v = stubSurface(container);
    const from = v.currentTime;

    press(v, RIGHT);
    release(v, RIGHT);
    advance(120); // a real double tap: two ~100ms taps
    press(v, RIGHT);
    release(v, RIGHT);

    // Both taps used to be eaten by the hold branch, so nothing ever seeked.
    expect(v.currentTime).toBe(from + 10);
  });

  it("seeks back on a double tap in the left third", async () => {
    const { container } = await mount();
    const v = stubSurface(container);
    const from = v.currentTime;

    press(v, LEFT);
    release(v, LEFT);
    advance(120);
    press(v, LEFT);
    release(v, LEFT);

    expect(v.currentTime).toBe(from - 10);
  });

  it("does not also play/pause when the double tap resolved as a seek", async () => {
    const { container } = await mount();
    const v = stubSurface(container);

    press(v, RIGHT);
    release(v, RIGHT);
    advance(120);
    press(v, RIGHT);
    release(v, RIGHT);
    advance(1000);
    expect(v.pause).not.toHaveBeenCalled();
  });

  it("still toggles play/pause on a lone edge tap", async () => {
    const { container } = await mount();
    const v = stubSurface(container);

    press(v, RIGHT);
    release(v, RIGHT);
    advance(500);
    expect(v.pause).toHaveBeenCalledTimes(1);
  });

  it("toggles immediately on a centre tap, with no double-tap delay", async () => {
    const { container } = await mount();
    const v = stubSurface(container);

    press(v, CENTER);
    release(v, CENTER);
    expect(v.pause).toHaveBeenCalledTimes(1);
  });
});
