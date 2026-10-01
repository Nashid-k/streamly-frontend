import { render, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Scrubber from "../components/player/v2/Scrubber";
import { BUBBLE_WIDTH } from "../components/player/v2/ScrubberBubble";
import { THUMBNAIL_SETTLE_MS } from "../components/player/v2/hoverPreview";
import { getPreviewThumb } from "../api/previewThumbs";

vi.mock("../api/previewThumbs", () => ({ getPreviewThumb: vi.fn() }));

/* PLAYER V2 scrubber geometry (task.md 3.13).
 *
 * The item, verbatim: "Scrubber: 2px rail -> 6px on hover/focus, 14px thumb,
 * container-scaled. Bar height is hardcoded `hoverRatio ? 5 : 3` at `:4174` and
 * never scales."
 *
 * Read that as TWO defects, because it is:
 *   1. GEOMETRY: a bar with no thumb, whose growth depends on a flag rather than
 *      on where the pointer actually is.
 *   2. SCALING: 3px and 5px literals, identical on a 360px phone and a 1400px
 *      television, so the bar is a hairline on one and a fifth of the space it
 *      could have on the other.
 *
 * jsdom has no layout engine, so the second half can only be asserted against the
 * stylesheet source. That is not a workaround to be ashamed of: the regression
 * this guards is a LITERAL reappearing in the CSS, and reading the CSS is the only
 * place a literal can hide. The first half is asserted behaviourally.
 */

const V2_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "components", "player", "v2");
const readV2 = (name) => readFileSync(resolve(V2_DIR, name), "utf8");
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Every rule in the sheet, as `{ selectors, body }`.
 *
 * Parsed once rather than regex-searched per assertion, because this file's whole
 * subject is WHICH SELECTOR a declaration belongs to. `.pv2-scrubber__rail,
 * .pv2-scrubber__fill { ... }` appears before `.pv2-scrubber__fill { ... }`, so an
 * `indexOf` search would hand back the shared thickness rule and let an assertion
 * about the fill pass for the wrong reason.
 */
const SHEET = stripComments(readV2("player.css"));
const rules = [...SHEET.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  body: m[2].trim(),
}));

/** The body of the one rule whose selector is EXACTLY `selector`. */
function rule(selector) {
  const hits = rules.filter((r) => r.selectors.length === 1 && r.selectors[0] === selector);
  if (hits.length !== 1) {
    throw new Error(`expected exactly one rule for ${selector}, found ${hits.length}`);
  }
  return hits[0].body;
}

/** The first rule whose selector list CONTAINS `selector`, whole. */
function blockFrom(selector) {
  const hit = rules.find((r) => r.selectors.some((s) => s === selector || s.includes(selector)));
  if (!hit) throw new Error(`no rule mentioning ${selector}`);
  return hit;
}

/**
 * The scrubber's own section of the stylesheet.
 *
 * Sliced from the RAW file, comments included, because the boundaries ARE
 * comments -- and a rule that reaches outside this section is exactly what 3.6
 * forbids, so widening the slice to hide an offender would defeat the test.
 */
const scrubberBlock = () => {
  const raw = readV2("player.css");
  const start = raw.indexOf("Scrubber geometry");
  const end = raw.indexOf("Status line");
  if (start === -1 || end === -1) throw new Error("scrubber block markers moved");
  return stripComments(raw.slice(start, end));
};

describe("the three layers exist", () => {
  it("renders a rail, a buffered band, a fill and a thumb", () => {
    // The item's "14px thumb" presupposes a thumb. The legacy had one; a 3.7
    // scrubber with rail and fill but no thumb would be a regression, not a
    // finish. The buffered band is 3.14's ONE element.
    const { container } = render(<Scrubber currentTime={50} duration={200} onSeek={vi.fn()} />);
    expect(container.querySelector(".pv2-scrubber__rail")).toBeTruthy();
    expect(container.querySelector(".pv2-scrubber__buffered")).toBeTruthy();
    expect(container.querySelector(".pv2-scrubber__fill")).toBeTruthy();
    expect(container.querySelector(".pv2-scrubber__thumb")).toBeTruthy();
    /* The count is the assertion that answers the item. `bufferedRanges.map(...)`
     * rendered one div PER RANGE, so the number of band elements used to be
     * however many disjoint spans the browser happened to hold. */
    expect(container.querySelectorAll(".pv2-scrubber__buffered")).toHaveLength(1);
  });

  it("keeps the decorative layers out of the accessibility tree", () => {
    // The slider already announces its position. A thumb that is also exposed
    // would make a screen reader say the position twice per focus.
    const { container } = render(<Scrubber currentTime={50} duration={200} onSeek={vi.fn()} />);
    container
      .querySelectorAll(
        ".pv2-scrubber__rail, .pv2-scrubber__buffered, .pv2-scrubber__fill, .pv2-scrubber__thumb",
      )
      .forEach((el) => expect(el.getAttribute("aria-hidden")).toBe("true"));
  });
});

