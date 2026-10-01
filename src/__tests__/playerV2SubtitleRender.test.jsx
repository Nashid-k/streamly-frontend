import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import SubtitleOverlay from "../components/player/v2/SubtitleOverlay";
import { PreferencesContext } from "../context/preferences";
import { SUBTITLE_FONTS } from "../constants/settings";

/* PLAYER V2 subtitle cue node (task.md 3.18-3.23).
 *
 * `playerV2SubtitleStyle.test.js` holds the mapping. This holds the node: that the
 * four decisions reach the DOM, that 3.21's `lang` is omitted rather than empty,
 * and that 3.23's plate is ONE box for the whole cue block.
 *
 * The context VALUE is supplied directly rather than through `PreferencesProvider`,
 * which reads localStorage at mount. These tests are about what the node does with
 * a preference value, and going through storage would make every case depend on a
 * sanitiser that is not what is under test.
 */
function renderCue(props = {}, preferences = {}) {
  /* `PreferencesContext`'s value is the preference object SPREAD plus the setters
   * (`{...preferences, setPreference, resetPreferences}` in
   * `PreferencesContext.jsx:369-370`) — not a nested `preferences` key. Wrapping it
   * the obvious-but-wrong way leaves every lookup reading undefined, which looks
   * exactly like the component ignoring the preference. */
  const value = {
    subtitleFont: "netflix",
    subtitleSize: 100,
    subtitleColor: "#ffffff",
    ...preferences,
    setPreference: () => {},
  };
  return render(
    <PreferencesContext.Provider value={value}>
      <SubtitleOverlay {...props} />
    </PreferencesContext.Provider>,
  );
}

/* jsdom normalises `font-family` quotes, so compare on the family NAME rather than
 * on the exact stack string — `'Inter', sans-serif` reads back as `"Inter",
 * sans-serif`. */
const HERE = resolve(import.meta.dirname, ".");
const fontName = (style) => (style.match(/"([^"]+)"/) || [null, style])[1];

const CUE = "First line\nSecond line";

