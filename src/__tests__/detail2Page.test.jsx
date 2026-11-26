import { describe, it, expect, beforeEach, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import MovieDetailsSkeleton from "../components/MovieDetailsSkeleton";
import TitleDetailsPage from "../pages/TitleDetailsPage";
import { renderWithProviders } from "../test/testUtils";

const { mockMovieService } = vi.hoisted(() => {
  const seasonEpisodes = Array.from({ length: 12 }, (_, idx) => ({
    id: 9000 + idx,
    episodeNumber: idx + 1,
    title: `Episode Title ${idx + 1}`,
    description: `Overview for episode ${idx + 1}`,
    duration: "45m",
    durationMins: 45,
    airDate: "2024-02-01",
    thumbnailUrl: null,
  }));
  return {
    mockMovieService: {
      getMovieDetails: vi.fn().mockResolvedValue({
        id: "tv-555",
        type: "tv",
        isSeries: true,
        title: "Severance",
        tagline: "We are all one.",
        description: "Mark leads a team of office workers whose memories have been surgically divided.",
        releaseDate: "2022-02-18",
        lastAiredDate: "2025-03-21",
        status: "Returning Series",
        originalLanguage: "en",
        genres: ["Drama", "Mystery", "Sci-Fi"],
        seasonsCount: 2,
        episodesCount: 19,
        seasons: [
          { seasonNumber: 1, name: "Season 1", episodeCount: 12 },
          { seasonNumber: 2, name: "Season 2", episodeCount: 10 },
        ],
        airingSeasonNumber: 2,
        imdbRating: 8.7,
        posterUrl: "/p.jpg",
        backdropUrl: "/b.jpg",
        cast: [{ id: 1, name: "Adam Scott", character: "Mark Scout" }],
        productionCompanies: [{ id: 10, name: "Red Hour", logoUrl: "/logo.png" }],
      }),
      getTitleLogo: vi.fn().mockResolvedValue(null),
      getSeasonEpisodes: vi.fn().mockResolvedValue(seasonEpisodes),
      getSimilarMovies: vi.fn().mockResolvedValue([]),
      getCollection: vi.fn().mockResolvedValue(null),
      getDiscover: vi.fn().mockResolvedValue([]),
      classifyTrailer: vi.fn(() => "trailer"),
    },
  };
});

vi.mock("../api/movieService", () => ({
  movieService: mockMovieService,
  classifyTrailer: mockMovieService.classifyTrailer,
}));

vi.mock("../api/ratingService", () => ({
  ratingService: {
    getRealRatings: vi.fn().mockResolvedValue({ imdb: 8.7, rt: 97 }),
    clearCache: vi.fn(),
  },
}));

vi.mock("../api/warmResolve", () => ({
  warmResolve: vi.fn(),
}));

vi.mock("../api/streamResolve", () => ({
  getZxcCapabilities: vi.fn().mockResolvedValue({ zxcNative: false }),
}));

describe("Streamly 2.0 TitleDetailsPage & MovieDetailsSkeleton", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders MovieDetailsSkeleton with 2:3 poster slot and conditional episode rows", () => {
    const { container, rerender } = renderWithProviders(
      <MovieDetailsSkeleton titleId="tv-555" isTv={true} hasBackdrop={true} />,
      { route: "/watch/tv-555" },
    );

    expect(container.querySelector(".dp.sk-detail")).toBeInTheDocument();
    expect(container.querySelector(".dh > .po.sk.detail-transition-poster")).toBeInTheDocument();
    expect(container.querySelector(".sk-facts")).toBeInTheDocument();
    expect(container.querySelector(".sk-eps")).toBeInTheDocument();

    rerender(<MovieDetailsSkeleton titleId="movie-550" isTv={false} hasBackdrop={false} />);
    expect(container.querySelector(".sk-eps")).toBeNull();
  });

  it("renders 2.0 .dp header, facts panel, season tabs, and caps episodes at EP_LIMIT = 8", async () => {
    const { container } = renderWithProviders(
      <Routes>
        <Route path="/watch/:id" element={<TitleDetailsPage />} />
      </Routes>,
      { route: "/watch/tv-555" },
    );

    expect(await screen.findByRole("heading", { name: "Severance" })).toBeInTheDocument();
    expect(container.querySelector(".dp > .bdp")).toBeInTheDocument();
    expect(container.querySelector(".dp .lk")).toBeInTheDocument();
    expect(container.querySelector(".dp .dh > .po")).toHaveAttribute("data-detail-source", "tv-555");
    expect(container.querySelector(".dp dl.facts.glass")).toBeInTheDocument();
    expect(container.querySelectorAll(".dp .stabs [role='tab']")).toHaveLength(2);

    // Wait for season episodes and verify 8-episode cap with Show 4 more toggle
    expect(await screen.findByText("Episode Title 1", {}, { timeout: 4000 })).toBeInTheDocument();
    expect(container.querySelectorAll(".dp .eps .ep")).toHaveLength(8);
    expect(screen.queryByText("Episode Title 9")).toBeNull();

    const showMoreBtn = screen.getByRole("button", { name: /show 4 more/i });
    fireEvent.click(showMoreBtn);

    expect(container.querySelectorAll(".dp .eps .ep")).toHaveLength(12);
    expect(screen.getByText("Episode Title 12")).toBeInTheDocument();

    const showLessBtn = screen.getByRole("button", { name: /show less/i });
    fireEvent.click(showLessBtn);
    expect(container.querySelectorAll(".dp .eps .ep")).toHaveLength(8);
  });

  it("auto-opens playback when entered via Banner Play (`state.autoPlay`) and stays on Details after closing", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/watch/:id" element={<TitleDetailsPage />} />
      </Routes>,
      { route: { pathname: "/watch/tv-555", state: { autoPlay: true } } },
    );

    const closeBtn = await screen.findByRole("button", { name: "Close player" }, { timeout: 4000 });
    expect(closeBtn).toBeInTheDocument();

    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Close player" })).toBeNull();
    });
    expect(await screen.findByRole("heading", { name: "Severance" })).toBeInTheDocument();
  });

  it("opens the unreleased notice instead of playback when Banner Play targets an unreleased title", async () => {
    mockMovieService.getMovieDetails.mockImplementationOnce(async () => ({
      id: "movie-999",
      type: "movie",
      isSeries: false,
      title: "Future Release",
      description: "Coming later.",
      releaseDate: "2099-12-31",
      genres: ["Sci-Fi"],
    }));

    renderWithProviders(
      <Routes>
        <Route path="/watch/:id" element={<TitleDetailsPage />} />
      </Routes>,
      { route: { pathname: "/watch/movie-999", state: { autoPlay: true } } },
    );

    expect(
      await screen.findByRole("dialog", { name: /this hasn't released yet/i }, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close player" })).toBeNull();
  });
});
