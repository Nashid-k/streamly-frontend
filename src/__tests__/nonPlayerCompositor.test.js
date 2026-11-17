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

    expect(card).not.toMatch(/backface-visibility|translateZ\\(0\\)/);
  });

  it("does not force idle glass buttons onto their own compositor layers", () => {
    const css = read("src/styles/buttons.css");
    const glassButton = rule(css, ".btn-glass");

    expect(glassButton).not.toMatch(/translateZ\\(0\\)/);
  });

  it("keeps route-plane promotion scoped to the active opacity transition", () => {
    const layout = read("src/app/Layout.jsx");

    expect(layout).not.toMatch(/backfaceVisibility:/);
    expect(layout).not.toMatch(/WebkitBackfaceVisibility:/);
    expect(layout).not.toMatch(/transform:\\s*"translateZ\\(0\\)"/);
  });
});
