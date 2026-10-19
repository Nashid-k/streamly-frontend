import { describe, it, expect } from "vitest";
import { formatRuntimeLabel, isUnreleased, voteSplitPct, buildEpisodeOrder, episodeNumberLabel, isEpAired, formatAirsDate, startPlaybackTimestamp, isEpisodeWatchedEntry, seasonEdgeEpisode } from "../utils/titleDetails";
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

  it("labels an upcoming episode's air date for both the details page and the player", () => {
    expect(formatAirsDate(null)).toBe("Upcoming");
    expect(formatAirsDate("")).toBe("Upcoming");
    // An unparseable date is shown verbatim rather than as "Invalid Date".
    expect(formatAirsDate("whenever")).toBe("whenever");
    expect(formatAirsDate("2026-09-09")).toMatch(/2026|9/);
  });

  it("anchors the aired boundary at noon UTC like getSeasonEpisodes", () => {
    // 06:00Z is the same calendar day but before the noon-UTC anchor, so an
    // episode airing today is not yet aired; the old UTC-midnight parse flipped
    // it a day early. After noon it is aired.
    expect(isEpAired({ episodeNumber: 1, airDate: "2026-06-15" }, new Date("2026-06-15T06:00:00Z"))).toBe(false);
    expect(isEpAired({ episodeNumber: 1, airDate: "2026-06-15" }, new Date("2026-06-15T13:00:00Z"))).toBe(true);
    // The day before is unambiguously aired.
    expect(isEpAired({ episodeNumber: 1, airDate: "2026-06-14" }, new Date("2026-06-15T06:00:00Z"))).toBe(true);
  });
});

describe("startPlaybackTimestamp (resume must survive pressing play)", () => {
  const entry = { id: "tv-1", savedSeason: 2, savedEpisode: 5, timestamp: 640 };

  it("keeps a series resume point when the same episode is about to play", () => {
    expect(startPlaybackTimestamp(entry, { isTv: true, season: 2, episode: 5 })).toBeNull();
  });

  it("resets for a different episode so it does not inherit the old timestamp", () => {
    expect(startPlaybackTimestamp(entry, { isTv: true, season: 2, episode: 6 })).toBe(0);
    expect(startPlaybackTimestamp(entry, { isTv: true, season: 3, episode: 5 })).toBe(0);
  });

  it("keeps a movie's positive resume point", () => {
    expect(startPlaybackTimestamp({ id: "m1", timestamp: 120 }, { isTv: false })).toBeNull();
  });

  it("writes 0 when there is no progress to keep", () => {
    expect(startPlaybackTimestamp(null, { isTv: true, season: 1, episode: 1 })).toBe(0);
    expect(startPlaybackTimestamp({ id: "tv-1", timestamp: 0 }, { isTv: true, season: 1, episode: 1 })).toBe(0);
  });
});

describe("isEpisodeWatchedEntry (season-scoped ticks)", () => {
  const entry = { savedSeason: 1, savedEpisode: 5, timestamp: 300, watchedEpisodes: { 1: [5] } };

  it("counts the live resume point only for its own season", () => {
    expect(isEpisodeWatchedEntry(entry, 1, 5)).toBe(true);
    expect(isEpisodeWatchedEntry(entry, 2, 5)).toBe(false);
  });

  it("reads the watchedEpisodes set for the given season", () => {
    expect(isEpisodeWatchedEntry({ watchedEpisodes: { 2: [3, 4] } }, 2, 4)).toBe(true);
    expect(isEpisodeWatchedEntry({ watchedEpisodes: { 2: [3, 4] } }, 2, 5)).toBe(false);
    expect(isEpisodeWatchedEntry({ watchedEpisodes: { 2: [3, 4] } }, 3, 4)).toBe(false);
  });

  it("returns false without an entry", () => {
    expect(isEpisodeWatchedEntry(null, 1, 1)).toBe(false);
  });
});

describe("seasonEdgeEpisode (cross-season prev/next landing)", () => {
  it("lands on the target season's last episode when stepping back", () => {
    expect(seasonEdgeEpisode(8, "last")).toBe(8);
    expect(seasonEdgeEpisode("10", "last")).toBe(10);
  });

  it("falls back to 1 when the season's count is unknown", () => {
    expect(seasonEdgeEpisode(0, "last")).toBe(1);
    expect(seasonEdgeEpisode(undefined, "last")).toBe(1);
  });

  it("always lands on the first episode when stepping forward", () => {
    expect(seasonEdgeEpisode(8, "first")).toBe(1);
    expect(seasonEdgeEpisode(undefined, "first")).toBe(1);
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
