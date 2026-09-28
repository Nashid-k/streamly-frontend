// Skip Intro / Skip Credits windows.
//
// The rule under test is deliberately an ESTIMATE: no provider in this app
// supplies intro/credit boundaries (verified against every resolver payload,
// the ZXC decryption, and the manifest parsers). These tests therefore pin
// the two things that matter when an estimate is involved:
//   1. the boundaries are where we say they are, and
//   2. a wrong estimate is CONTAINED — it costs a button, never a jump.
import { describe, expect, it } from "vitest";
import {
  getSkipIntroEnd,
  shouldShowSkipIntro,
  getSkipIntroTarget,
  SKIP_INTRO_OVERRIDES,
  getSkipOutroWindow,
  shouldShowSkipOutro,
  getSkipOutroTarget,
  shouldAutoSkipIntroOnce,
  SKIP_INTRO_DEFAULT_END,
  SKIP_INTRO_GRACE,
  SKIP_OUTRO_MIN_EPISODE_SECONDS,
  SKIP_OUTRO_TAIL_SECONDS,
} from "../utils/skipMarkers.js";

const LONG_EPISODE = 45 * 60; // 45 min
const tv = { type: "tv", id: "93405", duration: LONG_EPISODE };

describe("skip intro", () => {
  it("offers a boundary for a long episode, but never for a movie", () => {
    expect(getSkipIntroEnd(tv)).toBe(SKIP_INTRO_DEFAULT_END);
    // A movie's cold open is a scene — skipping 90s of it cuts story.
    expect(getSkipIntroEnd({ type: "movie", id: "550", duration: 2 * 3600 })).toBe(0);
  });

  it("declines on a short episode rather than guessing", () => {
    expect(getSkipIntroEnd({ type: "tv", id: "1", duration: 10 * 60 })).toBe(0);
  });

  it("still offers the button when the duration is unknown", () => {
    // Before metadata arrives, an intro is the only thing playing — refusing
    // here would hide the pill during the exact window it is useful. Safe,
    // because the button requires a tap.
    expect(getSkipIntroEnd({ type: "tv", id: "1", duration: 0 })).toBe(SKIP_INTRO_DEFAULT_END);
    expect(getSkipIntroEnd({ type: "tv", id: "1" })).toBe(SKIP_INTRO_DEFAULT_END);
  });

  it("is only visible inside the window, then disappears for good", () => {
    expect(shouldShowSkipIntro({ ...tv, currentTime: 0 })).toBe(true);
    expect(shouldShowSkipIntro({ ...tv, currentTime: SKIP_INTRO_DEFAULT_END })).toBe(true);
    // grace keeps it up a moment past the boundary
    expect(shouldShowSkipIntro({ ...tv, currentTime: SKIP_INTRO_DEFAULT_END + SKIP_INTRO_GRACE })).toBe(true);
    expect(shouldShowSkipIntro({ ...tv, currentTime: SKIP_INTRO_DEFAULT_END + SKIP_INTRO_GRACE + 1 })).toBe(false);
  });

  it("never shows at the end, or at a negative head", () => {
    expect(shouldShowSkipIntro({ ...tv, currentTime: 5, ended: true })).toBe(false);
    expect(shouldShowSkipIntro({ ...tv, currentTime: -1 })).toBe(false);
    expect(shouldShowSkipIntro({ ...tv, currentTime: NaN })).toBe(false);
  });

  it("yields the button entirely when the viewer asked for auto-skip", () => {
    // The setting's own copy: "instead of showing the Skip Intro button".
    expect(shouldShowSkipIntro({ ...tv, currentTime: 0, autoSkip: true })).toBe(false);
  });

  it("targets just past the boundary but never past the last 5s", () => {
    expect(getSkipIntroTarget(tv)).toBe(SKIP_INTRO_DEFAULT_END);
    // A 96s clip never even gets a boundary (under the 15-min floor).
    expect(getSkipIntroTarget({ type: "tv", id: "1", duration: 96 })).toBe(0);

    // The duration-5 clamp is only reachable through the override seam, and
    // only with a boundary later than the asset itself — i.e. bad data. That is
    // exactly what it is for: refuse to seek to `duration`, which some players
    // treat as unseekable and which would fire the end state immediately.
    SKIP_INTRO_OVERRIDES["__test-bogus"] = { endSeconds: 1400 };
    try {
      const d = 22 * 60; // 1320s
      expect(getSkipIntroTarget({ type: "tv", id: "__test-bogus", duration: d })).toBe(d - 5);
    } finally {
      delete SKIP_INTRO_OVERRIDES["__test-bogus"];
    }
  });

  it("an override boundary wins over the default estimate", () => {
    SKIP_INTRO_OVERRIDES["__test-override"] = { endSeconds: 42 };
    try {
      expect(getSkipIntroEnd({ type: "tv", id: "__test-override", duration: LONG_EPISODE })).toBe(42);
    } finally {
      delete SKIP_INTRO_OVERRIDES["__test-override"];
    }
  });
});

