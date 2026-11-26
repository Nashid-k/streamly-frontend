import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import ProviderPage from "../pages/ProviderPage";
import { movieService } from "../api/movieService";
import { renderWithProviders } from "../test/testUtils";

vi.mock("../api/movieService", () => ({
  movieService: {
    getDiscover: vi.fn(),
  },
}));

function makeTitles(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `movie-${index}`,
    title: `Test Title ${index}`,
    posterUrl: `/poster-${index}.jpg`,
    backdropUrl: `/backdrop-${index}.jpg`,
    releaseYear: 2024,
    imdbRating: 7.5,
  }));
}

function renderProviderPage(route = "/provider/8") {
  return renderWithProviders(
    <Routes>
      <Route path="/provider/:providerId" element={<ProviderPage />} />
      <Route path="/provider" element={<ProviderPage />} />
      <Route path="/" element={<div>Home Page</div>} />
    </Routes>,
    { route },
  );
}

describe("ProviderPage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    movieService.getDiscover.mockResolvedValue([]);
  });

  it("renders the provider hero with logo and title for Netflix (id 8)", async () => {
    renderProviderPage("/provider/8");

    expect(screen.getByRole("heading", { name: "Netflix" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Movies/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Series/i })).toBeInTheDocument();
  });

  it("switches tabs between Movies and Series", async () => {
    renderProviderPage("/provider/8");

    const moviesTab = screen.getByRole("tab", { name: /Movies/i });
    const seriesTab = screen.getByRole("tab", { name: /Series/i });

    expect(moviesTab).toHaveClass("is-active");
    expect(seriesTab).not.toHaveClass("is-active");

    fireEvent.click(seriesTab);

    expect(seriesTab).toHaveClass("is-active");
    expect(moviesTab).not.toHaveClass("is-active");
  });

  it("shows provider not found for an unknown provider id", async () => {
    renderProviderPage("/provider/unknown-id-99999");

    expect(screen.getByText("Provider not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Home/i })).toBeInTheDocument();
  });

  it("resolves slug aliases and renders canonical rails without an in-page back button", async () => {
    const { container } = renderProviderPage("/provider/peacock");

    expect(screen.getByRole("heading", { name: "Peacock Premium" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Back$/i })).not.toBeInTheDocument();
    expect(container.querySelector(".provider-back-btn")).toBeNull();
    expect(container.querySelector(".home-rails-section.provider-rails-section")).not.toBeNull();
    expect(container.querySelector(".home-rails-lead .cw.w .po.wd")).not.toBeNull();

    const moviesTab = screen.getByRole("tab", { name: /^Movies/i });
    expect(moviesTab).toHaveTextContent("8");
  });

  it("resolves prime-video slug to Amazon Prime Video with curated catalog", async () => {
    renderProviderPage("/provider/prime-video");

    expect(screen.getByRole("heading", { name: "Amazon Prime Video" })).toBeInTheDocument();
  });

  it("splits a large provider catalog into a wide lead rail and continuation rail", async () => {
    movieService.getDiscover.mockImplementation(({ mediaType }) =>
      Promise.resolve(mediaType === "movie" ? makeTitles(15) : []),
    );

    const { container } = renderProviderPage("/provider/8");

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /^Movies/i })).toHaveTextContent("15");
    });

    const lead = container.querySelector(".home-rails-lead");
    expect(lead).not.toBeNull();
    expect(lead.querySelectorAll(".cw.w .po.wd").length).toBeGreaterThan(0);
    expect(lead.querySelector("[data-detail-token^='Trending on Netflix:']")).not.toBeNull();

    const more = container.querySelector(
      ".home-rails-section > .home-rail:not(.home-rails-lead):not(.home-rail--skeleton)",
    );
    expect(more).not.toBeNull();
    expect(more.querySelectorAll(".cw").length).toBeGreaterThan(0);
    expect(container.querySelector(".provider-grid, .skeleton-grid")).toBeNull();
  });
});
