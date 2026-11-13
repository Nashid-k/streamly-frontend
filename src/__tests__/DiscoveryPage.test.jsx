import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, screen, fireEvent, waitFor } from "@testing-library/react";
import DiscoveryPage from "../pages/DiscoveryPage";
import { movieService } from "../api/movieService";
import { renderWithProviders } from "../test/testUtils";
import { setBannerMemory, clearBannerMemory } from "../utils/bannerMemory";

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

    const trigger = await screen.findByRole("button", { name: "Filter by Action" }, { timeout: 4000 });
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

describe("DiscoveryPage upcoming rail", () => {
  it("shows only this month's premieres, never later months", async () => {
    const today = new Date();
    const ymd = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    vi.spyOn(movieService, "getUpcomingMovies").mockResolvedValue([
      { id: "tmdb-movie-901", title: "Premiere This Month", mediaType: "movie", releaseDate: ymd(today), posterUrl: null, backdropUrl: null, voteAverage: 7 },
      { id: "tmdb-movie-902", title: "Premiere Next Month", mediaType: "movie", releaseDate: ymd(nextMonth), posterUrl: null, backdropUrl: null, voteAverage: 7 },
    ]);

    renderPage("/movies");

    expect(await screen.findByRole("heading", { name: "Upcoming" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "View details for Premiere This Month" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "View details for Premiere Next Month" }),
    ).toBeInTheDocument();
  });
});

/* Phase 3 contract: filters are mirrored as removable chips and the sticky bar
   can reset everything. The chips must be driven by the URL params (not local
   state) so back/forward restores them. */
describe.skip("DiscoveryPage active filter chips", () => {
  it("mirrors the URL filters as chips, counts them and removes one", async () => {
    const discover = vi
      .spyOn(movieService, "getDiscover")
      .mockResolvedValue(makeMovies(3));

    renderPage("/movies?genre=28&year=2020");

    expect(await screen.findByText("3 titles")).toBeInTheDocument();
    expect(await screen.findByText("2 filters")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Action filter" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Remove Action filter" }),
      ).toBeNull(),
    );
    expect(screen.getByText("1 filter")).toBeInTheDocument();
    expect(discover.mock.calls.at(-1)[0].genreId).toBeNull();
  });

  it("resets every filter from the bar's Clear all button", async () => {
    vi.spyOn(movieService, "getDiscover").mockResolvedValue(makeMovies(2));

    renderPage("/movies?genre=28&year=2020");

    fireEvent.click(await screen.findByRole("button", { name: "Clear all" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull(),
    );
    expect(screen.queryByText(/\d+ filters?/)).toBeNull();
    expect(await screen.findByText("2 titles")).toBeInTheDocument();
  });
});

/* Cross-route banner carry (cinejoy parity): while the grid's first page is in
   flight, a matching record keeps the banner that was on screen up instead of
   swapping in a skeleton. This pins the page-side wiring too — DiscoveryPage
   must hand its media type to BrowseBanner or the carry can never fire. */
describe("DiscoveryPage browse banner carry", () => {
  beforeEach(() => {
    clearBannerMemory();
  });

  afterEach(() => {
    clearBannerMemory();
  });

  it("keeps the on-screen movie banner while the movies grid loads", async () => {
    const pending = deferred();
    vi.spyOn(movieService, "getDiscover").mockImplementation(() => pending.promise);
    setBannerMemory({
      id: "tmdb-movie-100",
      title: "Carried Movie",
      mediaType: "movie",
      backdropUrl: "https://example.com/carried.jpg",
      posterUrl: "https://example.com/carried-poster.jpg",
    });

    renderPage("/movies");

    const heroImg = document.querySelector(".hero-bg");
    expect(heroImg).not.toBeNull();
    expect(heroImg.getAttribute("alt")).toBe("Carried Movie");
    expect(document.querySelector(".skeleton-hero")).toBeNull();
  });

  it("shows the banner skeleton on a kind mismatch", () => {
    vi.spyOn(movieService, "getDiscover").mockImplementation(() => new Promise(() => {}));
    setBannerMemory({
      id: "tmdb-tv-1399",
      title: "Carried Series",
      mediaType: "tv",
      backdropUrl: "https://example.com/carried-tv.jpg",
      posterUrl: "https://example.com/carried-tv-poster.jpg",
    });

    renderPage("/movies");

    expect(document.querySelector(".skeleton-hero")).not.toBeNull();
    expect(document.querySelector(".hero-bg")).toBeNull();
  });
});

describe("DiscoveryPage pinned filters (Cinejoy .pinned-filters)", () => {
  it("docks the row only after the header row scrolls past, and hands the tab order to the dock", async () => {
    const discover = vi
      .spyOn(movieService, "getDiscover")
      .mockResolvedValue(makeMovies(3));
    // Desktop is the only place the dock exists; the shared setup reports "no
    // match" for every query, so this suite opts in explicitly.
    vi.stubGlobal("matchMedia", (query) => ({
      matches: query.includes("1024"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));

    let onFilterEntry = null;
    const OriginalObserver = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class MockObserver {
      constructor(cb) {
        this.cb = cb;
      }
      observe(el) {
        // Several observers mount on this page (grid sentinel, cards); only the
        // filter slot's entry drives the dock.
        if (el.classList?.contains("discover-filter-slot")) onFilterEntry = this.cb;
      }
      // Real IntersectionObserver API: the virtual-render hook's cleanup calls
      // unobserve, so a mock without it crashes unmount.
      unobserve() {}
      takeRecords() {
        return [];
      }
      disconnect() {}
    };

    try {
      renderPage("/movies");
      await waitFor(() => expect(discover).toHaveBeenCalled());
      expect(document.querySelector(".discover-filters-dock")).toBeNull();
      expect(onFilterEntry).toBeTypeOf("function");

      // Scrolled past: the row's bottom edge is above the viewport.
      act(() => onFilterEntry([{ isIntersecting: false, boundingClientRect: { bottom: -20 } }]));

      const dock = document.querySelector(".discover-filters-dock");
      expect(dock).not.toBeNull();
      expect(dock.querySelectorAll('[aria-haspopup="listbox"]')).toHaveLength(5);
      // The inline copy must not be a second stop in the tab order.
      expect(document.querySelector(".discover-filter-slot .discover-filters")).toHaveAttribute(
        "inert",
      );

      // Scrolling back up returns the row to the header.
      act(() => onFilterEntry([{ isIntersecting: true, boundingClientRect: { bottom: 140 } }]));
      expect(document.querySelector(".discover-filters-dock")).toBeNull();
      expect(
        document.querySelector(".discover-filter-slot .discover-filters"),
      ).not.toHaveAttribute("inert");
    } finally {
      if (OriginalObserver === undefined) delete globalThis.IntersectionObserver;
      else globalThis.IntersectionObserver = OriginalObserver;
      vi.unstubAllGlobals();
    }
  });
});
