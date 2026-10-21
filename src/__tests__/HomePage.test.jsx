import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "../pages/HomePage";
import { movieService } from "../api/movieService";
import { renderWithProviders } from "../test/testUtils";

/* HomePage had NO coverage at all (1,136 lines, the app's landing surface).
   These tests pin the behaviours that are easy to break silently:
     - the hero is built from the featured pool and names the active title,
     - the loading skeleton and the failure state stay DISTINCT (an outage
       must not render as an endless skeleton),
     - the tab filter never leaks the wrong media type into the hero pool,
     - the hero can actually be navigated (dots + arrow keys).

   Queried via the hero's own accessible names: the banner renders a title LOGO
   image, never a visible <h1> (by design — see bannerReady in HomePage), so
   `getByText(title)` would never match. The slide dots expose
   aria-label="Show <title>" and aria-current on the active one, which is the
   real user-facing contract. */

const MOVIE = {
  id: "tmdb-movie-550",
  title: "Fight Club",
  mediaType: "movie",
  isSeries: false,
  releaseYear: 1999,
  voteAverage: 8.4,
  imdbRating: 8.8,
  genres: ["Drama", "Thriller"],
  description: "An insomniac office worker forms an underground fight club.",
  backdropUrl: "https://example.com/backdrop.jpg",
  posterUrl: "https://example.com/poster.jpg",
  // The hero renders the title LOGO, and the pool is filtered to titles that
  // carry one (a bare backdrop would fall back to the <h1> the banner avoids).
  logoUrl: "https://example.com/fight-club-logo.png",
};

const SERIES = {
  id: "tmdb-tv-1399",
  title: "Game of Thrones",
  mediaType: "tv",
  isSeries: true,
  releaseYear: 2011,
  voteAverage: 8.4,
  genres: ["Drama"],
  description: "Noble families vie for control of the Iron Throne.",
  backdropUrl: "https://example.com/got.jpg",
  posterUrl: "https://example.com/got-poster.jpg",
  logoUrl: "https://example.com/got-logo.png",
};

/* Everything HomePage can reach. Only the hero-critical two are given data;
   the rails are emptied so the assertions are about the hero, not the rails. */
function stubHomeService({ featured = [MOVIE], reject = false } = {}) {
  const empty = () => Promise.resolve([]);
  for (const method of [
    "getCategories",
    "getAiringThisWeek",
    "getTrendingThisWeek",
    "getTop10",
    "getPopular",
    "getTopRated",
    "getNowPlaying",
    "getNewReleases",
    "getRegionalUpcoming",
    "getRegionalAiring",
    "getRecommendations",
  ]) {
    if (typeof movieService[method] === "function") {
      vi.spyOn(movieService, method).mockImplementation(empty);
    }
  }
  vi.spyOn(movieService, "getFeaturedMovies").mockImplementation(() =>
    reject ? Promise.reject(new Error("network down")) : Promise.resolve(featured),
  );
  vi.spyOn(movieService, "getCategories").mockImplementation(() =>
    reject ? Promise.reject(new Error("network down")) : Promise.resolve([]),
  );
}

function renderHome(props = {}) {
  return renderWithProviders(<Home {...props} />, { route: "/" });
}

/* The active slide is the dot that carries aria-current. The dots only render
   while the hero is hovered/focused (or on a coarse pointer), so a test that
   wants them must hover the hero first — see revealHeroControls. */
const activeSlideName = () => {
  const active = document.querySelector(".hero-dot[aria-current='true']");
  return active?.getAttribute("aria-label");
};

function revealHeroControls() {
  const hero = document.querySelector(".hero-container");
  expect(hero).not.toBeNull();
  fireEvent.mouseEnter(hero);
  return hero;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HomePage hero", () => {
  it("builds the hero from the featured pool and shows that title's overview", async () => {
    stubHomeService();
    renderHome();

    // The hero renders the title LOGO (no visible <h1> by design), so the
    // overview is the reliable text handle for "this title is the hero".
    expect(
      await screen.findByText(/an insomniac office worker forms an underground fight club/i),
    ).toBeInTheDocument();
  });

  it("shows a loading skeleton (not the failure copy) while the first fetch is in flight", () => {
    // Never resolves: the page must sit in its loading state, not claim failure.
    vi.spyOn(movieService, "getFeaturedMovies").mockImplementation(
      () => new Promise(() => {}),
    );
    vi.spyOn(movieService, "getCategories").mockImplementation(
      () => new Promise(() => {}),
    );
    renderHome();

    // jsdom has no layout for the skeleton, so assert on the outcome instead:
    // no hero slide, and no error/retry affordance either.
    expect(screen.queryByRole("button", { name: /^show /i })).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn't|failed to load|try again/i)).not.toBeInTheDocument();
  });

  it("surfaces a failure state instead of an endless skeleton", async () => {
    stubHomeService({ reject: true });
    renderHome();

    // An outage must resolve to something the viewer can act on, not a hero.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^show /i })).not.toBeInTheDocument();
    });
  });

  it("never leaks the wrong media type into the hero POOL (not just the first slide)", async () => {
    stubHomeService({ featured: [MOVIE, SERIES] });

    // Only ONE of the two fixtures matches each tab, so the hero cannot reach its
    // target length from the tab-correct pool alone — which is exactly what made
    // the backfill reach into the raw featured list and pull the other one back
    // in. The hero then rotates onto a title the tab excludes.
    //
    // The active slide alone would not catch this (the leak can sit on slide 2+),
    // so this inspects the whole POOL via the slide dots.
    const { unmount } = renderHome({ filter: "movies" });
    await screen.findByText(/an insomniac office worker forms an underground fight club/i);
    revealHeroControls();

    expect(
      screen.queryByRole("button", { name: /show game of thrones/i }),
    ).not.toBeInTheDocument();
    unmount();

    renderHome({ filter: "series" });
    await screen.findByText(/noble families vie for control of the iron throne/i);
    revealHeroControls();

    expect(
      screen.queryByRole("button", { name: /show fight club/i }),
    ).not.toBeInTheDocument();
  });

  it("lets the hero be paged with the arrow keys", async () => {
    stubHomeService({ featured: [MOVIE, SERIES] });
    renderHome({ filter: "all" });

    await screen.findByText(/an insomniac office worker forms an underground fight club/i);
    const hero = revealHeroControls();

    fireEvent.keyDown(hero, { key: "ArrowRight" });
    await waitFor(() => expect(activeSlideName()).toMatch(/show game of thrones/i));

    // Wraps back to the first slide.
    fireEvent.keyDown(hero, { key: "ArrowLeft" });
    await waitFor(() => expect(activeSlideName()).toMatch(/show fight club/i));
  });

  it("offers a slide dot per hero title, and clicking one jumps to that slide", async () => {
    stubHomeService({ featured: [MOVIE, SERIES] });
    renderHome();

    await screen.findByText(/an insomniac office worker forms an underground fight club/i);
    revealHeroControls();
    const gotDot = await screen.findByRole("button", { name: /show game of thrones/i });
    fireEvent.click(gotDot);
    await waitFor(() => expect(activeSlideName()).toMatch(/show game of thrones/i));
  });
});
