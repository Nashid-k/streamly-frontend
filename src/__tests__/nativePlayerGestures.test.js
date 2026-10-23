import { describe, expect, it } from "vitest";
import {
  DOUBLE_TAP_WINDOW_MS,
  HOLD_2X_DELAY_MS,
  SINGLE_TAP_DELAY_MS,
  resolveTap,
} from "../components/player/nativePlayerGestures";

/* Tap arbitration for the player surface. These pin the shipped decision table
   that used to be inline in the touch handler, plus the timing relationships
   the comments claim but nothing enforced: the lone-tap toggle must outlast the
   double-tap window, and a 2x hold must not arm inside it. */

const FIRST = { time: 1000, zone: "left" };

describe("resolveTap", () => {
  it("toggles immediately on a center tap and resets the tap memory", () => {
    expect(resolveTap({ zone: "center", now: 500 })).toEqual({
      action: "toggle",
      tap: { time: 0, zone: "center" },
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

  it("kills edge taps during a rebuffer but keeps the center tap alive", () => {
    expect(resolveTap({ zone: "left", buffering: true, now: 2000, prevTap: FIRST })).toEqual({
      action: "ignore",
      tap: FIRST,
    });
    expect(resolveTap({ zone: "right", buffering: true, now: 2000 })).toEqual({
      action: "ignore",
      tap: null,
    });
    expect(resolveTap({ zone: "center", buffering: true, now: 2000 })).toMatchObject({
      action: "toggle",
    });
  });
});

describe("gesture timings", () => {
  it("waits longer for a lone tap than the double-tap window", () => {
    expect(SINGLE_TAP_DELAY_MS).toBeGreaterThan(DOUBLE_TAP_WINDOW_MS);
  });

  it("does not arm the 2x hold inside the double-tap window", () => {
    expect(HOLD_2X_DELAY_MS).toBeGreaterThanOrEqual(DOUBLE_TAP_WINDOW_MS);
  });
});
