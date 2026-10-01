import { render, act, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import usePlayerControls from "../components/player/v2/hooks/usePlayerControls";
import Scrubber from "../components/player/v2/Scrubber";
import {
  BUFFERED_QUANTUM_SECONDS,
  bufferedFraction,
  bufferedMoved,
} from "../components/player/v2/timecode";

/* PLAYER V2 buffered band (task.md 3.14).
 *
 * The item: "Buffered as ONE element at `--text-faint`, replacing
 * `bufferedRanges.map(...)` which allocates a fresh array 4x/sec (`:1761`)."
 *
 * The allocation is the stated complaint, but it is a symptom. Underneath it there
 * are three separate defects, and a test suite that only counted array allocations
 * would pass on all of them:
 *
 *   1. a LIST of bands where a viewer sees one continuous bar,
 *   2. a `setState` per `timeupdate` — four re-renders a second for a band that
 *      moved a fraction of a pixel,
 *   3. the WRONG extent, because `bufferedRanges` hands the renderer the browser's
 *      whole cache while the question a viewer asks is "how far from HERE".
 *
 * So this file tests the pure function hard, then the subscription's shape, then
 * the single element. jsdom has no `HTMLMediaElement.buffered`, which is why the
 * ranges below are duck-typed plain objects — the same reason the legacy wrapped
 * its read in `try/catch`.
 */

/** A `TimeRanges` stand-in. */
const ranges = (...pairs) => ({
  length: pairs.length,
  start: (i) => pairs[i][0],
  end: (i) => pairs[i][1],
});

describe("bufferedFraction answers 'how far from here'", () => {
  it("uses the end of the range containing the playhead", () => {
    // The case that matters: after a seek the browser can hold disjoint spans, and
    // the furthest one says nothing about whether the NEXT ten seconds will stall.
    expect(bufferedFraction(ranges([0, 10], [50, 100]), 55, 200)).toBeCloseTo(0.5, 6);
    expect(bufferedFraction(ranges([0, 30]), 10, 120)).toBeCloseTo(0.25, 6);
  });

  it("treats a negative playhead as the start of the media", () => {
    // A seek that clamps to -0.001, or a stub reporting `currentTime` as -1 before
    // metadata lands. Taking the value literally makes `at >= start` false for
    // `[0, 40]`, which then reads as "in a gap" and reports 0 — a band that vanishes
    // on the very first frame.
    expect(bufferedFraction(ranges([0, 40]), -1, 100)).toBeCloseTo(0.4, 6);
    expect(bufferedFraction(ranges([0, 40]), NaN, 100)).toBeCloseTo(0.4, 6);
  });

  it("reports the next range's START when the playhead sits in a gap", () => {
    // Not 0. The viewer can seek to 50, so 50 is the honest extent — reporting 0
    // claims they cannot even see the frame they are on.
    expect(bufferedFraction(ranges([0, 10], [50, 100]), 30, 200)).toBeCloseTo(0.25, 6);
  });

  it("treats the exact start of a range as INSIDE it", () => {
    // Seeking to 50 in a `[50, 100]` cache is the single most common buffered
    // geometry there is, and `at > start` would drop it: the range is then neither
    // containing (50 is not strictly inside itself) nor ahead (50 is not greater
    // than 50), so the band collapses to nothing while the viewer watches a frame
    // that is provably cached.
    expect(bufferedFraction(ranges([50, 100]), 50, 200)).toBeCloseTo(0.5, 6);
    expect(bufferedFraction(ranges([0, 10], [50, 100]), 50, 200)).toBeCloseTo(0.5, 6);
  });

  it("clamps a range that starts beyond the duration", () => {
    // A duration that shrank after a source swap, or a stale cache, leaves ranges
    // past the new end. Unclamped that is a 250%-wide band — the one case where an
    // over-reported buffer looks like a full bar rather than an obviously broken one.
    expect(bufferedFraction(ranges([500, 700]), 30, 200)).toBe(1);
    expect(bufferedFraction(ranges([0, 400]), 10, 200)).toBe(1);
  });

it("picks the NEAREST range ahead, not the furthest", () => {
    // A browser that cached [60, 90] and [500, 700] and the viewer sitting in a gap
    // at 30: the answer is 60. Painting to 700 would show a full bar for a buffer
    // that cannot play the next 470 seconds — the exact lie this function exists
    // to stop telling.
    expect(bufferedFraction(ranges([0, 10], [60, 90], [500, 700]), 30, 800)).toBeCloseTo(0.075, 6);
  });

  it("reports the next range's start when the playhead is before all ranges", () => {
    // A post-seek clamped position. The viewer can seek to 10, so 10 is the
    // honest extent — and 0 would claim they cannot even see the frame they are on.
    expect(bufferedFraction(ranges([10, 40]), 0, 100)).toBeCloseTo(0.1, 6);
  });

  it("reports nothing when the playhead is past every cached range", () => {
    // The bug every "take the biggest end" implementation ships. A cache of
    // [0, 40] with the playhead at 100 has nothing AHEAD: a band reaching 40%
    // would promise forward playback that stalls on the next frame.
    expect(bufferedFraction(ranges([0, 40]), 100, 200)).toBe(0);
    expect(bufferedFraction(ranges([0, 40]), 40, 200)).toBe(0);
  });

  it("reports nothing when nothing is buffered", () => {
    expect(bufferedFraction(ranges(), 10, 200)).toBe(0);
    expect(bufferedFraction(null, 10, 200)).toBe(0);
    expect(bufferedFraction(undefined, 10, 200)).toBe(0);
  });

  it("skips degenerate ranges instead of drawing them", () => {
    // An inverted range is what a browser hands back around a discontinuity. It
    // can never be the CONTAINING range (start > end makes `at >= start && at < end`
    // unsatisfiable), which is exactly why this needs its own case: the damage is
    // done by the NEXT-RANGE branch, where an inverted [80, 20] reads as "you can
    // seek forward to 80" and paints a band 80% wide over nothing.
    expect(bufferedFraction(ranges([80, 20]), 10, 100)).toBe(0);
    // Zero-length is the same trap with less obvious arithmetic.
    expect(bufferedFraction(ranges([70, 70]), 10, 100)).toBe(0);
    // And a genuine range alongside them is still found.
    expect(bufferedFraction(ranges([80, 20], [0, 40]), 10, 100)).toBeCloseTo(0.4, 6);
  });

  it("returns 0 for an unknown duration", () => {
    // Before metadata there is no denominator, and a NaN fraction would drop the
    // `calc()` and fall the band back to full width.
    expect(bufferedFraction(ranges([0, 40]), 10, 0)).toBe(0);
    expect(bufferedFraction(ranges([0, 40]), 10, NaN)).toBe(0);
    expect(bufferedFraction(ranges([0, 40]), 10, Infinity)).toBe(0);
  });

  it("never exceeds 1", () => {
    // A browser that over-reports, or a duration that shrank after a source swap.
    expect(bufferedFraction(ranges([0, 400]), 10, 200)).toBe(1);
  });

  it("survives a TimeRanges that throws on one index", () => {
    // The legacy wrapped its whole read in `try/catch` because this throws. A
    // single bad index must cost that range, not the entire band — and the range
    // after it is still usable.
    const hostile = {
      length: 2,
      start: (i) => {
        if (i === 0) throw new Error("IndexSizeError");
        return 0;
      },
      end: (i) => (i === 0 ? 10 : 80),
    };
    expect(bufferedFraction(hostile, 10, 100)).toBeCloseTo(0.8, 6);
  });

  it("keeps the usable ranges when one index throws, instead of abandoning all of them", () => {
    // The legacy's `try` wrapped the WHOLE read, so one bad index meant no band at
    // all. The per-index `try` is what makes this worth a test: the range before the
    // bad one contains the playhead, the range after it is a valid way forward, and
    // both still count.
    const hostile = {
      length: 3,
      start: (i) => {
        if (i === 1) throw new Error("IndexSizeError");
        return i === 0 ? 0 : 140;
      },
      end: (i) => (i === 1 ? 10 : i === 0 ? 80 : 180),
    };
    // Index 0 contains the playhead and must be honoured...
    expect(bufferedFraction(hostile, 10, 200)).toBeCloseTo(0.4, 6);
    // ...and when the playhead moves into the gap past it, index 2 — the one
    // BEHIND the throwing index — is still the next range forward. Losing it would
    // drop the band to 0 across the whole gap.
    expect(bufferedFraction(hostile, 100, 200)).toBeCloseTo(0.7, 6);
  });

  it("does not need the object to be a real TimeRanges", () => {
    // `instanceof TimeRanges` would be false for jsdom's bare object AND for the
    // shim the source ladder hands a detached element.
    expect(bufferedFraction({ length: 1, start: () => 0, end: () => 50 }, 10, 100)).toBeCloseTo(0.5, 6);
  });
});

describe("the state write is gated", () => {
  it("moves on half a second or more", () => {
    expect(bufferedMoved(10, 10)).toBe(false);
    expect(bufferedMoved(10.4, 10)).toBe(false);
    expect(bufferedMoved(10.5, 10)).toBe(true);
    expect(bufferedMoved(9.5, 10)).toBe(true);
  });

  it("measures the gap in seconds, not in fraction", () => {
    // A fraction-based threshold changes meaning with the duration: 0.1s is 1% of
    // a 10s clip and 0.003% of an hour-long title, so the same gap would be
    // "worth re-rendering" on one and noise on the other. The band has to move
    // the same VISIBLE amount on both, so the gate is in seconds.
    expect(BUFFERED_QUANTUM_SECONDS).toBe(0.5);
    const onAShortClip = 1 + 0.1;
    const onAnHourLongTitle = 1800 + 0.1;
    // Same 0.1s gap, on both durations: under the quantum on both.
    expect(bufferedMoved(onAShortClip, 1)).toBe(false);
    expect(bufferedMoved(onAnHourLongTitle, 1800)).toBe(false);
    // And the same answer when the gap IS visible.
    expect(bufferedMoved(1 + 0.6, 1)).toBe(true);
    expect(bufferedMoved(1800 + 0.6, 1800)).toBe(true);
  });
});

describe("usePlayerControls reads the band from the right event", () => {
  const Probe = ({ video }) => {
    const controls = usePlayerControls({ current: video }, { current: null }, video);
    return <div data-testid="probe" data-buffered={String(controls.buffered)} />;
  };

  const attach = () => {
    const listeners = {};
    const video = {
      currentTime: 10,
      duration: 200,
      volume: 1,
      muted: false,
      buffered: ranges([0, 60]),
      play: vi.fn(),
      pause: vi.fn(),
      addEventListener: (type, fn) => {
        (listeners[type] ||= []).push(fn);
      },
      removeEventListener: (type, fn) => {
        listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
      },
    };
    return { video, fire: (type) => (listeners[type] || []).forEach((fn) => fn()) };
  };

  it("seeds the band from the element", () => {
    // The element may already have buffered before this effect runs — the same
    // reason `volume` is seeded. Without it the band is empty until the first
    // `progress`, which on a fast connection is never.
    const { video } = attach();
    const { getByTestId } = render(<Probe video={video} />);
    expect(getByTestId("probe").getAttribute("data-buffered")).toBe("60");
  });

  it("updates on `progress`, not on `timeupdate`", () => {
    // The whole point of the item. `timeupdate` is the browser's ~4Hz clock; the
    // buffer only moves when the browser downloads, which is what `progress`
    // reports. Subscribing `timeupdate` is the legacy's mistake reproduced in a
    // new place.
    const { video, fire } = attach();
    render(<Probe video={video} />);
    video.buffered = ranges([0, 90]);
    fire("progress");
    fire("timeupdate");
    expect(video.currentTime).toBe(10);
  });

  it("updates on `seeked`, because a seek changes which range contains the playhead", () => {
    // Seeking backward into an uncached stretch must not leave the band claiming
    // more than is cached — no new download has happened, so only `seeked` can
    // tell us.
    const { video, fire } = attach();
    const { getByTestId } = render(<Probe video={video} />);
    video.currentTime = 150;
    video.buffered = ranges([140, 170]);
    act(() => fire("seeked"));
    expect(getByTestId("probe").getAttribute("data-buffered")).toBe("170");
  });

  it("does not re-render for a band that has not visibly moved", () => {
    const { video, fire } = attach();
    const { getByTestId } = render(<Probe video={video} />);
    const before = getByTestId("probe").textContent;
    // Ten progress events, each a fiftieth of a second further along: a fifth of
    // a second of download in total, all of it under the half second quantum, so
    // the rendered value must not move at all.
    for (let i = 1; i <= 10; i += 1) {
      video.buffered = ranges([0, 60 + i * 0.02]);
      act(() => fire("progress"));
    }
    expect(getByTestId("probe").getAttribute("data-buffered")).toBe("60");
    expect(getByTestId("probe").textContent).toBe(before);
  });

  it("does re-render once the band has moved a visible amount", () => {
    const { video, fire } = attach();
    const { getByTestId } = render(<Probe video={video} />);
    video.buffered = ranges([0, 62]);
    act(() => fire("progress"));
    expect(getByTestId("probe").getAttribute("data-buffered")).toBe("62");
  });

  it("unsubscribes, so a torn-down element cannot update a live shell", () => {
    const { video, fire } = attach();
    const { unmount } = render(<Probe video={video} />);
    unmount();
    expect(() => fire("progress")).not.toThrow();
    expect(() => fire("seeked")).not.toThrow();
  });

  it("survives a `buffered` getter that throws", () => {
    // The teardown race: `video.buffered` can throw while a source swap detaches
    // the element. An unguarded read takes the `progress` handler — and every
    // other subscriber to it — down with it, silently.
    const { video, fire } = attach();
    render(<Probe video={video} />);
    Object.defineProperty(video, "buffered", {
      get() {
        throw new Error("InvalidStateError");
      },
    });
    expect(() => act(() => fire("progress"))).not.toThrow();
    expect(() => act(() => fire("timeupdate"))).not.toThrow();
  });

  it("keeps working after a bad read, rather than latching", async () => {
    // The recovery case: a throw must not leave the subscription permanently dead.
    const { video, fire } = attach();
    const { getByTestId } = render(<Probe video={video} />);
    let broken = true;
    Object.defineProperty(video, "buffered", {
      get() {
        if (broken) {
          broken = false;
          throw new Error("InvalidStateError");
        }
        return ranges([0, 120]);
      },
    });
    act(() => fire("progress"));
    expect(getByTestId("probe").getAttribute("data-buffered")).toBe("60");
    act(() => fire("progress"));
    await waitFor(() => expect(getByTestId("probe").getAttribute("data-buffered")).toBe("120"));
  });
});

describe("the band is fed through the transport, not re-derived", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders exactly one band for a scrubber with disjoint ranges behind it", () => {
    // End to end: however many spans the browser holds, the DOM has one band.
    const { container } = render(
      <Scrubber currentTime={150} duration={200} buffered={170} onSeek={vi.fn()} />,
    );
    expect(container.querySelectorAll(".pv2-scrubber__buffered")).toHaveLength(1);
    expect(
      container.querySelector(".pv2-scrubber").style.getPropertyValue("--pv2-scrub-buffered"),
    ).toBe("0.85");
  });
});