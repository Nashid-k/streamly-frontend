import { beforeEach, describe, expect, it, vi } from "vitest";

const { tmdbMock, omdbMock } = vi.hoisted(() => ({
  tmdbMock: vi.fn(),
  omdbMock: vi.fn(),
}));

vi.mock("../api/tmdbClient", () => ({ default: tmdbMock }));
vi.mock("../api/omdbClient", () => ({
  fetchOmdbByImdbId: omdbMock,
  hasOmdbKey: () => true,
}));

import { ratingService } from "../api/ratingService";

beforeEach(() => {
  localStorage.clear();
  tmdbMock.mockReset();
  omdbMock.mockReset();
});

describe("getRealRatings", () => {
  it("reuses the normalized IMDb id and skips the external_ids lookup", async () => {
    omdbMock.mockResolvedValue({
      Ratings: [
        { Source: "Internet Movie Database", Value: "8.8/10" },
        { Source: "Rotten Tomatoes", Value: "98%" },
      ],
    });

    const result = await ratingService.getRealRatings({
      id: "movie-550",
      imdbId: "tt0137523",
    });

    expect(tmdbMock).not.toHaveBeenCalled();
    expect(omdbMock).toHaveBeenCalledWith("tt0137523", "movie");
    expect(result).toMatchObject({ imdbId: "tt0137523", imdb: 8.8, rt: 98 });
  });

  it("falls back to external_ids when the title has no normalized IMDb id", async () => {
    tmdbMock.mockResolvedValue({ imdb_id: "tt0111161" });
    omdbMock.mockResolvedValue({ Ratings: [] });

    const result = await ratingService.getRealRatings({ id: "movie-278" });

    expect(tmdbMock).toHaveBeenCalledWith("/movie/278/external_ids");
    expect(omdbMock).toHaveBeenCalledWith("tt0111161", "movie");
    expect(result).toMatchObject({ imdbId: "tt0111161", imdb: null, rt: null });
  });
});