describe("one number positions everything", () => {
  it("writes the fraction once, as a custom property", () => {
    // The fill and the thumb must be positioned from the SAME value. Passing an
    // inline width to one and an inline left to the other is how a fill reaches
    // 50% under a thumb sitting at 47%.
    const { container } = render(<Scrubber currentTime={50} duration={200} onSeek={vi.fn()} />);
    const bar = container.querySelector(".pv2-scrubber");
    expect(bar.style.getPropertyValue("--pv2-scrub-fraction")).toBe("0.25");
  });

  it("positions the fill and the thumb from that one property", () => {
    // If either falls back to a hardcoded 0 the fill would be empty and the thumb
    // pinned to the start while `data-fraction` said otherwise.
    expect(rule(".pv2-scrubber__fill")).toMatch(
      /inline-size:\s*calc\(var\(--pv2-scrub-fraction, 0\)\s*\*\s*100%\)/,
    );
    expect(rule(".pv2-scrubber__thumb")).toMatch(
      /inset-inline-start:\s*calc\(var\(--pv2-scrub-fraction, 0\)\s*\*\s*100%\)/,
    );
    // And centres on it, rather than starting there.
    expect(rule(".pv2-scrubber__thumb")).toMatch(/translate:\s*-50%\s*-50%/);
  });

  it("clamps the published fraction", () => {
    // A currentTime past the end must not push the fill off the row.
    const { container, rerender } = render(
      <Scrubber currentTime={500} duration={200} onSeek={vi.fn()} />,
    );
    expect(
      container.querySelector(".pv2-scrubber").style.getPropertyValue("--pv2-scrub-fraction"),
    ).toBe("1");
    rerender(<Scrubber currentTime={-40} duration={200} onSeek={vi.fn()} />);
    expect(
      container.querySelector(".pv2-scrubber").style.getPropertyValue("--pv2-scrub-fraction"),
    ).toBe("0");
  });

  it("publishes 0 for an unknown duration instead of NaN", () => {
    // `calc(NaN * 100%)` is invalid and drops the declaration entirely, which
    // leaves the fill with `inline-size: auto` -- full width. A video whose
    // duration has not loaded would show a completely played bar.
    const { container } = render(<Scrubber currentTime={12} duration={NaN} onSeek={vi.fn()} />);
    expect(
      container.querySelector(".pv2-scrubber").style.getPropertyValue("--pv2-scrub-fraction"),
    ).toBe("0");
  });
});

describe("the bar grows on hover AND on keyboard focus", () => {
  const hovered = (c) => c.querySelector(".pv2-scrubber").getAttribute("data-hovered");

  it("starts asleep", () => {
    const { container } = render(<Scrubber currentTime={1} duration={200} onSeek={vi.fn()} />);
    expect(hovered(container)).toBe("false");
  });

  it("wakes on pointer enter and sleeps on leave", () => {
    const { container } = render(<Scrubber currentTime={1} duration={200} onSeek={vi.fn()} />);
    const bar = container.querySelector(".pv2-scrubber");
    fireEvent.pointerEnter(bar);
    expect(hovered(bar.parentElement)).toBe("true");
    fireEvent.pointerLeave(bar);
    expect(hovered(bar.parentElement)).toBe("false");
  });

  it("wakes on keyboard focus, because there is no pointer to hover with", () => {
    // This is the half that is easy to leave as `:hover` only. A keyboard user
    // would then be permanently looking at the 2px bar -- the viewer who most
    // needs the affordance being the one who cannot summon it.
    const { container } = render(<Scrubber currentTime={1} duration={200} onSeek={vi.fn()} />);
    const bar = container.querySelector(".pv2-scrubber");
    fireEvent.focus(bar);
    expect(hovered(bar.parentElement)).toBe("true");
    fireEvent.blur(bar);
    expect(hovered(bar.parentElement)).toBe("false");
  });

  it("stays awake on focus after the pointer has left", () => {
    // A touch user taps the bar, focus stays, and hover state is then irrelevant.
    const { container } = render(<Scrubber currentTime={1} duration={200} onSeek={vi.fn()} />);
    const bar = container.querySelector(".pv2-scrubber");
    fireEvent.pointerEnter(bar);
    fireEvent.pointerLeave(bar);
    fireEvent.focus(bar);
    expect(hovered(bar.parentElement)).toBe("true");
  });
});

