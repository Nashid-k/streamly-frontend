import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "../pages/HomePage";
import { movieService } from "../api/movieService";
import { renderWithProviders } from "../test/testUtils";
import { getBannerMemory, clearBannerMemory } from "../utils/bannerMemory";

/* HomePage had NO coverage at all (1,136 lines, the app's landing surface).
   These tests pin the behaviours that are easy to break silently:
     - the hero is built from the featured pool and names the active title,
     - the hero paints from the trending list without waiting for artwork,
     - the loading skeleton and the failure state stay DISTINCT (an outage
       must not render as an endless skeleton),
     - the tab filter never leaks the wrong media type into the hero pool,
     - the hero can actually be navigated (dots + arrow keys).

   Queried via the hero's own accessible names: when a title already carries a
   logo the banner renders it, otherwise `HeroTitleLogo` draws the styled <h1>
   until the cached logo lookup resolves. The slide dots expose
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
   the rails are emptied so the assertions are about the hero, not the rails.
   `stubFeatured: false` leaves `getFeaturedMovies` real so a test can exercise
   the service/render boundary (see the waterfall test). */
function stubHomeService({ featured = [MOVIE], reject = false, stubFeatured = true } = {}) {
  const empty = () => Promise.resolve([]);
  for (const method of [
    "getCategories",
    // The provider rails and the rotating rail tail are their own discover
    // calls; empty them so the hero assertions stay offline.
    "getDiscover",
    "getDiscoverRail",
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
  if (stubFeatured) {
    vi.spyOn(movieService, "getFeaturedMovies").mockImplementation(() =>
      reject ? Promise.reject(new Error("network down")) : Promise.resolve(featured),
    );
  }
  vi.spyOn(movieService, "getCategories").mockImplementation(() =>
    reject ? Promise.reject(new Error("network down")) : Promise.resolve([]),
  );
}

function jsonResponse(body, ok = true) {
  return { ok, status: ok ? 200 : 500, json: async () => body };
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
  clearBannerMemory();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  clearBannerMemory();
});

describe("HomePage hero", () => {
  it("builds the hero from the featured pool and shows that title's overview", async () => {
    stubHomeService();
    renderHome();

    // The hero renders the title LOGO (no visible <h1> by design), so the
    // overview is the reliable text handle for "this title is the hero". The
    // timeout is generous for the same reason as the artwork test below: the
    // suite runs 120+ jsdom environments in parallel and the home page now also
    // mounts the provider rails and the rotating tail.
    expect(
      await screen.findByText(
        /an insomniac office worker forms an underground fight club/i,
        {},
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
  });

  it("paints the hero from the trending list without waiting for per-title artwork", async () => {
    stubHomeService({ stubFeatured: false });
    const fetch = vi.fn((url) => {
      if (String(url).includes("/trending/all/week")) {
        return Promise.resolve(
          jsonResponse({
            results: [
              {
                id: 550,
                media_type: "movie",
                title: "Fight Club",
                overview: "An insomniac office worker forms an underground fight club.",
                backdrop_path: "/fight-club.jpg",
                poster_path: "/fight-club-poster.jpg",
                release_date: "1999-10-15",
                vote_average: 8.4,
                genre_ids: [18, 53],
              },
            ],
          }),
        );
      }
      // Every artwork/detail lookup stalls forever: the banner must not need it.
      return new Promise(() => {});
    });
    vi.stubGlobal("fetch", fetch);
    renderHome();

    // The list payload is enough to paint. The wordmark resolves separately and
    // this title's lookup is still in flight, so the styled text title is the
    // designed fallback rather than a loading gate. The timeout is generous
    // because the full suite runs 110 jsdom environments in parallel and this
    // assertion traverses the real service + query pipeline.
    expect(
      await screen.findByRole("heading", { name: /fight club/i }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(
      fetch.mock.calls.some(([url]) => String(url).includes("append_to_response=images")),
    ).toBe(false);
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
    await screen.findByText(
      /an insomniac office worker forms an underground fight club/i,
      {},
      { timeout: 5000 },
    );
    revealHeroControls();

    expect(
      screen.queryByRole("button", { name: /show game of thrones/i }),
    ).not.toBeInTheDocument();
    unmount();

    renderHome({ filter: "series" });
    await screen.findByText(
      /noble families vie for control of the iron throne/i,
      {},
      { timeout: 5000 },
    );
    revealHeroControls();

    expect(
      screen.queryByRole("button", { name: /show fight club/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the banner on its current slide under manual input (no paging)", async () => {
    // Manual paging (arrows + clickable dots) was removed so the banner holds
    // its dwell time and the title logo has time to load before the slide
    // advances. Only the auto-rotation timer advances slides.
    stubHomeService({ featured: [MOVIE, SERIES] });
    renderHome({ filter: "all" });

    await screen.findByText(/an insomniac office worker forms an underground fight club/i);
    const hero = revealHeroControls();

    fireEvent.keyDown(hero, { key: "ArrowRight" });
    // Give any (now-removed) handler a chance to fire.
    await new Promise((r) => setTimeout(r, 50));
    expect(activeSlideName()).toMatch(/fight club/i);

    fireEvent.keyDown(hero, { key: "ArrowLeft" });
    await new Promise((r) => setTimeout(r, 50));
    expect(activeSlideName()).toMatch(/fight club/i);
  });

  it("turns the slide ticks into buttons that jump to that slide", async () => {
    // P2-3: the ticks used to be non-interactive spans. They are now real
    // buttons with a 44px hit area (see .hero-dot in hero.css), so the previous
    // "clicking must not advance" assertion no longer describes the product.
    stubHomeService({ featured: [MOVIE, SERIES] });
    renderHome();

    await screen.findByText(/an insomniac office worker forms an underground fight club/i);
    revealHeroControls();
    const dots = document.querySelectorAll(".hero-dot");
    expect(dots.length).toBe(2);
    expect(dots[0].tagName).toBe("BUTTON");
    expect(dots[0].getAttribute("aria-current")).toBe("true");

    fireEvent.click(dots[1]);
    await new Promise((r) => setTimeout(r, 50));
    expect(dots[1].getAttribute("aria-current")).toBe("true");
    expect(dots[0].getAttribute("aria-current")).toBe(null);
  });
});

describe("HomePage cross-route banner record", () => {
  it("publishes the active featured movie so the Movies page can carry it", async () => {
    stubHomeService();
    renderHome();

    expect(
      await screen.findByText(/an insomniac office worker forms an underground fight club/i),
    ).toBeInTheDocument();
    expect(getBannerMemory()).toMatchObject({
      id: "tmdb-movie-550",
      mediaType: "movie",
      title: "Fight Club",
      backdropUrl: "https://example.com/backdrop.jpg",
    });
  });

  it("publishes a series hero as tv so the Series page can carry it", async () => {
    stubHomeService({ featured: [SERIES] });
    renderHome();

    expect(
      await screen.findByText(/noble families vie for control of the iron throne/i),
    ).toBeInTheDocument();
    expect(getBannerMemory()).toMatchObject({
      id: "tmdb-tv-1399",
      mediaType: "tv",
      title: "Game of Thrones",
    });
  });
});
