/* Per-provider bandwidth memory. The failure modes that matter here are the
   quiet ones: corrupt JSON, quota/private-mode storage, a stale hotel-wifi
   measurement, and a sample that would poison the next seed. Every path must
   degrade to "no memory", never a thrown player error. */
import { describe, expect, it } from "vitest";
import {
  readSourceBandwidth,
  rememberSourceBandwidth,
  SOURCE_BANDWIDTH_KEY,
  SOURCE_BANDWIDTH_MAX_AGE_MS,
  SOURCE_SAMPLE_MAX_BITS,
  SOURCE_SAMPLE_MIN_BITS,
} from "../utils/sourceBandwidth.js";

function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

const write = (store, key, bits, now, extra = {}) =>
  rememberSourceBandwidth(key, bits, { storage: store, now, minIntervalMs: 0, ...extra });

describe("source bandwidth memory", () => {
  it("round-trips a measured sample per source", () => {
    const store = fakeStorage();
    expect(write(store, "rivo-1", 8_000_000, 1_000)).toBe(8_000_000);
    expect(readSourceBandwidth("rivo-1", { storage: store, now: 1_000 })).toBe(8_000_000);
    expect(readSourceBandwidth("zxc-valstrax", { storage: store, now: 1_000 })).toBeNull();
  });

  it("EWMA-blends a new sample instead of letting one fragment define the seed", () => {
    const store = fakeStorage();
    write(store, "rivo-1", 8_000_000, 1_000);
    // 8M * 0.65 + 16M * 0.35 = 10.8M
    expect(write(store, "rivo-1", 16_000_000, 2_000)).toBe(10_800_000);
    expect(readSourceBandwidth("rivo-1", { storage: store, now: 2_000 })).toBe(10_800_000);
  });

  it("clamps absurd samples into a usable range", () => {
    const store = fakeStorage();
    expect(write(store, "huge", 1e12, 1_000)).toBe(SOURCE_SAMPLE_MAX_BITS);
    expect(write(store, "tiny", 1_000, 1_000)).toBe(SOURCE_SAMPLE_MIN_BITS);
  });

  it("refuses more than one write per interval (the default is 15s)", () => {
    const store = fakeStorage();
    write(store, "rivo-1", 8_000_000, 1_000);
    expect(rememberSourceBandwidth("rivo-1", 16_000_000, { storage: store, now: 2_000 })).toBe(
      8_000_000,
    );
    expect(readSourceBandwidth("rivo-1", { storage: store, now: 2_000 })).toBe(8_000_000);
    expect(rememberSourceBandwidth("rivo-1", 16_000_000, { storage: store, now: 17_000 })).toBe(
      10_800_000,
    );
  });

  it("expires a measurement instead of carrying it across networks for months", () => {
    const store = fakeStorage();
    write(store, "rivo-1", 8_000_000, 1_000);
    expect(
      readSourceBandwidth("rivo-1", {
        storage: store,
        now: 1_000 + SOURCE_BANDWIDTH_MAX_AGE_MS + 1,
      }),
    ).toBeNull();
    // A stale prior must not be blended into the fresh sample either.
    expect(write(store, "rivo-1", 16_000_000, 1_000 + SOURCE_BANDWIDTH_MAX_AGE_MS + 1)).toBe(
      16_000_000,
    );
  });

  it("survives corrupt, non-object and throwing storage", () => {
    const corrupt = fakeStorage({ [SOURCE_BANDWIDTH_KEY]: "{not json" });
    expect(readSourceBandwidth("rivo-1", { storage: corrupt, now: 1_000 })).toBeNull();
    expect(write(corrupt, "rivo-1", 8_000_000, 1_000)).toBe(8_000_000);

    const array = fakeStorage({ [SOURCE_BANDWIDTH_KEY]: "[1,2,3]" });
    expect(readSourceBandwidth("rivo-1", { storage: array, now: 1_000 })).toBeNull();
    expect(write(array, "rivo-1", 8_000_000, 1_000)).toBe(8_000_000);

    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readSourceBandwidth("rivo-1", { storage: throwing, now: 1_000 })).toBeNull();
    expect(rememberSourceBandwidth("rivo-1", 8_000_000, { storage: throwing, now: 1_000 })).toBeNull();
  });

  it("rejects invalid keys and samples without touching the previous value", () => {
    const store = fakeStorage();
    write(store, "rivo-1", 8_000_000, 1_000);
    for (const key of ["", null, undefined, 42]) {
      expect(rememberSourceBandwidth(key, 16_000_000, { storage: store, now: 2_000, minIntervalMs: 0 })).toBeNull();
    }
    for (const sample of [0, -1, NaN, "junk"]) {
      expect(rememberSourceBandwidth("rivo-1", sample, { storage: store, now: 2_000, minIntervalMs: 0 })).toBeNull();
    }
    expect(readSourceBandwidth("rivo-1", { storage: store, now: 2_000 })).toBe(8_000_000);
  });

  it("trims the map to the newest sources", () => {
    const store = fakeStorage();
    for (let i = 0; i < 10; i += 1) write(store, `source-${i}`, 8_000_000, 1_000 + i);
    const map = JSON.parse(store.getItem(SOURCE_BANDWIDTH_KEY));
    expect(Object.keys(map)).toHaveLength(8);
    expect(readSourceBandwidth("source-0", { storage: store, now: 1_020 })).toBeNull();
    expect(readSourceBandwidth("source-9", { storage: store, now: 1_020 })).toBe(8_000_000);
  });
});
