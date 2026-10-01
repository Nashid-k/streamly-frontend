import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/* PLAYER V2 stylesheet tokens-only guard (task.md 1.6 / 7.17).
 *
 * "Tokens-only, zero hardcoded colour literals" is easy to write in a plan and
 * easy to break in practice: someone hits a deadline, inlines one #fff, and the
 * drift is invisible in review. It is especially easy here because
 * --accent-primary is USER-SELECTABLE across lime/purple/blue/red/amber plus a
 * custom value (settings-ui.css), so a hardcoded literal is not merely ugly — it
 * silently disagrees with the viewer's chosen theme.
 *
 * The check is a text scan on purpose. No CSS parser, no build step.
 *
 * Comments are stripped before scanning. That is a deliberate trade: this file
 * has to be able to NAME the forbidden syntax in its own header, so scanning
 * comments would make the contract undescribable — and a literal inside a
 * comment renders nothing. Hex is still checked across comments (see below),
 * because hex is what actually gets copy-pasted out of a comment into live code.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const V2_DIR = resolve(HERE, "../components/player/v2");

const readV2 = (name) => readFileSync(resolve(V2_DIR, name), "utf8");

/* Matches colour literals in any CSS value position.
 * - #hex / #rgb / #rgba (CSS Color 4 allows 4-digit too)
 * - the colour functions, including modern space/slash forms
 * - standalone colour keywords, e.g. `color: red`
 * `transparent`/`currentColor`/`inherit` are deliberately NOT flagged: they are
 * not colours, they are references.
 */
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
/* Captures the colour function AND its argument list, because the argument list
 * is the whole question: `rgba(var(--bg-surface-rgb), 0.72)` names no colour, it
 * forwards one, and this guard is about literals. */
const COLOR_FN = /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)(-mix)?\s*\(([^)]*)\)/g;
const KEYWORD =
  /\b(?:red|blue|green|yellow|orange|purple|pink|cyan|magenta|lime|maroon|navy|teal|olive|silver|gray|grey|white|black|gold|violet|indigo|coral|salmon|khaki|crimson)\b(?=\s*[;,)!]|\s*$)/g;

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Does this colour function only forward tokens and numbers?
 *
 * `transparent` / `currentColor` are exempt for the same reason the KEYWORD scan
 * exempts them: they are references, not values.
 */
function isTokenOnlyColorFunction(fullMatch) {
  const rest = fullMatch
    .replace(/^\s*\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)(-mix)?\s*\(/i, "")
    // color-mix's interpolation space (`in srgb`) is not a colour value.
    .replace(/\bin\s+(?:srgb|srgb-linear|lab|lch|oklab|oklch|xyz|hsl|hwb)\b/gi, "")
    .replace(/var\(\s*--[\w-]+\s*\)/g, "")
    .replace(/\b(?:transparent|currentColor|inherit)\b/gi, "")
    .replace(/[\d.]+%?/g, "")
    .replace(/[\s,/-]/g, "");
  return rest === "";
}

function literalsIn(css) {
  const found = [];
  const lineOf = (index) => css.slice(0, index).split("\n").length;
  for (const [label, re] of [
    ["hex", HEX],
    ["color-function", COLOR_FN],
    ["keyword", KEYWORD],
  ]) {
    for (const m of css.matchAll(re)) {
      if (label === "color-function" && isTokenOnlyColorFunction(m[0])) continue;
      found.push({ label, match: m[0], line: lineOf(m.index) });
    }
  }
  return found;
}

