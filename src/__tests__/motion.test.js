import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SPRING, DURATION, EASE_OUT, HUD_POP, PILL_IN, CHECK_POP, FADE, MODAL_PANEL, motionSafe } from "../constants/motion";
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

  it("publishes one duration scale in CSS, aliased by the player", () => {
    // Three scales used to coexist (motion.js 180/280/450, tokens.css
    // 150/250/400, player.css 150/300/500), so retuning motion.js changed
    // almost nothing on screen. CSS is the one the whole app reads, so it is
    // the one that has to agree with DURATION.
    const tokens = readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");
    const player = readFileSync(join(process.cwd(), "src", "styles", "player.css"), "utf8");
    const ms = (src, name) => Number(src.match(new RegExp(`${name}:\\s*(\\d+)ms`))?.[1]);

    expect(ms(tokens, "--duration-normal")).toBe(DURATION.MED * 1000);
    expect(ms(tokens, "--duration-slow")).toBe(DURATION.SLOW * 1000);
    // player.css must alias the scale, never redeclare it.
    expect(player).toMatch(/--zxc-t-med:\s*var\(--duration-normal\)/);
    expect(player).toMatch(/--zxc-t-slow:\s*var\(--duration-slow\)/);
    expect(player).not.toMatch(/--zxc-t-\w+:\s*\d+ms/);
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

    it("gives every dialog one panel shape and one scrim speed", () => {
      // The audit that produced this token found the same interaction arriving
      // with four travels and two springs across six surfaces.
      expect(MODAL_PANEL.transition).toBe(SPRING.SHEET);
      expect(MODAL_PANEL.animate).toEqual({ opacity: 1, scale: 1, y: 0 });
      expect(FADE.transition).toEqual({ duration: DURATION.MED, ease: EASE_OUT });
    });
  });

  describe("the shared shapes are actually adopted", () => {
    // Small dialogs: every motion node in these files IS the dialog, so any
    // hand-written panel timing is a regression.
    const SMALL_DIALOGS = [
      join(process.cwd(), "src", "components", "ConfirmDialog.jsx"),
      join(process.cwd(), "src", "components", "GlobalShortcuts.jsx"),
      join(process.cwd(), "src", "components", "RatingsTable.jsx"),
      join(process.cwd(), "src", "components", "TitleInfoModal.jsx"),
    ];
    // Big pages: one dialog among many rails and rows, so only the import and
    // the token usage are policed here.
    // SignInDialog replaces SettingsPage as the app's only sign-in surface, so
    // it belongs here: a gate can now summon it from any card on any page, and
    // it must not be the one modal that arrives with its own easing.
    const PAGE_DIALOGS = [
      join(process.cwd(), "src", "pages", "TitleDetailsPage.jsx"),
      join(process.cwd(), "src", "components", "auth", "SignInDialog.jsx"),
    ];
    const HUD_SOURCES = [
      "NetflixSeekHUD.jsx",
      "NetflixVolumeHUD.jsx",
      "NetflixBrightnessHUD.jsx",
      "NetflixAspectHUD.jsx",
    ].map((f) => join(process.cwd(), "src", "components", "player", f));

    it("keeps hand-rolled scrim and panel timings out of the dialogs", () => {
      for (const file of SMALL_DIALOGS) {
        const src = readFileSync(file, "utf8");
        expect(src).not.toMatch(/transition=\{\{\s*duration:/);
        expect(src).not.toMatch(/initial=\{\{[^}]*scale:/);
      }
    });

    it("takes the dialog on the two big pages from the same tokens", () => {
      for (const file of PAGE_DIALOGS) {
        const src = readFileSync(file, "utf8");
        // Depth-agnostic: PAGE_DIALOGS spans src/pages and src/components/auth.
        expect(src).toMatch(/import \{[^}]*MODAL_PANEL[^}]*\} from "(?:\.\.\/)+constants\/motion"/);
        expect(src).toMatch(/transition=\{MODAL_PANEL\.transition\}/);
        expect(src).toMatch(/transition=\{FADE\.transition\}/);
      }
    });

    it("routes the value HUDs through one pop shape", () => {
      for (const file of HUD_SOURCES) {
        const src = readFileSync(file, "utf8");
        expect(src).toMatch(/initial=\{HUD_POP\.initial\}/);
        expect(src).toMatch(/transition=\{HUD_POP\.transition\}/);
      }
    });

    it("leaves the two HUDs that answer a different question on their own shape", () => {
      // play/pause is a one-shot event (bigger pop) and hold-2x slides in from
      // the edge it is pinned to. Neither should be dragged onto HUD_POP.
      for (const f of ["NetflixPlayPauseHUD.jsx", "NetflixHold2xHUD.jsx"]) {
        const src = readFileSync(join(process.cwd(), "src", "components", "player", f), "utf8");
        expect(src).not.toMatch(/HUD_POP\./);
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
