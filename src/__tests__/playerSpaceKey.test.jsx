// Space on the player is BOTH a tap and a hold, so the key handler has to defer
// its decision: a tap is play/pause, a hold is 2x. These tests pin that
// arbitration, because the failure mode is not a crash — it is a viewer who
// pauses the video while trying to skim it, which is the kind of bug nobody
// reports and everybody notices.
import { describe, expect, it, beforeAll, vi, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import NativePlayerView from "../components/NativePlayerView";

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

afterEach(() => {
  vi.useRealTimers();
});

const mount = () =>
  render(<NativePlayerView type="movie" id="550" title="Fight Club" onClose={() => {}} />);

/* The player takes its honest fatal path in jsdom (no MediaSource), so the
   <video> is not in the tree. Mount first, then stub the element the handlers
   actually reach for — the order is inverted from what reads naturally here. */

/* jsdom's media element is inert: play() rejects unless stubbed, and the
   player's own autoplay path leaves `paused` true, which engageHold2x refuses
   (there is no playback to speed up). So the media element is stubbed after
   mount, and the assertions read `playbackRate` / `pause()` directly — those are
   the two things the feature actually sets. */
const stubPlaying = (container) => {
  const v = container.querySelector("video");
  Object.defineProperty(v, "paused", { value: false, configurable: true });
  // jsdom does not retain playbackRate, so `v.playbackRate = 2` reads back as 1
  // and the hold/restore assertions would pass or fail for no reason at all.
  // A real backing field is required for these tests to mean anything.
  let rate = 1;
  Object.defineProperty(v, "playbackRate", {
    get: () => rate,
    set: (next) => {
      rate = next;
    },
    configurable: true,
  });
  v.play = vi.fn().mockResolvedValue(undefined);
  v.pause = vi.fn();
  return v;
};

describe("Space: tap plays/pauses, hold runs 2x", () => {
  it("does not toggle on keydown — the tap resolves on keyup", () => {
    const { container } = mount();
    const v = stubPlaying(container);
    const before = v.paused;
    fireEvent.keyDown(window, { code: "Space", key: " " });
    // Toggling on keydown is what used to happen, and it is wrong: a viewer
    // holding Space to skim at 2x would have the video paused under them.
    expect(v.pause).not.toHaveBeenCalled();
    expect(v.paused).toBe(before);
  });

  it("toggles play/pause once on a quick tap", () => {
    const { container } = mount();
    const v = stubPlaying(container);
    fireEvent.keyDown(window, { code: "Space", key: " " });
    fireEvent.keyUp(window, { code: "Space", key: " " });
    expect(v.pause).toHaveBeenCalledTimes(1);
  });

  it("holds to 2x and restores the rate on release", () => {
    vi.useFakeTimers();
    const { container } = mount();
    const v = stubPlaying(container);
    fireEvent.keyDown(window, { code: "Space", key: " " });
    act(() => {
      vi.advanceTimersByTime(500); // past the hold threshold
    });
    expect(v.playbackRate).toBe(2);
    fireEvent.keyUp(window, { code: "Space", key: " " });
    expect(v.playbackRate).toBe(1);
  });

  it("does NOT also toggle play when the hold engaged", () => {
    // The exact bug: engaging 2x and then toggling on release would pause the
    // video the instant the viewer let go.
    vi.useFakeTimers();
    const { container } = mount();
    const v = stubPlaying(container);
    fireEvent.keyDown(window, { code: "Space", key: " " });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    fireEvent.keyUp(window, { code: "Space", key: " " });
    expect(v.pause).not.toHaveBeenCalled();
  });

  it("restores the rate the viewer was already at, not a hardcoded 1", () => {
    vi.useFakeTimers();
    const { container } = mount();
    const v = stubPlaying(container);
    // 1.25x is a row in the Settings speed panel, so this is a state a viewer can
    // genuinely be in. Releasing the hold must put them back on it, not on 1x.
    v.playbackRate = 1.25;
    fireEvent.keyDown(window, { code: "Space", key: " " });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(v.playbackRate).toBe(2);
    fireEvent.keyUp(window, { code: "Space", key: " " });
    expect(v.playbackRate).toBe(1.25);
  });

  it("ignores the auto-repeat stream a held key produces", () => {
    vi.useFakeTimers();
    const { container } = mount();
    const v = stubPlaying(container);
    fireEvent.keyDown(window, { code: "Space", key: " " });
    // The OS keeps sending keydown while a key is held. Without this guard each
    // repeat would restart the hold timer, so 2x would NEVER engage.
    fireEvent.keyDown(window, { code: "Space", key: " ", repeat: true });
    fireEvent.keyDown(window, { code: "Space", key: " ", repeat: true });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(v.playbackRate).toBe(2);
  });

  it("treats a second press after release as a fresh gesture", () => {
    vi.useFakeTimers();
    const { container } = mount();
    const v = stubPlaying(container);
    fireEvent.keyDown(window, { code: "Space", key: " " });
    fireEvent.keyUp(window, { code: "Space", key: " " });
    expect(v.pause).toHaveBeenCalledTimes(1);
    // If the held flag were never cleared, this hold would be ignored entirely.
    fireEvent.keyDown(window, { code: "Space", key: " " });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(v.playbackRate).toBe(2);
  });

  it("leaves KeyK as an instant toggle with no hold meaning", () => {
    const { container } = mount();
    const v = stubPlaying(container);
    fireEvent.keyDown(window, { code: "KeyK", key: "k" });
    expect(v.pause).toHaveBeenCalledTimes(1);
  });

  it("does nothing on Space keyup when no Space keydown was seen", () => {
    const { container } = mount();
    const v = stubPlaying(container);
    // A stray keyup (focus arriving mid-hold, an OS-synthesised event) must not
    // fire a play/pause nobody asked for.
    fireEvent.keyUp(window, { code: "Space", key: " " });
    expect(v.pause).not.toHaveBeenCalled();
  });
});
