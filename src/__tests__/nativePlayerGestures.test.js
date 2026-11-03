import { describe, expect, it } from "vitest";
import {
  DOUBLE_TAP_WINDOW_MS,
  HOLD_2X_DELAY_MS,
  resolveTap,
} from "../components/player/nativePlayerGestures";

/* Tap arbitration for the player surface. These pin the MOBILE decision table:
   only a double tap acts — centre pauses/resumes, the sides seek — and a lone
   tap is inert (it must never toggle playback). A 2x hold must not arm inside
   the double-tap window, or every deliberate double tap would briefly speed the
   video up. */

const FIRST = { time: 1000, zone: "left" };
const FIRST_CENTER = { time: 1000, zone: "center" };

describe("resolveTap", () => {
  it("does NOT toggle on the first centre tap — it only records it", () => {
    expect(resolveTap({ zone: "center", now: 1000 })).toEqual({
      action: "defer",
      tap: { time: 1000, zone: "center" },
    });
  });

  it("toggles pause/resume on a centre DOUBLE tap", () => {
    const now = FIRST_CENTER.time + 120;
    expect(resolveTap({ zone: "center", now, prevTap: FIRST_CENTER })).toEqual({
      action: "toggle",
      tap: { time: 0, zone: null },
    });
  });

  it("defers a first edge tap so a second one can make it a double tap", () => {
    expect(resolveTap({ zone: "left", now: 1000 })).toEqual({
      action: "defer",
      tap: { time: 1000, zone: "left" },
    });
  });

  it("seeks backward/forward on a second tap in the same edge zone", () => {
    const now = FIRST.time + DOUBLE_TAP_WINDOW_MS - 1;
    expect(resolveTap({ zone: "left", now, prevTap: FIRST })).toEqual({
      action: "seek",
      direction: -1,
      tap: { time: 0, zone: null },
    });
    expect(resolveTap({ zone: "right", now, prevTap: { time: 1000, zone: "right" } })).toMatchObject({
      action: "seek",
      direction: 1,
    });
  });

  it("treats a tap outside the window as a fresh single tap", () => {
    const now = FIRST.time + DOUBLE_TAP_WINDOW_MS;
    expect(resolveTap({ zone: "left", now, prevTap: FIRST })).toEqual({
      action: "defer",
      tap: { time: now, zone: "left" },
    });
  });

  it("requires the same zone for a double tap", () => {
    const now = FIRST.time + 100;
    expect(resolveTap({ zone: "right", now, prevTap: FIRST })).toEqual({
      action: "defer",
      tap: { time: now, zone: "right" },
    });
  });

  it("kills edge taps during a rebuffer but keeps the centre double tap alive", () => {
    expect(resolveTap({ zone: "left", buffering: true, now: 2000, prevTap: FIRST })).toEqual({
      action: "ignore",
      tap: FIRST,
    });
    expect(resolveTap({ zone: "right", buffering: true, now: 2000 })).toEqual({
      action: "ignore",
      tap: null,
    });
    // Pausing must still work while the stream rebuffers.
    expect(
      resolveTap({ zone: "center", buffering: true, now: 1120, prevTap: FIRST_CENTER }),
    ).toMatchObject({ action: "toggle" });
  });
});

describe("gesture timings", () => {
  it("does not arm the 2x hold inside the double-tap window", () => {
    expect(HOLD_2X_DELAY_MS).toBeGreaterThanOrEqual(DOUBLE_TAP_WINDOW_MS);
  });
});
