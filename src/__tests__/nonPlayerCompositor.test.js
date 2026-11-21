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

  it("keeps poster artwork visible beneath the hover affordance without filter rasterisation", () => {
    const css = read("src/styles/grids.css");
    const card = read("src/components/MovieCard.jsx");
    const hover = css.match(/\.movie-card:hover\s*\{([^}]*)\}/)?.[1] ?? "";
    const poster = css.match(/\.movie-card:hover \.movie-poster\s*\{([^}]*)\}/)?.[1] ?? "";
    const focus = css.match(/\.movie-card:focus-visible \.poster-wrapper\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(hover).toContain("transform: scale(1.035);");
    expect(poster).not.toMatch(/filter:/);
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

  it("enforces zero live blur in player stage, masked hero shade, and animating hero controls", () => {
    const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(read("src/components/player/chrome/primitives.jsx")).not.toMatch(/blur\(28px\)/);
    expect(stripComments(rule(read("src/styles/grids.css"), ".details-hero__shade"))).not.toMatch(/backdrop-filter/);
    expect(stripComments(rule(read("src/styles/hero.css"), ".hero-eyebrow-tag"))).not.toMatch(/backdrop-filter/);
    expect(stripComments(rule(read("src/styles/hero.css"), ".hero-action-pill"))).not.toMatch(/backdrop-filter/);
    expect(stripComments(rule(read("src/styles/hero.css"), ".hero-circle-btn"))).not.toMatch(/backdrop-filter/);
    expect(stripComments(rule(read("src/styles/header.css"), ".nav-active-pill"))).not.toMatch(/will-change/);
    expect(stripComments(rule(read("src/styles/discovery.css"), ".random-btn"))).not.toMatch(/max-width/);
    expect(stripComments(rule(read("src/styles/motion-themes.css"), ".motion-backdrop__layer"))).not.toMatch(/backface-visibility/);
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

  it("matches skeleton geometry to the live hero and rail card sizes", () => {
    const css = read("src/styles/skeleton.css");
    const hero = rule(css, ".skeleton-hero");
    const railItem = rule(css, ".skeleton-rail > div");

    expect(hero).toContain("height: min(78vh, 850px);");
    expect(hero).toContain("min-height: 480px;");
    expect(hero).toContain("max-height: 850px;");
    expect(railItem).toContain("width: 200px;");
  });

  it("morphs a card into the 1.0 hero backdrop and restores its rail position", () => {
    const css = read("src/styles/motion-themes.css");
    const hook = read("src/hooks/useDetailView.jsx");
    const tokens = read("src/styles/tokens.css");
    const layout = read("src/app/Layout.jsx");
    const card = read("src/components/MovieCard.jsx");
    const rail = read("src/components/rails/MovieRail.jsx");
    const skeleton = read("src/components/MovieDetailsSkeleton.jsx");
    const scroll = read("src/hooks/useScrollRestoration.js");

    expect(tokens).toContain("--vt-root-duration: 620ms;");
    expect(tokens).toContain("--vt-poster-duration: 780ms;");
    expect(tokens).toContain("--vt-view-ease: cubic-bezier(0.4, 0, 0.2, 1);");
    expect(tokens).toContain("--detail-b-duration: 1090ms;");
    expect(read("src/styles/skeleton.css")).toContain("animation: shimmer-wave 1.8s");
    expect(css).toContain(".detail-transition-overlay");
    expect(css).toContain('html[data-detail-transition]::view-transition-old(root)');
    expect(css).toContain('html[data-detail-transition]::view-transition-new(root)');
    expect(css).toContain(".detail-transition-overlay .detail-transition-hero");
    expect(css).not.toContain(".detail-transition-overlay .details-poster-large");
    expect(css).toContain("::view-transition-old(streamly-poster)");
    expect(css).toContain("object-fit: cover");
    expect(css).toContain("::view-transition-old(navbar)");
    expect(css).toContain("::view-transition-old(searchbar)");
    expect(hook).toContain("runForwardDetailTransition");
    expect(hook).toContain("runReverseDetailTransition");
    expect(hook).toContain("function capturePlace");
    expect(hook).toContain("function restorePlace");
    expect(hook).toContain("useDetailPopGuard");
    expect(hook).toContain("document.startViewTransition");
    expect(layout).toContain("detailTransition.overlay");
    expect(layout).toContain("detailTransition.bypass");
    expect(card).toContain("data-detail-source={movie.id}");
    expect(card).toContain("data-detail-token={detailToken}");
    expect(rail).toContain("data-detail-rail={category.name}");
    expect(rail).toContain("detailToken={`${category.name}:${index}:${movie.id}`}");
    expect(rail).toContain("window.__streamlyDetailScrollRestored");
    expect(skeleton).toContain("detail-transition-hero--fit");
    expect(scroll).toContain("window.__streamlyDetailScrollRestored");
  });

});
