import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import DiscoveryPage from "../pages/DiscoveryPage";
import { movieService } from "../api/movieService";
import { renderWithProviders } from "../test/testUtils";

/* Regression contract for the browse page's filter pills and grid footer:
   - every pill can clear its own param (no one-way filters),
   - the Country pill keeps filtering by production country,
   - the end-of-list copy cannot appear while a placeholder page is in flight,
   - Random is disabled until the CURRENT filter's results exist,
   - the grid and the rails never stack two empty states at once. */

const GENRES = [
  { id: 28, name: "Action" },
  { id: 35, name: "Comedy" },
];

const makeMovies = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: `tmdb-movie-${100 + i}`,
    title: `Movie ${i + 1}`,
    mediaType: "movie",
    releaseYear: 2020,
    posterUrl: null,
    backdropUrl: null,
    voteAverage: 7,
    isSeries: false,
  }));

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.spyOn(movieService, "getGenres").mockResolvedValue(GENRES);
  vi.spyOn(movieService, "getWatchProviders").mockResolvedValue([]);
  vi.spyOn(movieService, "getRegions").mockResolvedValue([
    { code: "IN", name: "India" },
    { code: "US", name: "United States" },
  ]);
  vi.spyOn(movieService, "getUpcomingMovies").mockResolvedValue([]);
  vi.spyOn(movieService, "getFutureMovies").mockResolvedValue([]);
  vi.spyOn(movieService, "getRegionalUpcoming").mockResolvedValue([]);
  vi.spyOn(movieService, "getDiscover").mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage(route = "/movies") {
  return renderWithProviders(<DiscoveryPage />, { route });
}

describe("DiscoveryPage filter pills", () => {
  it("clears a chosen genre through the pill's reset entry", async () => {
    const discover = vi
      .spyOn(movieService, "getDiscover")
      .mockResolvedValue(makeMovies(3));

    renderPage("/movies?genre=28");

    const trigger = await screen.findByRole("button", { name: "Filter by Action" });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("option", { name: "All Genres" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Filter by Genre" })).toBeInTheDocument(),
    );
    expect(discover.mock.calls.at(-1)[0].genreId).toBeNull();
  });

  it("keeps the Country selection as a production-country filter", async () => {
    const discover = vi
      .spyOn(movieService, "getDiscover")
      .mockResolvedValue(makeMovies(3));

    renderPage("/movies?country=IN");

    await waitFor(() => expect(discover).toHaveBeenCalled());
    const args = discover.mock.calls.at(-1)[0];
    expect(args.country).toBe("IN");
    expect(args.region).toBeUndefined();
  });
});

describe("DiscoveryPage grid footer", () => {
  it("hides the end-of-list copy while a new filter's placeholder page loads", async () => {
    const next = deferred();
    let call = 0;
    vi.spyOn(movieService, "getDiscover").mockImplementation(() => {
      call += 1;
      return call === 1 ? Promise.resolve(makeMovies(5)) : next.promise;
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("You have reached the end")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter by Genre" }));
    fireEvent.click(screen.getByRole("option", { name: "Action" }));

    await waitFor(() => expect(call).toBeGreaterThan(1));
    // The previous page is still mounted as placeholderData, but nothing is
    // settled yet — the "end" claim must not be shown.
    expect(screen.queryByText("You have reached the end")).toBeNull();

    await act(async () => {
      next.resolve(makeMovies(3));
    });
    await waitFor(() =>
      expect(screen.getByText("You have reached the end")).toBeInTheDocument(),
    );
  });
});

describe("DiscoveryPage Random pill", () => {
  it("stays disabled until the current filter's results arrive", async () => {
    const first = deferred();
    const second = deferred();
    let call = 0;
    vi.spyOn(movieService, "getDiscover").mockImplementation(() => {
      call += 1;
      return call === 1 ? first.promise : second.promise;
    });

    renderPage();

    const random = screen.getByRole("button", { name: "Play Random Movie" });
    expect(random).toBeDisabled();

    await act(async () => {
      first.resolve(makeMovies(4));
    });
    await waitFor(() => expect(random).not.toBeDisabled());

    // A filter change swaps the key; until the new page lands only the stale
    // placeholder rows exist, so Random is disabled again.
    fireEvent.click(screen.getByRole("button", { name: "Filter by Genre" }));
    fireEvent.click(screen.getByRole("option", { name: "Action" }));

    await waitFor(() => expect(random).toBeDisabled());
  });
});

describe("DiscoveryPage empty states", () => {
  it("shows only the grid empty state when the rails are empty too", async () => {
    vi.spyOn(movieService, "getDiscover").mockResolvedValue([]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("No titles found")).toBeInTheDocument(),
    );
    expect(screen.queryByText("No upcoming releases right now.")).toBeNull();
  });
});
