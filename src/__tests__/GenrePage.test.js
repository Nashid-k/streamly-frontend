import { describe, expect, it } from "vitest";
import { selectGenreResults } from "../utils/genreResults";

describe("selectGenreResults", () => {
  it("accepts the flat searchMovies response used by the genre route", () => {
    const results = selectGenreResults(
      [
        { id: "movie-1", title: "Action One", genres: ["Action"] },
        { id: "movie-2", title: "Drama", genres: ["Drama"] },
        { id: "movie-1", title: "Action One", genres: ["Action"] },
      ],
      "Action",
    );

    expect(results).toEqual([
      { id: "movie-1", title: "Action One", genres: ["Action"] },
    ]);
  });
});
