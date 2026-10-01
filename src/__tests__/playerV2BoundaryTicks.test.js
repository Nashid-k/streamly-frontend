import { describe, expect, it } from "vitest";
import {
  boundariesAreMeasured,
  boundaryTicks,
  TICK_KIND,
} from "../components/player/v2/boundaryTicks";
import { SKIP_INTRO_DEFAULT_END } from "../utils/skipMarkers";

/* PLAYER V2 boundary ticks (task.md 3.16).
 *
 * 3.16 asks for "chapter + credits ticks from `cueBoundaries` — data that already
 * exists at `:3451-3453`". Two things about that item are worth stating before the
 * tests, because both are ways of building the wrong thing:
 *
 *   1. `cueBoundaries` is NOT chapters. It is two fields —
 *      `introEndSeconds` and `creditsStartSeconds` — and either may be absent. So
 *      there are at most two ticks, they are named, and there is no chapter list. A
 *      chapter strip built here would be a feature nobody asked for, on data that
 *      cannot support it.
 *
 *   2. The skip window has two sources and they are NOT interchangeable:
 *
 *        MEASURED   the manifest's own cue tags, or the SkipDB dataset keyed by
 *                   IMDb id. Real boundaries for this title.
 *        ESTIMATED  `SKIP_INTRO_DEFAULT_END = 90` and the tail heuristic. A guess,
 *                   used when nothing measured arrives.
 *
 *      The legacy shows the same skip pill either way, so the viewer cannot tell
 *      which they are looking at. That is defensible for a button nobody sees until
 *      they choose to press it. It is not defensible for a permanent MARK on a
 *      timeline: a tick at 90s is a claim that the intro ends there, and drawn from
 *      the heuristic that is a false claim about a specific film, in the same ink as
 *      a measured one, that the viewer cannot dismiss and will learn to trust.
 *
 * So the load-bearing rule is: NO TICK IS EVER DRAWN FROM THE ESTIMATE. These tests
 * exist mainly to hold that line, because it is the rule most likely to be
 * "simplified" away by whoever next touches the scrubber.
 */

const MEASURED = { introEndSeconds: 42, creditsStartSeconds: 5400, source: "cues" };

