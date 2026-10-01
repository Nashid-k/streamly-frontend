import { describe, expect, it } from "vitest";
import {
  subtitleColor,
  subtitleFontFamily,
  subtitleLang,
  subtitleLuminance,
  subtitleScrim,
  subtitleSizeScale,
} from "../components/player/v2/subtitleStyle";
import { SUBTITLE_FONTS } from "../constants/settings";

/* PLAYER V2 subtitle typography (task.md 3.18-3.21).
 *
 * These are pure functions precisely so the four decisions a viewer makes in
 * Settings — which font, how big, what colour, which language is being spoken —
 * can be checked without a DOM. A cue node that renders them is easy; the risk is
 * entirely in the mapping, and the mapping is what these hold.
 */

describe("3.18 fontFamily comes from the registry, not a second list", () => {
  it("resolves every id the registry declares", () => {
    // The bug this replaces was a nested ternary in `PlayerPreview.jsx:78-83`
    // that had to be edited in lockstep with `constants/settings.js:66`. A fourth
    // font added to the registry would render no fontFamily at all — and a
    // dropped `font-family` inherits the player's stack, so it looks like "some
    // font" rather than a bug.
    for (const entry of SUBTITLE_FONTS) {
      expect(subtitleFontFamily(entry.id)).toBe(entry.family);
    }
  });

  it("falls back to the default for an unknown id", () => {
    expect(subtitleFontFamily("comic-sans")).toBe(SUBTITLE_FONTS[0].family);
  });

  it("falls back for a missing preference", () => {
    // A preference can be absent (a bare player with no preferences tree), and
    // undefined must not reach a style object.
    expect(subtitleFontFamily(undefined)).toBe(SUBTITLE_FONTS[0].family);
    expect(subtitleFontFamily(null)).toBe(SUBTITLE_FONTS[0].family);
    expect(subtitleFontFamily("")).toBe(SUBTITLE_FONTS[0].family);
  });

  it("is case sensitive about nothing", () => {
    expect(subtitleFontFamily("NETFLIX")).toBe(subtitleFontFamily("netflix"));
  });

  it("reads the family from the registry rather than repeating it", () => {
    // A copy would drift silently: renaming a family in the registry would leave
    // this module handing out a stack no font matches.
    expect(subtitleFontFamily("netflix")).toContain("Arial");
    expect(SUBTITLE_FONTS.find((f) => f.id === "netflix").family).toContain("Arial");
  });
});

describe("3.19 fontSize is a bounded scale, not a viewport fraction", () => {
  it("passes a normal percentage straight through", () => {
    expect(subtitleSizeScale(100)).toBe(1);
    expect(subtitleSizeScale(150)).toBe(1.5);
  });

  it("falls back to 100% for a nonsense value", () => {
    // The legacy's `(Number(subtitleSize) || 100) / 100` could not represent a
    // deliberate 0 and passed NaN through to `calc(...)`, which drops the whole
    // declaration and silently reverts the cue to the inherited size.
    //
    // `Infinity` is spelled out because it is the one value that separates the two
    // guards: a guard written only as `n > 0 ? n : 100` passes `Infinity` straight
    // through, and `calc(clamp(…) * Infinity)` is invalid, so the declaration is
    // dropped and the cue reverts to the inherited size — the exact silent failure
    // this function exists to prevent.
    expect(subtitleSizeScale(undefined)).toBe(1);
    expect(subtitleSizeScale("loud")).toBe(1);
    expect(subtitleSizeScale(NaN)).toBe(1);
    expect(subtitleSizeScale(Infinity)).toBe(1);
    expect(subtitleSizeScale(-Infinity)).toBe(1);
  });

  it("refuses a zero or negative size rather than hiding the cue", () => {
    // A caption at zero size is not a preference, it is a black bar where the
    // caption should be, and the viewer has no way to tell it from a broken
    // subtitle track.
    expect(subtitleSizeScale(0)).toBe(1);
    expect(subtitleSizeScale(-20)).toBe(1);
  });

  it("bounds the top so a cue cannot be scaled off the video", () => {
    expect(subtitleSizeScale(5000)).toBe(3);
  });

  it("bounds the bottom so a cue cannot be made invisible", () => {
    // Not 0: a subtitle at zero size is not a preference, it is a black bar.
    expect(subtitleSizeScale(1)).toBe(0.5);
  });

  it("accepts numeric strings from localStorage", () => {
    expect(subtitleSizeScale("125")).toBe(1.25);
  });

  it("never returns a scale that would make the declaration invalid", () => {
    // The real failure is silent: `calc(clamp(…) * NaN)` is an invalid value, the
    // browser drops the whole `font-size`, and the cue renders at whatever it
    // inherited — which looks like the subtitle setting "not working" rather than
    // like a bug. Asserted over a spread of values a hand-edited localStorage or a
    // sanitiser bug could actually produce.
    for (const value of [0, -1, NaN, Infinity, -Infinity, undefined, null, "", " ", "x", {}, []]) {
      const scale = subtitleSizeScale(value);
      expect(Number.isFinite(scale)).toBe(true);
      expect(scale).toBeGreaterThan(0);
    }
  });
});