describe("SubtitleOverlay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when there is no cue", () => {
    // Not an empty box: a plate with no text in it is a dark bar over the video.
    const { container } = renderCue({ cue: null, language: "English" });
    expect(container.querySelector(".pv2-cue")).toBeNull();
  });

  it("renders the cue text", () => {
    const { container } = renderCue({ cue: CUE, language: "English" });
    expect(container.querySelector(".pv2-cue").textContent).toBe(CUE);
  });

  describe("3.18 font-family comes from the registry", () => {
    it("applies the chosen font", () => {
      const { container } = renderCue(
        { cue: "x", language: "English" },
        { subtitleFont: "netflix" },
      );
      expect(fontName(container.querySelector(".pv2-cue").style.fontFamily)).toBe("Arial");
    });

    it("applies a different font for a different choice", () => {
      const { container } = renderCue(
        { cue: "x", language: "English" },
        { subtitleFont: "montserrat" },
      );
      expect(fontName(container.querySelector(".pv2-cue").style.fontFamily)).toBe("Montserrat");
    });

    it("falls back for an unknown id rather than leaving font-family unset", () => {
      // An unset `font-family` inherits the player's own stack, so a bad
      // preference looks like "some font" rather than a bug.
      const { container } = renderCue(
        { cue: "x", language: "English" },
        { subtitleFont: "comic-sans" },
      );
      expect(fontName(container.querySelector(".pv2-cue").style.fontFamily)).toBe(
        SUBTITLE_FONTS[0].family.match(/\x27([^\x27]+)\x27/)[1],
      );
    });
  });

  describe("3.19 size is scaled against the player box, not the viewport", () => {
    it("uses a container-relative unit", () => {
      // The legacy used `2.6vw`, which scales with the VIEWPORT — the same cue is
      // tiny beside a large video and enormous on a small one.
      const { container } = renderCue(
        { cue: "x", language: "English" },
        { subtitleSize: 100 },
      );
      expect(container.querySelector(".pv2-cue").style.fontSize).toContain("cqi");
      expect(container.querySelector(".pv2-cue").style.fontSize).not.toContain("vw");
    });

    it("scales by the preference", () => {
      const { container } = renderCue(
        { cue: "x", language: "English" },
        { subtitleSize: 150 },
      );
      expect(container.querySelector(".pv2-cue").style.fontSize).toContain("1.5");
    });

    it("ignores a nonsense size instead of dropping the declaration", () => {
      // `calc(... * NaN)` is an invalid value and the whole declaration is
      // dropped, which silently reverts the cue to the inherited size.
      const { container } = renderCue(
        { cue: "x", language: "English" },
        { subtitleSize: "huge" },
      );
      expect(container.querySelector(".pv2-cue").style.fontSize).toBeTruthy();
      expect(container.querySelector(".pv2-cue").style.fontSize.replace(/\s+/g, "")).toContain("*1)");
    });
  });

  describe("3.20 colour and a scrim derived from it", () => {
    it("applies the chosen colour", () => {
      const { container } = renderCue(
        { cue: "x", language: "English" },
        { subtitleColor: "#ffff00" },
      );
      const node = container.querySelector(".pv2-cue");
      expect(node.style.color).toBe("rgb(255, 255, 0)");
    });

    it("scrims brighter text harder", () => {
      // The legacy painted rgba(0,0,0,0.42) for every colour, so yellow captions
      // looked highlighted and mid-grey ones washed out on a bright scene.
      const alphaOf = (prefs) => {
        const { container } = renderCue({ cue: "x", language: "English" }, prefs);
        return Number(container.querySelector(".pv2-cue").style.background.match(/([\d.]+)\)$/)[1]);
      };
      expect(alphaOf({ subtitleColor: "#ffffff" })).toBeGreaterThan(
        alphaOf({ subtitleColor: "#808080" }),
      );
    });

    it("refuses an unparseable colour instead of inheriting one", () => {
      // An invalid `color` in a style object is dropped and the cue then inherits,
      // which on a white scene is invisible text.
      const { container } = renderCue(
        { cue: "x", language: "English" },
        { subtitleColor: "chartreuse" },
      );
      expect(container.querySelector(".pv2-cue").style.color).toBe("rgb(255, 255, 255)");
    });
  });

  describe("3.21 lang is set from the track, and omitted when unknown", () => {
    it("sets the tag for a mapped language", () => {
      const { container } = renderCue({ cue: "வணக்கம்", language: "Tamil" });
      // Without this a Tamil cue is announced in the viewer's own voice.
      expect(container.querySelector(".pv2-cue").getAttribute("lang")).toBe("ta");
    });

    it("omits the attribute rather than setting it empty", () => {
      // `lang=""` is a claim that the content has no language, which is worse than
      // making no claim.
      const { container } = renderCue({ cue: "x", language: "Klingon" });
      expect(container.querySelector(".pv2-cue").hasAttribute("lang")).toBe(false);
    });

    it("omits it when the track states no language", () => {
      const { container } = renderCue({ cue: "x" });
      expect(container.querySelector(".pv2-cue").hasAttribute("lang")).toBe(false);
    });

    it("strips a regional suffix rather than guessing", () => {
      const { container } = renderCue({ cue: "x", language: "English (US)" });
      expect(container.querySelector(".pv2-cue").getAttribute("lang")).toBe("en");
    });
  });

  describe("3.22 bottom clears the MEASURED chrome", () => {
    it("uses the measured height", () => {
      const { container } = renderCue({ cue: "x", language: "English", bottomPx: 148 });
      expect(container.querySelector(".pv2-cue").style.insetBlockEnd).toBe("148px");
    });

    it("does not fall back to a literal when nothing is measured", () => {
      // 0 is a real value: with the chrome hidden the cue takes the cinematic
      // resting offset that the CSS declares, not a hardcoded pair of guesses.
      const { container } = renderCue({ cue: "x", language: "English", bottomPx: 0 });
      expect(container.querySelector(".pv2-cue").style.insetBlockEnd).toBe("0px");
    });
  });

  describe("3.23 one plate per cue block", () => {
    it("renders a single element for a multi-line cue", () => {
      // The legacy nested a `<span>` with `box-decoration-break: clone`, which
      // paints a background box around every LINE — two boxes and a notch between
      // them for a two-line cue.
      const { container } = renderCue({ cue: CUE, language: "English" });
      const node = container.querySelector(".pv2-cue");
      expect(node.querySelectorAll("*")).toHaveLength(0);
    });

    it("keeps the file's own line breaks", () => {
      const { container } = renderCue({ cue: CUE, language: "English" });
      expect(container.querySelector(".pv2-cue").textContent).toContain("\n");
    });
  });

  it("never swallows a press meant for the video", () => {
    /* Read from the stylesheet source rather than `document.styleSheets`: nothing
     * imports `player.css` in jsdom, so the CSSOM is empty and a rule read that
     * way would pass on an empty string — which is exactly the assertion the
     * legacy's `pointer-events: none` needs and never had. */
    const css = readFileSync(
      resolve(HERE, "../components/player/v2/player.css"),
      "utf8",
    );
    const rule = css.match(/\.pv2-cue\s*\{[^}]*\}/);
    expect(rule).toBeTruthy();
    expect(rule[0]).toMatch(/pointer-events:\s*none/);
  });

  it("paints exactly one plate, with no inner element to break it up", () => {
    // 3.23: `box-decoration-break: clone` on a child span is what painted one
    // background box per LINE. One element, one box.
    const { container } = renderCue({ cue: CUE, language: "English" });
    const css = readFileSync(
      resolve(HERE, "../components/player/v2/player.css"),
      "utf8",
    );
    const rule = css.match(/\.pv2-cue\s*\{[^}]*\}/);
    expect(rule).toBeTruthy();
    /* Comments stripped first: the rule documents what it replaced, so the
     * property's name appears in the explanation as well as (hopefully not) in a
     * declaration. Asserting on the raw text would fail on the documentation. */
    const declarations = rule[0].replace(/\/\*[\s\S]*?\*\//g, "");
    expect(declarations).not.toMatch(/box-decoration-break/);
    expect(container.querySelectorAll(".pv2-cue")).toHaveLength(1);
  });

  it("still honours the file's own line breaks with pre-line", () => {
    const css = readFileSync(
      resolve(HERE, "../components/player/v2/player.css"),
      "utf8",
    );
    expect(css.match(/\.pv2-cue\s*\{[^}]*\}/)[0]).toMatch(/white-space:\s*pre-line/);
  });
});
