import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SPRING, DURATION, EASE_OUT, EASE_IN, HUD_POP, PILL_IN, FADE, MODAL_PANEL, PRESS_SCALE, motionSafe, DURATION_2, EASE_2 } from "../constants/motion";
import { ROUTE_VARIANTS } from "../constants/routeMotion";
import { RIVO_MOTION } from "../components/player/chrome/theme";
import { getRailScrollBehavior } from "../components/rails/MovieRail";

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

  it("exposes durations in ascending order with one shared easing curve", () => {
    expect(DURATION.FAST).toBeLessThan(DURATION.MED);
    expect(DURATION.MED).toBeLessThan(DURATION.SLOW);
    expect(EASE_OUT).toHaveLength(4);
    // The curve must start fast and settle slow, i.e. a decelerating ease-out.
    expect(EASE_OUT[0]).toBeLessThan(EASE_OUT[3]);
  });

  it("publishes one app duration scale, and RIVO's measured scale inside the player", () => {
    // Three scales used to coexist (motion.js 180/280/450, tokens.css
    // 150/250/400, player.css 150/300/500), so retuning motion.js changed
    // almost nothing on screen. The APP therefore reads tokens.css only.
    const tokens = readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");
    const player = readFileSync(join(process.cwd(), "src", "styles", "player.css"), "utf8");
    const ms = (src, name) => Number(src.match(new RegExp(`${name}:\\s*(\\d+)ms`))?.[1]);

    expect(ms(tokens, "--duration-normal")).toBe(DURATION.MED * 1000);
    expect(ms(tokens, "--duration-slow")).toBe(DURATION.SLOW * 1000);
    expect(ms(tokens, "--duration-fast")).toBe(DURATION.FAST * 1000);

    /* The player is the one surface allowed a scale of its own, by user order
       ("change our player to exactly like" rivo.st). rivo.st ships
       transition-duration .15s (x10) / .3s (x6) / .5s (x2) on
       cubic-bezier(.2,.8,.2,1) — measured from their stylesheet — and the
       player now uses exactly those. The cross-check against RIVO_MOTION keeps
       the CSS half and the framer half from drifting apart: retune the JS step
       and this test fails until the CSS matches. */
    expect(ms(player, "--zxc-t-instant")).toBe(RIVO_MOTION.MICRO.duration * 1000);
    expect(ms(player, "--zxc-t-fast")).toBe(RIVO_MOTION.MICRO.duration * 1000);
    expect(ms(player, "--zxc-t-med")).toBe(RIVO_MOTION.STANDARD.duration * 1000);
    expect(ms(player, "--zxc-t-slow")).toBe(RIVO_MOTION.SURFACE.duration * 1000);
    expect(player).toMatch(/--zxc-ease:\s*cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/);
    // tokens.css `--ease-tv` is RIVO's own curve, not Tailwind's default.
    expect(tokens).toMatch(/--ease-tv:\s*cubic-bezier\(0\.2, 0\.8, 0\.2, 1\)/);
  });

  describe("canonical streamly_2.0 vocabulary", () => {
    const tokens = readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");
    const cssMs = (name) => Number(tokens.match(new RegExp(`${name}:\\s*([\\d.]+)ms`))?.[1]);
    const cssEase = (name) =>
      tokens
        .match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]
        ?.replace(/\s+/g, "")
        .replace(/(^|[,(])\./g, "$10.");

    it("publishes the exact 2.0 duration scale in CSS and JS", () => {
      expect(cssMs("--dur-1")).toBe(220);
      expect(cssMs("--dur-2")).toBe(300);
      expect(cssMs("--dur-3")).toBe(400);
      expect(cssMs("--dur-4")).toBe(640);
      expect(cssMs("--dur-view")).toBe(620);
      expect(cssMs("--dur-poster")).toBe(780);
      expect(cssMs("--dur-nav")).toBe(520);
      expect(cssMs("--stagger")).toBe(55);
      expect(DURATION_2).toMatchObject({ STATE: 0.22, TAP: 0.3, REVEAL: 0.4, CONTENT: 0.64, VIEW: 0.62, POSTER: 0.78, NAV: 0.52 });
    });

    it("keeps the three exact 2.0 easing curves", () => {
      expect(cssEase("--ease-in-out")).toBe("cubic-bezier(0.4,0,0.2,1)");
      expect(cssEase("--sp")).toBe("cubic-bezier(0.34,1.25,0.64,1)");
      expect(cssEase("--ease")).toBe("cubic-bezier(0.22,1,0.36,1)");
      expect(EASE_2.IN_OUT).toEqual([0.4, 0, 0.2, 1]);
      expect(EASE_2.UI).toEqual([0.22, 1, 0.36, 1]);
      expect(EASE_2.SPRING).toEqual([0.34, 1.25, 0.64, 1]);
    });

    it("derives shimmer, hero rotation and detail dwell from the scale", () => {
      expect(tokens).toMatch(/--shimmer-duration:\s*1\.8s/);
      expect(tokens).toMatch(/--hero-rotate-duration:\s*9s/);
      expect(cssMs("--detail-b-duration")).toBe(640 + 55 * 6 + 120);
    });

    const src = (path) => readFileSync(join(process.cwd(), "src", ...path.split("/")), "utf8");
    const home = src("pages/HomePage.jsx");
    const browse = src("components/browse/BrowseBanner.jsx");
    const heroCss = src("styles/hero.css");
    // Home owns a scoped 2.0 layer; the legacy hero/grids files still serve
    // browse and detail, so the home contract reads home.css instead.
    const homeCss = src("styles/home.css");
    const card = src("components/home/HomeCard.jsx");
    const rail = src("components/home/HomeRail.jsx");
    const providerBrowse = src("components/rails/BrowseByProviderRail.jsx");
    const railArrow = rail;
    const railHook = src("hooks/useRailArrows.js");
    const railsCss = src("styles/rails.css");
    const skeletonCard = src("components/home/HomeSkeletonRail.jsx");
    const skeletonRail = skeletonCard;
    const skeletonCss = src("styles/skeleton.css");
    const providerPage = src("pages/ProviderPage.jsx");
    const providerCss = src("styles/provider.css");
    const header = src("app/Header.jsx");

    it("renders the canonical five-title hero with a 9s re-armable dwell", () => {
      expect(home).toMatch(/const HERO_LIMIT = 5;/);
      expect(home).toMatch(/const HERO_DWELL_MS = 9000;/);
      expect(home).toContain("return pool.slice(0, HERO_LIMIT);");
      expect(home).toMatch(/hero:\$\{heroScope\}:\$\{heroIndex\}:\$\{activeFeaturedMovie\.id\}/);
      expect(home).toContain('className="hbd"');
      expect(home).toContain('className="hx"');
      expect(home).toContain('className="dots glass hero-dots"');
      expect(home).toContain('aria-controls="hero-desc"');
      expect(home).toContain("new window.Image()");
      expect(browse).toMatch(/const BROWSE_DWELL_MS = 9000;/);
      expect(browse).toContain('className="hbd"');
      expect(browse).toContain('className="dots glass hero-dots hero-dots--apple hero-nav"');

      expect(heroCss).toMatch(/\.hero\.sw \.hbd,\s*\.hero\.sw \.hx\s*\{[^}]*opacity:\s*0/);
      expect(heroCss).toContain("animation: hbdKenBurns var(--hero-ken-burns-duration, 32s)");
      expect(heroCss).toContain("max-height: calc(3 * 1.5em)");
      expect(heroCss).toContain("max-height: var(--hdmax, 60em)");
      expect(heroCss).toContain("animation: dotlive 9s linear forwards");
      expect(heroCss).toContain("height: min(84vh, 760px) !important");
      expect(heroCss).toMatch(
        /@media \(max-width: 900px\)\s*\{\s*\.dots\.glass\.hero-dots\s*\{\s*display: flex !important;/,
      );
      expect(heroCss).toContain("width: 140px !important");

      expect(homeCss).toMatch(/\.home-page > \.hero\.sw \.hbd,\s*\.home-page > \.hero\.sw \.hx\s*\{[^}]*opacity:\s*0/);
      expect(homeCss).toContain("animation: homeHeroKenBurns var(--hero-ken-burns-duration, 32s) ease-in-out infinite alternate;");
      expect(homeCss).toContain("max-height: calc(3 * 1.5em)");
      expect(homeCss).toContain("max-height: var(--hdmax, 60em)");
      expect(homeCss).toContain("animation: homeDotProgress var(--hero-rotate-duration, 9s) linear forwards;");
      expect(homeCss).toContain("min-height: min(84vh, 760px) !important;");
      expect(homeCss).toMatch(
        /@media \(max-width: 820px\)\s*\{\s*\.home-page > \.hero\s*\{[^}]*display: block;/,
      );
      expect(homeCss).toMatch(
        /\.home-page > \.hero \.dots\.glass button\[aria-current="true"\]::after\s*\{[^}]*width: 28px;/,
      );
    });

    it("uses canonical card overlays with capped tilt and delayed play affordance", () => {
      expect(card).toContain('className={`cw home-card${wide ? " w" : ""}`}');
      expect(card).toContain('className={`po${wide ? " wd" : ""}`}');
      expect(card).toContain('className="qp glass"');
      expect(card).toContain('className={`qa${bump ? " bump" : ""}`}');
      expect(card).not.toContain("qa glass");
      expect(homeCss).toMatch(/\.home-rails-section \.qa\s*\{[^}]*background:\s*transparent;/);
      expect(homeCss).toMatch(/\.home-rails-section \.qa\s*\{[^}]*border:\s*0;/);
      expect(homeCss).toMatch(/\.home-rails-section \.qa\s*\{[^}]*border-radius:\s*50%;/);
      expect(card).toContain("${((0.5 - y) * 7).toFixed(2)}deg");
      expect(card).toContain("${((x - 0.5) * 7).toFixed(2)}deg");
      expect(card).toMatch(/setTimeout\(\(\) => \{[\s\S]{0,160}?classList\.add\("play-ready"\)[\s\S]{0,40}?\}, 320\)/);
      expect(card).toContain("data-detail-source={movie.id}");
      expect(card).toContain("data-detail-token={detailToken}");
      expect(card).not.toContain("showBelowMeta");
      expect(card).not.toContain("displayBelowMeta");
      expect(card).not.toContain('className="po-skeleton');
      expect(card).not.toContain('className="po-fallback');
      expect(card).not.toContain('className="po-tags');
      expect(card).not.toContain("<CountdownBadge");
      expect(card).toContain('data-initial={(movie.title || "?").trim().charAt(0).toUpperCase()}');
      expect(card).toContain('<span className="po-progress" aria-hidden="true" />');

      expect(homeCss).toContain("aspect-ratio: 2 / 3;");
      expect(homeCss).toContain("aspect-ratio: 16 / 9;");
      expect(homeCss).toMatch(/\.home-rails-section \.po:not\(\.wd\)\[data-loaded="true"\] b/);
      expect(homeCss).toContain("border-radius: 16px;");
      expect(homeCss).toContain("--s: 1.04;");
      expect(homeCss).toContain("--ty: -3px;");
      expect(homeCss).toContain("@media (hover: none)");
      expect(homeCss).toMatch(/\.home-rails-section \.cd > span\s*\{[^}]*font-size: 14px;/);
      expect(homeCss).toMatch(/\.home-rails-section \.cd > small\s*\{[^}]*font-size: 13px;/);
    });

    it("drives rail edge fades and six-card stagger from the canonical shell", () => {
      expect(rail).toContain('className="rail"');
      expect(card).toContain('className={`cw home-card${wide ? " w" : ""}`}');
      expect(card).toContain('style={{ "--i": Math.min(index, 5) }}');
      expect(railArrow).toContain('className="ar l glass"');
      expect(railArrow).toContain('className="ar r glass"');
      expect(railHook).toContain("syncEdges");
      expect(railHook).toContain('section.classList.toggle("at-start", atStart)');
      expect(railHook).toContain('section.classList.toggle("at-end", atEnd)');
      expect(railsCss).toContain("calc(min(var(--i), 6) * var(--stagger))");
      expect(railsCss).toContain("--fl: 0px;");
      expect(railsCss).toContain("mask-image: linear-gradient(90deg, transparent, #000 var(--fl)");
      expect(railsCss).toContain(".sh.at-start .ar.l");

      expect(providerBrowse).toContain('className="provider-icon-grid"');
      expect(providerBrowse).toContain('className="provider-icon"');
      expect(providerBrowse).toContain('data-initial={provider.name.charAt(0)}');
      expect(providerBrowse).toContain('style={{ "--i": Math.min(index, 6) }}');
      expect(providerBrowse).not.toContain("<li");
      expect(providerBrowse).not.toContain('provider-icon__art');
      expect(homeCss).toMatch(/\.home-rails-section \.provider-icon\s*\{[^}]*animation-name: homeProviderIconIn/);
      expect(homeCss).toContain("@keyframes homeProviderIconIn");
      expect(homeCss).toMatch(/\.home-rails-section \.provider-icon\s*\{[^}]*border-radius: 14px;/);
      expect(homeCss).toMatch(/\.home-rails-section \.provider-icon img\s*\{[^}]*object-fit: cover;/);
      expect(homeCss).toMatch(/\.home-rails-section \.rail-menu__menu\s*\{[^}]*animation-name: homeRailMenuIn/);
    });

    it("paints scene-coloured skeletons with the canonical card/rail shape", () => {
      expect(skeletonCard).toContain('className="cw sk-cw"');
      expect(skeletonCard).toContain('className="cd"');
      expect(skeletonCard).toContain('className="po sk"');
      expect(skeletonRail).toContain('className="sh in home-rail home-rail--skeleton"');
      expect(skeletonCss).toContain("animation: shimmer-wave var(--shimmer-duration) ease-in-out infinite");
      expect(skeletonCss).toMatch(/\.hbd\.sk\s*\{\s*--a: 212;\s*--b: 265;/);
      expect(skeletonCss).toMatch(/\.hero\[data-sk-scene="movies"\] \.hbd\.sk\s*\{\s*--a: 20;\s*--b: 350;/);
      expect(skeletonCss).toMatch(/\.hero\[data-sk-scene="series"\] \.hbd\.sk\s*\{\s*--a: 265;\s*--b: 320;/);
      expect(skeletonCss).toMatch(/\.hero\[data-sk-scene="list"\] \.hbd\.sk\s*\{\s*--a: 165;\s*--b: 210;/);
      expect(skeletonCss).toContain("animation: skhero-in var(--dur-content) var(--ease) backwards");
      expect(homeCss).toMatch(/\.home-rails-section \.sk-cw \.sk-ctitle\s*\{[^}]*display: block;/);
      expect(homeCss).toMatch(/\.home-rails-section \.sk-cw \.sk-cmeta\s*\{[^}]*display: block;/);
    });

    it("reuses canonical rails on every provider and removes both back affordances", () => {
      expect(providerPage).toContain('import HomeRail from "../components/home/HomeRail";');
      expect(providerPage).toContain('import HomeCard from "../components/home/HomeCard";');
      expect(providerPage).toContain('import HomeSkeletonRail from "../components/home/HomeSkeletonRail";');
      expect(providerPage).toContain('className="home-rails-section provider-rails-section"');
      expect(providerPage).toContain('className="home-rails-lead"');
      expect(providerPage).toMatch(/<HomeCard[\s\S]{0,240}wide/);
      expect(providerPage).toContain("const leadItems = activeItems.slice(0, 12);");
      expect(providerPage).toContain("const moreItems = activeItems.slice(12);");
      expect(providerPage).not.toContain("provider-back-btn");
      expect(providerPage).not.toContain("provider-grid");
      expect(providerPage).not.toContain("skeleton-grid");
      expect(providerPage).not.toContain("useNavigate");

      expect(header).toContain('const isProviderRoute = /^\\/provider(?:\\/|$)/.test(location.pathname);');
      expect(header).toMatch(/location\.pathname !== "\/"[\s\S]{0,160}!isProviderRoute/);

      expect(providerCss).not.toContain("provider-back-btn");
      expect(providerCss).not.toContain("provider-grid");
      expect(providerCss).not.toContain("@keyframes cardIn");
      expect(providerCss).toContain("animation: providerReveal var(--dur-content) var(--ease)");
      expect(providerCss).toContain("calc(var(--stagger) * 2)");
      expect(providerCss).toContain(".provider-rails-section {");
      expect(providerCss).toContain("@media (prefers-reduced-motion: reduce)");
      expect(providerCss).toContain('html[data-reduce-motion="true"] .provider-hero__logo');
    });
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
      (f) =>
        // Sibling imports from inside constants ("./motion") resolve to the
        // same token file — accepted alongside the explicit path spelling.
        !/(constants\/motion|from "\.\/motion")/.test(readFileSync(f, "utf8"))
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
  // read each coefficient as its own transition segment.
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
          const hasCurve = /ease|cubic-bezier|linear|steps\(|var\(--sp\)/.test(segment);
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

  it("keeps every tween on the published duration scale and easing", () => {
    // The sweep closed the loopholes the two tests above missed: string
    // shorthand transitions (`transition: "opacity 0.3s ease"`) and the
    // `ease: "easeInOut"` keyword never reached the object-shape audit, and
    // typed numeric durations (`duration: 0.35`) bypassed the CSS-scale check
    // entirely. All three are drift from the one published vocabulary. Only
    // transition objects are audited here, so autoplay/marquee timings that
    // legitimately ride `repeat` are left alone.
    const offenders = [];
    for (const file of files) {
      if (file.includes(`${join("components", "player")}`)) continue;
      const src = readFileSync(file, "utf8");
      for (const block of transitionObjects(src)) {
        const own = ownProps(block);
        const duration = own.match(/duration\s*:\s*([^,}]+)/);
        if (duration) {
          const raw = duration[1].trim();
          const numeric = /^\d+(\.\d+)?$/.test(raw);
          if (numeric) {
            const value = Number(raw);
            const isZero = value === 0;
            const isToken = [DURATION.FAST, DURATION.MED, DURATION.SLOW].includes(value);
            if (!isZero && !isToken) offenders.push(`${file.replace(process.cwd(), "")}: ${raw}`);
          }
        }
        const easeKeyword = own.match(/ease\s*:\s*"([^"]*)"/);
        if (easeKeyword) offenders.push(`${file.replace(process.cwd(), "")}: ${easeKeyword[0]}`);
      }
      for (const match of src.matchAll(/transition\s*(?::|=)\s*"([^"]*)"/g)) {
        if (!/var\(--/.test(match[1])) offenders.push(`${file.replace(process.cwd(), "")}: ${match[0]}`);
      }
    }
    expect(
      offenders,
      `Untokenised framer motion (string shorthand, ease keyword, typed duration):\n${offenders.join("\n")}`
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

describe("route planes arrive as one clean fade", () => {
  /* framer builds `transform` from x/y/scale/translateZ. A variant that also
     carries `transform: "translateZ(0)"` wins the style write and silently
     drops the movement — verified in jsdom. The 2026-11-11 user order removed
     the directional rail (a ±44px x-slide with y/scale depth): it read as the
     whole screen tilting sideways every time a route's data landed. Every
     route now enters and exits on opacity alone; variants are plain objects
     resolved through the same clean-shape guard. */
  const resolve = (state) => (typeof state === "function" ? state(1) : state);

  it("never sets a literal transform, which replaces x/y/scale", () => {
    for (const [variant, states] of Object.entries(ROUTE_VARIANTS)) {
      for (const [state, values] of Object.entries(states)) {
        expect(resolve(values), `${variant}.${state}`).not.toHaveProperty("transform");
      }
    }
  });

  it("fades the plane in place — no directional travel on any route", () => {
    for (const [variant, states] of Object.entries(ROUTE_VARIANTS)) {
      const enter = resolve(states.initial);
      const exit = resolve(states.exit);
      expect(enter, `${variant}.initial`).toHaveProperty("opacity", 0);
      expect(enter, `${variant}.initial`).not.toHaveProperty("x");
      expect(enter, `${variant}.initial`).not.toHaveProperty("y");
      expect(enter, `${variant}.initial`).not.toHaveProperty("scale");
      expect(exit, `${variant}.exit`).not.toHaveProperty("x");
      expect(exit, `${variant}.exit`).not.toHaveProperty("y");
      expect(exit, `${variant}.exit`).not.toHaveProperty("scale");
      // The leaving ghost must not swallow the click that navigated.
      expect(exit, `${variant}.exit`).toHaveProperty("pointerEvents", "none");
      // Returning to a route before its exit finishes must restore pointerEvents.
      expect(enter, `${variant}.initial`).toHaveProperty("pointerEvents", "auto");
      expect(resolve(states.animate), `${variant}.animate`).toHaveProperty("pointerEvents", "auto");
    }
    // crossfade holds a sliver of the outgoing page instead of a hard 0.
    expect(ROUTE_VARIANTS.crossfade.exit.opacity).toBeGreaterThan(0);
  });
});

describe("2.0 shell: one bottom pill and one expanding search", () => {
  const headerCss = readFileSync(join(process.cwd(), "src", "styles", "header.css"), "utf8");
  const responsiveCss = readFileSync(join(process.cwd(), "src", "styles", "responsive.css"), "utf8");
  const searchCss = readFileSync(join(process.cwd(), "src", "styles", "search.css"), "utf8");
  const discoveryCss = readFileSync(join(process.cwd(), "src", "styles", "discovery.css"), "utf8");
  const motionThemesCss = readFileSync(join(process.cwd(), "src", "styles", "motion-themes.css"), "utf8");
  const tokensCss = readFileSync(join(process.cwd(), "src", "styles", "tokens.css"), "utf8");
  const headerJsx = readFileSync(join(process.cwd(), "src", "app", "Header.jsx"), "utf8");
  const mobileJsx = readFileSync(join(process.cwd(), "src", "app", "MobileBottomNav.jsx"), "utf8");
  const searchPageJsx = readFileSync(join(process.cwd(), "src", "pages", "SearchPage.jsx"), "utf8");
  const layoutJsx = readFileSync(join(process.cwd(), "src", "app", "Layout.jsx"), "utf8");

  function block(css, selector) {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] || "";
  }

  it("renders the frozen four-item pill at every width with one shared pill", () => {
    expect(mobileJsx).toMatch(/id="tb"/);
    expect(mobileJsx).toMatch(/className=\{`tb glass mobile-bottom-nav/);
    expect(mobileJsx).toMatch(/NAV_ITEMS\.map/);
    expect(mobileJsx).toMatch(/data-v=\{item\.id\}/);
    expect(mobileJsx).toMatch(/aria-current=\{active \? "page"/);
    expect(mobileJsx).toMatch(/<span id="pill" aria-hidden="true" \/>/);
    expect(mobileJsx).not.toMatch(/Search|Settings|useOptionalNotifications/);
    expect(responsiveCss).not.toMatch(/\.mobile-bottom-nav\s*\{[^}]*display:\s*none/);
    expect(searchCss).not.toMatch(/\.mobile-bottom-nav\s*\{[^}]*display:\s*none/);
    expect(discoveryCss).not.toMatch(/\.mobile-bottom-nav[^}]*scale:/);
  });

  it("uses the canonical pill geometry, timing and navwave/sheen choreography", () => {
    const nav = block(headerCss, ".tb");
    expect(nav).toMatch(/bottom:\s*18px/);
    expect(nav).toMatch(/margin-bottom:\s*env\(safe-area-inset-bottom/);
    expect(nav).toMatch(/gap:\s*4px/);
    expect(nav).toMatch(/padding:\s*5px/);
    expect(nav).toMatch(/border-radius:\s*22px/);

    const link = block(headerCss, ".tb a");
    expect(link).toMatch(/min-width:\s*clamp\(62px, 7vw, 86px\)/);
    expect(link).toMatch(/min-height:\s*42px/);
    expect(link).toMatch(/border-radius:\s*18px/);
    expect(link).toMatch(/font-size:\s*11px/);
    expect(block(headerCss, ".tb a[aria-current=\"page\"]")).toMatch(/color:\s*var\(--ui-tint\)/);

    const pill = block(headerCss, "#pill");
    expect(pill).toMatch(/top:\s*5px/);
    expect(pill).toMatch(/bottom:\s*5px/);
    expect(pill).toMatch(/transform:\s*translateX\(var\(--pill-x/);
    expect(pill).toMatch(/width:\s*var\(--pill-w/);
    expect(pill).toMatch(/transform var\(--dur-nav\) var\(--sp\)/);
    expect(pill).toMatch(/width var\(--dur-nav\) var\(--sp\)/);
    expect(block(headerCss, ".tb.go #pill::after")).toMatch(
      /animation:\s*pillsheen var\(--dur-nav\) var\(--ease\)/,
    );
    expect(block(headerCss, ".tb.back #pill::after")).toMatch(
      /animation:\s*pillsheen-back var\(--dur-nav\) var\(--ease\)/,
    );
    expect(block(headerCss, ".tb a.wave")).toMatch(
      /animation:\s*navwave var\(--dur-nav\) var\(--sp\)/,
    );
    expect(headerCss).toMatch(/@keyframes navwave[\s\S]*?translateY\(-3px\) scale\(1\.05\)/);
    expect(block(headerCss, ".tb.sc a")).toMatch(/min-height:\s*36px/);

    expect(mobileJsx).toMatch(/DURATION_2\.NAV/);
    expect(mobileJsx).toMatch(/--pill-x/);
    expect(mobileJsx).toMatch(/--pill-w/);
    expect(mobileJsx).toMatch(/active\.offsetLeft/);
    expect(mobileJsx).toMatch(/active\.offsetWidth/);
    expect(mobileJsx).not.toMatch(/activeRect\.width/);
    expect(mobileJsx).toMatch(/runNavWave/);
    expect(mobileJsx).toMatch(/useLayoutEffect/);
    expect(mobileJsx).toMatch(/data-pill-moving/);
    expect(mobileJsx).toMatch(/prefReduceMotion/);
    expect(headerCss).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.tb a\.wave/);
  });

  it("expands the top-right search with the canonical glass and a 250ms debounce", () => {
    const search = block(headerCss, ".sq.glass");
    expect(search).toMatch(/position:\s*fixed/);
    expect(search).toMatch(/top:\s*14px/);
    expect(search).toMatch(/margin-top:\s*env\(safe-area-inset-top/);
    expect(search).toMatch(/right:\s*clamp\(14px, 3vw, 40px\)/);
    expect(search).toMatch(/width:\s*44px/);
    expect(search).toMatch(/height:\s*44px/);
    expect(search).toMatch(/width var\(--dur-3\) var\(--ease\)/);
    expect(search).toMatch(/backdrop-filter:\s*blur\(28px\) saturate\(190%\)/);
    expect(headerCss).toMatch(
      /\.sq\.glass:focus-within,\s*\.sq\.glass\.has\s*\{[^}]*width:\s*min\(280px, calc\(100vw - 28px\)\)/,
    );
    expect(headerCss).toMatch(/\.sq\.glass\.loading::after/);
    expect(headerCss).toMatch(/conic-gradient\(var\(--ui-label-2\)/);

    expect(headerJsx).toMatch(/const SEARCH_DEBOUNCE_MS = 250/);
    expect(headerJsx).toMatch(/className=\{`sq glass shell-search/);
    expect(headerJsx).toMatch(/shellDebounceRef\.current = window\.setTimeout/);
    expect(headerJsx).toMatch(/source: "shell"/);
    expect(headerJsx).toMatch(/streamly:search-focus/);
    expect(headerJsx).toMatch(/metaKey \|\| event\.ctrlKey/);
    expect(headerJsx).not.toMatch(/<kbd/);

    expect(searchPageJsx).toMatch(/\}, 250\);/);
    expect(searchPageJsx).toMatch(/event\.detail\?\.source === "shell"/);
    expect(searchPageJsx).toMatch(/shellSearchHasFocus/);
    expect(searchPageJsx).toMatch(/autoFocus=\{!isTouchDevice && !shellSearchHasFocus\(\)\}/);
    expect(layoutJsx).toMatch(/active\?\.closest\?\.\("\.sq"\)/);
  });

  it("keeps search/settings/account reachable without a desktop nav link strip", () => {
    expect(headerJsx).toContain("<NotificationCenter />");
    expect(headerJsx).toContain("shell-utility-cluster");
    expect(headerJsx).toContain("toggleAccountMenu");
    expect(headerCss).toMatch(/\.header-row\.shell-search-open \.shell-utility-cluster/);
    expect(headerCss).toMatch(/@media \(max-width: 639px\)[\s\S]*?\.shell-search-open \.shell-utility-cluster/);
    expect(headerCss).toMatch(
      /@media \(max-width: 639px\)[\s\S]*?\.shell-search-open \.header-brand-cluster\s*\{[^}]*visibility:\s*hidden/,
    );
    expect(headerJsx).not.toMatch(/NAV_ITEMS\.map/);
    expect(headerCss).not.toMatch(/\.nav-link\s*\{/);
    expect(headerCss).not.toMatch(/\.nav-active-pill/);
  });

  it("moves the hidden nav/search View Transition snapshots onto the 2.0 surfaces", () => {
    expect(motionThemesCss).toMatch(/\.tb\s*\{\s*view-transition-name:\s*navbar;/);
    expect(motionThemesCss).toMatch(/\.sq\s*\{\s*view-transition-name:\s*searchbar;/);
    expect(motionThemesCss).not.toMatch(/\.header-row\s*\{\s*view-transition-name/);
    expect(motionThemesCss).toContain("::view-transition-old(navbar)");
    expect(motionThemesCss).toContain("::view-transition-old(searchbar)");
  });

  it("slides the brand mark when the back button claims its space", () => {
    // The back button mounts inside the left cluster on every non-home route.
    // Without a layout animation the logo snapped ~52px right in the same
    // frame the route changed.
    expect(headerJsx).toMatch(/<motion\.div[\s\S]{0,120}layout[\s\S]{0,200}className="app-brand-link-wrap"/);
    expect(headerJsx).toMatch(/useReducedMotion/);
    expect(block(headerCss, ".app-brand-link-wrap")).toMatch(/display:\s*inline-flex/);
  });

  it("keeps mobile hero and browse banners full-bleed with symmetric negative margin", () => {
    expect(responsiveCss).toMatch(/margin-left:\s*-50vw\s*!important/);
    expect(responsiveCss).not.toMatch(/margin-left:\s*calc\(50%\s*-\s*50vw\)/);
    expect(tokensCss).toMatch(/--radius-pill:\s*9999px/);
  });
});


describe("horizontal rail scroll respects reduced motion", () => {
  it("keeps smooth scrolling when neither preference requests reduced motion", () => {
    expect(getRailScrollBehavior()).toBe("smooth");
    expect(getRailScrollBehavior({ appReducedMotion: false, systemReducedMotion: false })).toBe("smooth");
  });

  it("uses an immediate scroll when the in-app preference is enabled", () => {
    expect(getRailScrollBehavior({ appReducedMotion: true })).toBe("auto");
  });

  it("uses an immediate scroll when the operating system requests reduced motion", () => {
    expect(getRailScrollBehavior({ systemReducedMotion: true })).toBe("auto");
  });

  it("uses an immediate scroll when both preferences request reduced motion", () => {
    expect(getRailScrollBehavior({ appReducedMotion: true, systemReducedMotion: true })).toBe("auto");
  });
});