describe("the geometry is the item's, and it scales", () => {
  it("uses 2px at rest and 6px live", () => {
    const wrapper = rule(".pv2-scrubber");
    expect(wrapper).toMatch(/--pv2-rail-rest:\s*clamp\(2px,/);
    expect(wrapper).toMatch(/--pv2-rail-live:\s*clamp\(6px,/);
  });

  it("uses a 14px thumb", () => {
    expect(rule(".pv2-scrubber")).toMatch(/--pv2-thumb:\s*clamp\(14px,/);
  });

  it("scales from the container, not the viewport", () => {
    // The complaint is `hoverRatio ? 5 : 3` -- literals. `cqi` is the fix, and
    // `vw` would be the same class of bug in a different syntax.
    const wrapper = rule(".pv2-scrubber");
    expect(wrapper).toMatch(/cqi/);
    expect(wrapper).not.toMatch(/\d(vw|vh)/);
  });

  it("bounds the growth so a wide box does not get a fat sausage", () => {
    // The upper bound is what stops a 1400px television from getting a 12px bar
    // while the phone gets 6px.
    expect(rule(".pv2-scrubber")).toMatch(/--pv2-rail-live:\s*clamp\(6px,\s*[\d.]+cqi,\s*12px\)/);
  });

  it("applies the live thickness to every layer of the bar", () => {
    // Growing only the rail would leave the fill at 2px inside a 6px well, which
    // reads as two different bars. 3.14 added the buffered band to the same list,
    // and leaving it off would have drawn a 6px fill over a 2px band.
    const growth = blockFrom('.pv2-scrubber[data-hovered="true"] .pv2-scrubber__rail');
    const grown = growth.selectors.join(" ");
    expect(growth.selectors).toHaveLength(3);
    expect(grown).toMatch(/\.pv2-scrubber__rail/);
    expect(grown).toMatch(/\.pv2-scrubber__buffered/);
    expect(grown).toMatch(/\.pv2-scrubber__fill/);
    expect(growth.body).toMatch(/block-size:\s*var\(--pv2-rail-live\)/);
  });

  it("grows layers only, never the wrapper itself", () => {
    // The whole reason the rail is absolutely positioned. Growing the hit area
    // reflows the transport and pushes the timecode sideways -- the UI moves when
    // you look at it. Enumerated rather than spot-checked so that ADDING another
    // `data-hovered` rule on the wrapper is what fails.
    const grown = rules
      .flatMap((r) => r.selectors)
      .filter((s) => s.includes('[data-hovered="true"]'));
    expect(grown.length).toBeGreaterThan(0);
    grown.forEach((selector) => {
      expect(selector, `grows the wrapper: ${selector}`).not.toBe('.pv2-scrubber[data-hovered="true"]');
      expect(selector, `grows the wrapper: ${selector}`).toMatch(/\.pv2-scrubber__[a-z]+/);
    });
  });

  it("keeps a 44px hit area whatever the bar looks like", () => {
    // The 3.11 touch floor, and what 6.8 would actually measure. Declared on the
    // wrapper so the rail can stay hairline-thin without shrinking the target.
    expect(rule(".pv2-scrubber")).toMatch(/block-size:\s*var\(--pv2-touch-hit/);
  });

  it("gives the wrapper exactly one block-size, the hit area", () => {
    // Counted rather than pattern-matched, because the regression is an ADDITIONAL
    // `block-size` on the wrapper that a `toMatch` would happily ignore. A wrapper
    // that is both the hit area and something else is how the row starts moving on
    // hover.
    const declarations = [...rule(".pv2-scrubber").matchAll(/(^|;)\s*block-size:/g)];
    expect(declarations).toHaveLength(1);
  });

  it("stops the thumb swallowing a seek aimed at it", () => {
    // A decorative circle that eats presses aimed at the bar is a bug, and one
    // that only appears on hover -- so it is invisible until it causes a dropped
    // seek.
    expect(rule(".pv2-scrubber__thumb")).toMatch(/pointer-events:\s*none/);
  });

  it("does not transition the thumb's position", () => {
    // The playhead moves every frame of playback. A transition there would lag
    // it, and a lagging playhead reads as a laggy player.
    expect(rule(".pv2-scrubber__thumb")).toMatch(/transition:\s*none/);
  });

  it("dims the playhead when the control cannot seek", () => {
    // A full-strength playhead on a control that does nothing is a lie.
    const dimmed = rules.filter((r) =>
      r.selectors.some((s) => s.startsWith('.pv2-scrubber[aria-disabled="true"] .pv2-scrubber__')),
    );
    expect(dimmed.length).toBeGreaterThan(0);
    dimmed.forEach((r) => expect(r.body).toMatch(/--text-faint/));
  });

  it("respects 3.6 -- no @media and no viewport units in the scrubber block", () => {
    const own = scrubberBlock();
    expect(own).not.toMatch(/@media/);
    expect(own).not.toMatch(/\d(vw|vh)/);
  });
});

describe("3.14 the buffered band is ONE element", () => {
  const published = (c) =>
    c.querySelector(".pv2-scrubber").style.getPropertyValue("--pv2-scrub-buffered");

  it("publishes the extent as one number", () => {
    const { container } = render(<Scrubber currentTime={10} duration={200} buffered={60} />);
    expect(published(container)).toBe("0.3");
  });

  it("never paints past the fill", () => {
    // A `buffered` left over from a longer source, or a duration that shrank,
    // must not put the band beyond the end of the bar.
    const { container } = render(<Scrubber currentTime={10} duration={200} buffered={9999} />);
    expect(published(container)).toBe("1");
  });

  it("publishes 0 rather than NaN, because NaN drops the calc() entirely", () => {
    // An invalid `calc()` is not zero — it is NO DECLARATION, which falls the
    // band back to `auto`, i.e. full width, covering the fill and the playhead.
    const { container } = render(<Scrubber currentTime={10} duration={200} buffered={NaN} />);
    expect(published(container)).toBe("0");
    const unknown = render(<Scrubber currentTime={10} duration={0} buffered={40} />);
    expect(published(unknown.container)).toBe("0");
  });

  it("positions the band from its own property, not the playhead's", () => {
    // Reusing `--pv2-scrub-fraction` would make the band sit exactly on the
    // fill and be invisible — a "buffered" indicator that shows the playhead.
    const band = rule(".pv2-scrubber__buffered");
    expect(band).toMatch(/inline-size:\s*calc\(var\(--pv2-scrub-buffered, 0\)\s*\*\s*100%\)/);
    expect(band).not.toMatch(/--pv2-scrub-fraction/);
  });

  it("draws the band in --text-faint, behind the fill", () => {
    // Contrast against the fill, not taste: the two sit on top of each other and
    // can only be told apart by brightness. Anything brighter reads as two bars.
    expect(rule(".pv2-scrubber__buffered")).toMatch(/background:\s*var\(--text-faint\)/);
    // And DOM order puts it before the fill, so the fill paints last.
    const { container } = render(<Scrubber currentTime={10} duration={200} buffered={60} />);
    const children = [...container.querySelector(".pv2-scrubber").children].map((el) =>
      el.className.replace("pv2-scrubber__", ""),
    );
    expect(children.indexOf("buffered")).toBeLessThan(children.indexOf("fill"));
  });

  it("does not let the band swallow a seek aimed at it", () => {
    // The band covers most of the rail. Without this, pressing anywhere in the
    // buffered part of the bar would stop seeking.
    expect(rule(".pv2-scrubber__buffered")).toMatch(/pointer-events:\s*none/);
  });

  it("shares the rail's positioning, so the band cannot reflow the row", () => {
    // The band has to be absolutely positioned against the wrapper like the rail
    // and the fill. Left in normal flow it would push the thumb and the times down
    // every time it grew — and because it grows on a network event, the row would
    // jump on a slow connection.
    //
    // `blockFrom` finds the FIRST rule mentioning the rail, which is the
    // `data-hovered` growth rule; this needs the LAYERING rule, so it is located
    // explicitly rather than by name.
    const layering = rules.find(
      (r) =>
        r.selectors.includes(".pv2-scrubber__rail") &&
        r.selectors.includes(".pv2-scrubber__fill") &&
        r.selectors.includes(".pv2-scrubber__buffered"),
    );
    expect(layering).toBeTruthy();
    expect(layering.body).toMatch(/position:\s*absolute/);
    expect(layering.body).toMatch(/inset-inline:\s*0/);
    // And the band only overrides the END edge, to pin its width from the left.
    expect(rule(".pv2-scrubber__buffered")).toMatch(/inset-inline-end:\s*auto/);
  });
});

describe("3.15 the hover bubble", () => {
  /* jsdom has no layout engine, so `getBoundingClientRect()` reports 0x0 for
   * everything. `hoverAnchor` handles that (a 0-width track centres the card and
   * never clamps), but the TEST has to pretend to be laid out for the clamp to be
   * exercised at all — so the rect is stubbed here rather than the assertion being
   * weakened. */
  const TRACK = { left: 0, width: 320, top: 0, height: 44, right: 320, bottom: 44, x: 0, y: 0 };

  const layout = (element, rect = TRACK) => {
    element.getBoundingClientRect = () => rect;
    return element;
  };

  const barOf = (container) => container.querySelector(".pv2-scrubber");
  const bubbleOf = (container) => container.querySelector(".pv2-scrubber__bubble");

  it("is absent until the bar is live", () => {
    // A bubble resting at the start of the bar is a claim about the film that
    // nobody asked for, sitting on top of the timecodes.
    const { container } = render(<Scrubber currentTime={10} duration={200} onSeek={vi.fn()} />);
    expect(bubbleOf(container)).toBeNull();
  });

  it("appears on hover and names the position under the pointer, not the playhead", () => {
    // The distinction the whole feature exists for. A bubble showing the playhead
    // would be a second copy of the timecode already in the transport.
    const { container } = render(<Scrubber currentTime={10} duration={200} onSeek={vi.fn()} />);
    const bar = layout(barOf(container));
    fireEvent.pointerEnter(bar);
    fireEvent.pointerMove(bar, { clientX: 160 });
    // Halfway along a 200s title is 100s, while the playhead is at 10s.
    expect(bubbleOf(container).textContent).toBe("1:40");
  });

  it("appears on keyboard FOCUS too, because there is no pointer to hover with", () => {
    // The same reason 3.13 grew the bar on focus. A keyboard viewer gets the
    // bubble because it restates `aria-valuetext` — which is the only preview
    // available without a pointer, not a bonus.
    const { container } = render(<Scrubber currentTime={95} duration={200} onSeek={vi.fn()} />);
    const bar = layout(barOf(container));
    fireEvent.focus(bar);
    expect(bubbleOf(container).textContent).toBe("1:35");
  });

  it("shows no bubble at all when the duration is unknown", () => {
    // The legacy guarded `safeDuration > 0` for this reason. A bubble reading
    // `0:00` under the pointer claims "the start of the film" when the truth is
    // "we do not know yet".
    const { container } = render(<Scrubber currentTime={0} duration={0} onSeek={vi.fn()} />);
    const bar = layout(barOf(container));
    fireEvent.pointerEnter(bar);
    fireEvent.pointerMove(bar, { clientX: 100 });
    expect(bubbleOf(container)).toBeNull();
  });

  it("shows no bubble for an inert control", () => {
    // An absent scrubber has no position to preview, and a bubble over a control
    // that cannot seek claims the seek is available.
    const { container } = render(
      <Scrubber currentTime={10} duration={200} present={false} onSeek={vi.fn()} />,
    );
    fireEvent.pointerEnter(barOf(container));
    fireEvent.pointerMove(barOf(container), { clientX: 160 });
    expect(bubbleOf(container)).toBeNull();
  });

  it("goes away when the pointer leaves", () => {
    const { container } = render(<Scrubber currentTime={10} duration={200} onSeek={vi.fn()} />);
    const bar = layout(barOf(container));
    fireEvent.pointerEnter(bar);
    fireEvent.pointerMove(bar, { clientX: 160 });
    expect(bubbleOf(container)).not.toBeNull();
    fireEvent.pointerLeave(bar);
    expect(bubbleOf(container)).toBeNull();
  });

  it("keeps the bubble out of the accessibility tree", () => {
    // The slider already announces `aria-valuetext`. A bubble in the tree means a
    // screen reader says the position twice per focus — and the bubble's number
    // changes on every pointer move, so as a live region it would be an unbounded
    // stream of updates interrupting whatever the viewer is reading.
    const { container } = render(<Scrubber currentTime={10} duration={200} onSeek={vi.fn()} />);
    const bar = layout(barOf(container));
    fireEvent.pointerEnter(bar);
    fireEvent.pointerMove(bar, { clientX: 160 });
    const bubble = bubbleOf(container);
    expect(bubble.getAttribute("aria-hidden")).toBe("true");
    expect(bubble.querySelector("img")).toBeNull();
  });

  it("is positioned from the ONE clamp, not a percentage", () => {
    // The legacy: `left: min(94, max(6, ratio*100))%`. On a 320px track 6% is
    // 19.2px, narrower than the 64px bubble, so its centre sits 19px from the edge
    // with half the bubble off-screen. `hoverAnchor` clamps the CENTRE to half a
    // bubble in, which is `10%` here.
    const { container } = render(<Scrubber currentTime={0} duration={200} onSeek={vi.fn()} />);
    const bar = layout(barOf(container));
    fireEvent.pointerEnter(bar);
    fireEvent.pointerMove(bar, { clientX: 0 });
    const left = bubbleOf(container).style.getPropertyValue("--pv2-bubble-left");
    expect(left).toBe("10%");
    expect(bubbleOf(container).getAttribute("data-clamped")).toBe("true");
  });

  it("centres a mid-bar hover without clamping", () => {
    const { container } = render(<Scrubber currentTime={0} duration={200} onSeek={vi.fn()} />);
    const bar = layout(barOf(container));
    fireEvent.pointerEnter(bar);
    fireEvent.pointerMove(bar, { clientX: 160 });
    const bubble = bubbleOf(container);
    expect(bubble.style.getPropertyValue("--pv2-bubble-left")).toBe("50%");
    expect(bubble.getAttribute("data-clamped")).toBe("false");
  });

  it("reads the TRACK's position, not the window's", () => {
    // The legacy's `hoverRatio * playerW` uses the player width to place something
    // measured from the track's left edge. On a track inset by 48px of timecodes
    // that puts the card 48px right of the position being pointed at.
    const inset = { ...TRACK, left: 48, right: 368, x: 48 };
    const { container } = render(<Scrubber currentTime={0} duration={200} onSeek={vi.fn()} />);
    const bar = layout(barOf(container), inset);
    fireEvent.pointerEnter(bar);
    fireEvent.pointerMove(bar, { clientX: 48 + 160 });
    expect(bubbleOf(container).textContent).toBe("1:40");
    expect(bubbleOf(container).style.getPropertyValue("--pv2-bubble-left")).toBe("50%");
  });

  it("cannot be aimed at by a press, because it covers the bar", () => {
    // The bubble sits over the middle of the track. If it took the pointer, the
    // position it describes would be unseekable — a preview you cannot use to
    // preview.
    expect(rule(".pv2-scrubber__bubble")).toMatch(/pointer-events:\s*none/);
  });

  it("uses the bubble width the clamp was computed from", () => {
    // A clamp computed from a width that has quietly changed is worse than no
    // clamp: it looks correct mid-bar and puts half the bubble off-screen at the
    // ends. `--pv2-bubble-width` and `BUBBLE_WIDTH` are the same contract, so the
    // stylesheet value is asserted against the number the JS actually uses.
    expect(rule(".pv2-scrubber")).toMatch(/--pv2-bubble-width:\s*64px/);
    expect(rule(".pv2-scrubber__bubble")).toMatch(
      /inline-size:\s*var\(--pv2-bubble-width\)/,
    );
    expect(BUBBLE_WIDTH).toBe(64);
  });

  it("centres the bubble on `left`, so the clamp can keep half a card on screen", () => {
    // Without `translateX(-50%)`, `left` is the LEADING edge and the clamp in
    // `hoverAnchor` — which clamps the centre — would be wrong at every position.
    expect(rule(".pv2-scrubber__bubble")).toMatch(/translate:\s*-50%\s+0/);
  });
});

describe("3.15 the thumbnail is opt-in", () => {
  const barOf = (container) => container.querySelector(".pv2-scrubber");
  const artOf = (container) => container.querySelector(".pv2-scrubber__bubble-art");

  const live = (container, clientX = 160) => {
    const bar = barOf(container);
    bar.getBoundingClientRect = () => ({
      left: 0,
      width: 320,
      top: 0,
      height: 44,
      right: 320,
      bottom: 44,
      x: 0,
      y: 0,
    });
    fireEvent.pointerEnter(bar);
    fireEvent.pointerMove(bar, { clientX });
  };

  it("shows NO art until the viewer asks, even on hover", () => {
    // The item: "the thumbnail is **opt-in** (`T`)". The legacy opens a second full
    // HLS session (`previewThumbs.js:107-121`) the moment a pointer lands on the
    // bar, so opt-in is the whole point of this sub-item — not a detail.
    const { container } = render(<Scrubber currentTime={0} duration={200} onSeek={vi.fn()} />);
    live(container);
    expect(barOf(container).getAttribute("data-thumbs")).toBe("off");
    expect(artOf(container)).toBeNull();
    // The timecode is still there. That is the part that is not opt-in.
    expect(container.querySelector(".pv2-scrubber__bubble-time").textContent).toBe("1:40");
  });

  it("arms on `T`, and disarms on `T` again", () => {
    const { container } = render(<Scrubber currentTime={0} duration={200} onSeek={vi.fn()} />);
    const bar = barOf(container);
    fireEvent.keyDown(bar, { key: "t" });
    expect(barOf(container).getAttribute("data-thumbs")).toBe("on");
    fireEvent.keyDown(barOf(container), { key: "T" });
    expect(barOf(container).getAttribute("data-thumbs")).toBe("off");
  });

  it("does not seek when `T` is pressed", () => {
    // The opt-in key shares a handler with the arrow keys. If it fell through,
    // arming the thumbnails would also step the playhead — a silent state change
    // riding along with an unrelated one.
    const onSeek = vi.fn();
    const { container } = render(<Scrubber currentTime={100} duration={200} onSeek={onSeek} />);
    fireEvent.keyDown(barOf(container), { key: "t" });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("does not arm on `T` for an inert control", () => {
    // An absent scrubber is out of the tab order, so this is mostly belt-and-braces
    // — but a control that cannot be reached must not keep state that says the
    // feature is on.
    const { container } = render(
      <Scrubber currentTime={0} duration={200} present={false} onSeek={vi.fn()} />,
    );
    fireEvent.keyDown(barOf(container), { key: "t" });
    expect(barOf(container).getAttribute("data-thumbs")).toBe("off");
  });
});

describe("3.15 the decode is gated on opt-in AND on settling", () => {
  const PREVIEW = { url: "https://cdn.test/master.m3u8", refUrl: "https://cdn.test/ref", sourceKey: "s1" };
  const RECT = { left: 0, width: 320, top: 0, height: 44, right: 320, bottom: 44, x: 0, y: 0 };

  let decode;

  beforeEach(() => {
    vi.useFakeTimers();
    // Resetting the IMPORTED binding, not a fresh `vi.fn()`. The module mock
    // installed one function and the component calls that one; a second spy would
    // be a different function, so every assertion below would be reading a mock
    // nothing ever called — which passes for "no decoder was opened" and fails for
    // every other reason.
    decode = getPreviewThumb;
    decode.mockReset();
    decode.mockResolvedValue("blob:frame");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const setup = (props = {}) => {
    const utils = render(
      <Scrubber
        currentTime={0}
        duration={200}
        onSeek={vi.fn()}
        preview={PREVIEW}
        {...props}
      />,
    );
    const bar = utils.container.querySelector(".pv2-scrubber");
    bar.getBoundingClientRect = () => RECT;
    return { ...utils, bar };
  };

  const arm = (utils, clientX = 160) => {
    fireEvent.keyDown(utils.bar, { key: "t" });
    fireEvent.pointerEnter(utils.bar);
    fireEvent.pointerMove(utils.bar, { clientX });
  };

  const artOf = (container) => container.querySelector(".pv2-scrubber__bubble-art img");

  it("opens NO decoder while the feature is off, however long the pointer rests", () => {
    // The item's whole point. The legacy mounts a second hls.js instance
    // (`previewThumbs.js:107-121`) the moment a pointer lands.
    const utils = setup();
    fireEvent.pointerEnter(utils.bar);
    fireEvent.pointerMove(utils.bar, { clientX: 160 });
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it("waits for the pointer to settle before opening a decoder", () => {
    // Opt-in alone is opt-in in name only. A viewer who armed it and swept the
    // pointer across a title would otherwise open a decoder per position passed.
    const utils = setup();
    arm(utils);
    act(() => {
      vi.advanceTimersByTime(THUMBNAIL_SETTLE_MS - 1);
    });
    expect(decode).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(decode).toHaveBeenCalledTimes(1);
  });

  it("shows the timecode immediately, while the art is still decoding", () => {
    // The bubble must not wait on the decoder. `previewThumbs` is an off-screen
    // HLS session; a bubble that blocked on it would add a second of latency to
    // the timecode, which is the thing the viewer actually asked for.
    const utils = setup();
    arm(utils);
    expect(utils.container.querySelector(".pv2-scrubber__bubble-time").textContent).toBe("1:40");
    expect(artOf(utils.container)).toBeNull();
  });

  it("decodes the position under the POINTER, not the playhead", () => {
    const utils = setup();
    arm(utils, 80); // a quarter along a 200s title
    act(() => {
      vi.advanceTimersByTime(THUMBNAIL_SETTLE_MS + 2);
    });
    expect(decode).toHaveBeenCalledWith(expect.objectContaining({ seconds: 50 }));
  });

  it("does not decode half a second past the end", () => {
    // The pipeline has a settle window, so a decode at the final frame usually
    // misses — and a preview that never resolves is a preview that never appears.
    const utils = setup({ duration: 4 });
    arm(utils, 320);
    act(() => {
      vi.advanceTimersByTime(THUMBNAIL_SETTLE_MS + 2);
    });
    expect(decode).toHaveBeenCalledWith(expect.objectContaining({ seconds: 3.5 }));
  });

  it("passes the source identity through, so the pipeline can key its cache", () => {
    const utils = setup();
    arm(utils);
    act(() => {
      vi.advanceTimersByTime(THUMBNAIL_SETTLE_MS + 2);
    });
    expect(decode).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKey: "s1", refUrl: PREVIEW.refUrl }),
    );
  });

  it("opens no decoder when there is nothing to decode from", () => {
    // A decode attempt that cannot succeed is a failure log on every hover.
    const utils = setup({ preview: null });
    arm(utils);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it("cancels a decode when the pointer moves away first", async () => {
    // A sweep outruns the serialised pipeline, so every abandoned position must
    // stop rather than queue: a decoder is a second video element.
    const utils = setup();
    arm(utils, 40);
    act(() => {
      vi.advanceTimersByTime(THUMBNAIL_SETTLE_MS + 2);
    });
    fireEvent.pointerLeave(utils.bar);
    await act(async () => {
      await Promise.resolve();
    });
    expect(artOf(utils.container)).toBeNull();
  });

  it("never shows a frame decoded for ANOTHER source", async () => {
    // Not a stale preview — a preview of the wrong film. This is why the art is
    // keyed by `sourceKey` and read at render rather than cleared in an effect.
    const utils = setup();
    arm(utils);
    act(() => {
      vi.advanceTimersByTime(THUMBNAIL_SETTLE_MS + 2);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(artOf(utils.container)).toBeTruthy();
    utils.rerender(
      <Scrubber
        currentTime={0}
        duration={200}
        onSeek={vi.fn()}
        preview={{ ...PREVIEW, sourceKey: "s2" }}
      />,
    );
    expect(artOf(utils.container)).toBeNull();
  });

  it("never shows art from a position the pointer has left", async () => {
    // The pipeline serialises captures, so a sweep genuinely overlaps: request A for
    // an abandoned position can resolve AFTER request B for the position the viewer
    // is actually on. Without newest-wins the bubble ends up showing the frame for
    // where the pointer used to be — which reads as a broken preview, not a slow one.
    let resolveA;
    let resolveB;
    decode.mockImplementationOnce(
      () => new Promise((r) => {
        resolveA = r;
      }),
    );
    decode.mockImplementationOnce(
      () => new Promise((r) => {
        resolveB = r;
      }),
    );

    const utils = setup();
    arm(utils, 40); // 25s
    act(() => {
      vi.advanceTimersByTime(THUMBNAIL_SETTLE_MS + 2);
    });
    // The viewer moves on before A comes back.
    fireEvent.pointerMove(utils.bar, { clientX: 200 }); // 125s
    act(() => {
      vi.advanceTimersByTime(THUMBNAIL_SETTLE_MS + 2);
    });

    // B lands first, then the abandoned A lands late.
    await act(async () => {
      resolveB("blob:current");
    });
    await act(async () => {
      resolveA("blob:abandoned");
    });
    expect(artOf(utils.container).getAttribute("src")).toBe("blob:current");
  });

  it("abandons a decode the pointer left before it even started", () => {
    // The cheap case, and the common one: a pointer that sweeps across and off in
    // under 120ms must not open a decoder at all. Cancelling after the timer fires
    // is too late to matter here.
    const utils = setup();
    arm(utils, 40);
    act(() => {
      vi.advanceTimersByTime(THUMBNAIL_SETTLE_MS - 20);
    });
    fireEvent.pointerLeave(utils.bar);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it("survives a rejected decode", async () => {
    // `getPreviewThumb` resolves null on pipeline failure, so a rejection means a
    // throw from the module itself or a test double. It must not become an
    // unhandled rejection, and the timecode must survive it.
    decode.mockRejectedValue(new Error("boom"));
    const utils = setup();
    arm(utils);
    act(() => {
      vi.advanceTimersByTime(THUMBNAIL_SETTLE_MS + 2);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(artOf(utils.container)).toBeNull();
    expect(utils.container.querySelector(".pv2-scrubber__bubble-time").textContent).toBe("1:40");
  });
});

describe("seeking still works with a thumb in the way", () => {
  it("seeks from the pointer position", () => {
    const onSeek = vi.fn();
    const { container } = render(<Scrubber currentTime={0} duration={200} onSeek={onSeek} />);
    const bar = container.querySelector(".pv2-scrubber");
    bar.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 44 });
    fireEvent.pointerDown(bar, { clientX: 100, button: 0 });
    expect(onSeek).toHaveBeenCalledWith(100);
  });

  it("still refuses a non-primary button", () => {
    const onSeek = vi.fn();
    const { container } = render(<Scrubber currentTime={0} duration={200} onSeek={onSeek} />);
    const bar = container.querySelector(".pv2-scrubber");
    bar.getBoundingClientRect = () => ({ left: 0, width: 200, top: 0, height: 44 });
    fireEvent.pointerDown(bar, { clientX: 100, button: 2 });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it("seeks on arrow keys with no pointer involved", () => {
    const onSeek = vi.fn();
    const { container } = render(<Scrubber currentTime={100} duration={200} onSeek={onSeek} />);
    fireEvent.keyDown(container.querySelector(".pv2-scrubber"), { key: "ArrowRight" });
    expect(onSeek).toHaveBeenCalledWith(105);
  });
});