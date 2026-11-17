import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
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

  it("does not force a 3D layer on every pending rail reveal", () => {
    const css = read("src/styles/rails.css");
    const reveal = rule(css, ".fade-in-section");

    expect(reveal).not.toMatch(/backface-visibility|translateZ/);
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
