// ABR seed tuning. The browser's Network Information API is only a PRIOR —
// hls.js's real measurement must still be able to override it, so these tests
// check the shape of the seed and, above all, that every path degrades to the
// previous fixed 10Mbps rather than to something clever and wrong.
import { describe, expect, it } from "vitest";
import {
  pickInitialBandwidthBits,
  DEFAULT_INITIAL_BW_BITS,
  MIN_SEED_BITS,
  MAX_SEED_BITS,
} from "../utils/streamTuning.js";

describe("pickInitialBandwidthBits", () => {
  it("falls back to the fixed seed when the API is absent (Safari, Firefox)", () => {
    expect(pickInitialBandwidthBits(undefined)).toBe(DEFAULT_INITIAL_BW_BITS);
    expect(pickInitialBandwidthBits(null)).toBe(DEFAULT_INITIAL_BW_BITS);
    expect(pickInitialBandwidthBits({})).toBe(DEFAULT_INITIAL_BW_BITS);
    // A non-object must not throw — this runs during playback.
    expect(pickInitialBandwidthBits("nope")).toBe(DEFAULT_INITIAL_BW_BITS);
  });

  it("honours Data Saver instead of optimising against the viewer's wish", () => {
    // They explicitly asked to use less data; a fast-looking seed is wrong here
    // no matter what downlink claims.
    expect(pickInitialBandwidthBits({ saveData: true, downlink: 100, effectiveType: "4g" })).toBe(MIN_SEED_BITS);
  });

  it("stays low on a slow link, so the first rung can actually survive", () => {
    const seed = pickInitialBandwidthBits({ effectiveType: "2g", downlink: 0.4 });
    expect(seed).toBeLessThanOrEqual(2 * 1000 * 1000);
    expect(seed).toBeGreaterThanOrEqual(MIN_SEED_BITS);
  });

  it("does not let a generous downlink talk a slow class UP", () => {
    // Chromium reports a rounded `downlink` that can disagree with the
    // effectiveType. The class is the safer signal and must win.
    const seed = pickInitialBandwidthBits({ effectiveType: "2g", downlink: 50 });
    expect(seed).toBeLessThanOrEqual(2 * 1000 * 1000);
  });

  it("scales with a fast link but not without bound", () => {
    const seed = pickInitialBandwidthBits({ effectiveType: "4g", downlink: 80 });
    // Trust is deliberately partial (0.75) and the result is capped: there is no
    // rung above the top variant for the headroom to buy.
    expect(seed).toBeLessThan(80 * 1e6);
    expect(seed).toBeLessThanOrEqual(MAX_SEED_BITS);
    expect(seed).toBeGreaterThan(DEFAULT_INITIAL_BW_BITS);
  });

  it("always lands inside the bounds, for every shape of input", () => {
    const inputs = [
      { downlink: -5 },
      { downlink: 0 },
      { downlink: NaN },
      { downlink: Infinity },
      { downlink: "50" },
      { effectiveType: "slow-2g" },
      { effectiveType: "unknown-class" },
      { effectiveType: "4g", downlink: 0.001 },
    ];
    for (const input of inputs) {
      const seed = pickInitialBandwidthBits(input);
      expect(seed).toBeGreaterThanOrEqual(MIN_SEED_BITS);
      expect(seed).toBeLessThanOrEqual(MAX_SEED_BITS);
      expect(Number.isFinite(seed)).toBe(true);
    }
  });

  it("treats a numeric-string downlink as usable but a junk one as absent", () => {
    expect(pickInitialBandwidthBits({ downlink: "50" })).toBeGreaterThan(DEFAULT_INITIAL_BW_BITS);
    expect(pickInitialBandwidthBits({ downlink: "fast" })).toBe(DEFAULT_INITIAL_BW_BITS);
  });

  it("respects an explicit fallback argument", () => {
    expect(pickInitialBandwidthBits(undefined, 6 * 1000 * 1000)).toBe(6 * 1000 * 1000);
  });
});
