import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it, expect } from "vitest";

/* Guards the layering contract in src/styles/tokens.css.

 * Two failure modes, both silent in a browser and invisible to every component
 * test (jsdom does not compute paint order):
 *
 *   1. Two rungs of the ladder collide, so which surface wins depends on DOM
 *      order — this is how a toast once ended up behind a dialog's buttons.
 *   2. A component invents its own large number instead of using a rung, which
 *      is how the app ended up with seven competing "above everything" values
 *      (9998, 9999, 10000, 10010, 99999, 100000, 999999).
 *
 * The scan is deliberately mechanical: any literal z-index at or above the
 * overlay rung, anywhere outside the ladder definition itself, is a bug. */

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const TOKENS = join(SRC, "styles", "tokens.css");
// Below the overlay rung (8000) page-level layering is local: a card over its
// poster, chrome over a video frame. Those are stacking contexts, not layers.
const OVERLAY_FLOOR = 8000;

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function ladder() {
  const css = readFileSync(TOKENS, "utf8");
  const rungs = {};
  for (const [, name, value] of css.matchAll(/--z-([a-z-]+):\s*(\d+);/g)) {
    rungs[name] = Number(value);
  }
  return rungs;
}

describe("z-index ladder", () => {
  it("defines every rung the app uses, in strictly increasing order", () => {
    const rungs = ladder();
    const expected = ["sticky", "skiplink", "overlay", "modal", "modal-top", "toast", "curtain", "tooltip"];

    expect(Object.keys(rungs).sort()).toEqual([...expected].sort());

    for (let i = 1; i < expected.length; i += 1) {
      expect(rungs[expected[i]]).toBeGreaterThan(rungs[expected[i - 1]]);
    }
  });

  it("keeps tooltips, toasts and curtains above dialogs", () => {
    const rungs = ladder();
    expect(rungs.toast).toBeGreaterThan(rungs["modal-top"]);
    expect(rungs.curtain).toBeGreaterThan(rungs.toast);
    expect(rungs.tooltip).toBeGreaterThan(rungs.curtain);
  });

  it("has no hardcoded layer above the overlay rung outside tokens.css", () => {
    const offenders = [];
    const patterns = [/\bz-index:\s*(\d+)/g, /\bzIndex:\s*(\d+)/g, /\bz-\[(\d+)\]/g];

    for (const file of walk(SRC)) {
      if (file === TOKENS || !/\.(css|jsx?|tsx?)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const pattern of patterns) {
        for (const [, value] of text.matchAll(pattern)) {
          if (Number(value) >= OVERLAY_FLOOR) {
            offenders.push(`${relative(ROOT, file).split(sep).join("/")}: ${value}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
