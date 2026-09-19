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

  it("getRegionalUpcoming sweeps the Indian languages (pages 1-2) and returns deduped, date-sorted premieres", async () => {
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
      .mockResolvedValueOnce(jsonResponse({ results: [{ id: 401, title: "Telugu Drama", release_date: "2026-09-30", vote_average: 6.9 }] }))
      .mockResolvedValueOnce(jsonResponse({ results: [] }));
    vi.stubGlobal("fetch", fetch);

    const items = await movieService.getRegionalUpcoming(60);

    expect(fetch).toHaveBeenCalledTimes(8); // 4 languages × 2 pages
    const urls = fetch.mock.calls.map(([url]) => String(url));
    for (const lang of ["ta", "hi", "ml", "te"]) {
      // Each language is swept twice (page 1 + page 2) —
      // count both, and no language is restricted by a region=IN param.
      expect(urls.filter((u) => u.includes(`with_original_language=${lang}`)).length).toBe(2);
    }
    // Sorted soonest-first, deduped (no movie-101 twice).
    expect(items.map((i) => i.id)).toEqual(["movie-401", "movie-201", "movie-101", "movie-301", "movie-105", "movie-104"]);
    expect(items[0].releaseDate).toBe("2026-09-30");
    expect(items[3].title).toBe("Malayalam Hit");
  });

  it("getRegionalAiring dedupes regional on-the-air series and enriches top titles with the next episode", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 510, name: "Chennai Nights", first_air_date: "2023-06-01" }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 520, name: "Delhi Drama", first_air_date: "2024-03-01" }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 530, name: "Kochi Tales", first_air_date: "2022-09-01" }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ results: [{ id: 510, name: "Chennai Nights", first_air_date: "2023-06-01" }] }),
      )
      // Per-title next_episode_to_air lookups for the deduped slice.
      .mockResolvedValueOnce(
        jsonResponse({ id: 510, name: "Chennai Nights", next_episode_to_air: { air_date: "2026-09-26", season_number: 2, episode_number: 7, name: "Storm" } }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 520, name: "Delhi Drama", next_episode_to_air: null }))
      .mockResolvedValueOnce(jsonResponse({ id: 530, name: "Kochi Tales", next_episode_to_air: null }));
    vi.stubGlobal("fetch", fetch);

    const items = await movieService.getRegionalAiring(10);

    expect(fetch).toHaveBeenCalledTimes(7); // 4 discovers + 3 enriched lookups
    expect(items.map((i) => i.id)).toEqual(["tv-510", "tv-520", "tv-530"]);
    expect(items[0].nextEpisode).toMatchObject({ season: 2, episode: 7, releaseDate: "2026-09-26" });
    expect(items[1].nextEpisode).toBeUndefined();
expect(items[0].title).toBe("Chennai Nights");
  });
});