describe("player/v2/player.css is tokens-only", () => {
  const raw = readV2("player.css");
  const css = stripComments(raw);
  const literals = literalsIn(css);

  it("contains no colour literal in live CSS", () => {
    expect(
      literals,
      `colour literals found in player/v2/player.css:\n` +
        literals.map((l) => `  line ${l.line}: [${l.label}] ${l.match}`).join("\n") +
        `\nUse a var() token. Scrims live in tokens.css (--scrim-top/-bottom/-flat).`,
    ).toEqual([]);
  });

  it("keeps hex literals out of comments too", () => {
    // Hex is what gets copy-pasted from a comment into live code, so it is held
    // to the rule even where it cannot render. Prose may still name `rgb(` etc.
    expect(raw.match(HEX) ?? [], "hex literal in a comment").toEqual([]);
  });

  it("does not reference the retired Netflix red or the old .np- namespace", () => {
    // NETFLIX_RED = "#E50914" (NativePlayerView.jsx:95) is a brand colour this
    // player is dropping, and `.np-` classes belong to player.css, which Phase 6
    // deletes — a stray `.np-` selector in v2 would die with it.
    expect(css).not.toMatch(/E50914/i);
    expect(css).not.toMatch(/\.np-[\w-]/);
  });

  it("namespaces every selector under .pv2-", () => {
    // Guards the coexistence property: during the flagged rollout both
    // stylesheets are live, so an unprefixed rule in v2 could restyle the old
    // player. @keyframes and keyframe selectors are exempt (they are not
    // matched as class selectors).
    const selectors = css
      .replace(/\/\*[\s\S]*?\*\//g, "") // strip comments
      .split("}")
      .map((chunk) => chunk.split("{")[0])
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("@") && !/^\d|^from$|^to$/.test(s));

    const offenders = selectors.filter(
      (s) => !/\.pv2-/.test(s) && !/^\d{1,3}%/.test(s),
    );
    expect(offenders, `unprefixed selectors: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("declares its keyframes rather than stealing a colliding name", () => {
    // The old sheet has a duplicate `upNextCountdown` keyframes (player.css:470
    // drains scaleX(1)->0; NativePlayerView.jsx:1976 injects scaleX(0)->1 and,
    // being later in document order, wins — so the bar filled UP while the label
    // counted down). v2 uses its own `pv2-sweep` name so it cannot inherit or
    // re-create that class of bug.
    expect(css).toMatch(/@keyframes\s+pv2-sweep/);
    expect(css).not.toMatch(/@keyframes\s+upNextCountdown/);
  });

  it("distinguishes a forwarded token colour from a real literal", () => {
    // The refinement above must not have quietly disarmed the guard it relaxed.
    // This is the check that says so: token-forwarding is allowed, a value is
    // not, however the value is dressed up.
    expect(literalsIn(".a { color: rgba(var(--bg-surface-rgb), 0.72); }")).toEqual([]);
    expect(
      literalsIn(".a { color: color-mix(in srgb, var(--bg-surface) 72%, transparent); }"),
    ).toEqual([]);
    expect(
      literalsIn(".a { background: rgba(18, 18, 23, 0.72); }"),
      "a hardcoded rgb triplet must still be caught",
    ).toHaveLength(1);
    expect(
      literalsIn(".a { background: color-mix(in srgb, var(--bg-surface) 72%, red); }"),
      "a colour keyword inside color-mix must still be caught",
    ).toHaveLength(1);
  });

  it("scrims come from tokens.css, not inline literals", () => {
    // A legible scrim over arbitrary video is mandatory, so the alpha values
    // are shared via tokens rather than allowed as inline literals here.
    const tokens = readFileSync(resolve(HERE, "../styles/tokens.css"), "utf8");
    for (const token of ["--scrim-top", "--scrim-bottom", "--scrim-flat"]) {
      expect(tokens).toMatch(new RegExp(`${token}\\s*:`));
    }
  });
});

/* The visual language and motion budget (task.md 3.1-3.2).
 *
 * Same reasoning as the colour guard above: "only --duration-fast and
 * --duration-normal, fade + 4px, no springs" is a sentence that decays. A single
 * `0.3s` in a transition looks harmless in review and quietly doubles the
 * player's motion budget, and one `spring` reintroduces exactly the feel this
 * rewrite exists to remove.
 */
describe("player/v2/player.css follows the motion budget and type roles", () => {
  const css = stripComments(readV2("player.css"));

  it("uses no spring anywhere", () => {
    // The old player leans on constants/motion.js springs. A spring in v2 is a
    // regression to the motion the rewrite was commissioned to remove.
    expect(css, "spring found in v2 css").not.toMatch(/spring/i);
  });

  it("transitions only on the two budgeted durations", () => {
    // Every duration in a transition/animation must be a var() or the single
    // named exception. Literal durations are what the budget is protecting
    // against, so they are the thing checked.
    const durations = [];
    for (const m of css.matchAll(/(?:transition|animation)\s*:[^;}]+/g)) {
      for (const t of m[0].matchAll(/(\d*\.?\d+)(ms|s)\b/g)) durations.push(t[0]);
    }
    expect(
      durations,
      `literal durations found: ${durations.join(", ")}\n` +
        `Use var(--pv2-motion-fast) / var(--pv2-motion-normal). The loader sweep\n` +
        `is var(--pv2-motion-sweep) and is the only exception.`,
    ).toEqual([]);
  });

  it("names the sweep exception exactly once, on the shell", () => {
    // If the exception can be declared per-component, it stops being an
    // exception and becomes a second, invisible motion system.
    const declarations = css.match(/--pv2-motion-sweep\s*:/g) ?? [];
    expect(declarations).toHaveLength(1);
    expect(css).toMatch(/--pv2-motion-sweep:\s*[\d.]+m?s/);
    expect(css).toMatch(/\.pv2-shell\s*\{[^}]*--pv2-motion-sweep/);
  });

  it("keeps the enter shift at 4px and nowhere else", () => {
    expect(css).toMatch(/--pv2-motion-shift:\s*4px/);
    // Any other translate distance in v2 is a new motion idea arriving without
    // a decision, so the distance is only legal via the one token.
    const shifts = [];
    for (const m of css.matchAll(/translate[XY]?\(\s*(-?[\d.]+)px/g)) shifts.push(m[1]);
    expect(
      shifts.filter((s) => s !== "0" && s !== "4"),
      `unexpected translate distances: ${shifts.join(", ")}`,
    ).toEqual([]);
  });

  it("gives the player the app's typeface and timecodes a mono stack", () => {
    expect(css, ".pv2-shell must set --font-sans").toMatch(
      /\.pv2-shell\s*\{[^}]*font-family:\s*var\(--font-sans\)/,
    );
    // 3.32's jitter fix depends on this existing before the transport exists.
    expect(css).toMatch(
      /\.pv2-timecode\s*\{[^}]*font-family:\s*var\(--font-mono\)[^}]*tabular-nums/s,
    );
  });

  it("builds the glass plate from tokens, not an opaque surface", () => {
    const tokens = readFileSync(resolve(HERE, "../styles/tokens.css"), "utf8");
    // rgba(var(--bg-surface-rgb), 0.72) — the rgb triplet is the repo's existing
    // alpha pattern, and an opaque plate would hide the video behind it.
    expect(tokens).toMatch(/--bg-surface-rgb:/);
    expect(css, "glass plate must be translucent").toMatch(
      /\.pv2-glass\s*\{[^}]*rgba\(var\(--bg-surface-rgb\),\s*0\.72\)/s,
    );
    expect(css).toMatch(/\.pv2-glass\s*\{[^}]*backdrop-filter:\s*var\(--glass-blur\)/s);
  });
});

/* PLAYER V2 chrome-reveal guard (task.md 3.5).
 *
 * jsdom cannot evaluate `:focus-within` or resolve `@container`, so this is a
 * text scan on the stylesheet. That is a real limitation, not a shortcut: the
 * visual result is verified in the 6.8 browser checklist, and what is verified
 * HERE is the part that silently rots — a rule getting reordered, or the hidden
 * state gaining `visibility: hidden` and quietly deleting the tab order.
 */
describe("player/v2 chrome reveals on focus and keeps its tab order", () => {
  const css = stripComments(readV2("player.css"));

  it("hides chrome with opacity alone, never visibility or display", () => {
    // This is the load-bearing assertion. `visibility: hidden` or `display: none`
    // on the hidden state removes the controls from the tab order, `:focus-within`
    // can then never fire, and the reveal rule becomes unreachable code. The
    // failure is silent: the player looks fine and cannot be operated by keyboard.
    const block = css.match(/\.pv2-chrome\s*\{([^}]*)\}/);
    expect(block, ".pv2-chrome rule is missing").toBeTruthy();
    expect(block[1], ".pv2-chrome must not leave the tab order").not.toMatch(
      /visibility\s*:\s*hidden|display\s*:\s*none/i,
    );
    expect(block[1], "hidden chrome starts at opacity 0").toMatch(/opacity\s*:\s*0/);
    // The layer itself must never eat a tap meant for the video underneath.
    expect(block[1], "the chrome layer must pass pointer events through").toMatch(
      /pointer-events\s*:\s*none/,
    );
  });

  it("reveals chrome on :focus-within", () => {
    expect(css, "keyboard must be able to reveal the chrome").toMatch(
      /\.pv2-shell:focus-within\s+\.pv2-chrome\s*\{[^}]*opacity\s*:\s*1/s,
    );
  });

  it("orders the focus reveal AFTER the hide rule so keyboard wins", () => {
    // Same specificity on both selectors, so source order is the only thing
    // making focus beat the auto-hide timer. Re-sorting these two rules breaks
    // the 3.5 guarantee with no error anywhere — this is the assertion that
    // notices.
    const hideAt = css.search(/\.pv2-shell\[data-chrome="hidden"\]\s+\.pv2-chrome\s*\{/);
    const revealAt = css.search(/\.pv2-shell:focus-within\s+\.pv2-chrome\s*\{/);
    expect(hideAt, "hide rule missing — 3.8 will need it").toBeGreaterThanOrEqual(0);
    expect(revealAt, "reveal rule missing").toBeGreaterThanOrEqual(0);
    expect(
      revealAt,
      "the :focus-within reveal must come after the hide rule to win the cascade",
    ).toBeGreaterThan(hideAt);
  });

  it("only makes real controls clickable while the chrome is shown", () => {
    // A blanket `pointer-events: auto` on children would leave invisible buttons
    // swallowing clicks; a blanket `auto` on the layer would stop taps reaching
    // the video. The opt-in has to name interactive elements and be gated.
    const optIn = css.match(
      /:is\(button,[^)]*\)\s*\{[^}]*pointer-events\s*:\s*auto/s,
    );
    expect(optIn, "control pointer-events opt-in is missing").toBeTruthy();
    expect(optIn[0]).toMatch(/\[role="button"\]/);
  });
});

/* PLAYER V2 container-query guard (task.md 3.6).
 *
 * The claim under test: layout responds to the PLAYER BOX. A media query or a
 * viewport unit responds to the window, which is a different question — and the
 * two disagree on exactly the two shapes this app ships (a phone-width player on
 * a desktop viewport, and a full-width player on a narrow one).
 */
describe("player/v2 layout follows the container, not the viewport", () => {
  const css = stripComments(readV2("player.css"));

  it("establishes the shell as the query container", () => {
    expect(css, "the shell must be a container").toMatch(
      /\.pv2-shell\s*\{[^}]*container-type\s*:\s*inline-size/s,
    );
    expect(css).toMatch(/container-name\s*:\s*pv2/);
    // `size` would contain the block axis too, letting the player size itself
    // from its contents and collapse around the video.
    expect(css).not.toMatch(/container-type\s*:\s*size\b/);
  });

  it("contains no media query and no viewport unit", () => {
    // Non-vacuity: this scan is proven by the probe below, which injects one of
    // each and fails the guard.
    expect(css, "@media answers the wrong question").not.toMatch(/@media\b/);
    const units = [...css.matchAll(/(\d*\.?\d+)(?:d?vw|d?vh|d?vmin|d?vmax)\b/g)].map(
      (m) => m[0],
    );
    expect(units, `viewport units found: ${units.join(", ")}`).toEqual([]);
  });

  it("actually branches on the container", () => {
    // Without this, `container-type` alone is a declaration nobody uses — the
    // guard above would pass on a stylesheet with zero container queries.
    expect(css).toMatch(/@container\s+pv2\s+\(min-width:/);
    expect(css).toMatch(/@container\s+pv2\s+\(max-width:/);
  });
});

/* Non-vacuity probe for the two guards above.
 *
 * A guard that cannot fail is worse than no guard, because it is reported as
 * coverage. Each case below feeds a known violation through the same predicate
 * the real test uses and requires the predicate to REJECT it. */
describe("the sheet's width clamp has a floor (3.28)", () => {
  const css = stripComments(readV2("player.css"));
  /* Two `.pv2-sheet` blocks exist (the base rule and the phone-width container
   * override), and the override comes FIRST in the file. A naive
   * `match(/\.pv2-sheet\s*\{…\}/)` therefore captures the override — a block with a
   * custom property and no `inline-size` — and every assertion below silently
   * degrades to "expected '' to match". Selecting the block that actually sizes the
   * panel is what keeps these tests from passing vacuously. */
  const blocks = [...css.matchAll(/\.pv2-sheet\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const rule = blocks.find((b) => /inline-size\s*:/.test(b)) ?? "";
  const width = rule.match(/inline-size\s*:\s*([^;]+);/)?.[1]?.trim() ?? "";
  expect(width, "no inline-size on .pv2-sheet").toBeTruthy();

  /* 3.28's whole claim is arithmetic, so the test is arithmetic. jsdom has no layout
   * and cannot measure a rendered panel, which is why this file asserts on CSS text:
   * the failure mode 3.28 fixes is invisible to every DOM assertion in the suite. */

  /* The legacy value, and the case that motivates the change. `min()` returns the
   * SMALLER argument, so `min(480px, 32%)` at 700px is 224px — one settings row wide.
   * Computed here rather than hard-coded so the test states the reason instead of the
   * conclusion: `32%` of 700 is 224, and 224 < 480, so the smaller wins. */
  const legacyAt = (player) => Math.min(480, (32 / 100) * player);
  expect(legacyAt(700)).toBe(224);

  it("would have shipped the 224px column this replaces", () => {
    // Non-vacuity: the failure is what the new value must NOT be. If this ever stops
    // being true, the test below is guarding a bug that no longer exists.
    expect(legacyAt(700)).toBeLessThan(288);
  });

  it("uses clamp(), so the px value is a floor rather than a cap", () => {
    /* Not a style preference — `min()` and `clamp()` differ exactly here. `min()` can
     * only ever cap; the author wrote "480px, but not more than a third" and reached
     * for the function that can only express half of that. A test asserting `min(` is
     * absent from the declaration would be wrong, though: the outer `min(100%, …)` is
     * load-bearing and is asserted separately below. So the guard targets the LEGACY
     * SHAPE — a `min()` that mixes a length with a percentage — rather than the
     * function name, which is what "no floor" actually looks like in CSS. */
    expect(width).toMatch(/clamp\(/);
    /* `[^()]*`, not `[^)]*`: a `min(` whose arguments contain another function is the
     * outer wrapper (its `var(…)` supplies a nested paren), and its "arguments" would
     * be truncated mid-`var` into a string that looks like a length mixed with a
     * percentage. Only a FLAT `min(480px, 32%)` is the legacy shape. */
    const legacyShape = [...width.matchAll(/min\(([^()]*)\)/g)]
      .map((m) => m[1])
      .filter((args) => /%/.test(args) && /(px|rem|em)/.test(args));
    expect(legacyShape, `min() cannot express a floor: ${legacyShape.join(" | ")}`).toEqual([]);
  });

  it("keeps the 288px floor at the 700px embed the task names", () => {
    /* The regression itself. 34% of 700 is 238px, which is BELOW the 18rem floor, so
     * a correct clamp returns the floor and the panel gets 288px instead of the legacy
     * 224px. Written as the clamp's own semantics so a change to any of the three
     * numbers has to be deliberate: this fails if the floor drops under 238. */
    const floor = Number(width.match(/clamp\(([\d.]+)rem/)?.[1]) * 16;
    const fluid = (34 / 100) * 700;
    expect(fluid).toBeLessThan(floor);
    expect(Math.max(floor, Math.min(fluid, 26 * 16))).toBe(floor);
    expect(Math.max(floor, Math.min(fluid, 26 * 16))).not.toBe(legacyAt(700));
  });

  it("caps at the ceiling rather than growing without bound", () => {
    /* The other half of what `min(480px, 32%)` was reaching for: a wide player must not
     * stretch the panel across a 4K display. Only the floor is under test in the case
     * above — without a ceiling, "widen the narrow case" is also satisfied by 100%. */
    /* Matched against the clamp's own arguments rather than the whole declaration: the
     * outer `min(100%, …)` contributes a comma-separated first argument, so anchoring
     * at `clamp(` and letting `[^)]*` stop at the clamp's closing paren is what reads
     * the THIRD argument as the ceiling. */
    const args = width.match(/clamp\(([^)]*)\)/)?.[1] ?? "";
    const parts = args.split(",").map((p) => p.trim());
    expect(parts, `clamp needs three arguments, got "${args}"`).toHaveLength(3);
    const rem = (part) => Number(part.match(/([\d.]+)rem/)?.[1]) * 16;
    const floor = rem(parts[0]);
    const ceiling = rem(parts[2]);
    expect(ceiling).toBeLessThanOrEqual(26 * 16);
    expect((34 / 100) * 1400).toBeGreaterThan(ceiling);

    /* Floor <= ceiling. `clamp()` does NOT error when they are swapped — CSS resolves
     * min > max to the MIN, so `clamp(26rem, 34%, 18rem)` silently becomes a 416px
     * panel on every player, including the 700px embed this task exists to widen.
     * The mutation probe confirmed it: swapping the two outer values left all 29
     * tests green, because every assertion above was about the floor being *present*
     * and never about the two agreeing. */
    expect(floor, `clamp(${parts[0]}, …, ${parts[2]}) has an inverted range`).toBeLessThanOrEqual(
      ceiling,
    );
  });

  it("still cannot outgrow a player narrower than the floor", () => {
    /* The clamp's floor is a floor against the CEILING argument, not against the
     * container: `clamp(288px, 34%, 416px)` is 288px even inside a 200px box, where it
     * would push the sheet off the inline-start edge and clip the rows the viewer came
     * to change. The `min(100%, …)` wrapper is what prevents that, so it is asserted
     * rather than assumed — dropping it fails here rather than only on a real phone.
     *
     * `inline-size` and not `max-inline-size`, which was the second surviving mutant.
     * The sheet is `position: absolute` with `inset-inline-end: 0` and no inline-start,
     * so its used width is shrink-to-fit against its content; `max-inline-size` only
     * CAPS that, leaving the panel as narrow as its longest row instead of at the
     * clamp's floor. A pinned drawer needs a DEFINED width, and `max-inline-size`
     * quietly left every assertion in this file passing. */
    expect(width).toMatch(/^min\(100%\s*,/);
    expect(rule, "the panel needs a defined width, not a cap").toMatch(/(^|[\s;])inline-size\s*:/);
    expect(rule).not.toMatch(/(^|[\s;])max-inline-size\s*:/);
  });

  it("hands the phone-width case a full-width drawer", () => {
    /* At `max-width: 420px` the 288px floor would be 69% of the box — the sheet would
     * read as a broken side panel rather than a deliberate drawer. The override goes
     * through the custom property so the clamp stays in ONE place, which is why the
     * width is written as `var(--pv2-sheet-width, …)` and not a second literal. */
    /* Brace-matched extraction, not `[^}]*`: the `@container` block holds several
     * sibling rules (loading bar, logo, status), so the first `}` inside it terminates
     * any non-greedy scan before `.pv2-sheet` is ever reached — and the assertion
     * below then fails on `undefined` while looking like a missing override. */
    const start = css.indexOf("@container pv2 (max-width: 420px)");
    expect(start, "no phone-width container query at all").toBeGreaterThan(-1);
    let depth = 0;
    let end = start;
    for (; end < css.length; end += 1) {
      if (css[end] === "{") depth += 1;
      else if (css[end] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const block = css.slice(start, end);
    const narrow = block.match(/\.pv2-sheet\s*\{([^}]*)\}/)?.[1];
    expect(narrow, "no phone-width override for the sheet").toBeTruthy();
    expect(narrow).toMatch(/--pv2-sheet-width\s*:\s*100%/);
  });
});

describe("container + chrome guards reject known-bad input", () => {
  const badViewport = `.x { inline-size: 50vw; }`;
  const badMedia = `@media (min-width: 720px) { .x { color: var(--a); } }`;

  it("rejects a viewport unit and a media query", () => {
    expect(stripComments(badViewport)).toMatch(/(\d*\.?\d+)(?:d?vw|d?vh|d?vmin|d?vmax)\b/);
    expect(stripComments(badMedia)).toMatch(/@media\b/);
  });

  it("rejects a hidden chrome that leaves the tab order", () => {
    const hidden = `.pv2-chrome { opacity: 0; visibility: hidden; }`;
    const block = hidden.match(/\.pv2-chrome\s*\{([^}]*)\}/);
    expect(block[1]).toMatch(/visibility\s*:\s*hidden/);
    expect(block[1]).not.toMatch(/pointer-events\s*:\s*none/);
  });

  it("rejects the reveal rule placed BEFORE the hide rule", () => {
    // Same specificity, so this ordering genuinely loses the cascade to the
    // hide rule: focus would reveal nothing and the test would still find both
    // selectors present.
    const swapped = `.pv2-shell:focus-within .pv2-chrome { opacity: 1; }
.pv2-shell[data-chrome="hidden"] .pv2-chrome { opacity: 0; }`;
    const hideAt = swapped.search(/\.pv2-shell\[data-chrome="hidden"\]\s+\.pv2-chrome\s*\{/);
    const revealAt = swapped.search(/\.pv2-shell:focus-within\s+\.pv2-chrome\s*\{/);
    expect(revealAt).toBeLessThan(hideAt);
  });
});
