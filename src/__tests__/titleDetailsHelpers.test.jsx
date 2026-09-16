import { describe, it, expect } from "vitest";
import { formatRuntimeLabel, isUnreleased, voteSplitPct, buildEpisodeOrder, episodeNumberLabel, isEpAired } from "../utils/titleDetails";
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

describe("episode layout helpers (Cinejoy episodes section)", () => {
  const eps = [
    { episodeNumber: 1, title: "A" },
    { episodeNumber: 2, title: "B" },
    { episodeNumber: 3, title: "C" },
  ];

  it("keeps the default order (Oldest) and returns a copy", () => {
    const order = buildEpisodeOrder(eps);
    expect(order.map((e) => e.episodeNumber)).toEqual([1, 2, 3]);
    expect(order).not.toBe(eps);
  });

  it("reverses for Newest without mutating the source", () => {
    const order = buildEpisodeOrder(eps, true);
    expect(order.map((e) => e.episodeNumber)).toEqual([3, 2, 1]);
    expect(eps.map((e) => e.episodeNumber)).toEqual([1, 2, 3]);
  });

  it("handles empty input", () => {
    expect(buildEpisodeOrder([])).toEqual([]);
    expect(buildEpisodeOrder(null)).toEqual([]);
    expect(buildEpisodeOrder(undefined, true)).toEqual([]);
  });

  it("labels episode numbers like the Cinejoy E-badge", () => {
    expect(episodeNumberLabel(1)).toBe("E1");
    expect(episodeNumberLabel(25)).toBe("E25");
    expect(episodeNumberLabel(null)).toBe("");
    expect(episodeNumberLabel(undefined)).toBe("");
  });

  it("treats an episode without an air date as aired", () => {
    expect(isEpAired({ episodeNumber: 1 })).toBe(true);
  });

  it("reports only aired episodes as playable", () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const now = new Date();
    expect(isEpAired({ episodeNumber: 1, airDate: past }, now)).toBe(true);
    expect(isEpAired({ episodeNumber: 2, airDate: future }, now)).toBe(false);
    expect(isEpAired({ episodeNumber: 2, airDate: future })).toBe(false);
    expect(isEpAired({ episodeNumber: 3, airDate: "not-a-date" }, now)).toBe(true);
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