describe("boundaryTicks draws what is actually known", () => {
  it("produces one tick per stated boundary", () => {
    const ticks = boundaryTicks(MEASURED, 6000);
    expect(ticks).toHaveLength(2);
    expect(ticks.map((t) => t.kind)).toEqual([TICK_KIND.INTRO, TICK_KIND.CREDITS]);
  });

  it("positions them as fractions of THIS control's duration", () => {
    const ticks = boundaryTicks(MEASURED, 6000);
    // 42s and 5400s of a 6000s title.
    expect(ticks[0].at).toBeCloseTo(0.007, 6);
    expect(ticks[1].at).toBeCloseTo(0.9, 6);
  });

  it("draws one tick when only one boundary is known", () => {
    // The common case: a manifest with a cue-out but no tail cue. Rendering both
    // and leaving one blank would put a hole in the bar.
    const ticks = boundaryTicks({ introEndSeconds: 42, source: "cues" }, 6000);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].kind).toBe(TICK_KIND.INTRO);
  });

  it("draws nothing when there is nothing known", () => {
    // The estimate case. `SKIP_INTRO_DEFAULT_END` is 90 and is a GUESS; a tick
    // there is a false claim about a specific film, permanently on the bar.
    expect(boundaryTicks(null, 6000)).toEqual([]);
    expect(boundaryTicks(undefined, 6000)).toEqual([]);
    expect(boundaryTicks({}, 6000)).toEqual([]);
    expect(boundaryTicks({ introEndSeconds: 0, creditsStartSeconds: null }, 6000)).toEqual([]);
  });

  it("draws nothing for an unknown duration", () => {
    // A tick at `NaN` is a tick in the wrong place rather than no tick at all, and
    // the bar has no denominator before metadata lands.
    expect(boundaryTicks(MEASURED, 0)).toEqual([]);
    expect(boundaryTicks(MEASURED, NaN)).toEqual([]);
  });

  it("never draws the 90s heuristic", () => {
    // Spelled as a literal comparison against the constant, so this keeps passing
    // if `SKIP_INTRO_DEFAULT_END` is ever retuned — and keeps failing if someone
    // wires the estimate into the ticks.
    const estimated = { introEndSeconds: SKIP_INTRO_DEFAULT_END };
    expect(boundaryTicks(estimated, 6000)).toEqual([]);
    expect(SKIP_INTRO_DEFAULT_END).toBe(90);
  });

  it("ignores a boundary at or before zero", () => {
    // A boundary at exactly 0 states nothing — the bar already starts there, so the
    // tick would be invisible AND would imply an intro ending the instant playback
    // begins. A negative one is a broken record.
    expect(boundaryTicks({ introEndSeconds: 0, creditsStartSeconds: -5, source: "cues" }, 6000)).toEqual([]);
  });

  it("clamps a boundary past the end rather than drawing it off the bar", () => {
    // A dataset boundary for a title whose runtime the player measured differently,
    // or a source swap that shortened the duration. Unclamped this is a fraction
    // above 1, i.e. a tick outside the track — invisible, and it silently
    // deforms the rail because it is no longer inside it.
    const [tick] = boundaryTicks({ introEndSeconds: 700, creditsStartSeconds: null, source: "cues" }, 600);
    expect(tick.at).toBe(1);
    expect(tick.seconds).toBe(700);
  });

  it("ignores non-numeric boundaries", () => {
    expect(
      boundaryTicks({ introEndSeconds: "later", creditsStartSeconds: {}, source: "cues" }, 6000),
    ).toEqual([]);
  });

  it("orders by position, not by the order the fields are written", () => {
    // A credits tick for a 40-minute title and an intro tick at 42s arrive in
    // whichever order the payload happened to serialise. DOM order must match
    // what the eye reads.
    const ticks = boundaryTicks(
      { creditsStartSeconds: 300, introEndSeconds: 42, source: "cues" },
      6000,
    );
    expect(ticks.map((t) => t.kind)).toEqual([TICK_KIND.INTRO, TICK_KIND.CREDITS]);
  });

  it("gives each tick an identity that survives a re-render", () => {
    // The id includes the position, so a re-render with a moved boundary produces a
    // NEW key rather than React reusing a node that was drawn at the wrong place.
    const [first] = boundaryTicks({ introEndSeconds: 42, source: "cues" }, 6000);
    const [moved] = boundaryTicks({ introEndSeconds: 84, source: "cues" }, 6000);
    expect(first.id).not.toBe(moved.id);
    expect(first.id).toBe("intro-42");
  });

  it("keeps two ticks at the same second distinct", () => {
    // A title whose intro cue-out and credits cue-in coincide would otherwise
    // produce two elements with one React key, and React drops one of them.
    const ticks = boundaryTicks({ introEndSeconds: 300, creditsStartSeconds: 300, source: "cues" }, 6000);
    expect(ticks).toHaveLength(2);
    expect(new Set(ticks.map((t) => t.id)).size).toBe(2);
  });
});

describe("boundariesAreMeasured is the confidence, not a guess", () => {
  it("accepts both measured sources", () => {
    expect(boundariesAreMeasured({ source: "cues" })).toBe(true);
    expect(boundariesAreMeasured({ source: "dataset" })).toBe(true);
  });

  it("refuses anything else, including the absence of a source", () => {
    // The shape a hand-edited or future source would have. Defaulting to "probably
    // fine" is how a guess ends up painted like a measurement.
    expect(boundariesAreMeasured(null)).toBe(false);
    expect(boundariesAreMeasured({})).toBe(false);
    expect(boundariesAreMeasured({ source: "estimate" })).toBe(false);
    expect(boundariesAreMeasured({ source: "" })).toBe(false);
  });
});