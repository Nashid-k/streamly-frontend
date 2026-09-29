import { describe, it, expect } from "vitest";
import { highlightSegments } from "../utils/highlightMatch";

const join = (segments) => segments.map((s) => s.text).join("");

describe("highlightSegments", () => {
  it("marks the first occurrence of the query", () => {
    const segments = highlightSegments("The Dark Knight", "dark");
    expect(segments).toEqual([
      { text: "The ", hit: false },
      { text: "Dark", hit: true },
      { text: " Knight", hit: false },
    ]);
    expect(join(segments)).toBe("The Dark Knight");
  });

  it("matches case-insensitively but marks the title's own casing", () => {
    const segments = highlightSegments("INCEPTION", "incept");
    expect(segments).toEqual([
      { text: "INCEPT", hit: true },
      { text: "ION", hit: false },
    ]);
  });

  it("trims the query so a trailing space does not kill the match", () => {
    const segments = highlightSegments("Parasite", "  para  ");
    expect(segments[0]).toEqual({ text: "Para", hit: true });
  });

  it("marks only the first repeat, not every one", () => {
    const segments = highlightSegments("The Man Who Knew Too Much", "man");
    expect(segments.filter((s) => s.hit)).toHaveLength(1);
    expect(join(segments)).toBe("The Man Who Knew Too Much");
  });

  it("returns the whole string unmarked when the query is empty or whitespace", () => {
    expect(highlightSegments("Alien", "")).toEqual([{ text: "Alien", hit: false }]);
    expect(highlightSegments("Alien", "   ")).toEqual([{ text: "Alien", hit: false }]);
  });

  it("returns the whole string unmarked when nothing matches", () => {
    expect(highlightSegments("Alien", "zzz")).toEqual([{ text: "Alien", hit: false }]);
  });

  it("handles empty or non-string title without throwing", () => {
    expect(highlightSegments(undefined, "a")).toEqual([{ text: "", hit: false }]);
    expect(highlightSegments(null, "a")).toEqual([{ text: "", hit: false }]);
    expect(highlightSegments(1234, "12")).toEqual([{ text: "", hit: false }]);
  });

  it("does not require a whole word — substring semantics on purpose", () => {
    // "Interstellar" contains "stell" but never "star"; the file header pins
    // substring (not word-boundary) matching, so the inner span is marked.
    expect(highlightSegments("Interstellar", "stell")).toEqual([
      { text: "Inter", hit: false },
      { text: "stell", hit: true },
      { text: "ar", hit: false },
    ]);
    expect(highlightSegments("Interstellar", "star")).toEqual([
      { text: "Interstellar", hit: false },
    ]);
  });
});
