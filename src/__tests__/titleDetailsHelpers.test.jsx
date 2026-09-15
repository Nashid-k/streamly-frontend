import { describe, it, expect } from "vitest";
import { formatRuntimeLabel, isUnreleased, voteSplitPct } from "../utils/titleDetails";
import { certificationFromDetail } from "../api/movieService";

describe("TitleDetails meta helpers", () => {
  it("formats runtime the way Cinejoy does (2h 45m)", () => {
    expect(formatRuntimeLabel(165)).toBe("2h 45m");
    expect(formatRuntimeLabel(120)).toBe("2h");
    expect(formatRuntimeLabel(45)).toBe("45m");
    expect(formatRuntimeLabel(0)).toBeNull();
    expect(formatRuntimeLabel(null)).toBeNull();
  });

  it("flags only future release dates as unreleased", () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(isUnreleased(future)).toBe(true);
    expect(isUnreleased(past)).toBe(false);
    expect(isUnreleased(null)).toBe(false);
    expect(isUnreleased("not-a-date")).toBe(false);
  });

  it("derives an up/down split from the score", () => {
    expect(voteSplitPct(8.4)).toEqual({ up: 84, down: 16 });
    expect(voteSplitPct(0)).toBeNull();
    expect(voteSplitPct(null)).toBeNull();
  });
});

describe("certificationFromDetail", () => {
  it("prefers the US movie certification", () => {
    const detail = {
      release_dates: {
        results: [
          { iso_3166_1: "GB", release_dates: [{ certification: "15" }] },
          { iso_3166_1: "US", release_dates: [{ certification: "" }, { certification: "R" }] },
        ],
      },
    };
    expect(certificationFromDetail(detail, false)).toBe("R");
  });

  it("falls back to any country when the US entry is missing", () => {
    const detail = {
      release_dates: {
        results: [{ iso_3166_1: "DE", release_dates: [{ certification: "FSK 16" }] }],
      },
    };
    expect(certificationFromDetail(detail, false)).toBe("FSK 16");
  });

  it("reads TV content ratings", () => {
    const detail = {
      content_ratings: { results: [{ iso_3166_1: "US", rating: "TV-MA" }] },
    };
    expect(certificationFromDetail(detail, true)).toBe("TV-MA");
  });

  it("returns null when nothing is available", () => {
    expect(certificationFromDetail({}, false)).toBeNull();
    expect(certificationFromDetail(null, true)).toBeNull();
  });
});
