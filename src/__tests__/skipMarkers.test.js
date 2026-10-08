// Skip Intro / Skip Credits windows.
//
// Two kinds of boundary meet in this file and they must not be confused:
//   1. MEASURED boundaries, which now exist. The provider endpoint (ZXC/vidstuck
//      `/backend/intro`) publishes per-encode intro/outro windows, and SkipDB
//      publishes community ones; both arrive as untrusted numbers and pass
//      through normalizeSkipBoundaries before anything acts on them.
//   2. ESTIMATES, for what neither source covers. These are pinned by the tests
//      below for the two things that matter when an estimate is involved: the
//      windows are where we say they are, and a wrong estimate is CONTAINED — it
//      costs a button, never a jump.
//
// The `normalize*`/`getScrubberBands`/field-merge blocks at the bottom are
// regressions for real, viewer-reported bugs: a source reporting 0 for "no
// credits" painted the ENTIRE progress bar orange and pinned the Skip Credits
// pill on screen for whole episodes.
import { afterEach, describe, expect, it } from "vitest";
import {
  getSkipIntroEnd,
  shouldShowSkipIntro,
  getSkipIntroTarget,
  SKIP_INTRO_OVERRIDES,
  getSkipOutroWindow,
  shouldShowSkipOutro,
  getSkipOutroTarget,
  shouldAutoSkipIntroOnce,
  episodeKey,
  lookupSkipIntro,
  mergeSkipBoundaries,
  normalizeSkipBoundaries,
  getScrubberBands,
  rescopeBoundaries,
  SKIP_INTRO_DEFAULT_END,
  SKIP_INTRO_GRACE,
  SKIP_INTRO_LEAD_SECONDS,
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

  it("appears only as the intro approaches its end, never from the cold open", () => {
    const opens = SKIP_INTRO_DEFAULT_END - SKIP_INTRO_LEAD_SECONDS;
    // Sitting on screen from t=0 trains viewers to ignore it and puts a control on
    // screen aimed at the wrong moment.
    expect(shouldShowSkipIntro({ ...tv, currentTime: 0 })).toBe(false);
    expect(shouldShowSkipIntro({ ...tv, currentTime: opens - 1 })).toBe(false);
    expect(shouldShowSkipIntro({ ...tv, currentTime: opens })).toBe(true);
    expect(shouldShowSkipIntro({ ...tv, currentTime: SKIP_INTRO_DEFAULT_END })).toBe(true);
    // grace keeps it up a moment past the boundary
    expect(shouldShowSkipIntro({ ...tv, currentTime: SKIP_INTRO_DEFAULT_END + SKIP_INTRO_GRACE })).toBe(true);
    expect(shouldShowSkipIntro({ ...tv, currentTime: SKIP_INTRO_DEFAULT_END + SKIP_INTRO_GRACE + 1 })).toBe(false);
  });

  it("opens the window from t=0 when the intro genuinely ends that early", () => {
    // A measured 12s boundary has no room for a lead-in, and clamping to 0 is
    // correct: the pill must still be reachable.
    expect(shouldShowSkipIntro({ ...tv, currentTime: 0, cueIntroEnd: 12 })).toBe(true);
    expect(shouldShowSkipIntro({ ...tv, currentTime: 5, cueIntroEnd: 12 })).toBe(true);
    expect(shouldShowSkipIntro({ ...tv, currentTime: 12 + SKIP_INTRO_GRACE + 1, cueIntroEnd: 12 })).toBe(false);
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

// ── Per-episode dataset keying ─────────────────────────────────────────────
// TV overrides used to be keyed by SHOW id, which meant every episode of a series
// shared one cold-open length. A dataset cannot work that way, so episodes are
// keyed "SxxExx" and the episode entry wins over a series-wide one.
describe("per-episode skip boundaries", () => {
  const SHOW = "__test-show";

  afterEach(() => {
    delete SKIP_INTRO_OVERRIDES[SHOW];
    delete SKIP_INTRO_OVERRIDES.S01E01;
    delete SKIP_INTRO_OVERRIDES.S01E02;
  });

  it("builds a padded episode key", () => {
    expect(episodeKey(1, 2)).toBe("S01E02");
    expect(episodeKey(12, 34)).toBe("S12E34");
    expect(episodeKey(0, 1)).toBeNull();
    expect(episodeKey(1, 0)).toBeNull();
    expect(episodeKey("x", 1)).toBeNull();
  });

  it("gives each episode its own boundary", () => {
    SKIP_INTRO_OVERRIDES.S01E01 = { endSeconds: 132 };
    SKIP_INTRO_OVERRIDES.S01E02 = { endSeconds: 45 };
    expect(getSkipIntroEnd({ type: "tv", id: SHOW, season: 1, episode: 1, duration: LONG_EPISODE })).toBe(132);
    expect(getSkipIntroEnd({ type: "tv", id: SHOW, season: 1, episode: 2, duration: LONG_EPISODE })).toBe(45);
  });

  it("falls back to the show for an episode with no entry of its own", () => {
    SKIP_INTRO_OVERRIDES[SHOW] = { endSeconds: 90 };
    expect(getSkipIntroEnd({ type: "tv", id: SHOW, season: 1, episode: 7, duration: LONG_EPISODE })).toBe(90);
  });

  it("lets the episode entry override a series-wide one", () => {
    SKIP_INTRO_OVERRIDES[SHOW] = { endSeconds: 90 };
    SKIP_INTRO_OVERRIDES.S01E03 = { endSeconds: 61 };
    expect(getSkipIntroEnd({ type: "tv", id: SHOW, season: 1, episode: 3, duration: LONG_EPISODE })).toBe(61);
  });

  it("still lets a measured cue outrank the dataset", () => {
    SKIP_INTRO_OVERRIDES.S01E01 = { endSeconds: 132 };
    expect(getSkipIntroEnd({ type: "tv", id: SHOW, season: 1, episode: 1, duration: LONG_EPISODE, cueIntroEnd: 20 })).toBe(20);
  });

  it("accepts the loose key shapes a public dataset tends to use", () => {
    SKIP_INTRO_OVERRIDES.__test_loose = { seconds: 88 };
    try {
      expect(lookupSkipIntro({ id: "__test_loose" })).toBe(88);
    } finally {
      delete SKIP_INTRO_OVERRIDES.__test_loose;
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

// ── Measured cue boundaries ────────────────────────────────────────────────
// When a manifest states its own #EXT-X-CUE-OUT/#EXT-X-CUE-IN window, that fact
// outranks every guess below. These pin the precedence, because getting it wrong
// is how a real boundary would get ignored in favour of a blind 90s seek.
describe("measured cue boundaries beat the estimates", () => {
  it("uses the manifest intro end instead of the 90s default", () => {
    expect(getSkipIntroEnd({ type: "tv", duration: LONG_EPISODE })).toBe(SKIP_INTRO_DEFAULT_END);
    expect(getSkipIntroEnd({ type: "tv", duration: LONG_EPISODE, cueIntroEnd: 42 })).toBe(42);
  });

  it("offers a measured movie intro, which the TV-only guess must never do", () => {
    expect(getSkipIntroEnd({ type: "movie", duration: 5400 })).toBe(0);
    expect(getSkipIntroEnd({ type: "movie", duration: 5400, cueIntroEnd: 63 })).toBe(63);
  });

  it("ignores a non-positive or missing cue and keeps the estimate", () => {
    expect(getSkipIntroEnd({ type: "tv", duration: LONG_EPISODE, cueIntroEnd: 0 })).toBe(SKIP_INTRO_DEFAULT_END);
    expect(getSkipIntroEnd({ type: "tv", duration: LONG_EPISODE, cueIntroEnd: null })).toBe(SKIP_INTRO_DEFAULT_END);
  });

  it("shows and targets the intro pill at the measured boundary", () => {
    expect(shouldShowSkipIntro({ type: "tv", duration: LONG_EPISODE, currentTime: 42, cueIntroEnd: 42 })).toBe(true);
    expect(shouldShowSkipIntro({ type: "tv", duration: LONG_EPISODE, currentTime: 80, cueIntroEnd: 42 })).toBe(false);
    expect(getSkipIntroTarget({ type: "tv", duration: LONG_EPISODE, cueIntroEnd: 42 })).toBe(42);
  });

  it("uses the measured credits start even on a short movie", () => {
    // A 40s credits marker on a film the length floor would normally exclude.
    const w = getSkipOutroWindow({ type: "movie", duration: 5400, cueCreditsStart: 5200 });
    expect(w).not.toBeNull();
    expect(w.start).toBe(5200);
    expect(shouldShowSkipOutro({ type: "movie", duration: 5400, currentTime: 5200, cueCreditsStart: 5200 })).toBe(true);
  });

  it("keeps a measured credits window from running past the asset", () => {
    const w = getSkipOutroWindow({ type: "tv", duration: 1000, cueCreditsStart: 99999 });
    expect(w.start).toBeLessThanOrEqual(1000);
    expect(getSkipOutroTarget({ type: "tv", duration: 1000, cueCreditsStart: 99999 })).toBeLessThanOrEqual(1000);
  });

  it("auto-skips against a measured boundary, once, via the caller's one-shot ref", () => {
    // The predicate never writes the ref; NativePlayerView owns that write, so the
    // "exactly once" guarantee is the ref's contract, not this function's.
    const fired = { current: false };
    expect(shouldAutoSkipIntroOnce({ type: "tv", duration: LONG_EPISODE, currentTime: 10, firedRef: fired, cueIntroEnd: 42 })).toBe(true);
    fired.current = true;
    expect(shouldAutoSkipIntroOnce({ type: "tv", duration: LONG_EPISODE, currentTime: 10, firedRef: fired, cueIntroEnd: 42 })).toBe(false);
  });
});

describe("mergeSkipBoundaries", () => {
  const CUES = { introEndSeconds: 246.5, creditsStartSeconds: 3434 };
  const DATASET = { introEndSeconds: 132, creditsStartSeconds: 3400 };

  it("keeps a cue tag when the dataset lands afterwards", () => {
    // The regression this function exists for. The two fetches race, and without
    // ranking a slow SkipDB response would replace a boundary the provider
    // embedded in the actual stream — silently, with both values looking valid.
    const afterCues = mergeSkipBoundaries({ ...CUES, source: "cues" }, DATASET, "dataset");
    expect(afterCues.source).toBe("cues");
    expect(afterCues.introEndSeconds).toBe(246.5);
  });

  it("lets a cue tag win when it lands afterwards", () => {
    const afterDataset = mergeSkipBoundaries({ ...DATASET, source: "dataset" }, CUES, "cues");
    expect(afterDataset.source).toBe("cues");
    expect(afterDataset.introEndSeconds).toBe(246.5);
  });

  it("is order-independent — both arrival orders converge", () => {
    const a = mergeSkipBoundaries({ ...CUES, source: "cues" }, DATASET, "dataset");
    const b = mergeSkipBoundaries({ ...DATASET, source: "dataset" }, CUES, "cues");
    expect(a).toEqual(b);
  });

  it("accepts the dataset when it is the only source", () => {
    const out = mergeSkipBoundaries(null, DATASET, "dataset");
    expect(out.source).toBe("dataset");
    expect(out.introEndSeconds).toBe(132);
  });

  it("accepts a first cue when nothing is held yet", () => {
    expect(mergeSkipBoundaries(null, CUES, "cues").source).toBe("cues");
  });

  it("ignores an empty arrival instead of clearing good boundaries", () => {
    // A dataset that resolves null (uncrowdsourced title, or offline) must not
    // wipe a cue tag we already have.
    const held = { ...CUES, source: "cues" };
    expect(mergeSkipBoundaries(held, null, "dataset")).toBe(held);
  });

  it("replaces dataset with dataset on a title change", () => {
    // Same trust level, so the newer value is kept — the player resets on title
    // change, but a late response for the PREVIOUS title must not stick.
    const out = mergeSkipBoundaries({ ...DATASET, source: "dataset" }, CUES, "cues");
    expect(out.introEndSeconds).toBe(246.5);
  });
});

describe("rescopeBoundaries", () => {
  const cues = { introEndSeconds: 246.5, creditsStartSeconds: 3434, source: "cues" };
  const dataset = { introEndSeconds: 132, creditsStartSeconds: 3400, source: "dataset" };
  const VIDCORE = "vidcore|0"; // server|dub
  const DUB1 = "zxc-centaurus|1";

  it("drops cue tags when a different server starts playing", () => {
    // A cue describes one encode. Server 2's video is not Server 1's, so
    // Server 1's measured boundary is a claim we never made about it.
    expect(rescopeBoundaries(cues, VIDCORE, "zxc-centaurus|0")).toBeNull();
  });

  it("drops cue tags when a dub switch swaps to another manifest", () => {
    // Dub switches are separate full-stream manifests, not in-manifest groups.
    expect(rescopeBoundaries(cues, VIDCORE, DUB1)).toBeNull();
  });

  it("keeps dataset boundaries across a server switch", () => {
    // Keyed by IMDb id: the data describes the TITLE, so it stays true for every
    // server. This is the reason the dataset beats a hardcoded table.
    expect(rescopeBoundaries(dataset, VIDCORE, "zxc-centaurus|0")).toBe(dataset);
  });

  it("keeps dataset boundaries across a dub switch", () => {
    expect(rescopeBoundaries(dataset, VIDCORE, DUB1)).toBe(dataset);
  });

  it("keeps everything when the manifest did not change", () => {
    // pickAudio only sets hls.audioTrack — same manifest, so the tags still
    // describe what is on screen and must survive.
    expect(rescopeBoundaries(cues, VIDCORE, VIDCORE)).toBe(cues);
    expect(rescopeBoundaries(dataset, VIDCORE, VIDCORE)).toBe(dataset);
  });

  it("treats the dub index as part of the manifest identity", () => {
    // Same server, different manifest. A scope key of just the server key would
    // read as "unchanged" and carry the old dub's tags onto the new one.
    expect(rescopeBoundaries(cues, "zxc-centaurus|0", "zxc-centaurus|1")).toBeNull();
  });

  it("passes null through untouched", () => {
    expect(rescopeBoundaries(null, VIDCORE, "zxc-centaurus|0")).toBeNull();
  });

  it("is safe to call before anything has been measured", () => {
    expect(rescopeBoundaries(undefined, null, VIDCORE)).toBeUndefined();
  });
});

// -- Regressions: real viewer reports that the whole progress bar went orange --
//
// Every case below is a number that arrived from a network response or a manifest
// and was individually well-formed. None of them throw, which is why they reached
// the scrubber at all.
describe("normalizeSkipBoundaries refuses the values that painted the whole bar", () => {
  const source = "provider";

  it("treats a credits start of 0 as unknown, not as the first second", () => {
    // THE bug. Every source spells "no outro" as 0, and `>= 0` read that as a
    // position: the band covered 0%?100% (entire progress bar orange) and the
    // Skip Credits pill stayed up for the whole episode.
    expect(normalizeSkipBoundaries({ source, creditsStartSeconds: 0 }, 2700)).toBeNull();
    expect(normalizeSkipBoundaries({ source, creditsStartSeconds: -5 }, 2700)).toBeNull();
    expect(normalizeSkipBoundaries({ source, creditsStartSeconds: null }, 2700)).toBeNull();
  });

  it("keeps a real credits marker", () => {
    const out = normalizeSkipBoundaries({ source, introEndSeconds: 531, creditsStartSeconds: 3431 }, 3500);
    expect(out.creditsStartSeconds).toBe(3431);
    expect(out.introEndSeconds).toBe(531);
  });

  it("refuses a marker at or past the end of what is actually playing", () => {
    // Measured against a longer cut of the same title. Kept, it placed the band
    // off the right-hand edge and aimed the pill at the last 4s of every episode.
    expect(normalizeSkipBoundaries({ source, creditsStartSeconds: 3631 }, 2700)).toBeNull();
    expect(normalizeSkipBoundaries({ source, creditsStartSeconds: 2700 }, 2700)).toBeNull();
    expect(normalizeSkipBoundaries({ source, introEndSeconds: 5300 }, 2700)).toBeNull();
  });

  it("waits for the duration instead of judging while it is still unknown", () => {
    // duration settles after the metadata does; a marker is not wrong just
    // because the runtime has not arrived yet.
    expect(normalizeSkipBoundaries({ source, creditsStartSeconds: 3631 }, 0).creditsStartSeconds).toBe(3631);
    expect(normalizeSkipBoundaries({ source, creditsStartSeconds: 3631 }, undefined).creditsStartSeconds).toBe(3631);
  });

  it("drops an inverted intro range but keeps the measured end", () => {
    // introStart >= introEnd renders a NEGATIVE width, i.e. an invisible band.
    const out = normalizeSkipBoundaries({ source, introStartSeconds: 600, introEndSeconds: 531 }, 3500);
    expect(out.introEndSeconds).toBe(531);
    expect(out.introStartSeconds).toBeUndefined();
  });

  it("clamps a credits finish beyond the asset instead of dropping it", () => {
    const out = normalizeSkipBoundaries({ source, creditsStartSeconds: 3400, creditsEndSeconds: 9999 }, 3500);
    expect(out.creditsEndSeconds).toBe(3500);
  });

  it("keeps the source stamp so measured data stays distinguishable from a guess", () => {
    expect(normalizeSkipBoundaries({ source, introEndSeconds: 90 }, 2700).source).toBe("provider");
  });

  it("passes null through and survives an empty set", () => {
    expect(normalizeSkipBoundaries(null, 2700)).toBeNull();
    expect(normalizeSkipBoundaries(undefined, 2700)).toBeNull();
  });
});

describe("getScrubberBands cannot produce a full-width band", () => {
  const source = "provider";
  const EPISODE = 3500;

  it("paints the credits tail, bounded by the track when the finish is unknown", () => {
    const bounds = normalizeSkipBoundaries({ source, creditsStartSeconds: 3431 }, EPISODE);
    const bands = getScrubberBands(bounds, EPISODE);
    expect(bands.credits.left).toBe(`${(3431 / EPISODE) * 100}%`);
    // "The credits run to the end of the asset" is TRUE, so right:0 is correct here
    // and is the only path to it.
    expect(bands.credits.right).toBe("0%");
  });

  it("emits no credits band at all for a 0 credits start", () => {
    // The full-orange bar, asserted at the geometry layer rather than the source.
    const bounds = normalizeSkipBoundaries({ source, creditsStartSeconds: 0 }, EPISODE);
    expect(bounds).toBeNull();
    expect(getScrubberBands(bounds, EPISODE)).toBeNull();
  });

  it("never emits a band that starts at 0% or runs off the track", () => {
    for (const creditsStartSeconds of [0, -1, EPISODE, EPISODE + 500]) {
      const bounds = normalizeSkipBoundaries({ source, creditsStartSeconds }, EPISODE);
      const bands = getScrubberBands(bounds, EPISODE);
      expect(bands === null || bands.credits === null).toBe(true);
    }
  });

  it("draws the intro band from the measured start when there is one", () => {
    const bounds = normalizeSkipBoundaries({ source, introStartSeconds: 437, introEndSeconds: 531 }, EPISODE);
    expect(getScrubberBands(bounds, EPISODE).intro).toEqual({
      left: `${(437 / EPISODE) * 100}%`,
      width: `${(94 / EPISODE) * 100}%`,
    });
  });

  it("falls back to one default-length intro band when only the end was measured", () => {
    // Provider records carry an intro END and no start; the band still has to show,
    // and its width must come from the shared constant rather than a second literal.
    const bounds = normalizeSkipBoundaries({ source, introEndSeconds: 531 }, EPISODE);
    expect(getScrubberBands(bounds, EPISODE).intro.width).toBe(`${(SKIP_INTRO_DEFAULT_END / EPISODE) * 100}%`);
  });

  it("draws nothing without a duration or without a measured source", () => {
    const bounds = normalizeSkipBoundaries({ source, creditsStartSeconds: 3431 }, EPISODE);
    expect(getScrubberBands(bounds, 0)).toBeNull();
    expect(getScrubberBands(null, EPISODE)).toBeNull();
    // A set with no source stamp is an estimate, and estimates never paint.
    expect(getScrubberBands({ introEndSeconds: 90, creditsStartSeconds: 3000 }, EPISODE)).toBeNull();
  });
});

describe("mergeSkipBoundaries keeps fields a partial record never measured", () => {
  const PROVIDER = { introEndSeconds: 0, creditsStartSeconds: 3400 };
  const DATASET = { introEndSeconds: 132, creditsStartSeconds: 3390 };

  it("does not let a credits-only provider record erase a real measured intro", () => {
    // The whole-object swap this replaces threw the intro away and silently
    // demoted it to the 90s guess — the "skip intro is inaccurate" half of the bug.
    const out = mergeSkipBoundaries({ ...DATASET, source: "dataset" }, PROVIDER, "provider");
    expect(out.introEndSeconds).toBe(132);
    expect(out.creditsStartSeconds).toBe(3400);
    expect(out.source).toBe("provider");
  });

  it("stays order-independent when the sources are partial", () => {
    const a = mergeSkipBoundaries({ ...DATASET, source: "dataset" }, PROVIDER, "provider");
    const b = mergeSkipBoundaries({ ...PROVIDER, source: "provider" }, DATASET, "dataset");
    expect(a).toEqual(b);
  });

  it("still lets a higher-ranked source overwrite a field it did measure", () => {
    const out = mergeSkipBoundaries(
      { ...DATASET, source: "dataset" },
      { introEndSeconds: 531, creditsStartSeconds: 3400 },
      "provider"
    );
    expect(out.introEndSeconds).toBe(531);
  });
});

describe("a 0 credits start falls back to the tail estimate instead of the whole episode", () => {
  it("does not open the credits window at the first second", () => {
    const w = getSkipOutroWindow({ type: "tv", duration: 2700, cueCreditsStart: 0 });
    // Falls through to the length-based tail heuristic, which is the honest
    // "credits live at the tail" answer, rather than covering 0?2700.
    expect(w.start).toBe(2700 - SKIP_OUTRO_TAIL_SECONDS);
    expect(shouldShowSkipOutro({ type: "tv", duration: 2700, currentTime: 30, cueCreditsStart: 0 })).toBe(false);
    expect(shouldShowSkipOutro({ type: "tv", duration: 2700, currentTime: 2600, cueCreditsStart: 0 })).toBe(true);
  });

  it("refuses a credits start past the end of this playback", () => {
    const w = getSkipOutroWindow({ type: "tv", duration: 1000, cueCreditsStart: 99999 });
    expect(w.start).toBeLessThanOrEqual(1000);
    expect(w.end).toBeGreaterThanOrEqual(w.start);
  });

  it("ignores a stale measured intro that points into the credits", () => {
    expect(getSkipIntroEnd({ type: "tv", duration: 2700, cueIntroEnd: 5300 })).toBe(SKIP_INTRO_DEFAULT_END);
  });
});