import { describe, it, expect } from "vitest";
import {
  PLAYER_SPEEDS,
  ASPECT_RATIOS,
  ASPECT_VIDEO_STYLE,
  aspectVideoStyle,
  previewMetrics,
  HOLD_SPEED,
  STILL_WATCHING_EPISODES,
  STILL_WATCHING_IDLE_MS,
} from "../constants/playerUi";

describe("playerUi", () => {
  it("exposes the canonical playback speed ladder", () => {
    expect(PLAYER_SPEEDS).toEqual([0.5, 0.75, 1, 1.25, 1.5, 2]);
  });

  it("lists speeds in strictly ascending order", () => {
    for (let i = 1; i < PLAYER_SPEEDS.length; i++) {
      expect(PLAYER_SPEEDS[i]).toBeGreaterThan(PLAYER_SPEEDS[i - 1]);
    }
  });

  it("always includes the natural 1x rate", () => {
    expect(PLAYER_SPEEDS).toContain(1);
  });
});

describe("aspectVideoStyle", () => {
  it("gives every catalog mode a render recipe — no dead entries", () => {
    for (const { id } of ASPECT_RATIOS) {
      expect(ASPECT_VIDEO_STYLE[id]).toBeDefined();
    }
  });

  it("Fit renders the original frame with no punch-in", () => {
    expect(aspectVideoStyle(0)).toEqual({ objectFit: "contain" });
  });

  it("Fill covers the box edge-to-edge (visible when ratios differ)", () => {
    expect(aspectVideoStyle(1)).toEqual({ objectFit: "cover" });
  });

  it("Zoom/Cinema/16:10 punch in — object-fit alone is a no-op when box and stream ratios match", () => {
    expect(aspectVideoStyle(2)).toEqual({ objectFit: "contain", transform: "scale(1.25)" });
    expect(aspectVideoStyle(3)).toEqual({ objectFit: "contain", transform: "scale(1.344)" });
    expect(aspectVideoStyle(4)).toEqual({ objectFit: "contain", transform: "scale(1.111)" });
  });

  it("Stretch distorts the frame onto the box", () => {
    expect(aspectVideoStyle(5)).toEqual({ objectFit: "fill" });
  });

  it("falls back to Fit for out-of-range or corrupt indices", () => {
    expect(aspectVideoStyle(99)).toEqual({ objectFit: "contain" });
    expect(aspectVideoStyle(-1)).toEqual({ objectFit: "contain" });
    expect(aspectVideoStyle(undefined)).toEqual({ objectFit: "contain" });
  });
});

describe("previewMetrics", () => {
  it("derives a 16:9 thumb from the measured frame", () => {
    const m = previewMetrics(1280, 720);
    expect(m.thumbH).toBe(Math.round((m.thumbW * 9) / 16));
    expect(m.thumbInset).toBeGreaterThan(m.thumbW / 2); // edge clamp beats half-width
  });

  it("stays within its clamps for a phone frame and a huge frame", () => {
    const phone = previewMetrics(390, 844);
    const huge = previewMetrics(3840, 2160);
    expect(phone.thumbW).toBeGreaterThanOrEqual(128);
    expect(huge.thumbW).toBeLessThanOrEqual(288);
    expect(huge.thumbW).toBeGreaterThan(phone.thumbW);
  });
});

describe("netflix behavior constants", () => {
  it("hold-to-2x is Netflix's rate", () => {
    expect(HOLD_SPEED).toBe(2);
  });

  it("still-watching asks after 3 auto-advanced episodes or 2 idle hours", () => {
    expect(STILL_WATCHING_EPISODES).toBe(3);
    expect(STILL_WATCHING_IDLE_MS).toBe(2 * 60 * 60 * 1000);
  });
});