describe("3.20 the scrim is derived from the cue's own luminance", () => {
  it("reads relative luminance, not a channel average", () => {
    // The gamma step is the point. `#808080` averages 0.5 across channels but is
    // really ~0.216 relative — an averaged "brightness" would treat mid-grey as
    // half-bright and under-scrim it.
    expect(subtitleLuminance("#ffffff")).toBeCloseTo(1, 3);
    expect(subtitleLuminance("#000000")).toBeCloseTo(0, 3);
    expect(subtitleLuminance("#808080")).toBeCloseTo(0.216, 2);
  });

  it("weights green the way the eye does", () => {
    // Pure green scores far above pure blue or red despite the same max channel.
    expect(subtitleLuminance("#00ff00")).toBeGreaterThan(subtitleLuminance("#0000ff"));
    expect(subtitleLuminance("#00ff00")).toBeGreaterThan(subtitleLuminance("#ff0000"));
  });

  it("reads the three-digit shorthand", () => {
    expect(subtitleLuminance("#fff")).toBeCloseTo(1, 3);
  });

  it("scrims bright text harder than dark text", () => {
    // The legacy painted rgba(0,0,0,0.42) for every colour, which made yellow
    // captions look highlighted and left mid-grey captions washing out on a white
    // scene.
    const alpha = (c) => Number(subtitleScrim(c).match(/[\d.]+(?=\)$)/)[0]);
    expect(alpha("#ffffff")).toBeGreaterThan(alpha("#ffff00"));
    expect(alpha("#ffff00")).toBeGreaterThan(alpha("#808080"));
    expect(alpha("#808080")).toBeGreaterThan(alpha("#0000ff"));
  });

  it("never returns a transparent scrim", () => {
    // Even the darkest text keeps a floor: the video behind it is not under our
    // control, and a fully transparent scrim is the caption disappearing on a
    // bright frame.
    expect(subtitleScrim("#000000")).toMatch(/rgba\(0, 0, 0, 0\.1[0-9]{2}\)/);
  });

  it("scrims hardest for a colour it cannot read", () => {
    // Unparseable is the worst case for contrast, so it gets the most protection
    // rather than none.
    expect(subtitleScrim("not-a-colour")).toBe(subtitleScrim("#ffffff"));
    expect(subtitleScrim(undefined)).toBe(subtitleScrim("#ffffff"));
  });

  it("normalises the cue colour and refuses a broken one", () => {
    expect(subtitleColor("#95ff50")).toBe("#95ff50");
    expect(subtitleColor("95ff50")).toBe("#95ff50");
    // An invalid colour in a style object is DROPPED, and the cue then inherits —
    // invisible text on a white scene.
    expect(subtitleColor("red;")).toBe("#ffffff");
    expect(subtitleColor("")).toBe("#ffffff");
  });
});

describe("3.21 lang is a claim the player can back up", () => {
  it("maps the languages the registry offers", () => {
    expect(subtitleLang("English")).toBe("en");
    expect(subtitleLang("Tamil")).toBe("ta");
    expect(subtitleLang("Hindi")).toBe("hi");
  });

  it("strips a regional suffix rather than guessing the region", () => {
    // Honest about the language, silent about the region: "English (US)" is
    // correctly `en`, and claiming `en-US` from the text would be a guess.
    expect(subtitleLang("English (US)")).toBe("en");
    expect(subtitleLang("Spanish (Latin America)")).toBe("es");
  });

  it("keeps a multi-word name intact", () => {
    // The base name is not a bare table key, so it must not be mangled into one.
    expect(subtitleLang("Haitian Creole")).toBe("");
  });

  it("returns empty rather than an empty attribute", () => {
    // `lang=""` is worse than no `lang` at all: an empty value is a claim that the
    // content has no language.
    expect(subtitleLang("")).toBe("");
    expect(subtitleLang(undefined)).toBe("");
    expect(subtitleLang("Klingon")).toBe("");
  });
});