describe("auto skip intro fires exactly once", () => {
  const fired = () => ({ current: false });

  it("says yes while inside the intro, then latches off", () => {
    const ref = fired();
    expect(shouldAutoSkipIntroOnce({ ...tv, currentTime: 1, firedRef: ref })).toBe(true);
    ref.current = true;
    // A timeupdate re-fires constantly; a second jump would be a visible stutter.
    expect(shouldAutoSkipIntroOnce({ ...tv, currentTime: 2, firedRef: ref })).toBe(false);
  });

  it("stays silent until the head is actually inside the intro", () => {
    expect(shouldAutoSkipIntroOnce({ ...tv, currentTime: 5, firedRef: fired() })).toBe(true);
    // Past the window: the viewer already watched it, don't yank.
    expect(shouldAutoSkipIntroOnce({ ...tv, currentTime: SKIP_INTRO_DEFAULT_END + 5, firedRef: fired() })).toBe(false);
  });

  it("never auto-skips a movie, a short episode, or an unknown-length asset", () => {
    expect(shouldAutoSkipIntroOnce({ type: "movie", id: "550", duration: 7200, currentTime: 1, firedRef: fired() })).toBe(false);
    expect(shouldAutoSkipIntroOnce({ type: "tv", id: "1", duration: 300, currentTime: 1, firedRef: fired() })).toBe(false);
    // The button may appear before metadata arrives; an automatic jump may not.
    expect(shouldAutoSkipIntroOnce({ type: "tv", id: "1", duration: 0, currentTime: 1, firedRef: fired() })).toBe(false);
    expect(shouldAutoSkipIntroOnce({ type: "tv", id: "1", currentTime: 1, firedRef: fired() })).toBe(false);
  });
});

describe("skip credits", () => {
  it("needs a longer episode than the intro, and a movie never qualifies", () => {
    // A 16-min show's last 2.5 min is usually story, not credits.
    expect(getSkipOutroWindow({ type: "tv", duration: 16 * 60 })).toBeNull();
    expect(getSkipOutroWindow({ type: "movie", id: "550", duration: 2 * 3600 })).toBeNull();
    expect(getSkipOutroWindow({ type: "tv", duration: SKIP_OUTRO_MIN_EPISODE_SECONDS })).not.toBeNull();
  });

  it("windows the tail of the episode", () => {
    const w = getSkipOutroWindow({ type: "tv", duration: LONG_EPISODE });
    expect(w.start).toBe(LONG_EPISODE - SKIP_OUTRO_TAIL_SECONDS);
    expect(w.start).toBeLessThan(LONG_EPISODE);
  });

  it("only shows inside the tail, and never after the end", () => {
    const start = LONG_EPISODE - SKIP_OUTRO_TAIL_SECONDS;
    expect(shouldShowSkipOutro({ type: "tv", duration: LONG_EPISODE, currentTime: start - 1 })).toBe(false);
    expect(shouldShowSkipOutro({ type: "tv", duration: LONG_EPISODE, currentTime: start })).toBe(true);
    expect(shouldShowSkipOutro({ type: "tv", duration: LONG_EPISODE, currentTime: start + 10 })).toBe(true);
    expect(shouldShowSkipOutro({ type: "tv", duration: LONG_EPISODE, currentTime: start, ended: true })).toBe(false);
  });

  it("there is deliberately no auto path for credits", () => {
    // A wrong tail guess must cost a visible button, never an unrequested jump.
    const start = LONG_EPISODE - SKIP_OUTRO_TAIL_SECONDS;
    expect(shouldAutoSkipIntroOnce({ type: "tv", duration: LONG_EPISODE, currentTime: LONG_EPISODE - 1, firedRef: { current: false } })).toBe(false);
    expect(shouldShowSkipOutro({ type: "tv", duration: LONG_EPISODE, currentTime: start })).toBe(true);
  });

  it("targets just before the very end so the end state can fire", () => {
    const t = getSkipOutroTarget({ type: "tv", duration: LONG_EPISODE });
    expect(t).toBeLessThan(LONG_EPISODE);
    expect(LONG_EPISODE - t).toBeLessThanOrEqual(5);
  });
});
