import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import SearchPage from "../pages/SearchPage";
import { movieService } from "../api/movieService";
import { renderWithProviders } from "../test/testUtils";

/* Integration contract for the search surface: the request must carry a
   cancellation signal (so a query the viewer already typed past cannot land),
   and the result grid must be walkable from the keyboard. Both were verified
   by reading alone for weeks; these are the tests that keep them true. */

const RESULTS = [
  { id: "tmdb-movie-603", title: "The Matrix", mediaType: "movie", releaseYear: 1999, posterUrl: null, voteAverage: 8.2, isSeries: false },
  { id: "tmdb-movie-604", title: "The Matrix Reloaded", mediaType: "movie", releaseYear: 2003, posterUrl: null, voteAverage: 7.1, isSeries: false },
  { id: "tmdb-tv-1399", title: "Matrix Rising", mediaType: "tv", releaseYear: 2020, posterUrl: null, voteAverage: 6.5, isSeries: true },
];

let searchSpy;

beforeEach(() => {
  searchSpy = vi
    .spyOn(movieService, "searchMovies")
    .mockResolvedValue(RESULTS);
  vi.spyOn(movieService, "getTrendingThisWeek").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage(q = "matrix") {
  return renderWithProviders(<SearchPage />, { route: `/search?q=${encodeURIComponent(q)}` });
}

const queryInput = () => document.querySelector(".search-panel__input");

/* Results carry <mark> elements now, and testing-library's default text
   matcher reads DIRECT text-node children only — "The " + <mark>Matrix</mark>
   matches no string. Wait on the structure instead of the copy. */
const waitForResults = async (min = 1) => {
  await waitFor(() => {
    expect(
      document.querySelectorAll("[data-search-result]").length,
    ).toBeGreaterThanOrEqual(min);
  });
};

describe("SearchPage cancellation", () => {
  it("passes react-query's abort signal to searchMovies", async () => {
    renderPage("matrix");

    await waitForResults();
    expect(searchSpy).toHaveBeenCalledTimes(1);

    const [query, opts] = searchSpy.mock.calls[0];
    expect(query).toBe("matrix");
    expect(opts).toBeTruthy();
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not call the service for an empty query", async () => {
    renderPage("");

    await waitFor(() => expect(searchSpy).not.toHaveBeenCalled());
  });
});

describe("SearchPage keyboard navigation", () => {
  it("moves focus from the query box to the first result on ArrowDown", async () => {
    renderPage("matrix");
    await waitForResults();

    const input = queryInput();
    // jsdom does not honour React's autoFocus on this mount path, so give the
    // box focus the way a real tab-through would. The contract here is the
    // ArrowDown handoff, not React's autofocus plumbing.
    input.focus();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.activeElement?.classList.contains("movie-card")).toBe(true);
  });

  it("walks results with ArrowDown and returns to the query box on ArrowUp", async () => {
    renderPage("matrix");
    await waitForResults();

    const input = queryInput();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const first = document.activeElement;
    fireEvent.keyDown(first, { key: "ArrowDown" });
    const second = document.activeElement;
    expect(second).not.toBe(first);
    expect(second?.classList.contains("movie-card")).toBe(true);

    fireEvent.keyDown(second, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(input);
  });

  it("jumps to the last result with End and back with Home", async () => {
    renderPage("matrix");
    await waitForResults();

    const input = queryInput();
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const first = document.activeElement;
    // Not getAllByRole(...).pop(): each card also contains an inner poster
    // button carrying the same aria-label, and that one is not a roving stop.
    const cards = Array.from(
      document.querySelectorAll("[data-search-result] .movie-card"),
    );
    const last = cards[cards.length - 1];
    expect(cards.length).toBeGreaterThanOrEqual(3);

    fireEvent.keyDown(first, { key: "End" });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(last, { key: "Home" });
    expect(document.activeElement).toBe(first);
  });

  it("returns focus to the query box from a result on Escape", async () => {
    renderPage("matrix");
    await waitForResults();

    const input = queryInput();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(document.activeElement).not.toBe(input);

    fireEvent.keyDown(document.activeElement, { key: "Escape" });
    expect(document.activeElement).toBe(input);
  });
});

describe("SearchPage result highlighting", () => {
  it("marks the typed query inside each result title", async () => {
    renderPage("matrix");
    await waitForResults();

    const marks = document.querySelectorAll(".movie-title mark");
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].textContent.toLowerCase()).toContain("matrix");
  });
});
