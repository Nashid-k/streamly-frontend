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
    expect(title.nextEpisode).toMatchObject({ seasonNumber: 3, episodeNumber: 4 });
  });
});
