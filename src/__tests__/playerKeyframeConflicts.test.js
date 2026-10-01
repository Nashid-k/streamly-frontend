import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* Guards against duplicate @keyframes definitions with the same name.
 *
 * Two rules with the same @keyframes name is legal CSS and totally silent: the
 * later one in document order wins, and the earlier one is simply ignored. That
 * is not a compile error, not a lint error, and nothing in jsdom reports it -
 * so the only way to catch it is to scan.
 *
 * This is not hypothetical. The legacy player injected
 *
 *   @keyframes upNextCountdown { from { scaleX(0) } to { scaleX(1) } }
 *
 * into <head> at runtime, while player.css already declared
 *
 *   @keyframes upNextCountdown { from { scaleX(1) } to { scaleX(0) } }
 *
 * The injected copy landed later, so it won, and the Up Next bar FILLED UP while
 * its own countdown label counted DOWN - for the full 15 seconds, with the two
 * parts of one card disagreeing. The injection is gone; the stylesheet's drain
 * direction is the correct one for a countdown. See NativePlayerView.jsx.
 *
 * The scan covers both static CSS and runtime-injected strings, because the
 * whole failure lived in the second kind.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, "../");

/* Extracts every `@keyframes <name> { ... }` with its body.
 *
 * A regex alone is not enough here and getting that wrong makes the guard lie:
 * the naive `@keyframes\s+([\w-]+)\s*\{([^{}]*)\}` returns nothing, because a
 * keyframes body is itself full of braces (`from { transform: scaleX(1) }`). A
 * scan built on that regex matches zero rules, finds no collisions, and passes
 * vacuously — which is how this file's first version "passed" while checking
 * nothing. So this walks the braces and returns the real body, and the tests
 * below assert that rules were actually found.
 */
/* Comments are stripped before scanning. Otherwise a comment that QUOTES the old
 * bug - as the fix for it must, to explain itself to the next reader - reads as
 * a live injection and the guard fails on its own documentation. Only real code
 * can inject a stylesheet. Naive: a quoted "https://x" is not a comment opener,
 * and stripping block comments before line comments keeps a line-comment
 * marker inside a block comment from truncating the rest of the file.
 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function keyframesIn(css) {
  const found = new Map();
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    const name = m[1];
    // Brace-depth walk from the opening brace to its match.
    let depth = 1;
    let i = re.lastIndex;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    const body = css.slice(re.lastIndex, i - 1).replace(/\s+/g, " ").trim();
    if (!found.has(name)) found.set(name, []);
    found.get(name).push(body);
    re.lastIndex = i;
  }
  return found;
}

describe("no duplicate @keyframes definitions", () => {
  it("has no name defined twice in any single stylesheet", () => {
    const offenders = [];
    let total = 0;
    for (const file of ["styles/player.css", "styles/tokens.css", "components/player/v2/player.css"]) {
      let css;
      try {
        css = readFileSync(resolve(SRC, file), "utf8");
      } catch {
        continue;
      }
      total += keyframesIn(css).size;
      for (const [name, bodies] of keyframesIn(css)) {
        const distinct = new Set(bodies);
        if (distinct.size > 1) {
          offenders.push(`${file}: @keyframes ${name} has ${distinct.size} different bodies`);
        }
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
    // Guards the guard: a scan that parses zero rules cannot find a collision,
    // so it would pass forever while checking nothing. This is the assertion
    // that catches that, and it failed for real during development.
    expect(total, "the keyframes scan found nothing to check").toBeGreaterThan(0);
  });

  it("does not re-declare a keyframes name that a stylesheet already owns", () => {
    /* The exact shape of the Up Next bug: a runtime <style> element redefining a
     * name the stylesheet already defines. Scan the component sources for
     * injected @keyframes and cross-check each name against the real CSS. */
    const cssNames = new Set();
    for (const file of ["styles/player.css", "components/player/v2/player.css"]) {
      try {
        for (const [name] of keyframesIn(readFileSync(resolve(SRC, file), "utf8"))) {
          cssNames.add(name);
        }
      } catch {
        // A missing stylesheet cannot collide with anything.
      }
    }
    // Same anti-vacuity rule as above: with an empty stylesheet set this scan
    // would approve any runtime injection, which is exactly the bug it exists
    // to prevent.
    expect(cssNames.size, "no stylesheet keyframes found to cross-check against").toBeGreaterThan(0);

    const offenders = [];
    for (const file of ["components/NativePlayerView.jsx", "components/player/v2/PlayerShell.jsx"]) {
      let source;
      try {
        source = readFileSync(resolve(SRC, file), "utf8");
      } catch {
        continue;
      }
      // Every @keyframes in live code is a runtime injection. Comments are
      // removed first so the fix's own explanation of this bug is not mistaken
      // for the bug returning.
      for (const m of stripComments(source).matchAll(/@keyframes\s+([\w-]+)/g)) {
        if (cssNames.has(m[1])) {
          offenders.push(`${file} injects @keyframes ${m[1]}, which player.css already defines`);
        }
      }
    }
    expect(
      offenders,
      `A runtime @keyframes silently overrides the stylesheet copy of the same name:\n  ${offenders.join("\n  ")}`,
    ).toEqual([]);
  });

  it("drains the Up Next bar rather than filling it", () => {
    /* A countdown bar must empty as time runs out. Assert the direction
     * directly, because if this ever inverts again the bug is visible only as
     * "something looked odd" in a real browser. */
    const css = readFileSync(resolve(SRC, "styles/player.css"), "utf8");
    const body = keyframesIn(css).get("upNextCountdown")?.[0] ?? "";
    const from = body.match(/from\s*\{[^}]*scaleX\(([\d.]+)\)/)?.[1];
    const to = body.match(/to\s*\{[^}]*scaleX\(([\d.]+)\)/)?.[1];
    expect(from, "upNextCountdown from-scaleX").toBe("1");
    expect(to, "upNextCountdown to-scaleX").toBe("0");
    expect(Number(from), "bar must shrink, not grow").toBeGreaterThan(Number(to));
  });
});