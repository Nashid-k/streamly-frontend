import { afterEach, describe, expect, it, vi } from "vitest";
import { movieService } from "../api/movieService";

function jsonResponse(body, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
}

afterEach(() => vi.unstubAllGlobals());

describe("movieService", () => {
  it("does not turn people from TMDB's mixed trending feed into titles", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        results: [
          { id: 1, media_type: "person", name: "Actor" },
          { id: 2, media_type: "movie", title: "A Film", vote_average: 7.4 },
          { id: 3, media_type: "tv", name: "A Show", vote_average: 8.1 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetch);

    const titles = await movieService.getTop10();

    expect(titles.map((title) => title.title)).toEqual(["A Film", "A Show"]);
    expect(titles.map((title) => title.id)).toEqual(["movie-2", "tv-3"]);
  });

  it("uses appended credits and keeps details usable when external IDs fail", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 7,
          title: "Example",
          genres: [],
          credits: { cast: [{ id: 10, name: "Lead" }], crew: [] },
          videos: { results: [] },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}, false));
    vi.stubGlobal("fetch", fetch);

    const title = await movieService.getMovieDetails("movie-7");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(title.cast).toEqual([{ id: 10, name: "Lead", character: undefined, profileUrl: null }]);
    expect(title.imdbId).toBeNull();
  });

  it("keeps TMDB's live season metadata so the watch page can open it directly", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 9,
          name: "Running Show",
          number_of_seasons: 3,
          seasons: [
            { season_number: 0, name: "Specials" },
            { season_number: 1, name: "Season 1", episode_count: 8 },
            { season_number: 3, name: "Season 3", episode_count: 10 },
          ],
          next_episode_to_air: {
            season_number: 3,
            episode_number: 4,
            air_date: "2026-09-12",
            name: "New Episode",
          },
          last_episode_to_air: {
            season_number: 3,
            episode_number: 3,
            air_date: "2026-09-05",
            name: "Previous Episode",
          },
          genres: [],
          credits: { cast: [], crew: [] },
          videos: { results: [] },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetch);

    const title = await movieService.getMovieDetails("tv-9");

    expect(title.seasons.map((season) => season.seasonNumber)).toEqual([1, 3]);
    expect(title.airingSeasonNumber).toBe(3);
    expect(title.nextEpisode).toMatchObject({ season: 3, episode: 4 });
  });

  it("keeps the popularity floor but relaxes it when a keyword editorial rail surfaces nothing", async () => {
    // 1 = keyword search resolves the tag id, 2 = discover under the vote
    // floor returns 0 rows, 3 = relaxed (no floor, English) fallback fills it.
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 11472, name: "cannes" }] }),
      )
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { id: 1, title: "Palm D'or Winner", vote_average: 8.2, media_type: "movie" },
            { id: 2, title: "Un Certain Regard", vote_average: 7.1, media_type: "movie" },
          ],
        }),
      );
    vi.stubGlobal("fetch", fetch);

    const items = await movieService.getEditorialRail("cannes-film-festival");

    expect(items.length).toBe(2);
    // Strict floor attempt runs first...
    const strictCall = fetch.mock.calls[1][0];
    expect(strictCall).toContain("vote_count_gte=10");
    expect(strictCall).toContain("with_keywords=11472");
    // ...then the fallback drops the floor and forces English.
    const fallbackCall = fetch.mock.calls[2][0];
    expect(fallbackCall).not.toContain("vote_count_gte");
    expect(fallbackCall).toContain("language=en");
  });

