import { describe, it, expect } from "vitest";
import {
  PLAYER_ZONES,
  PLAYER_CONTROLS,
  PLAYER_CONTROL_ORDER,
  PLAYER_UI_PRESETS,
  resolveUILayout,
  zoneOf,
  controlsInZone,
  presetById,
} from "../components/playerUIDef";

describe("playerUIDef zones", () => {
  it("offers six zones including bottom center and hidden", () => {
    expect(PLAYER_ZONES.map((z) => z.id)).toEqual([
      "topLeft",
      "topRight",
      "bottomLeft",
      "bottomCenter",
      "bottomRight",
      "tray",
    ]);
  });

  it("covers every control in the canonical order", () => {
    expect(PLAYER_CONTROL_ORDER).toHaveLength(PLAYER_CONTROLS.length);
    for (const { key } of PLAYER_CONTROLS) {
      expect(PLAYER_CONTROL_ORDER).toContain(key);
    }
  });
});

describe("playerUIDef presets", () => {
  it("ships exactly five presets with full visibility + layout maps", () => {
    expect(PLAYER_UI_PRESETS.map((p) => p.id)).toEqual([
      "classic",
      "minimal",
      "compact",
      "theater",
      "studio",
    ]);
    const zoneIds = new Set(PLAYER_ZONES.map((z) => z.id));
    for (const preset of PLAYER_UI_PRESETS) {
      for (const { key } of PLAYER_CONTROLS) {
        expect(typeof preset.visibility[key]).toBe("boolean");
        expect(zoneIds.has(preset.layout[key])).toBe(true);
      }
    }
  });

  it("resolves presets by id and falls back to null", () => {
    expect(presetById("theater").name).toBe("Theater");
    expect(presetById("custom")).toBeNull();
    expect(presetById("nope")).toBeNull();
  });
});

describe("playerUIDef layout resolution", () => {
  it("merges stored layouts over defaults and rejects unknown zones", () => {
    const resolved = resolveUILayout({ playPause: "topRight", volume: "moon" });
    expect(resolved.playPause).toBe("topRight");
    expect(resolved.volume).toBe("bottomLeft");
    expect(resolved.fullscreen).toBe("bottomRight");
  });

  it("falls back to defaults for missing or corrupt storage", () => {
    expect(resolveUILayout(undefined).playPause).toBe("bottomLeft");
    expect(resolveUILayout("corrupt").volume).toBe("bottomLeft");
    expect(resolveUILayout(null).screenLock).toBe("topLeft");
  });

  it("places controls per zone honoring visibility toggles", () => {
    const layout = resolveUILayout({ playPause: "bottomCenter" });
    expect(zoneOf(layout, "playPause")).toBe("bottomCenter");
    expect(controlsInZone(layout, {}, "bottomCenter")).toEqual(["playPause"]);
    // Hidden controls never render, even when placed.
    expect(controlsInZone(layout, { playPause: false }, "bottomCenter")).toEqual([]);
    // Tray controls never render.
    const trayLayout = resolveUILayout({ playPause: "tray" });
    expect(controlsInZone(trayLayout, {}, "tray")).toEqual([]);
  });
});
