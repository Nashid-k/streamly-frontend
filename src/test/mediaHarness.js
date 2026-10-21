import { act } from "@testing-library/react";

/* ── Player test harness: the media element ──────────────────────────────
   jsdom's <video> is inert — `paused` is always true, `play()` does nothing,
   `duration` is NaN, and `getBoundingClientRect()` is all zeros. Every player
   test therefore has to replace those surfaces by hand.

   They all replaced the SAME surfaces, and they drifted: some omitted the
   `seeking` reset on `currentTime`, some forgot the `canplay` dispatch that
   clears the player's buffering gate (leaving edge gestures dead for reasons
   unrelated to the test), and the double-tap tests needed a non-zero rect that
   only one file remembered to pin. This is the single implementation.

   Nothing here mocks the player's own code: it replaces browser surfaces jsdom
   does not implement, so component behaviour stays under test. */

/**
 * Strip the inert jsdom media element down to the surfaces the player reads:
 * a live clock, a rate, a seeking flag, and a real rect for zone geometry.
 *
 * @param {HTMLElement} container  Mounted tree to find the <video> in.
 * @param {object} [options]
 * @param {number} [options.width]   Pin getBoundingClientRect width (touch
 *        geometry is all zeros in jsdom otherwise, so `zoneOf` divides by zero
 *        and every gesture is silently ignored).
 * @param {number} [options.height]
 * @param {number} [options.currentTime] Starting playhead (default 120).
 * @param {number} [options.duration]    Reported duration (default 3600).
 * @param {boolean} [options.paused]     Initial paused state (default false).
 * @param {boolean} [options.canplay]    Dispatch `canplay` to clear the
 *        player's buffering gate. Default true — while buffering, EDGE zones
 *        are deliberately dead, so a test that forgets this fails for reasons
 *        that have nothing to do with what it asserts.
 * @returns {HTMLVideoElement}
 */
export function stubMediaElement(container, options = {}) {
  const {
    width,
    height,
    currentTime: startTime = 120,
    duration: reportedDuration = 3600,
    paused: startPaused = false,
    canplay = true,
  } = options;

  const v = container.querySelector("video");
  if (!v) throw new Error("stubMediaElement: no <video> in the mounted tree");

  if (width != null) {
    v.getBoundingClientRect = () => ({
      left: 0,
      top: 0,
      width,
      height: height ?? 600,
      right: width,
      bottom: height ?? 600,
      x: 0,
      y: 0,
      toJSON: () => {},
    });
  }

  let paused = startPaused;
  Object.defineProperty(v, "paused", {
    get: () => paused,
    set: (next) => {
      paused = next;
    },
    configurable: true,
  });

  let rate = 1;
  Object.defineProperty(v, "playbackRate", {
    get: () => rate,
    set: (next) => {
      rate = next;
    },
    configurable: true,
  });

  let seeking = false;
  Object.defineProperty(v, "seeking", {
    get: () => seeking,
    set: (next) => {
      seeking = next;
    },
    configurable: true,
  });

  let current = startTime;
  Object.defineProperty(v, "currentTime", {
    get: () => current,
    set: (next) => {
      current = next;
      // Staying "seeking" would make the next seek queue instead of applying —
      // the player coalesces deltas while a seek is in flight.
      seeking = false;
    },
    configurable: true,
  });

  Object.defineProperty(v, "duration", {
    get: () => reportedDuration,
    set: () => {},
    configurable: true,
  });

  v.play = vi.fn().mockResolvedValue(undefined);
  v.pause = vi.fn().mockImplementation(() => {
    paused = true;
  });

  if (canplay) {
    act(() => {
      v.dispatchEvent(new Event("canplay"));
    });
  }

  return v;
}

/* Touch geometry helpers — jsdom has no Touch/TouchList, and the player reads
   `changedTouches[0]` / `touches[0]`, so a plain array of one object is the
   faithful shape. */
export const touches = (x, y) => [{ identifier: 1, clientX: x, clientY: y }];
