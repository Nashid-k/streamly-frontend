import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SPRING, DURATION, EASE_OUT, EASE_IN, HUD_POP, PILL_IN, CHECK_POP, FADE, MODAL_PANEL, PRESS_SCALE, motionSafe } from "../constants/motion";
import { ROUTE_VARIANTS } from "../constants/routeMotion";
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
    expect(ms(tokens, "--duration-fast")).toBe(DURATION.FAST * 1000);
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
      "NetflixAspectHUD.jsx",
    ].map((f) => join(process.cwd(), "src", "components", "player", f));

    it("keeps hand-rolled scrim and panel timings out of the dialogs", () => {
      for (const file of SMALL_DIALOGS) {
        const src = readFileSync(file, "utf8");
        expect(src).not.toMatch(/transition=\{\{\s*duration:/);
        expect(src).not.toMatch(/initial=\{\{[^}]*scale:/);
      }
    });

    it("takes the dialog on the two big pages through MotionLeaf", () => {
      for (const file of PAGE_DIALOGS) {
        const src = readFileSync(file, "utf8");
        // Depth-agnostic: PAGE_DIALOGS spans src/pages and src/components/auth.
        expect(src).toMatch(/import \{[^}]*MotionLeaf[^}]*\} from "[^"]*MotionLeaf"/);
        expect(src).toMatch(/transition=\{L\.Modal\.panel\.transition\}/);
        expect(src).toMatch(/exit=\{L\.Modal\.panelExit\}/);
        expect(src).toMatch(/<MotionFade/);
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

describe("player stylesheet speaks the token scale", () => {
  const playerCss = readFileSync(join(process.cwd(), "src", "styles", "player.css"), "utf8");
  const tokensCss = readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");
  // Declarations only: a duration mentioned inside a comment is documentation,
  // not a fourth scale, and flagging those would just teach people to stop
  // writing explanatory comments.
  const declarations = playerCss
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)(\/\/[^\n]*)/g, "$1");

  it("keeps the player interactions off hardcoded durations", () => {
    // The sweep replaced every interaction literal with the shared scale. What
    // is left is the Tailspin loader's own period, which is a rotation speed
    // passed in as --uib-speed rather than a transition duration, so it is
    // allowed to keep its own default.
    const survivors = [
      ...declarations.matchAll(/transition(?:-duration)?:[^;]*?\b(\d*\.?\d+)s\b/g),
      ...declarations.matchAll(/animation:[^;]*?\b(\d*\.?\d+)s\b/g),
    ]
      .map((m) => m[0])
      .filter((line) => !line.includes("--uib-speed"));
    expect(survivors, `Untokenised durations left in player.css:\n${survivors.join("\n")}`).toEqual([]);
  });

  it("uses no bare `ease` keyword, only the shared easing", () => {
    // `ease` is cubic-bezier(0.25, 0.1, 0.25, 1) and --ease-out is
    // cubic-bezier(0.16, 1, 0.3, 1): same intent, different curve, and a
    // player whose button hovers decelerate differently from its scrub bar is
    // exactly the inconsistency the tokens exist to prevent.
    const bare = [...declarations.matchAll(/(?<![\w-])ease(?![\w-])/g)].filter((m) => {
      const line = declarations.slice(0, m.index).split("\n").pop();
      return /transition|animation/.test(line);
    });
    expect(bare.length, "Bare `ease` in a player transition; use var(--zxc-ease)").toBe(0);
  });

  it("publishes a press scale per target size and uses them in the player", () => {
    // Three tiers, because press depth has to match the target: an icon button
    // reads as a button because it moves, a full-width row must barely move.
    expect(tokensCss).toMatch(/--press-scale-icon:\s*0\.9\d+/);
    expect(tokensCss).toMatch(/--press-scale:\s*0\.9\d+/);
    expect(tokensCss).toMatch(/--press-scale-row:\s*0\.9\d+/);
    expect(playerCss).toMatch(/var\(--press-scale-icon\)/);
    expect(playerCss).toMatch(/var\(--press-scale\)/);
    expect(playerCss).toMatch(/var\(--press-scale-row\)/);
    // No bare press scale may survive: every `:active` scale in the player is a
    // tier now. (0.92 does still appear elsewhere in the file, on the two
    // whole-card collapses in grids.css / hero.css, which are not press tiers.)
    const remaining = [...playerCss.matchAll(/:active[^{]*\{[^}]*scale\((\d*\.?\d+)\)/g)]
      .map((m) => m[1])
      .filter((v) => v !== "var");
    expect(remaining, `Un-tokenised press scales: ${remaining.join(", ")}`).toEqual([]);
  });
});

describe("the whole app speaks one easing curve", () => {
  const stylesDir = join(process.cwd(), "src", "styles");
  const sheets = readdirSync(stylesDir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => [f, readFileSync(join(stylesDir, f), "utf8")]);

  // Parse whole declarations, not lines: a transition may be wrapped across
  // several lines, and a line-based scan silently misses every continuation.
  // Comments are stripped (they explain the scale; reduced-motion kill switches
  // are `0.001ms` on purpose and are skipped by the duration check).
  function transitionDeclarations(css) {
    const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
    const out = [];
    for (const match of clean.matchAll(/transition(-duration)?\s*:\s*([^;]+);/g)) {
      out.push({
        property: match[1] ? "transition-duration" : "transition",
        value: match[2],
        line: clean.slice(0, match.index).split(/\r?\n/).length,
      });
    }
    return out;
  }

  // `cubic-bezier(0.16, 1, 0.3, 1)` contains commas, so a plain split would
  // read each coefficient as its own transition segment.
  function splitTopLevel(value) {
    const out = [];
    let depth = 0;
    let current = "";
    for (const ch of value) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        out.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    out.push(current);
    return out;
  }

  // In the shorthand, the FIRST time value is the duration and the second is
  // the delay. Only the duration belongs to the shared scale; a stagger delay
  // is content, not interaction speed. A `var()` duration counts as the first
  // time value, which is how the `.. var(--duration-slow) .. 180ms` delays
  // below are left alone.
  function firstDuration(segment) {
    const times = segment.match(
      /[\d.]+m?s\b|var\(--duration-[a-z]+\)|var\(--anim-hover-time\)/g
    );
    return times ? times[0] : null;
  }

  it("finds every stylesheet", () => {
    expect(sheets.length).toBeGreaterThan(10);
  });

  it("uses the shared curve instead of the bare ease keyword", () => {
    const offenders = [];
    for (const [name, css] of sheets) {
      for (const { value, line } of transitionDeclarations(css)) {
        if (/(?<![\w-])ease(?![\w-])/.test(value)) {
          offenders.push(`${name}:${line} ${value.replace(/\s+/g, " ").trim()}`);
        }
      }
    }
    expect(
      offenders,
      `Bare \`ease\` is cubic-bezier(0.25, 0.1, 0.25, 1); use var(--ease-out).\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("names fast interaction durations instead of typing them", () => {
    // 100/150/160/180/200ms were five spellings of one step. The shared name
    // is --duration-fast (200ms) and --duration-instant (120ms) for presses.
    const typed = new Set(["0.1s", "0.15s", "0.2s", "150ms", "160ms", "180ms"]);
    const offenders = [];
    for (const [name, css] of sheets) {
      for (const { value, line } of transitionDeclarations(css)) {
        for (const segment of splitTopLevel(value)) {
          const duration = firstDuration(segment);
          if (duration && typed.has(duration)) {
            offenders.push(`${name}:${line} ${value.replace(/\s+/g, " ").trim()}`);
            break;
          }
        }
      }
    }
    expect(
      offenders,
      `Hand-written interaction durations; use var(--duration-fast)/var(--duration-instant).\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("gives every animated property an explicit curve", () => {
    // Omitting the timing function is not "no curve" — the browser falls back
    // to bare `ease`, which is exactly the drift the token exists to stop.
    // `transition-duration` cannot carry a curve, and the reduced-motion
    // kill switches are intentionally instantaneous.
    const offenders = [];
    for (const [name, css] of sheets) {
      for (const { property, value, line } of transitionDeclarations(css)) {
        if (property === "transition-duration") continue;
        if (/0\.00?1?ms/.test(value)) continue;
        for (const segment of splitTopLevel(value)) {
          const hasTime = /[\d.]+m?s\b|var\(--duration|var\(--anim-hover-time\)/.test(segment);
          const hasCurve = /ease|cubic-bezier|linear|steps\(/.test(segment);
          if (hasTime && !hasCurve) {
            offenders.push(`${name}:${line} ${segment.replace(/\s+/g, " ").trim()}`);
          }
        }
      }
    }
    expect(
      offenders,
      `Animated properties with no timing function (implicit \`ease\`):\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});

describe("framer tweens declare the shared easing", () => {
  const SOURCE_DIRS = ["components", "pages", "app"];
  const files = SOURCE_DIRS.flatMap((d) =>
    walk(join(process.cwd(), "src", d))
  );

  function objectBlocks(text) {
    const blocks = [];
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === "{") {
        if (depth === 0) start = i;
        depth += 1;
      } else if (text[i] === "}") {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          blocks.push(text.slice(start + 1, i));
          start = -1;
        }
      }
    }
    return blocks;
  }

  // Every motion transition prop, whether written `transition={{...}}` (JSX)
  // or `transition: {...}` (a variant object). Nested maps such as
  // `{ opacity: { duration }, scale: SPRING.X }` are audited per sub-object.
  function transitionObjects(src) {
    const out = [];
    const re = /transition\s*(?:=|:)\s*\{/g;
    let match;
    while ((match = re.exec(src))) {
      const start = match.index + match[0].length - 1;
      const [block] = objectBlocks(src.slice(start));
      if (block !== undefined) out.push(block);
    }
    return out;
  }

  function ownProps(block) {
    let own = "";
    let depth = 0;
    for (const ch of block) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
      else if (depth === 0) own += ch;
    }
    return own;
  }

  function audit(block, file, out) {
    const own = ownProps(block);
    const duration = own.match(/duration\s*:\s*([^,}]+)/);
    if (duration) {
      const raw = duration[1].trim();
      const isZero = raw === "0" || Number(raw) === 0;
      if (!isZero && !/\bease\s*:/.test(own)) {
        out.push(`${file.replace(process.cwd(), "")}: duration ${raw}`);
      }
    }
    for (const nested of objectBlocks(block)) audit(nested, file, out);
  }

  it("scans the app sources", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("gives every tween a non-zero duration an explicit ease", () => {
    const offenders = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      if (file.includes(`${join("constants", "motion")}`)) continue;
      for (const block of transitionObjects(src)) audit(block, file, offenders);
    }
    expect(
      offenders,
      `Tweens without an ease take framer's default curve instead of EASE_OUT.\n${offenders.join("\n")}`
    ).toEqual([]);
  });

  it("uses the EASE_OUT token, not the easeOut keyword", () => {
    // `easeOut` is cubic-bezier(0, 0, 0.58, 1); the app's curve is
    // [0.16, 1, 0.3, 1]. Same name, different deceleration.
    const offenders = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (/ease:\s*"easeOut"/.test(src)) {
        offenders.push(file.replace(process.cwd(), ""));
      }
    }
    expect(offenders, `Use ease: EASE_OUT in: ${offenders.join(", ")}`).toEqual([]);
  });

  it("allows only the two published curves as inline bezier arrays", () => {
    // The app publishes EASE_OUT (enters) and EASE_IN (exits). A hand-typed
    // array is a second vocabulary even when it looks close; the committed
    // regression used [0.25, 0.8, 0.25, 1] on the header back button.
    const allowed = [EASE_OUT, EASE_IN].map((curve) => curve.join(","));
    const offenders = [];
    for (const file of files) {
      // The player owns its own motion model (IS_TOUCH paths, native controls),
      // so its chrome is deliberately outside the shared-chrome vocabulary.
      if (file.includes(`${join("components", "player")}`)) continue;
      const src = readFileSync(file, "utf8");
      for (const match of src.matchAll(/ease:\s*\[([^\]]+)\]/g)) {
        const nums = match[1].split(",").map((n) => Number(n.trim()));
        if (!allowed.includes(nums.join(","))) {
          offenders.push(`${file.replace(process.cwd(), "")}: [${match[1].trim()}]`);
        }
      }
    }
    expect(
      offenders,
      `Hand-typed easing arrays; import EASE_OUT/EASE_IN instead:\n${offenders.join("\n")}`
    ).toEqual([]);
  });
});

describe("every modal takes the shared shapes", () => {
  /* These three mounted and unmounted instantly: each returned null the moment
     its `open` prop went false, so there was no node left for AnimatePresence
     to animate out. AccountMenu is deliberately NOT in this list — it looks
     motionless in a grep because its framer usage lives one file away, in
     Popover, which already animates on SPRING.POPOVER. */
  const COLLECTION_DIALOGS = [
    join(process.cwd(), "src", "components", "CollectionPickerDialog.jsx"),
    join(process.cwd(), "src", "components", "overlays", "AddTitlesDialog.jsx"),
    join(process.cwd(), "src", "components", "overlays", "CollectionNameDialog.jsx"),
  ];

  it("finds all three collection dialogs", () => {
    expect(COLLECTION_DIALOGS.length).toBe(3);
    for (const f of COLLECTION_DIALOGS) expect(readFileSync(f, "utf8")).toBeTruthy();
  });

  describe("mobile modal motion", () => {
    it("centres animated panels with their flex overlay instead of a panel transform", () => {
      const confirm = readFileSync(join(process.cwd(), "src", "components", "ConfirmDialog.jsx"), "utf8");
      const shortcuts = readFileSync(join(process.cwd(), "src", "components", "GlobalShortcuts.jsx"), "utf8");
      const responsive = readFileSync(join(process.cwd(), "src", "styles", "responsive.css"), "utf8");

      expect(confirm).toMatch(/className="modal-overlay"[\s\S]*?alignItems:\s*"center"/);
      expect(confirm).not.toMatch(/transform:\s*"translate\(-50%,\s*-50%\)"/);
      expect(shortcuts).toMatch(/className="modal-overlay"/);
      const mobileModal = responsive.slice(responsive.indexOf(".modal-container {"));
      const mobileModalBlock = mobileModal.slice(0, mobileModal.indexOf("}"));
      expect(mobileModalBlock).not.toMatch(/transform:\s*none\s*!important/);
    });
  });

  it("takes the panel and scrim through MotionLeaf so a cut is unavoidable", () => {
    // The raw-token contract this replaced (import MODAL_PANEL, spread it) let
    // a call site satisfy the test while every transition ignored the viewer's
    // motion preference. MotionLeaf resolves that preference itself, so the
    // import plus the panel/scrim shapes is the assertion that matters now.
    for (const file of COLLECTION_DIALOGS) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toMatch(/import \{[^}]*MotionLeaf[^}]*\} from "[^"]*MotionLeaf"/);
      expect(src, file).toMatch(/transition=\{L\.Modal\.panel\.transition\}/);
      expect(src, file).toMatch(/exit=\{L\.Modal\.panelExit\}/);
      expect(src, file).toMatch(/<MotionFade/);
      expect(src, file).toMatch(/<AnimatePresence>/);
    }
  });

  it("stays mounted while closing so the exit can actually play", () => {
    // The subtle half of the fix: wrapping in AnimatePresence is worthless if
    // the component still returns null first. Each of these used to.
    for (const file of COLLECTION_DIALOGS) {
      const src = readFileSync(file, "utf8");
      expect(src, `${file} still bails out before AnimatePresence`).not.toMatch(
        /if \(!open[^)]*\) return null;/
      );
      // The guarded branch inside AnimatePresence: `{open && (` for the two
      // plain dialogs, `{open && movie &&` for the picker, which also needs the
      // movie before it can render a title.
      expect(src, file).toMatch(/<AnimatePresence>[\s\S]{0,160}?\{open &&/);
    }
  });

  it("does not animate a panel that CSS centres with a translate transform", () => {
    // The trap STAGE 5 documents: framer writes `transform` inline, so a
    // panel centred by `translate(-50%,-50%)` gets shoved off-axis while it
    // animates. These three centre with flexbox, so MODAL_PANEL is safe here;
    // assert that so a future switch to transform centring is caught.
    const css = readFileSync(join(process.cwd(), "src", "styles", "collections.css"), "utf8");
    const backdrop = css.slice(css.indexOf(".collection-dialog-backdrop"));
    const block = backdrop.slice(0, backdrop.indexOf("}"));
    expect(block).toMatch(/display:\s*flex/);
    expect(block).not.toMatch(/transform:\s*translate\(-50%/);
  });
});

describe("press feedback is one vocabulary", () => {
  const tokensCss = readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");
  // Comments quote the old values while explaining the change, so parse
  // declarations only — otherwise the test would happily read a number out of
  // a sentence describing why it was removed.
  const declarations = tokensCss.replace(/\/\*[\s\S]*?\*\//g, "");
  const cssRung = (name) => {
    const match = declarations.match(new RegExp(`--press-scale${name}:\\s*([\\d.]+)\\s*;`));
    if (!match) throw new Error(`tokens.css no longer declares --press-scale${name}`);
    return Number(match[1]);
  };

  /* Every `whileTap={...}` in app source, with the whole expression. Brace
     matching instead of a regex: the shapes are `{{...}}` and ternaries, so a
     single-brace pattern silently matches nothing. */
  function pressSites() {
    const files = walk(join(process.cwd(), "src")).filter((f) => !/[\\/]__tests__[\\/]/.test(f));
    const sites = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      let from = 0;
      for (;;) {
        const start = source.indexOf("whileTap={", from);
        if (start === -1) break;
        let depth = 0;
        let end = -1;
        for (let i = start + "whileTap=".length; i < source.length; i += 1) {
          if (source[i] === "{") depth += 1;
          else if (source[i] === "}") {
            depth -= 1;
            if (depth === 0) {
              end = i + 1;
              break;
            }
          }
        }
        if (end === -1) throw new Error(`${file}: unbalanced whileTap at ${start}`);
        sites.push({ file, body: source.slice(start, end), source });
        from = end;
      }
    }
    return sites;
  }

  const sites = pressSites();

  it("keeps the JS rungs equal to the CSS rungs", () => {
    // The stylesheet has published these three tiers since the player redesign.
    // A JS copy that drifts means a framer button and a CSS `:active` button
    // that sit next to each other sink by different amounts.
    expect(PRESS_SCALE).toEqual({
      ICON: cssRung("-icon"),
      CONTROL: cssRung(""),
      ROW: cssRung("-row"),
    });
  });

  it("orders the rungs by target size, all short of a full collapse", () => {
    expect(PRESS_SCALE.ICON).toBeLessThan(PRESS_SCALE.CONTROL);
    expect(PRESS_SCALE.CONTROL).toBeLessThan(PRESS_SCALE.ROW);
    expect(PRESS_SCALE.ROW).toBeLessThan(1);
    for (const value of Object.values(PRESS_SCALE)) expect(value).toBeGreaterThan(0.9);
  });

  it("finds the press sites, so the scan cannot pass by finding nothing", () => {
    expect(sites.length).toBeGreaterThanOrEqual(25);
  });

  it("lets no call site hand-type its own press scale", () => {
    // The eight literals this replaced (0.88, 0.9, 0.92, 0.93, 0.95, 0.96,
    // 0.97, 0.98) were each a small design decision nobody could find again.
    const offenders = sites
      .filter(({ body }) => /scale:\s*-?[\d.]/.test(body))
      .map(({ file, body }) => `${file.replace(process.cwd(), "")}: ${body.replace(/\s+/g, " ")}`);
    expect(offenders, `Hand-typed press scale: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("only names rungs that exist", () => {
    const used = new Set();
    for (const { body } of sites) {
      for (const match of body.matchAll(/PRESS_SCALE\.(\w+)/g)) used.add(match[1]);
    }
    const unknown = [...used].filter((name) => !(name in PRESS_SCALE));
    expect(unknown, `Unknown press rung: ${unknown.join(", ")}`).toEqual([]);
    expect(used.size, "No rung is used anywhere").toBeGreaterThan(0);
  });

  it("imports the rungs it names", () => {
    const users = new Set(sites.filter(({ body }) => body.includes("PRESS_SCALE.")).map(({ file }) => file));
    for (const file of users) {
      const source = readFileSync(file, "utf8");
      expect(source, `${file} names PRESS_SCALE without importing it`).toMatch(
        /import \{[^}]*\bPRESS_SCALE\b[^}]*\} from "[^"]*constants\/motion"/,
      );
    }
  });
});

describe("route variants let framer compose the transform", () => {
  /* framer builds `transform` from x/y/scale/translateZ. A variant that also
     carries `transform: "translateZ(0)"` wins the style write and silently
     drops the movement � verified in jsdom: the element rendered with only
     `translateZ(0)`, while `translateZ: 0` produced `translateY(10px)
     scale(0.995)`. Two route variants regressed this way, turning the app's
     most common pages into fades with no rise. */
  it("never sets a literal transform, which replaces x/y/scale", () => {
    for (const [variant, states] of Object.entries(ROUTE_VARIANTS)) {
      for (const [state, values] of Object.entries(states)) {
        expect(values, `${variant}.${state}`).not.toHaveProperty("transform");
      }
    }
  });

  it("keeps the movement each variant's name promises", () => {
    expect(ROUTE_VARIANTS["fade-up-subtle"].initial.y).toBeGreaterThan(0);
    expect(ROUTE_VARIANTS["fade-up"].initial.y).toBeGreaterThan(0);
    expect(ROUTE_VARIANTS["slide-right"].initial.x).toBeLessThan(0);
    expect(ROUTE_VARIANTS["slide-left"].initial.x).toBeGreaterThan(0);
    expect(ROUTE_VARIANTS["fade-up"].initial.scale).toBeLessThan(1);
    // crossfade holds a sliver of the outgoing page instead of a hard 0.
    expect(ROUTE_VARIANTS.crossfade.exit.opacity).toBeGreaterThan(0);
  });
});

describe("navigation moves one pill, never the dock", () => {
  /* The desktop dock is right-docked, so any active-state width change is a
     one-frame reflow of the whole island: 23px of nav shift used to land
     before the pill had moved a single pixel. The ink also crossfaded for
     0.3s, leaving the outgoing label black-on-glass and the incoming label
     white-on-white mid-flight. These guards pin the two fixes: (a) every tab
     is the same width whether active or not, (b) the ink is a blend against
     the pill, not a timed colour change. */
  const headerCss = readFileSync(join(process.cwd(), "src", "styles", "header.css"), "utf8");
  const responsiveCss = readFileSync(join(process.cwd(), "src", "styles", "responsive.css"), "utf8");
  const tokensCss = readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");
  const headerJsx = readFileSync(join(process.cwd(), "src", "app", "Header.jsx"), "utf8");
  const mobileJsx = readFileSync(join(process.cwd(), "src", "app", "MobileBottomNav.jsx"), "utf8");

  function block(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] || "";
  }

  it("keeps every desktop tab the same width in every active state", () => {
    const tab = block(headerCss, ".nav-link");
    expect(tab).toMatch(/font-weight:\s*600/);
    // Active used to bump 500 → 600 and reveal an icon (display:none → block),
    // widening the tab and reflowing the dock before the pill travelled.
    expect(block(headerCss, ".nav-link--active")).not.toMatch(/font-weight:/);
    expect(block(headerCss, ".nav-link--active")).not.toMatch(/padding:|gap:/);
    expect(block(headerCss, ".nav-link--home")).not.toMatch(/font-weight:/);
    expect(headerCss).not.toMatch(/\.nav-link-icon[^{]*\{[^}]*display:\s*none/);
  });

  it("keeps the ink in one place and lets difference resolve it over the pill", () => {
    expect(block(headerCss, ".nav-link")).toMatch(/mix-blend-mode:\s*difference/);
    expect(block(headerCss, ".nav-icon-btn")).toMatch(/mix-blend-mode:\s*difference/);
    // White is the source colour difference needs: over the white pill it
    // resolves to black, over the frosted track it stays near-white.
    expect(block(headerCss, ".nav-link--active")).toMatch(/color:\s*#ffffff/);
    expect(block(headerCss, ".nav-icon-btn--active")).toMatch(/color:\s*#ffffff/);
    // Opacity on the blended element would isolate it from the pill behind it;
    // the nav cluster must not create a stacking context either.
    expect(block(headerCss, ".nav-link")).not.toMatch(/opacity:/);
    expect(block(headerCss, ".nav-cluster")).not.toMatch(/z-index:/);
    expect(block(headerCss, ".nav-link--active")).not.toMatch(/color:\s*#000/);
  });

  it("drives the pill with one spring and leaves no CSS transition to fight it", () => {
    expect(headerJsx).toMatch(/<motion\.span[\s\S]{0,80}className="nav-active-pill"/);
    expect(headerJsx).toMatch(/transition=\{pillTransition\}/);
    expect(headerJsx).toMatch(/x:\s*SPRING\.LIFT/);
    expect(block(headerCss, ".nav-active-pill")).not.toMatch(/transition:/);
    expect(tokensCss).not.toMatch(/--nav-transition/);
  });

  it("slides the brand mark when the back button claims its space", () => {
    // The back button mounts inside the left island on every non-home route.
    // Without a layout animation the logo snapped ~52px right in the same
    // frame the route changed.
    expect(headerJsx).toMatch(/<motion\.div[\s\S]{0,120}layout[\s\S]{0,200}className="app-brand-link-wrap"/);
    expect(headerJsx).toMatch(/useReducedMotion/);
    expect(block(headerCss, ".app-brand-link-wrap")).toMatch(/display:\s*inline-flex/);
  });

  it("applies the same ink rule to the mobile bottom nav", () => {
    expect(block(responsiveCss, ".bottom-nav-item")).toMatch(/mix-blend-mode:\s*difference/);
    expect(block(responsiveCss, ".bottom-nav-item.active")).toMatch(/color:\s*#fff/);
    expect(responsiveCss).not.toMatch(/\.bottom-nav-item\.active svg\s*\{[^}]*color:\s*#000/);
    expect(mobileJsx).not.toMatch(/#000000/);
  });
});
