import { describe, expect, it } from "vitest";
import {
  buildQualityRows,
  fmtTime,
  qualityHdTag,
  qualityLabelFor,
  zoneOf,
} from "../components/player/nativePlayerHelpers";

/* Characterisation tests for the helpers lifted out of NativePlayerView. They
   pin behaviour that was previously only reachable through a 4.6k-line
   component: the transport clock, the quality ladder's order/dedupe rules and
   the three-zone tap geometry. Nothing here is new policy — each assertion
   describes what the player already did. */

describe("fmtTime", () => {
  it("reads m:ss below an hour", () => {
    expect(fmtTime(0)).toBe("0:00");
    expect(fmtTime(9)).toBe("0:09");
    expect(fmtTime(65)).toBe("1:05");
    expect(fmtTime(3599)).toBe("59:59");
  });

  it("reads h:mm:ss from one hour up, zero-padding the minutes", () => {
    expect(fmtTime(3600)).toBe("1:00:00");
    expect(fmtTime(3725)).toBe("1:02:05");
    expect(fmtTime(9372)).toBe("2:36:12");
  });

  it("floors fractional seconds and clamps junk to 0:00", () => {
    expect(fmtTime(59.9)).toBe("0:59");
    expect(fmtTime("65")).toBe("1:05");
    expect(fmtTime(-4)).toBe("0:00");
    expect(fmtTime(NaN)).toBe("0:00");
    expect(fmtTime(undefined)).toBe("0:00");
  });
});

describe("zoneOf", () => {
  const rect = { left: 100, width: 900 };

  it("splits the frame into left / center / right thirds", () => {
    expect(zoneOf(rect, 100)).toBe("left");
    expect(zoneOf(rect, 399)).toBe("left");
    expect(zoneOf(rect, 400)).toBe("center");
    expect(zoneOf(rect, 700)).toBe("center");
    expect(zoneOf(rect, 701)).toBe("right");
    expect(zoneOf(rect, 1000)).toBe("right");
  });

  it("measures from the frame's left edge, not the viewport's", () => {
    // A 300px frame: thirds are 0..99 / 100..200 / 201..300 in client space.
    expect(zoneOf({ left: 0, width: 300 }, 99)).toBe("left");
    expect(zoneOf({ left: 0, width: 300 }, 100)).toBe("center");
    expect(zoneOf({ left: 0, width: 300 }, 200)).toBe("center");
    expect(zoneOf({ left: 0, width: 300 }, 201)).toBe("right");
  });
});

describe("qualityLabelFor", () => {
  it("answers Auto when the rendition has no height", () => {
    expect(qualityLabelFor({})).toBe("Auto");
    expect(qualityLabelFor(null)).toBe("Auto");
  });

  it("delegates to the playlist variant label", () => {
    expect(qualityLabelFor({ width: 1920, height: 1080 })).toBe("1080p");
    expect(qualityLabelFor({ width: 3840, height: 2160 })).toBe("4K");
  });
});

describe("qualityHdTag", () => {
  it("trusts the label, so a scope-cut 1080p rung is HD", () => {
    // 1920x804 ranks as 1080p by width; a raw-height check called it below HD.
    const scope = { width: 1920, height: 804 };
    expect(qualityLabelFor(scope)).toBe("1080p");
    expect(qualityHdTag(scope)).toBe("HD");
  });

  it("tags 2K labels and keeps sub-HD labels untagged", () => {
    expect(qualityHdTag({ label: "2K" })).toBe("HD");
    expect(qualityHdTag({ label: "1080p · HDR" })).toBe("HD");
    expect(qualityHdTag({ label: "720p" })).toBe("");
    expect(qualityHdTag({ label: "480p" })).toBe("");
    expect(qualityHdTag({})).toBe("");
  });
});

describe("buildQualityRows", () => {
  it("orders the ladder low to high regardless of feed order", () => {
    const rows = buildQualityRows([
      { uri: "a", width: 3840, height: 2160 },
      { uri: "b", width: 1280, height: 720 },
      { uri: "c", width: 1920, height: 1080 },
    ]);
    expect(rows.map((r) => r.label)).toEqual(["720p", "1080p", "4K"]);
    expect(rows.map((r) => r.uri)).toEqual(["b", "c", "a"]);
  });

  it("keeps one row per label, preferring the taller then the faster rendition", () => {
    const rows = buildQualityRows([
      { uri: "scope", width: 1920, height: 804, bandwidth: 9000 },
      { uri: "full", width: 1920, height: 1080, bandwidth: 5000 },
      { uri: "fast", width: 1920, height: 1080, bandwidth: 8000 },
      { uri: "hd", width: 1280, height: 720 },
    ]);
    // height 804 is width-bound to the same 1080p rung as the 1080-row renditions
    expect(rows.map((r) => r.label)).toEqual(["720p", "1080p"]);
    expect(rows[1]).toMatchObject({ uri: "fast", height: 1080, bandwidth: 8000 });
  });

  it("normalises missing numeric fields to 0 instead of undefined", () => {
    const [row] = buildQualityRows([{ uri: "x", width: 1280, height: 720 }]);
    expect(row).toEqual({ uri: "x", height: 720, label: "720p", bandwidth: 0 });
  });

  it("does not mutate the caller's array", () => {
    const input = [
      { uri: "hi", width: 1920, height: 1080 },
      { uri: "lo", width: 1280, height: 720 },
    ];
    buildQualityRows(input);
    expect(input.map((v) => v.uri)).toEqual(["hi", "lo"]);
  });
});
