import { describe, it, expect } from "vitest";
import {
  durationSeconds,
  progressPct,
  remainingSeconds,
} from "../utils/resumeProgress";

describe("resumeProgress helpers", () => {
  describe("durationSeconds", () => {
    it("converts durationMins to seconds", () => {
      expect(durationSeconds({ durationMins: 90 })).toBe(5400);
    });

    it("converts runtime to seconds", () => {
      expect(durationSeconds({ runtime: 45 })).toBe(2700);
    });

    it("interprets numeric duration over 60 as seconds", () => {
      expect(durationSeconds({ duration: 3000 })).toBe(3000);
    });

    it("parses \"45m\" episode duration strings", () => {
      expect(durationSeconds({ duration: "45m" })).toBe(2700);
    });

    it("returns 0 when nothing usable is present", () => {
      expect(durationSeconds({})).toBe(0);
      expect(durationSeconds(null)).toBe(0);
      expect(durationSeconds({ duration: "unknown" })).toBe(0);
    });
  });

  describe("progressPct", () => {
    it("computes a proper ratio from seconds-consistent inputs", () => {
      const item = { timestamp: 2700, durationMins: 90 };
      expect(progressPct(item)).toBe(50);
    });

    it("clamps to 100 and never dips below 1", () => {
      expect(progressPct({ timestamp: 5400, durationMins: 90 })).toBe(100);
      expect(progressPct({ timestamp: 1, durationMins: 90 })).toBe(1);
    });

    it("falls back to the 90-minute heuristic when runtime is missing", () => {
      expect(progressPct({ timestamp: 2700 })).toBe(50);
    });

    it("returns 0 without a timestamp", () => {
      expect(progressPct({ timestamp: 0 })).toBe(0);
    });
  });

  describe("remainingSeconds", () => {
    it("returns seconds left against a known runtime", () => {
      expect(remainingSeconds({ timestamp: 2700, durationMins: 90 })).toBe(2700);
    });

    it("returns null when runtime is unknown", () => {
      expect(remainingSeconds({ timestamp: 2700 })).toBe(null);
    });
  });
});