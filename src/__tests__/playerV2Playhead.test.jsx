import { render, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useEffect } from "react";
import usePlayerControls from "../components/player/v2/hooks/usePlayerControls";
import Scrubber from "../components/player/v2/Scrubber";

/* PLAYER V2 frame-rate playhead (task.md 5.15).
 *
 * The item: "Drive the scrubber with rAF + direct DOM writes." `timeupdate` is
 * the browser's own ~4Hz cadence — honest for a whole-second timecode, a visible
 * stutter for a fill that should slide. The fix is a SEPARATE channel that reads
 * the element each frame and writes the scrubber's four time-varying values
 * straight to the DOM, while the React `currentTime` state stays exactly as it
 * was for the timecode and the subtitle cue.
 *
 * These tests pin the three things that make that safe:
 *   1. the channel exists and reports the ELEMENT's time, not the 4Hz state,
 *   2. a paused element / an unsubscribed consumer is never written to,
 *   3. when the channel is wired, React stops emitting those four values, so a
 *      later 4Hz render cannot overwrite a frame-rate write (they would
 *      otherwise alternate and make the bar stutter).
 */

/** The `<video>` stand-in `playerV2Buffered.test.jsx` established. */
const attach = () => {
  const listeners = {};
  const video = {
    currentTime: 10,
    duration: 200,
    volume: 1,
    muted: false,
    play: vi.fn(),
    pause: vi.fn(),
    addEventListener: (type, fn) => {
      (listeners[type] ||= []).push(fn);
    },
    removeEventListener: (type, fn) => {
      listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
    },
  };
  return { video, fire: (type) => (listeners[type] || []).forEach((fn) => fn()) };
};

/* The hook is called inside a committed component so its effects run; the latest
 * controls object is parked where the test can reach it. No `result.all` here —
 * RTL v16's `renderHook` does not expose it. */
let latest = null;
let seen = [];
const Probe = ({ video, onControls }) => {
  const controls = usePlayerControls({ current: video }, { current: null }, video);
  useEffect(() => {
    if (onControls) onControls(controls);
  }, [controls, onControls]);
  return null;
};

describe("usePlayerControls exposes a frame-rate playhead", () => {
  it("delivers the element's CURRENT time immediately on subscribe", () => {
    const { video } = attach();
    video.currentTime = 42;
    render(<Probe video={video} onControls={(c) => (latest = c)} />);
    const got = [];
    latest.subscribePlayhead((t) => got.push(t));
    // Not the 4Hz state (which is still 0): the whole point is "where is the
    // element NOW".
    expect(got).toEqual([42]);
    expect(latest.getCurrentTime()).toBe(42);
  });

  it("notifies subscribers on `timeupdate` with the element's time", () => {
    const { video, fire } = attach();
    render(<Probe video={video} onControls={(c) => (latest = c)} />);
    seen = [];
    latest.subscribePlayhead((t) => seen.push(t));
    act(() => {
      video.currentTime = 55;
      fire("timeupdate");
    });
    expect(seen).toContain(55);
  });

  it("stops delivering once the returned unsubscribe is called", () => {
    const { video, fire } = attach();
    render(<Probe video={video} onControls={(c) => (latest = c)} />);
    seen = [];
    const unsubscribe = latest.subscribePlayhead((t) => seen.push(t));
    // The immediate delivery happens first (see the first test), then the
    // unsubscribe must silence every later update.
    expect(seen).toEqual([10]);
    seen = [];
    unsubscribe();
    act(() => {
      video.currentTime = 77;
      fire("timeupdate");
    });
    expect(seen).toEqual([]);
  });

  it("runs the frame loop with no subscriber without throwing", () => {
    const { video, fire } = attach();
    expect(() => {
      render(<Probe video={video} />);
      fire("timeupdate");
    }).not.toThrow();
  });
});

describe("Scrubber writes the playhead straight to the DOM", () => {
  const mount = (props) => render(<Scrubber duration={200} onSeek={vi.fn()} {...props} />);
  const track = (container) => container.querySelector(".pv2-scrubber");

  it("hands React's four time-varying values to the channel when wired", () => {
    // `currentTime={100}` would make React paint 50% if it still owned the value.
    // It must emit NONE of them, or a 4Hz render would clobber the frame write.
    const captured = [];
    const subscribePlayhead = (cb) => {
      captured.push(cb);
      return () => {};
    };
    const { container } = mount({ currentTime: 100, subscribePlayhead });
    const el = track(container);
    expect(el.hasAttribute("data-fraction")).toBe(false);
    expect(el.hasAttribute("aria-valuenow")).toBe(false);
    expect(el.hasAttribute("aria-valuetext")).toBe(false);
    expect(el.style.getPropertyValue("--pv2-scrub-fraction")).toBe("");
    // The buffered band is NOT the playhead and stays on React in both modes.
    expect(el.style.getPropertyValue("--pv2-scrub-buffered")).toBe("0");

    act(() => captured.forEach((cb) => cb(50)));
    expect(el.style.getPropertyValue("--pv2-scrub-fraction")).toBe("0.25");
    expect(el.getAttribute("data-fraction")).toBe("0.2500");
    expect(el.getAttribute("aria-valuenow")).toBe("50");
    expect(el.getAttribute("aria-valuetext")).toBe("0:50 of 3:20");
  });

  it("leaves the React path whole when no channel is supplied", () => {
    const { container } = mount({ currentTime: 50 });
    const el = track(container);
    expect(el.getAttribute("data-fraction")).toBe("0.2500");
    expect(el.getAttribute("aria-valuenow")).toBe("50");
    expect(el.getAttribute("aria-valuetext")).toBe("0:50 of 3:20");
    expect(el.style.getPropertyValue("--pv2-scrub-fraction")).toBe("0.25");
  });
});
