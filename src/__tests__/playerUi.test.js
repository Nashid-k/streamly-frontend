import { describe, it, expect } from "vitest";
import {
  PLAYER_SPEEDS,
  ASPECT_RATIOS,
  ASPECT_VIDEO_STYLE,
  aspectVideoStyle,
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