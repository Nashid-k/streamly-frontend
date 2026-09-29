import { describe, expect, it } from "vitest";
import { getCueBoundaries, parseCueOutDuration, parseCueWindows } from "../utils/hlsCueTags";

/* 6s segments. `at` places tag lines BEFORE that segment index, which is how a
   manifest expresses a boundary: the tag governs the segment that follows it.
   A CUE pair must span at least one segment, so opening at 2 and closing at 8
   really is a 36s break. */
function playlist({ at = {}, segments = 80, target = 6 } = {}) {
  const head = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${target}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
  ];
  const body = [];
  for (let i = 0; i < segments; i += 1) {
    const tag = at[i];
    if (tag) body.push(...String(tag).split("\n"));
    body.push(`#EXTINF:${target.toFixed(1)},`, `seg-${i}.m4s`);
  }
  body.push("#EXT-X-ENDLIST");
  return [...head, ...body].join("\n");
}

describe("parseCueOutDuration", () => {
  it("reads the DURATION attribute form", () => {
    expect(parseCueOutDuration("DURATION=30")).toBe(30);
    expect(parseCueOutDuration("DURATION=30.5")).toBe(30.5);
  });

  it("reads the bare form", () => {
    expect(parseCueOutDuration("30")).toBe(30);
    expect(parseCueOutDuration("42.25")).toBe(42.25);
  });

  it("ignores extra attributes", () => {
    expect(parseCueOutDuration('DURATION=30,CTIME="2026-01-01T00:00:00Z"')).toBe(30);
  });

  it("returns null for anything unusable", () => {
    expect(parseCueOutDuration("")).toBeNull();
    expect(parseCueOutDuration(null)).toBeNull();
    expect(parseCueOutDuration('CTIME="now"')).toBeNull();
  });
});

describe("parseCueWindows", () => {
  it("returns nothing for a manifest with no cue tags", () => {
    const { windows, total } = parseCueWindows(playlist());
    expect(windows).toEqual([]);
    expect(total).toBe(480);
  });

  it("returns nothing for a non-playlist payload", () => {
    expect(parseCueWindows("<html>nope</html>")).toEqual({ windows: [], total: 0 });
    expect(parseCueWindows("")).toEqual({ windows: [], total: 0 });
  });

  it("resolves a CUE pair against cumulative EXTINF offsets", () => {
    const { windows } = parseCueWindows(
      playlist({ at: { 2: "#EXT-X-CUE-OUT:DURATION=36", 8: "#EXT-X-CUE-IN" } }),
    );
    expect(windows).toHaveLength(1);
    expect(windows[0].outAt).toBe(12);
    expect(windows[0].inAt).toBe(48);
    expect(windows[0].declaredDuration).toBe(36);
  });

  it("keeps an unclosed break open", () => {
    const { windows } = parseCueWindows(playlist({ at: { 2: "#EXT-X-CUE-OUT:DURATION=90" } }));
    expect(windows[0].inAt).toBeNull();
    expect(windows[0].declaredDuration).toBe(90);
  });
});

describe("getCueBoundaries", () => {
  it("derives a real intro end that replaces the 90s guess", () => {
    const bounds = getCueBoundaries(
      playlist({ at: { 2: "#EXT-X-CUE-OUT:DURATION=36", 8: "#EXT-X-CUE-IN" } }),
    );
    expect(bounds).not.toBeNull();
    expect(bounds.introEndSeconds).toBe(48);
  });

  it("falls back to null so the caller keeps its estimate", () => {
    expect(getCueBoundaries(playlist())).toBeNull();
    expect(getCueBoundaries("not a playlist")).toBeNull();
  });

  it("ignores a break that opens too late to be an intro", () => {
    // 100 x 6s = 600s. The break opens at segment 60 => 360s, past the 150s
    // intro ceiling: a mid-roll marker, not a title sequence.
    const bounds = getCueBoundaries(
      playlist({
        segments: 100,
        at: { 60: "#EXT-X-CUE-OUT:DURATION=30", 65: "#EXT-X-CUE-IN" },
      }),
    );
    expect(bounds === null || bounds.introEndSeconds === 0).toBe(true);
  });

  it("treats an unclosed break opening in the tail as the credits", () => {
    // 600s total, tail runs from 0. An unclosed CUE-OUT at segment 80 => 480s.
    const bounds = getCueBoundaries(
      playlist({ segments: 100, at: { 80: "#EXT-X-CUE-OUT:DURATION=120" } }),
    );
    expect(bounds).not.toBeNull();
    expect(bounds.creditsStartSeconds).toBe(480);
  });

  it("falls back to the last break in the tail when it is closed", () => {
    const bounds = getCueBoundaries(
      playlist({
        segments: 100,
        at: { 80: "#EXT-X-CUE-OUT:DURATION=120", 90: "#EXT-X-CUE-IN" },
      }),
    );
    expect(bounds.creditsStartSeconds).toBe(480);
  });

  it("never mistakes the intro for the credits on a short asset", () => {
    // 4 x 6s = 24s. A fixed 15-minute credits window is WIDER than this asset, so
    // the tail used to start at 0 and the intro's own window qualified as credits.
    const bounds = getCueBoundaries(
      playlist({ segments: 4, at: { 1: "#EXT-X-CUE-OUT:DURATION=12", 3: "#EXT-X-CUE-IN" } }),
    );
    expect(bounds).not.toBeNull();
    expect(bounds.introEndSeconds).toBe(18);
    expect(bounds.creditsStartSeconds).toBeNull();
  });

  it("finds intro and credits together", () => {
    const bounds = getCueBoundaries(
      playlist({
        segments: 100,
        at: {
          2: "#EXT-X-CUE-OUT:DURATION=36",
          8: "#EXT-X-CUE-IN",
          90: "#EXT-X-CUE-OUT:DURATION=60",
        },
      }),
    );
    expect(bounds.introEndSeconds).toBe(48);
    expect(bounds.creditsStartSeconds).toBe(540);
  });
});