it("normalizes production companies with rich logo metadata", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 42,
          title: "Production Test",
          genres: [],
          credits: { cast: [], crew: [] },
          videos: { results: [] },
          production_companies: [
            { id: 101, name: "Warner Bros. Pictures", logo_path: "/warner.png", origin_country: "US" },
            { id: 102, name: "Legendary", logo_path: null, origin_country: "US" },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}));
    vi.stubGlobal("fetch", fetch);

    const title = await movieService.getMovieDetails("movie-42");

    expect(title.productionCompanies).toEqual([
      {
        id: 101,
        name: "Warner Bros. Pictures",
        logo_path: "/warner.png",
        logoUrl: "https://image.tmdb.org/t/p/w300/warner.png",
        originCountry: "US",
      },
      {
        id: 102,
        name: "Legendary",
        logo_path: null,
        logoUrl: null,
        originCountry: "US",
      },
    ]);
  });

  it("getRegionalUpcoming sweeps the Indian languages (pages 1-3) and returns deduped, date-sorted premieres", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { id: 101, title: "Tamil Film", release_date: "2026-10-25", vote_average: 7.2 },
            { id: 104, title: "Madras Story", release_date: "2027-02-10", vote_average: 6.8 },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 105, title: "Chennai Drama", release_date: "2026-12-01", vote_average: 6.5 }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          results: [
            { id: 201, title: "Hindi Blockbuster", release_date: "2026-10-01", vote_average: 8 },
            // Duplicate of a Tamil sweep title across languages — must dedupe.
            { id: 101, title: "Tamil Film", release_date: "2026-10-25", vote_average: 7.2 },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 301, title: "Malayalam Hit", release_date: "2026-11-05", vote_average: 7.5 }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 401, title: "Telugu Drama", release_date: "2026-09-30", vote_average: 6.9 }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetch);

    const items = await movieService.getRegionalUpcoming(60);

    // Robust to the tmdbClient's proxy→direct fallback (a retry re-hits the same
    // query string): collapse to one entry per distinct query.
    const distinctQueries = [
      ...new Set(fetch.mock.calls.map(([url]) => String(url).split("?")[1])),
    ];
    expect(distinctQueries).toHaveLength(12); // 4 languages × 3 pages
    for (const lang of ["ta", "hi", "ml", "te"]) {
      // Each language is swept three times (page 1 + page 2 + page 3) —
      // count all three, and no language is restricted by a region=IN param.
      expect(distinctQueries.filter((q) => q?.includes(`with_original_language=${lang}`)).length).toBe(3);
    }
    // Sorted soonest-first, deduped (no movie-101 twice).
    expect(items.map((i) => i.id)).toEqual(["movie-401", "movie-201", "movie-101", "movie-301", "movie-105", "movie-104"]);
    expect(items[0].releaseDate).toBe("2026-09-30");
    expect(items[3].title).toBe("Malayalam Hit");
  });

  it("getRegionalAiring merges returning-series and recent-premiere sweeps and enriches top titles", async () => {
    const fetch = vi
      .fn()
      // Returning-series sweep (with_status=0) per language: on-the-air now.
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 510, name: "Chennai Nights", first_air_date: "2023-06-01" }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 520, name: "Delhi Drama", first_air_date: "2024-03-01" }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 530, name: "Kochi Tales", first_air_date: "2022-09-01" }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 530, name: "Kochi Tales", first_air_date: "2022-09-01" }] }))
      // Recent-premieres pass per language: brand-new shows not yet tagged returning.
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 510, name: "Chennai Nights", first_air_date: "2023-06-01" }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 520, name: "Delhi Drama", first_air_date: "2024-03-01" }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 530, name: "Kochi Tales", first_air_date: "2022-09-01" }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 530, name: "Kochi Tales", first_air_date: "2022-09-01" }] }))
      // Per-title next_episode_to_air lookups for the deduped slice.
      .mockResolvedValueOnce(
        jsonResponse({ id: 510, name: "Chennai Nights", next_episode_to_air: { air_date: "2026-10-12", season_number: 2, episode_number: 7, name: "Storm" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 520, name: "Delhi Drama", next_episode_to_air: null }))
      .mockResolvedValueOnce(jsonResponse({ id: 530, name: "Kochi Tales", next_episode_to_air: null }));
    vi.stubGlobal("fetch", fetch);

    const items = await movieService.getRegionalAiring(10);

    // Collapse proxy→direct fallback retries (same path+query) before counting.
    const distinct = [
      ...new Set(
        fetch.mock.calls.map(([url]) => {
          const u = String(url);
          const q = u.split("?")[1] || "";
          return `${u.split("?")[0]}?${q}`;
        }),
      ),
    ];
    expect(distinct).toHaveLength(11); // 4 returning + 4 premieres + 3 enriched look-ups
    for (const lang of ["ta", "hi", "ml", "te"]) {
      // One returning-series sweep + one recent-premiere sweep per language.
      expect(distinct.filter((u) => u.includes("with_status=0") && u.includes(`with_original_language=${lang}`)).length).toBe(1);
      expect(distinct.filter((u) => u.includes("air_date_gte=") && u.includes(`with_original_language=${lang}`)).length).toBe(1);
    }
    expect(items.map((i) => i.id)).toEqual(["tv-510", "tv-520", "tv-530"]);
    expect(items[0].nextEpisode).toMatchObject({ season: 2, episode: 7, releaseDate: "2026-10-12" });
    expect(items[1].nextEpisode).toBeUndefined();
    expect(items[0].title).toBe("Chennai Nights");
  });

  it("getAiringRail paginates /tv/on_the_air, dedupes pages, and keeps the rail alive when enrichment fails", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 1, name: "One", first_air_date: "2024-01-01" }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 2, name: "Two", first_air_date: "2025-05-05" }, { id: 1, name: "One", first_air_date: "2024-01-01" }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      // Enrichment: one hit with a next episode, one failed look-up (fallback item).
      .mockResolvedValueOnce(
        jsonResponse({ id: 1, name: "One", next_episode_to_air: { air_date: "2026-10-15", season_number: 3, episode_number: 5, name: "Rise" } }),
      )
      .mockResolvedValueOnce(jsonResponse({}, false));
    vi.stubGlobal("fetch", fetch);

    const items = await movieService.getAiringRail(30);

    // Collapse proxy→direct fallback retries (same path+query) before counting.
    const distinct = [
      ...new Set(
        fetch.mock.calls.map(([url]) => {
          const u = String(url);
          const q = u.split("?")[1] || "";
          return `${u.split("?")[0]}?${q}`;
        }),
      ),
    ];
    const onAir = distinct.filter((u) => u.includes("/tv/on_the_air"));
    expect(onAir).toHaveLength(3); // pages 1-3
    for (const page of [1, 2, 3]) {
      expect(onAir.some((u) => u.includes(`page=${page}`))).toBe(true);
    }
    // Two per-title next-episode look-ups, one of which fails and falls back.
    expect(distinct.filter((u) => u.includes("/tv/") && !u.includes("/tv/on_the_air")).length).toBe(2);
    expect(items.map((i) => i.id)).toEqual(["tv-1", "tv-2"]);
    expect(items[0].nextEpisode).toMatchObject({ season: 3, episode: 5, releaseDate: "2026-10-15" });
    // The failed look-up falls back to the plain list item — it stays in the rail.
    expect(items[1]).toMatchObject({ id: "tv-2", title: "Two" });
    expect(items[1].nextEpisode).toBeUndefined();
  });

  it("getTvUpcoming merges the global and regional first-air-date sweeps, deduped and soonest-first", async () => {
    const fetch = vi
      .fn()
      // Global sweep pages 1-2.
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 1, name: "Global One", first_air_date: "2026-10-15" }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 2, name: "Global Two", first_air_date: "2026-11-01" }] }))
      // Regional per language (pages 1-2). hi page1 duplicates the Tamil page-1 title.
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 3, name: "Tamil Series", first_air_date: "2026-10-20" }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 3, name: "Tamil Series", first_air_date: "2026-10-20" }, { id: 4, name: "Hindi Series", first_air_date: "2026-10-25" }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 5, name: "Kochi Premiere", first_air_date: "2027-01-05" }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 6, name: "Telugu Series", first_air_date: "2026-10-30" }] }));
    vi.stubGlobal("fetch", fetch);

    const items = await movieService.getTvUpcoming(120);

    const distinctQueries = [
      ...new Set(fetch.mock.calls.map(([url]) => String(url).split("?")[1])),
    ];
    expect(distinctQueries).toHaveLength(10); // 2 global + 4 languages × 2 pages
    for (const lang of ["ta", "hi", "ml", "te"]) {
      expect(distinctQueries.filter((q) => q?.includes(`with_original_language=${lang}`)).length).toBe(2);
    }
    expect(fetch.mock.calls.every(([url]) => String(url).includes("first_air_date.gte="))).toBe(true);
    // tv-3 deduped across the ta/hi sweeps; tv-2 is the global page-2 title. Soonest-first.
    expect(items.map((i) => i.id)).toEqual(["tv-1", "tv-3", "tv-4", "tv-6", "tv-2", "tv-5"]);
    expect(items[0].releaseDate).toBe("2026-10-15");
    expect(items[4].releaseDate).toBe("2026-11-01");
    expect(items[5].releaseDate).toBe("2027-01-05");
  });
});

