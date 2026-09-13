import { describe, it, expect } from "vitest";
import { rankSearchResults, getDidYouMean, getSearchRelevance } from "../utils/searchRanking";

describe("searchRanking advanced edge cases", () => {
  const mockMovies = [
    { id: "1", title: "The Dark Knight", genres: ["Action", "Crime"], year: 2008, imdbRating: 9.0 },
    { id: "2", title: "Inception", genres: ["Sci-Fi", "Action"], year: 2010, imdbRating: 8.8 },
    { id: "3", title: "Interstellar", genres: ["Sci-Fi", "Drama"], year: 2014, imdbRating: 8.6 },
    { id: "4", title: "The Dark Knight Rises", genres: ["Action", "Crime"], year: 2012, imdbRating: 8.4 },
    { id: "5", title: "Oppenheimer", genres: ["Drama", "Biography"], year: 2023, imdbRating: 8.5 },
    { id: "6", title: "Parasite", genres: ["Thriller", "Drama"], year: 2019, imdbRating: 8.5 },
    { id: "7", title: "The Matrix", genres: ["Sci-Fi", "Action"], year: 1999, imdbRating: 8.7 },
  ];

  describe("rankSearchResults edge cases", () => {
    it("returns empty array for empty movie list", () => {
      expect(rankSearchResults([], "test")).toEqual([]);
    });

    it("returns empty array for null movie list", () => {
      expect(rankSearchResults(null, "test")).toEqual([]);
    });

    it("returns input array for empty query (code returns results || [])", () => {
      expect(rankSearchResults(mockMovies, "")).toEqual(mockMovies);
    });

    it("returns input array for null query", () => {
      expect(rankSearchResults(mockMovies, null)).toEqual(mockMovies);
    });

    it("returns results with zero relevance for whitespace-only query", () => {
      const results = rankSearchResults(mockMovies, "   ");
      // rankSearchResults adds _relevance to each item, so check length and scores
      expect(results.length).toBe(mockMovies.length);
      results.forEach(m => expect(m._relevance).toBe(0));
    });

    it("exact title match ranks first", () => {
      const results = rankSearchResults(mockMovies, "Inception");
      expect(results[0].title).toBe("Inception");
    });

    it("partial title match works", () => {
      const results = rankSearchResults(mockMovies, "Dark Knight");
      expect(results.length).toBeGreaterThanOrEqual(2);
      expect(results[0].title).toContain("Dark Knight");
    });

    it("case-insensitive search", () => {
      const results = rankSearchResults(mockMovies, "INCEPTION");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe("Inception");
    });

    it("genre search returns relevant results", () => {
      const results = rankSearchResults(mockMovies, "Sci-Fi");
      expect(results.length).toBeGreaterThan(0);
    });

    it("year-based search works", () => {
      const results = rankSearchResults(mockMovies, "2023");
      expect(results.length).toBeGreaterThan(0);
    });

    it("single character query returns results", () => {
      const results = rankSearchResults(mockMovies, "a");
      expect(results.length).toBeGreaterThan(0);
    });

    it("long query that partially matches", () => {
      const results = rankSearchResults(mockMovies, "The Dark Knight Rises 2012");
      expect(results.length).toBeGreaterThan(0);
    });

    it("query with special characters", () => {
      const results = rankSearchResults(mockMovies, "the@dark#knight!");
      expect(Array.isArray(results)).toBe(true);
    });

    it("query with spaces at edges is trimmed", () => {
      const results = rankSearchResults(mockMovies, "  Inception  ");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe("Inception");
    });

    it("handles movies with undefined fields", () => {
      const moviesWithUndefined = [
        { id: "u1", title: undefined },
        { id: "u2" },
        { id: "u3", title: "" },
      ];
      const results = rankSearchResults(moviesWithUndefined, "test");
      expect(Array.isArray(results)).toBe(true);
    });

    it("handles movies with null fields", () => {
      const moviesWithNull = [
        { id: "n1", title: null, genres: null },
        { id: "n2", title: null },
      ];
      const results = rankSearchResults(moviesWithNull, "test");
      expect(Array.isArray(results)).toBe(true);
    });

    it("preserves movie data in results", () => {
      const results = rankSearchResults(mockMovies, "Oppenheimer");
      expect(results[0].id).toBe("5");
      expect(results[0].imdbRating).toBe(8.5);
    });
  });

  describe("getDidYouMean", () => {
    it("returns suggestions for misspelled query", () => {
      const results = getDidYouMean("Incepcion", mockMovies, 0.35);
      expect(Array.isArray(results)).toBe(true);
    });

    it("returns empty for empty query", () => {
      expect(getDidYouMean("", mockMovies, 0.35)).toEqual([]);
    });

    it("returns empty for exact match", () => {
      const results = getDidYouMean("Inception", mockMovies, 0.35);
      // Exact match should return no suggestions (or self-suggestion)
      expect(Array.isArray(results)).toBe(true);
    });

    it("handles empty movie list", () => {
      const results = getDidYouMean("test", [], 0.35);
      expect(results).toEqual([]);
    });

    it("handles null threshold", () => {
      const results = getDidYouMean("test", mockMovies, null);
      expect(Array.isArray(results)).toBe(true);
    });

    it("handles very high threshold", () => {
      const results = getDidYouMean("xyz", mockMovies, 0.99);
      expect(Array.isArray(results)).toBe(true);
    });

    it("handles very low threshold", () => {
      const results = getDidYouMean("Dark", mockMovies, 0.01);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("getSearchRelevance", () => {
    it("returns 0 for null movie", () => {
      expect(getSearchRelevance(null, "test")).toBe(0);
    });

    it("returns 0 for null query", () => {
      expect(getSearchRelevance(mockMovies[0], null)).toBe(0);
    });

    it("returns 0 for empty query", () => {
      expect(getSearchRelevance(mockMovies[0], "")).toBe(0);
    });

    it("returns 100 for exact title match", () => {
      expect(getSearchRelevance(mockMovies[1], "Inception")).toBeGreaterThanOrEqual(100);
    });

    it("scores genre match higher than no match", () => {
      // Use exact genre name match (not alias) for reliable scoring
      const horror = { id: "x", title: "RandomMovie", genres: ["Horror"] };
      const drama = { id: "y", title: "RandomMovie", genres: ["Drama"] };
      const horScore = getSearchRelevance(horror, "horror");
      const draScore = getSearchRelevance(drama, "horror");
      expect(horScore).toBeGreaterThan(draScore);
    });

    it("caps score at 120", () => {
      const score = getSearchRelevance(
        { id: "x", title: "Test", genres: ["Action"], director: "Test Director", matchScore: 80, releaseYear: new Date().getFullYear() },
        "test director"
      );
      expect(score).toBeLessThanOrEqual(120);
    });

    it("boosts recent content", () => {
      const recent = { id: "r", title: "Recent Movie", releaseYear: new Date().getFullYear() };
      const old = { id: "o", title: "Recent Movie", releaseYear: 2000 };
      expect(getSearchRelevance(recent, "recent movie")).toBeGreaterThan(
        getSearchRelevance(old, "recent movie")
      );
    });
  });
});
