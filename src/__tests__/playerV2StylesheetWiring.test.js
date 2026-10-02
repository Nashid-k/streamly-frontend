import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "..");

function jsFilesIn(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...jsFilesIn(full));
    else if (/\.jsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * The v2 stylesheet must be reachable from runtime code.
 *
 * Every other v2 CSS test reads `player/v2/player.css` off disk with
 * `readFileSync` and asserts rules exist. That is the right way to test
 * *declarations* and a completely wrong way to test *delivery*: a file full of
 * correct rules that no module imports never reaches the browser, and every
 * declaration test still passes. That is exactly what shipped - the v2 player
 * rendered with zero styles because `styles/player.css` (the legacy sheet, the
 * only one main.jsx imports) has no `.pv2-` rules in it.
 */
describe("v2 player stylesheet is actually shipped", () => {
  it("is imported by at least one runtime module", () => {
    // Matched on the resolved target, not the literal string: the shell imports
    // it relatively (`./player.css`), so requiring the full path would pass only
    // for an import style this codebase does not use.
    const V2 = join(SRC, "components/player/v2");
    const importers = jsFilesIn(V2).filter((file) =>
      /import\s+["'][^"']*player\.css["']/.test(readFileSync(file, "utf8")),
    );
    expect(importers.map((f) => f.slice(SRC.length + 1))).not.toHaveLength(0);
  });

  it("is imported by the module that renders the shell", () => {
    // Not "somewhere" - colocated with the component, so it rides the lazy chunk
    // instead of loading for viewers who never open a player.
    const shell = readFileSync(join(SRC, "components/player/v2/PlayerShell.jsx"), "utf8");
    expect(shell).toMatch(/import\s+["']\.\/player\.css["']/);
  });

  it("is not imported by main.jsx, which would defeat lazy loading", () => {
    const main = readFileSync(join(SRC, "main.jsx"), "utf8");
    expect(main).not.toMatch(/player\/v2\/player\.css/);
  });
});