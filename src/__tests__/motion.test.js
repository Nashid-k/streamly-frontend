import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SPRING, DURATION, EASE_OUT, HUD_POP, PILL_IN, CHECK_POP, FADE, motionSafe } from "../constants/motion";
import { SPRING as REEXPORTED } from "../constants/playerUi";

/* Walks a directory for source files, so the contract tests below cover every
   player surface rather than the three files this test happens to know about. */
function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(jsx?|tsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

const PLAYER_SOURCES = walk(join(process.cwd(), "src", "components")).filter(
  (f) => /player/i.test(f) || /NativePlayerView/i.test(f)
);

describe("motion tokens", () => {
  it("exposes the seven named roles the app is allowed to use", () => {
    expect(Object.keys(SPRING).sort()).toEqual(
      ["LIFT", "POP", "POPOVER", "PRESS", "SHEET", "SNAPPY", "TOAST"].sort()
    );
  });

  it("keeps every spring valid and critically damped enough not to wobble", () => {
    for (const [role, spring] of Object.entries(SPRING)) {
      expect(spring.type, role).toBe("spring");
      expect(spring.stiffness, role).toBeGreaterThan(0);
      expect(spring.damping, role).toBeGreaterThan(0);
      // Below ~0.5 the spring is underdamped and visibly oscillates; none of
      // these roles want a wobble, they want weight.
      expect(spring.damping / Math.sqrt(spring.stiffness), role).toBeGreaterThan(0.4);
    }
  });

  it("gives the transient roles a mass below 1 so they read as light and fast", () => {
    // A menu must feel open before you have read it; a toast is an
    // interruption and must not feel heavy. Both depend on sub-1 mass.
    for (const role of ["POPOVER", "TOAST"]) {
      expect(SPRING[role].mass, role).toBeLessThan(1);
    }
    // The heavier surfaces must NOT carry it, or nothing is actually lighter.
    for (const role of ["LIFT", "SHEET", "SNAPPY", "POP", "PRESS"]) {
      expect(SPRING[role].mass, role).toBeUndefined();
    }
  });

  it("orders the player scale by weight: sheets move slower than confirmations", () => {
    expect(SPRING.SHEET.stiffness).toBeLessThan(SPRING.SNAPPY.stiffness);
    expect(SPRING.SNAPPY.stiffness).toBeLessThan(SPRING.POP.stiffness);
    // The loosest spring is press feedback, so it must not outrun any surface.
    expect(SPRING.PRESS.stiffness).toBeLessThan(SPRING.SHEET.stiffness);
  });

  it("re-exports SPRING from playerUi so old import paths stay valid", () => {
    expect(REEXPORTED).toBe(SPRING);
  });

  it("exposes durations in ascending order with one shared easing curve", () => {
    expect(DURATION.FAST).toBeLessThan(DURATION.MED);
    expect(DURATION.MED).toBeLessThan(DURATION.SLOW);
    expect(EASE_OUT).toHaveLength(4);
    // The curve must start fast and settle slow, i.e. a decelerating ease-out.
    expect(EASE_OUT[0]).toBeLessThan(EASE_OUT[3]);
  });

  describe("shared enter/exit shapes", () => {
    it("makes a HUD scale up from below and never travel sideways", () => {
      expect(HUD_POP.initial.scale).toBeLessThan(1);
      expect(HUD_POP.initial.x).toBeUndefined();
      expect(HUD_POP.exit.scale).toBeLessThan(1);
      expect(HUD_POP.transition).toBe(SPRING.SNAPPY);
    });

    it("makes a pill enter from the edge it lives on, and exit back the way it came", () => {
      expect(PILL_IN.initial.x).toBeGreaterThan(0);
      expect(PILL_IN.animate.x).toBe(0);
      // Exit must not overshoot past the entry point; it retraces.
      expect(Math.abs(PILL_IN.exit.x)).toBeLessThan(PILL_IN.initial.x);
      expect(PILL_IN.transition).toBe(SPRING.LIFT);
    });

    it("lets a checkmark overshoot, which is the only thing that should", () => {
      expect(CHECK_POP.initial.scale).toBeLessThan(HUD_POP.initial.scale);
      expect(CHECK_POP.transition).toBe(SPRING.POP);
    });

    it("fades without moving anything", () => {
      for (const key of ["initial", "animate", "exit"]) {
        expect(Object.keys(FADE[key])).toEqual(["opacity"]);
      }
    });
  });

  describe("motionSafe", () => {
    it("collapses to a cut when the viewer asked for less motion", () => {
      expect(motionSafe(true, SPRING.LIFT)).toEqual({ duration: 0 });
    });

    it("passes the real transition through when motion is welcome", () => {
      expect(motionSafe(false, SPRING.LIFT)).toBe(SPRING.LIFT);
    });
  });
});

describe("motion contract is actually enforced", () => {
  it("finds the player sources to police", () => {
    // Guards the test below from silently passing on an empty file list.
    expect(PLAYER_SOURCES.length).toBeGreaterThan(3);
  });

  it("forbids raw spring physics anywhere in src, not just the player", () => {
    // The audit that motivated this file found 12 files app-wide, not 2 in the
    // player: TitleInfoModal had hardcoded 380/30, the exact value LIFT now
    // owns, and Popover and Toast each carried their own local SPRING const.
    // A player-only rule would have let all of that survive.
    const offenders = [];
    for (const file of walk(join(process.cwd(), "src"))) {
      if (file.includes(`${join("constants", "motion")}`)) continue; // the source of truth
      const src = readFileSync(file, "utf8");
      if (/stiffness:\s*\d+/.test(src) || /damping:\s*\d+/.test(src)) {
        offenders.push(file.replace(process.cwd(), ""));
      }
    }
    expect(
      offenders,
      `Raw spring physics in: ${offenders.join(", ")}. Import SPRING from src/constants/motion.js and pick a role.`
    ).toEqual([]);
  });

  it("keeps every file that names a spring importing it from the token file", () => {
    const users = walk(join(process.cwd(), "src")).filter(
      (f) =>
        !f.includes(`${join("constants", "motion")}`) && // the token file names its own roles
        /SPRING\.[A-Z]/.test(readFileSync(f, "utf8"))
    );
    const unbacked = users.filter(
      (f) => !/constants\/motion/.test(readFileSync(f, "utf8"))
    );
    expect(
      unbacked.map((f) => f.replace(process.cwd(), "")),
      "These name a spring but do not import src/constants/motion.js"
    ).toEqual([]);
  });

  it("still disables the lone CSS keyframe under reduced motion", () => {
    // upNextCountdown is the only animation still in CSS. It cannot read a JS
    // token, so the contract has to be enforced on the stylesheet instead.
    const css = readFileSync(join(process.cwd(), "src", "styles", "player.css"), "utf8");
    expect(css).toMatch(/@keyframes upNextCountdown/);
    const reduced = css.slice(css.indexOf("prefers-reduced-motion"));
    expect(reduced).toMatch(/\.np-upnext-countdown\s*\{\s*animation:\s*none\s*!important/);
  });
});
