import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { HOLD_SPEED } from "../constants/playerUi";
import {
  holdRestoreRate,
  resolveSpaceRelease,
  resolveTouchRelease,
} from "../components/player/nativePlayerHold";
import { DOUBLE_TAP_WINDOW_MS } from "../components/player/nativePlayerGestures";

/* Characterisation of the hold/ release branches that used to live inline in
   NativePlayerView. Each case maps to a bug that shipped: a pending right-zone
   arm eating every tap, a release restoring the wrong rate (or no rate at all
   after a background pause), and a Space keyup that could not tell a tap from a
   hold. The component owns the refs; these functions own the decision. */

describe("holdRestoreRate", () => {
  it("restores the rate the viewer was already watching at", () => {
    expect(holdRestoreRate({ elementRate: 1.5, settingRate: 1.25 })).toBe(1.5);
    expect(holdRestoreRate({ elementRate: 0.75, settingRate: 1 })).toBe(0.75);
  });

  it("falls back to the setting when the element reports nothing usable", () => {
    // A browser that paused the element in the background reports 0/1 while the
    // picture is still the faster/slower one the viewer picked.
    expect(holdRestoreRate({ elementRate: 0, settingRate: 1.25 })).toBe(1.25);
    expect(holdRestoreRate({ elementRate: Number.NaN, settingRate: 1.25 })).toBe(1.25);
    expect(holdRestoreRate({ elementRate: undefined, settingRate: 1.25 })).toBe(1.25);
  });

  it("never latches the hold speed itself as the rate to restore", () => {
    expect(HOLD_SPEED).toBeGreaterThan(1);
    expect(holdRestoreRate({ elementRate: HOLD_SPEED, settingRate: 1.25 })).toBe(1.25);
    // Except when the viewer's own setting is 2x: that is a real choice, not a
    // stale hold, so the fallback must honour it.
    expect(holdRestoreRate({ elementRate: HOLD_SPEED, settingRate: HOLD_SPEED })).toBe(HOLD_SPEED);
  });

  it("never returns a non-positive rate, which the element would reject", () => {
    for (const settingRate of [0, -2, Number.NaN, undefined, null]) {
      const rate = holdRestoreRate({ elementRate: 0, settingRate });
      expect(rate).toBeGreaterThan(0);
      expect(Number.isFinite(rate)).toBe(true);
    }
    expect(holdRestoreRate()).toBe(1);
  });
});

describe("resolveSpaceRelease", () => {
  it("ignores a keyup the player did not own", () => {
    expect(resolveSpaceRelease({ held: false, engaged: false })).toBe("ignore");
    expect(resolveSpaceRelease({ held: false, engaged: true })).toBe("ignore");
    expect(resolveSpaceRelease()).toBe("ignore");
  });

  it("restores the rate when the hold actually reached 2x", () => {
    expect(resolveSpaceRelease({ held: true, engaged: true })).toBe("release-hold");
  });

  it("toggles play when Space came up before the hold timer fired", () => {
    // The keydown only ARMS 2x; a tap must reach play/pause on the keyup.
    expect(resolveSpaceRelease({ held: true, engaged: false })).toBe("toggle");
  });
});

describe("resolveTouchRelease", () => {
  const tapAt = (zone) => ({ time: 1000, zone });

  it("ends a live hold and never counts it as a tap", () => {
    for (const zone of ["left", "center", "right", null]) {
      const release = resolveTouchRelease({ holdLive: true, zone, now: 2000 });
      expect(release).toMatchObject({ action: "end-hold", tap: null, dropArm: false });
    }
  });

  it("keeps a right-zone tap alive while its hold arm is still pending", () => {
    // The bug this replaced: the arm is set for the whole of a normal tap, so
    // treating "armed" as "holding" swallowed every right-third tap.
    const release = resolveTouchRelease({ holdLive: false, zone: "right", now: 1000 });
    expect(release.action).toBe("defer");
    expect(release.dropArm).toBe(true);
    expect(release.tap).toEqual({ time: 1000, zone: "right" });
  });

  it("lets a double tap in the right zone seek forward even with a pending arm", () => {
    const release = resolveTouchRelease({
      holdLive: false,
      zone: "right",
      now: 1000 + DOUBLE_TAP_WINDOW_MS - 1,
      prevTap: tapAt("right"),
    });
    expect(release).toMatchObject({ action: "seek", direction: 1, clearPendingTap: true });
    expect(release.tap).toEqual({ time: 0, zone: null });
  });

  it("treats a volume drag as not-a-tap and clears the gesture", () => {
    const release = resolveTouchRelease({ gestureActive: true, zone: "right", now: 1000 });
    expect(release).toMatchObject({
      action: "ignore",
      dropArm: true,
      clearGesture: true,
      clearPendingTap: false,
      tap: null,
    });
  });

  it("returns nothing actionable when the surface has no measurable width or touch", () => {
    const release = resolveTouchRelease({ zone: null, now: 1000 });
    expect(release).toMatchObject({ action: "ignore", tap: null, dropArm: true });
  });

  it("kills edge taps during a rebuffer but keeps its tap memory frozen", () => {
    const prevTap = tapAt("left");
    const release = resolveTouchRelease({ zone: "left", buffering: true, now: 2000, prevTap });
    expect(release.action).toBe("ignore");
    expect(release.clearPendingTap).toBe(false);
    expect(release.tap).toBe(prevTap);
  });

  it("still toggles on a center tap during a rebuffer", () => {
    expect(resolveTouchRelease({ zone: "center", buffering: true, now: 2000 })).toMatchObject({
      action: "toggle",
      direction: 0,
    });
  });

  it("clears a pending lone-tap toggle whenever it resolves the tap", () => {
    for (const release of [
      resolveTouchRelease({ zone: "center" }),
      resolveTouchRelease({ zone: "right" }),
      resolveTouchRelease({ zone: "right", now: 1000 + DOUBLE_TAP_WINDOW_MS - 1, prevTap: tapAt("right") }),
    ]) {
      expect(release.action).not.toBe("ignore");
      expect(release.clearPendingTap).toBe(true);
    }
  });

  it("only ever reports a direction for a seek", () => {
    const releases = [
      resolveTouchRelease({ holdLive: true, zone: "left" }),
      resolveTouchRelease({ gestureActive: true, zone: "left" }),
      resolveTouchRelease({ zone: null }),
      resolveTouchRelease({ zone: "center" }),
      resolveTouchRelease({ zone: "left" }),
    ];
    for (const release of releases) expect(release.direction).toBe(0);
    expect(resolveTouchRelease({ zone: "left", now: 1000 + DOUBLE_TAP_WINDOW_MS - 1, prevTap: tapAt("left") }).direction).toBe(-1);
  });
});

describe("the player routes through these decisions", () => {
  const source = readFileSync(
    join(process.cwd(), "src", "components", "NativePlayerView.jsx"),
    "utf8",
  );

  it("imports and calls the release arbitration", () => {
    expect(source).toMatch(/from "\.\/player\/nativePlayerHold"/);
    for (const name of ["holdRestoreRate", "resolveSpaceRelease", "resolveTouchRelease"]) {
      expect(source).toMatch(new RegExp(`\\b${name}\\(`));
    }
  });

  it("does not re-derive the branches inline", () => {
    // Both of these were the inline form of a decision the suite now pins.
    expect(source).not.toMatch(/video\.playbackRate !== HOLD_SPEED\s*\?/);
    expect(source).not.toMatch(/tap\.action === "seek"/);
  });
});
