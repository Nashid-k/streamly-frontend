import { describe, it, expect } from "vitest";
import {
  PLAYER_ZONES,
  PLAYER_CONTROLS,
  PLAYER_CONTROL_ORDER,
  PLAYER_UI_PRESETS,
  PLAYER_UI_SKINS,
  DEFAULT_SKIN_ID,
  ICON_VARIANTS,
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
  it("ships exactly six presets with full visibility + layout maps", () => {
    expect(PLAYER_UI_PRESETS.map((p) => p.id)).toEqual([
      "classic",
      "apple",
      "material",
      "theater",
      "studio",
      "minimal",
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

  it("gives each of the six looks a genuinely different visual identity", () => {
    const { classic, apple, material, theater, studio, minimal } = PLAYER_UI_SKINS;
    // Bar surfaces all differ.
    const barBgs = new Set([classic.barBg, apple.barBg, material.barBg, theater.barBg, studio.barBg, minimal.barBg]);
    expect(barBgs.size).toBe(6);
    // Fill colors / gradients all differ.
    const fills = new Set([classic.progressFill, apple.progressFill, material.progressFill, theater.progressFill, studio.progressFill, minimal.progressFill]);
    expect(fills.size).toBe(6);
    // Button shapes differ (squircle, circle, boxed).
    expect(new Set([classic.btnRadius, material.btnRadius, studio.btnRadius]).size).toBe(3);
    // Theater, Apple, Material glow; Minimal and Studio do not.
    expect(theater.progressGlow).not.toBe("none");
    expect(apple.progressGlow).not.toBe("none");
    expect(minimal.progressGlow).toBe("none");
    expect(studio.progressGlow).toBe("none");
  });

  it("resolves a preset's skin and falls back to Classic for custom/unknown ids", () => {
    expect(resolveSkin("theater").id).toBe("theater");
    expect(resolveSkin("custom").id).toBe(DEFAULT_SKIN_ID);
    expect(resolveSkin("nope").id).toBe(DEFAULT_SKIN_ID);
    expect(resolveSkin(undefined).id).toBe(DEFAULT_SKIN_ID);
  });

  it("gives every skin a complete full-UI token set (HUD, toast, badges, center burst, motion)", () => {
    const REQUIRED_TOKENS = [
      "hudBg", "hudBlur", "hudBorder", "hudRadius", "hudShadow", "hudFont",
      "toastBg", "badgeBg",
      "centerIconBg", "centerIconBlur", "centerIconBorder", "centerIconTone",
      "progressTrack", "progressBuffered", "barInset",
      "entrance", "motionMs", "fontBody", "vignette",
    ];
    for (const skin of Object.values(PLAYER_UI_SKINS)) {
      for (const token of REQUIRED_TOKENS) {
        expect(skin[token], `${skin.id}.${token}`).toBeDefined();
      }
      expect(["ghost", "solid", "gilded", "flat-red"]).toContain(skin.centerIconTone);
      expect(["fade", "rise", "pop", "unfold", "slide"]).toContain(skin.entrance);
      expect(skin.motionMs).toBeGreaterThan(0);
    }
  });

  it("makes presets genuinely different experiences, not recolors", () => {
    const skins = Object.values(PLAYER_UI_SKINS);
    // Distinct HUD surfaces across all six presets.
    expect(new Set(skins.map((s) => s.hudBg)).size).toBe(skins.length);
    expect(new Set(skins.map((s) => s.hudRadius)).size).toBe(skins.length);
    // Distinct entrance choreography + timing.
    expect(new Set(skins.map((s) => s.entrance)).size).toBe(5); // minimal+classic share fade
    expect(new Set(skins.map((s) => s.motionMs)).size).toBe(skins.length);
    // Center burst tone varies by preset identity.
    expect(new Set(skins.map((s) => s.centerIconTone)).size).toBe(4);
    // Only Theater carries the cinematic vignette.
    expect(skins.filter((s) => s.vignette !== "none").map((s) => s.id)).toEqual(["theater"]);
    // Floating bars have non-zero barInset.
    expect(skins.filter((s) => s.barInset !== "0px").map((s) => s.id).sort()).toEqual(["apple", "material"].sort());
    // Per-skin typography extends beyond the time row.
    expect(new Set(skins.map((s) => s.fontBody)).size).toBe(4); // system / roboto / serif / mono
    expect(new Set(skins.map((s) => s.hudFont)).size).toBe(4);
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

describe("playerUIDef icon variants", () => {
  it("ships exactly eight distinct icon aesthetic variants with rich descriptions", () => {
    expect(ICON_VARIANTS.map((v) => v.id)).toEqual([
      "outline",
      "filled",
      "neon",
      "glass",
      "material",
      "retro",
      "minimal",
      "duotone",
    ]);
    for (const variant of ICON_VARIANTS) {
      expect(typeof variant.label).toBe("string");
      expect(variant.label.length).toBeGreaterThan(0);
      expect(typeof variant.desc).toBe("string");
      expect(variant.desc.length).toBeGreaterThan(0);
    }
  });

  it("assigns each preset skin an appropriate default icon variant", () => {
    const validIds = new Set(ICON_VARIANTS.map((v) => v.id));
    for (const [skinId, skin] of Object.entries(PLAYER_UI_SKINS)) {
      expect(skin.iconVariant, `skin ${skinId} iconVariant`).toBeDefined();
      expect(validIds.has(skin.iconVariant)).toBe(true);
    }
    expect(PLAYER_UI_SKINS.classic.iconVariant).toBe("outline");
    expect(PLAYER_UI_SKINS.apple.iconVariant).toBe("glass");
    expect(PLAYER_UI_SKINS.material.iconVariant).toBe("material");
    expect(PLAYER_UI_SKINS.theater.iconVariant).toBe("neon");
    expect(PLAYER_UI_SKINS.studio.iconVariant).toBe("retro");
    expect(PLAYER_UI_SKINS.minimal.iconVariant).toBe("minimal");
  });
});

