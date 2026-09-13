import { describe, it, expect } from "vitest";
import {
  PLAYER_ZONES,
  PLAYER_CONTROLS,
  PLAYER_CONTROL_ORDER,
  PLAYER_UI_PRESETS,
  PLAYER_UI_SKINS,
  DEFAULT_SKIN_ID,
  resolveUILayout,
  resolveSkin,
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

  it("binds every preset to a distinct, existing skin", () => {
    const skinIds = PLAYER_UI_PRESETS.map((p) => p.skinId);
    expect(new Set(skinIds).size).toBe(PLAYER_UI_PRESETS.length);
    for (const id of skinIds) {
      expect(PLAYER_UI_SKINS[id]).toBeDefined();
    }
  });
});

describe("playerUIDef skins", () => {
  it("defines a complete token set for every skin", () => {
    const required = [
      "barBg", "barBlur", "barBorder", "barRadius",
      "btnBg", "btnGhostBg", "btnBorder", "btnRadius",
      "progressHeight", "progressFill", "progressGlow",
      "timeFont", "accent",
      "panelBg", "panelBlur", "panelBorder",
      "scrim", "chromeShadow",
    ];
    for (const [id, skin] of Object.entries(PLAYER_UI_SKINS)) {
      for (const token of required) {
        expect(skin[token], `${id}.${token}`).toBeDefined();
      }
    }
  });

  it("gives each of the five looks a genuinely different visual identity", () => {
    const { classic, minimal, compact, theater, studio } = PLAYER_UI_SKINS;
    // Bar surfaces all differ.
    const barBgs = new Set([classic.barBg, minimal.barBg, compact.barBg, theater.barBg, studio.barBg]);
    expect(barBgs.size).toBe(5);
    // Fill colors / gradients all differ.
    const fills = new Set([classic.progressFill, minimal.progressFill, compact.progressFill, theater.progressFill, studio.progressFill]);
    expect(fills.size).toBe(5);
    // Button shapes are not all the same (squircle/flat vs circle).
    expect(new Set([classic.btnRadius, compact.btnRadius, studio.btnRadius]).size).toBe(3);
    // Theater glows; Minimal and Studio do not.
    expect(theater.progressGlow).not.toBe("none");
    expect(minimal.progressGlow).toBe("none");
    expect(studio.progressGlow).toBe("none");
  });

  it("resolves a preset's skin and falls back to Classic for custom/unknown ids", () => {
    expect(resolveSkin("theater").id).toBe("theater");
    expect(resolveSkin("custom").id).toBe(DEFAULT_SKIN_ID);
    expect(resolveSkin("nope").id).toBe(DEFAULT_SKIN_ID);
    expect(resolveSkin(undefined).id).toBe(DEFAULT_SKIN_ID);
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
