import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import Scrubber from "../components/player/v2/Scrubber";
import { TICK_KIND } from "../components/player/v2/boundaryTicks";

/* PLAYER V2 boundary ticks — rendering (task.md 3.16).
 *
 * `boundaryTicks.test.js` owns the arithmetic and, more importantly, the rule that
 * an UNMEASURED boundary never becomes a tick. These tests check the other half:
 * that what survives reaches the DOM, is positioned from the same fraction the fill
 * uses, and stays decorative rather than becoming a second set of slider values.
 */

function renderScrubber(props = {}) {
  const ref = createRef();
  const utils = render(<Scrubber ref={ref} {...props} />);
  return { ...utils, ref };
}

const MEASURED = { introEndSeconds: 42, creditsStartSeconds: 5400, source: "cues" };

describe("Scrubber renders measured boundary ticks", () => {
  let warnSpy;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    warnSpy.mockRestore();
  });

  it("draws one mark per known boundary", () => {
    const { container } = renderScrubber({ duration: 6000, boundaries: MEASURED });
    expect(container.querySelectorAll(".pv2-scrubber__tick")).toHaveLength(2);
  });

  it("draws NOTHING for an unmeasured record", () => {
    // The load-bearing case. `SKIP_INTRO_DEFAULT_END` is 90 and is a guess; the
    // scrubber still skips on it, but a permanent mark would claim it as fact.
    const { container } = renderScrubber({
      duration: 6000,
      boundaries: { introEndSeconds: 90 },
    });
    expect(container.querySelectorAll(".pv2-scrubber__tick")).toHaveLength(0);
  });

  it("draws nothing before metadata gives the bar a denominator", () => {
    const { container } = renderScrubber({ duration: 0, boundaries: MEASURED });
    expect(container.querySelectorAll(".pv2-scrubber__tick")).toHaveLength(0);
  });

  it("draws a single boundary without leaving a gap in the bar", () => {
    const { container } = renderScrubber({
      duration: 6000,
      boundaries: { introEndSeconds: 42, source: "cues" },
    });
    expect(container.querySelectorAll(".pv2-scrubber__tick")).toHaveLength(1);
  });

  it("names each mark so CSS can tell credits from an intro end", () => {
    const { container } = renderScrubber({ duration: 6000, boundaries: MEASURED });
    const kinds = [...container.querySelectorAll(".pv2-scrubber__tick")].map((n) =>
      n.getAttribute("data-kind"),
    );
    expect(kinds).toEqual([TICK_KIND.INTRO, TICK_KIND.CREDITS]);
  });

  it("positions marks with the same fraction the fill uses", () => {
    // Both read `--pv2-scrub-fraction`, so a mark cannot drift from the geometry
    // it claims to divide. 5400s of 6000s is 90%.
    const { container } = renderScrubber({ duration: 6000, boundaries: MEASURED });
    const marks = [...container.querySelectorAll(".pv2-scrubber__tick")];
    expect(marks[1].style.left).toBe("90%");
  });

  it("clamps a boundary past the end onto the bar rather than off it", () => {
    const { container } = renderScrubber({
      duration: 600,
      boundaries: { introEndSeconds: 700, source: "cues" },
    });
    const [mark] = container.querySelectorAll(".pv2-scrubber__tick");
    // Unclamped this is 116% — a mark outside the track, which is invisible and
    // silently deforms the rail because it is no longer inside it.
    expect(mark.style.left).toBe("100%");
  });

  it("keeps the marks out of the accessibility tree", () => {
    // The slider already announces the position. Two more values per focus is noise,
    // not information — and the marks are a visual division, not a seekable target.
    const { container } = renderScrubber({ duration: 6000, boundaries: MEASURED });
    for (const mark of container.querySelectorAll(".pv2-scrubber__tick")) {
      expect(mark.getAttribute("aria-hidden")).toBe("true");
    }
    // Exactly one seekable element, unchanged by 3.16.
    expect(screen.getAllByRole("slider")).toHaveLength(1);
  });

  it("draws the marks above the fill so a mark stays legible once played", () => {
    const { container } = renderScrubber({ duration: 6000, boundaries: MEASURED });
    // The layers are children of the slider root, not of the render container.
    const order = [...container.querySelector(".pv2-scrubber").children].map((n) => n.className);
    const fill = order.findIndex((c) => String(c).includes("__fill"));
    const tick = order.findIndex((c) => String(c).includes("__tick"));
    expect(tick).toBeGreaterThan(fill);
    // And below the thumb, which paints last and must never be split by a mark.
    expect(order.findIndex((c) => String(c).includes("__thumb"))).toBeGreaterThan(tick);
  });
});