import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const read = (path) => readFileSync(join(process.cwd(), path), "utf8");

function rule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
}

describe("non-player compositor budget", () => {
  it("does not force a permanent layer on every movie card", () => {
    const css = read("src/styles/grids.css");
    const card = rule(css, ".movie-card");

    expect(card).not.toMatch(/backface-visibility|translateZ\(0\)/);
  });

  it("does not force idle glass buttons onto their own compositor layers", () => {
    const css = read("src/styles/buttons.css");
    const glassButton = rule(css, ".btn-glass");

    expect(glassButton).not.toMatch(/translateZ\(0\)/);
  });

  it("keeps route-plane promotion scoped to the active opacity transition", () => {
    const layout = read("src/app/Layout.jsx");

    expect(layout).not.toMatch(/backfaceVisibility:/);
    expect(layout).not.toMatch(/WebkitBackfaceVisibility:/);
    expect(layout).not.toMatch(/transform:\s*"translateZ\(0\)"/);
  });
  it("keeps ambient wrapper and blob promotion tied to the actual animation", () => {
    const css = read("src/styles/hero.css");
    const stage = rule(css, ".ambient-liquid");
    const blob = rule(css, ".ambient-liquid__blob");

    expect(stage).not.toMatch(/translateZ\(0\)|translate3d\(0,\s*0,\s*0\)|backface-visibility/);
    expect(blob).not.toMatch(/translateZ\(0\)|translate3d\(0,\s*0,\s*0\)|backface-visibility/);
    expect(css).toContain("@keyframes ambient-blob-a");
  });

  it("does not use Tailwind's all-property transition utility outside the player", () => {
    // Tailwind's all-property transition animates paint-only properties too —
    // the JSX counterpart of the `transition: all` declarations the compositor
    // diet removed from CSS. Built from parts so Tailwind's scanner, which
    // reads this file, does not emit the utility into the bundle. Player
    // chrome is out of scope.
    const banned = ["transition", "all"].join("-");
    const pattern = new RegExp(`\\b${banned}\\b`);
    const offenders = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (entry.name === "player" || entry.name === "__tests__") continue;
          walk(join(dir, entry.name));
        } else if (/\.(jsx|js)$/.test(entry.name)) {
          const file = join(dir, entry.name);
          if (pattern.test(readFileSync(file, "utf8"))) {
            offenders.push(file.slice(process.cwd().length + 1));
          }
        }
      }
    };
    walk(join(process.cwd(), "src"));

    expect(offenders).toEqual([]);
  });

  it("uses explicit properties for non-player interactive transitions", () => {
    const paths = [
      "src/pages/HistoryPage.jsx",
      "src/components/ConfirmDialog.jsx",
      "src/pages/PersonDetailsPage.jsx",
      "src/pages/WatchlistPage.jsx",
      "src/pages/TitleDetailsPage.jsx",
    ];

    for (const path of paths) {
      expect(read(path), path).not.toMatch(/transition:\s*["']all\b/);
    }
  });

  it("keeps the Home hero parent fade-only while CSS staggers its children", () => {
    const home = read("src/pages/HomePage.jsx");
    const content = home.slice(home.indexOf('key={activeFeaturedMovie.id + "-content"}'));
    const parentMotion = content.slice(0, content.indexOf("</motion.div>"));

    expect(parentMotion).toMatch(/initial=\{\{ opacity: 0 \}\}/);
    expect(parentMotion).toMatch(/animate=\{\{ opacity: 1 \}\}/);
    expect(parentMotion).toMatch(/exit=\{\{ opacity: 0 \}\}/);
    expect(parentMotion).not.toMatch(/\by:\s*(?:18|0)\b/);
    expect(read("src/styles/hero.css")).toContain("animation: heroReveal 0.48s");
  });

  it("keeps poster artwork visible beneath the hover affordance", () => {
    const css = read("src/styles/grids.css");
    const card = read("src/components/MovieCard.jsx");
    const hover = css.match(/\.movie-card:hover\s*\{([^}]*)\}/)?.[1] ?? "";
    const poster = css.match(/\.movie-card:hover \.movie-poster\s*\{([^}]*)\}/)?.[1] ?? "";
    const focus = css.match(/\.movie-card:focus-visible \.poster-wrapper\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(hover).toContain("transform: scale(1.035);");
    expect(poster).toContain("filter: brightness(0.78);");
    expect(poster).toContain("transform: scale(1.02);");
    expect(card).toContain('background: "rgba(0, 0, 0, 0.28)"');
    expect(focus).toContain("outline: 2px solid var(--focus-ring-color);");
  });

  it("keeps hero reveal stagger short and transform/opacity based", () => {
    const css = read("src/styles/hero.css");

    expect(css).toContain("animation: heroReveal 0.48s");
    expect(css).toContain("nth-child(5) { animation-delay: 0.30s; }");
  });

  it("does not permanently promote static non-player overlays and panels", () => {
    const checks = [
      ["src/styles/hero.css", ".ambient-backdrop-img"],
      ["src/styles/hero.css", ".hero-circle-btn"],
      ["src/styles/auth.css", ".auth-dialog"],
      ["src/styles/modals.css", ".title-info-card"],
      ["src/styles/search.css", ".search-suggest"],
      ["src/styles/collections.css", ".collection-dialog"],
      ["src/styles/discovery.css", ".discovery-menu"],
    ];

    for (const [path, selector] of checks) {
      expect(rule(read(path), selector), selector).not.toMatch(/translateZ\(0\)|translate3d\(0,\s*0,\s*0\)|backface-visibility/);
    }
  });

  it("keeps poster artwork visible beneath the hover affordance", () => {
    const css = read("src/styles/grids.css");
    const card = read("src/components/MovieCard.jsx");
    const hover = css.match(/\.movie-card:hover\s*\{([^}]*)\}/)?.[1] ?? "";
    const poster = css.match(/\.movie-card:hover \.movie-poster\s*\{([^}]*)\}/)?.[1] ?? "";
    const focus = css.match(/\.movie-card:focus-visible \.poster-wrapper\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(hover).toContain("transform: scale(1.035);");
    expect(poster).toContain("filter: brightness(0.78);");
    expect(poster).toContain("transform: scale(1.02);");
    expect(card).toContain('background: "rgba(0, 0, 0, 0.28)"');
    expect(focus).toContain("outline: 2px solid var(--focus-ring-color);");
  });

  it("does not force a 3D layer on every pending rail reveal", () => {
    const css = read("src/styles/rails.css");
    const reveal = rule(css, ".fade-in-section");

    expect(reveal).not.toMatch(/backface-visibility|translateZ/);
  });

  it("keeps mobile rails free-scrolling and aligned to the shared content gutter", () => {
    const css = read("src/styles/responsive.css");
    const mobileStyles = css.slice(css.indexOf("/* Movie Rails */"));
    const mobile = mobileStyles.match(/\.movie-rail\s*\{([^}]*)\}/)?.[1] ?? "";
    const mobileItems = mobileStyles.match(/\.movie-rail > \*\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(mobile).toContain("scroll-snap-type: x proximity;");
    expect(mobile).toContain("scroll-padding-left: var(--gutter, 24px);");
    expect(mobile).not.toContain("scroll-snap-type: x mandatory;");
    expect(mobileItems).not.toContain("scroll-snap-stop: always;");
  });

  it("keeps title-detail playback primary and ratings in a supporting mobile row", () => {
    const page = read("src/pages/TitleDetailsPage.jsx");
    const css = read("src/styles/grids.css");
    const actionStart = page.indexOf("details-hero__actions");
    const actionEnd = page.indexOf("{unreleased && (", actionStart);
    const actions = page.slice(actionStart, actionEnd);
    const mobileStart = css.lastIndexOf("@media (max-width: 639px)");
    const mobile = css.slice(mobileStart);

    expect(actions).toContain("details-hero__play");
    expect(actions).toContain("details-hero__quick-actions");
    expect(actions).toContain("details-hero__ratings");
    expect(mobile).toContain("grid-template-columns: minmax(0, 1fr) auto;");
    expect(mobile).toContain("grid-column: 1 / -1;");
    expect(mobile).toContain("min-height: 48px;");
  });

  it("reserves high fetch priority for the first hero slide and its logo", () => {
    const home = read("src/pages/HomePage.jsx");
    const browse = read("src/components/browse/BrowseBanner.jsx");
    const logo = read("src/components/HeroTitleLogo.jsx");

    expect(home).toContain('fetchPriority={featuredIndex === 0 ? "high" : "auto"}');
    expect(browse).toContain('fetchPriority={index === 0 ? "high" : "auto"}');
    expect(home).toContain('<HeroTitleLogo movie={activeFeaturedMovie} fetchPriority={featuredIndex === 0 ? "high" : "auto"} />');
    expect(browse).toContain('<HeroTitleLogo movie={active} fetchPriority={index === 0 ? "high" : "auto"} />');
    expect(logo).toContain('fetchPriority = "auto"');
  });

});
