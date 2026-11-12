import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import HomeRails from "../components/rails/HomeRails";
import { renderWithProviders } from "../test/testUtils";

/* The home feed's rail order is a product decision, not an accident of render
   order: Trending Movies → Trending Series → Movies on <provider> → TV Series
   on <provider> → … → the rotating tail. This pins that order, and pins that
   the retired Top 10 / "Browse by Provider" rows stay gone. */

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

    expect(await screen.findByText("Trending Film")).toBeInTheDocument();
    expect(screen.getByText("Trending Show")).toBeInTheDocument();
    // The provider rails paint their dropdown head only once their first page
    // lands (before that they are a skeleton).
    expect(await screen.findByText("Movies on")).toBeInTheDocument();

    const heads = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    const at = (text) => heads.indexOf(text);

    expect(at("Movies on")).toBeGreaterThanOrEqual(0);
    expect(at("Movies on")).toBeLessThan(at("TV Series on"));
    // The viewer's own rows lead; the catalogue's trending rows follow them.
    expect(at("TV Series on")).toBeLessThan(at("Because you watched"));
    expect(at("Because you watched")).toBeLessThan(at("Trending Movies"));
    expect(at("Trending Movies")).toBeLessThan(at("Trending Series"));
  });

  it("no longer renders a Top 10 row or the provider chip row", () => {
    renderRails();
    expect(screen.queryByText(/top 10/i)).toBeNull();
    expect(screen.queryByText(/browse by provider/i)).toBeNull();
  });
});
