import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import HomeRails from "../components/rails/HomeRails";
import { renderWithProviders } from "../test/testUtils";

/* The home feed's rail order is a product decision, not an accident of render
   order: Trending Movies → Trending Series → Movies on <provider> → TV Series
   on <provider> → … → the rotating tail. This pins that order, and pins that
   Browse by Provider is an animated brand-icon grid, not a poster-card rail. */

vi.mock("../api/movieService", () => ({
  movieService: {
    getDiscover: vi.fn().mockResolvedValue([
      {
        id: "tmdb-movie-99",
        title: "On a service",
        mediaType: "movie",
        posterUrl: "https://example.com/service.jpg",
        backdropUrl: "https://example.com/service-backdrop.jpg",
        releaseYear: 2022,
        imdbRating: 6.9,
        genres: ["Comedy"],
      },
    ]),
    getDiscoverRail: vi.fn().mockResolvedValue([]),
  },
}));

const MOVIE = {
  id: "tmdb-movie-1",
  title: "Trending Film",
  mediaType: "movie",
  posterUrl: "https://example.com/poster.jpg",
  backdropUrl: "https://example.com/backdrop.jpg",
  releaseYear: 2024,
  imdbRating: 7.4,
  genres: ["Drama"],
};

const WATCHED = { id: "tmdb-movie-77", title: "Already Watched", mediaType: "movie" };

const RECOMMENDED = {
  id: "tmdb-movie-78",
  title: "Suggested Next",
  mediaType: "movie",
  posterUrl: "https://example.com/next.jpg",
  backdropUrl: "https://example.com/next-backdrop.jpg",
  releaseYear: 2021,
  imdbRating: 7.1,
  genres: ["Thriller"],
};

const SERIES = {
  id: "tmdb-tv-1",
  title: "Trending Show",
  mediaType: "tv",
  isSeries: true,
  posterUrl: "https://example.com/show.jpg",
  backdropUrl: "https://example.com/show-backdrop.jpg",
  releaseYear: 2023,
  imdbRating: 8.1,
  genres: ["Drama"],
};

function renderRails() {
  renderWithProviders(
    <HomeRails
      loading={false}
      filter="all"
      railsSentinelRef={{ current: null }}
      trendingMovies={[MOVIE]}
      trendingSeries={[SERIES]}
      becauseAnchor={WATCHED}
      onBecauseAnchorChange={() => {}}
      recommendations={[RECOMMENDED]}
    />,
    { route: "/" },
  );
}

describe("HomeRails", () => {
  it("renders the catalogue rows in the agreed order", async () => {
    renderRails();

    expect((await screen.findAllByText("Trending Film")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Trending Show").length).toBeGreaterThan(0);
    // The provider rails paint their dropdown head only once their first page
    // lands (before that the accessible skeleton is aria-hidden).
    await waitFor(() => {
      expect(screen.getByText("Movies on")).toBeInTheDocument();
    });

    // Provider rails inline their prefix in the trigger instead of a separate
    // heading, so the order check reads both canonical heads and inline labels.
    const heads = [...document.querySelectorAll(".sh-head h2, .rail-menu--inline .rail-menu__label")].map(
      (h) => h.textContent,
    );
    const at = (text) => heads.indexOf(text);

    expect(at("Because you watched")).toBeGreaterThanOrEqual(0);
    expect(at("Because you watched")).toBeLessThan(at("Trending Movies"));
    expect(at("Trending Movies")).toBeLessThan(at("Trending Series"));
    expect(at("Trending Series")).toBeLessThan(at("Movies on"));
    expect(at("Movies on")).toBeLessThan(at("TV Series on"));
  });

  it("renders Browse by Provider as brand icons and no longer renders Top 10", () => {
    renderRails();
    expect(screen.queryByText(/top 10/i)).toBeNull();
    expect(screen.getByRole("heading", { name: "Browse by Provider" })).toBeInTheDocument();

    const grid = document.querySelector(".provider-icon-grid");
    expect(grid).not.toBeNull();
    expect(grid.querySelectorAll(".provider-icon")).toHaveLength(17);
    expect(grid.querySelector(".provider-icon")?.getAttribute("href")).toMatch(/^\/provider\//);
    expect(grid.querySelector(".provider-icon img")).not.toBeNull();
    expect(grid.querySelector("li, .provider-icon span")).toBeNull();
    expect(grid.querySelector(".po, .cw")).toBeNull();
  });
});
