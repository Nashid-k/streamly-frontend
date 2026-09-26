import { describe, it, expect, beforeEach } from "vitest";
import { readStoredNumber } from "../utils/storedNumber";

// The player's own bounds, kept in sync with NativePlayerView.
const BRIGHTNESS = { min: 0.25, max: 1.75, fallback: 1 };
const VOLUME = { min: 0, max: 1, fallback: 1 };

const fakeStorage = (entries) => ({
  getItem: (key) => (key in entries ? entries[key] : null),
});

describe("readStoredNumber", () => {
  it("returns the fallback for a key that was never written", () => {
    // The bug: getItem → null and Number(null) === 0, which passes an
    // isFinite check, so an unset brightness clamped to 0.25 and every fresh
    // viewer watched a near-black video.
    expect(readStoredNumber("nope", BRIGHTNESS, fakeStorage({}))).toBe(1);
    expect(readStoredNumber("nope", BRIGHTNESS, fakeStorage({ nope: null }))).toBe(1);
  });

  it("returns the fallback for a blank or unparsable value", () => {
    expect(readStoredNumber("k", BRIGHTNESS, fakeStorage({ k: "" }))).toBe(1);
    expect(readStoredNumber("k", BRIGHTNESS, fakeStorage({ k: "   " }))).toBe(1);
    expect(readStoredNumber("k", BRIGHTNESS, fakeStorage({ k: "abc" }))).toBe(1);
    expect(readStoredNumber("k", BRIGHTNESS, fakeStorage({ k: "NaN" }))).toBe(1);
    expect(readStoredNumber("k", BRIGHTNESS, fakeStorage({ k: "Infinity" }))).toBe(1);
  });

  it("returns the fallback when storage is unavailable (private mode)", () => {
    const throwing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
    };
    expect(readStoredNumber("k", BRIGHTNESS, throwing)).toBe(1);
    expect(readStoredNumber("k", BRIGHTNESS, null)).toBe(1);
  });

  it("reads a real stored value", () => {
    expect(readStoredNumber("k", BRIGHTNESS, fakeStorage({ k: "0.6" }))).toBe(0.6);
    expect(readStoredNumber("k", BRIGHTNESS, fakeStorage({ k: " 1.25 " }))).toBe(1.25);
  });

  it("clamps a stored value into range, never past it", () => {
    expect(readStoredNumber("k", BRIGHTNESS, fakeStorage({ k: "0.01" }))).toBe(0.25);
    expect(readStoredNumber("k", BRIGHTNESS, fakeStorage({ k: "9" }))).toBe(1.75);
  });

  it("keeps a deliberate 0 for volume (mute is a real stored value)", () => {
    expect(readStoredNumber("k", VOLUME, fakeStorage({ k: "0" }))).toBe(0);
  });
});

describe("player preference restore (unset must not fabricate a floor)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("restores brightness at 100% for a viewer with no stored value", () => {
    expect(readStoredNumber("streamly-native-brightness", BRIGHTNESS, window.localStorage)).toBe(1);
  });

  it("restores volume at full for a viewer with no stored value", () => {
    expect(readStoredNumber("streamly-native-volume", VOLUME, window.localStorage)).toBe(1);
  });

  it("restores a stored brightness and volume as written", () => {
    window.localStorage.setItem("streamly-native-brightness", "0.4");
    window.localStorage.setItem("streamly-native-volume", "0.3");
    expect(readStoredNumber("streamly-native-brightness", BRIGHTNESS, window.localStorage)).toBe(0.4);
    expect(readStoredNumber("streamly-native-volume", VOLUME, window.localStorage)).toBe(0.3);
  });
});
