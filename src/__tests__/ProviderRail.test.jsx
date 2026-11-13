import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import ProviderRail from "../components/rails/ProviderRail";
import { renderWithProviders } from "../test/testUtils";
import { BROWSE_PROVIDERS, STREAMING_PROVIDERS } from "../data/homeRailDomains";

/* "Movies on X" / "TV Series on X" — the home rail whose subject is a
   streaming service. The contract: the row head is a dropdown over the six
   services, the default is Netflix, and picking another service re-runs the
   discover query with THAT provider's id (the same `providerId` filter Browse
   uses) instead of navigating away. */

const mocks = vi.hoisted(() => ({ getDiscover: vi.fn() }));

vi.mock("../api/movieService", () => ({
  movieService: { getDiscover: mocks.getDiscover },
}));

const MOVIE = {
  id: "tmdb-movie-1",
  title: "Test Feature",
  mediaType: "movie",
  posterUrl: "https://example.com/poster.jpg",
  backdropUrl: "https://example.com/backdrop.jpg",
  releaseYear: 2024,
  imdbRating: 7.4,
  genres: ["Drama"],
};

beforeEach(() => {
  localStorage.clear();
  mocks.getDiscover.mockReset();
  mocks.getDiscover.mockResolvedValue([MOVIE]);
});

describe("ProviderRail", () => {
  it("opens on Netflix and lists every service in the picker", async () => {
    renderWithProviders(<ProviderRail mediaType="movie" />, { route: "/" });

    const trigger = await screen.findByRole("button", { name: "Netflix" });
    expect(screen.getByText("Movies on")).toBeInTheDocument();

    fireEvent.click(trigger);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "Netflix",
      "Hulu",
      "Disney+",
      "Prime Video",
      "Max",
      "Apple TV+",
    ]);

    expect(mocks.getDiscover).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "movie", providerId: 8 }),
    );
  });

  it("shows each service's own brand mark in the picker", async () => {
    renderWithProviders(<ProviderRail mediaType="movie" />, { route: "/" });

    fireEvent.click(await screen.findByRole("button", { name: "Netflix" }));

    // A list of bare names is a settings menu. The mark comes from the Browse
    // rail's provider data, so the two surfaces can never disagree.
    const logos = screen
      .getAllByRole("option")
      .map((option) => option.querySelector("img")?.getAttribute("src"));
    const logosById = new Map(BROWSE_PROVIDERS.map((provider) => [provider.id, provider.logo]));
    expect(logos).toEqual(STREAMING_PROVIDERS.map((provider) => logosById.get(provider.id)));
    expect(logos.every(Boolean)).toBe(true);
  });

  it("keeps the picker on screen when the service has nothing", async () => {
    mocks.getDiscover.mockResolvedValue([]);
    renderWithProviders(<ProviderRail mediaType="movie" />, { route: "/" });

    // The head must survive an empty catalogue — otherwise the only way back
    // to another service disappears with the row.
    const trigger = await screen.findByRole("button", { name: "Netflix" });
    fireEvent.click(trigger);
    expect(screen.getAllByRole("option")).toHaveLength(6);
  });

  it("re-queries the chosen service without leaving the page", async () => {
    renderWithProviders(<ProviderRail mediaType="tv" />, { route: "/" });

    fireEvent.click(await screen.findByRole("button", { name: "Netflix" }));
    fireEvent.click(screen.getByRole("option", { name: "Hulu" }));

    await waitFor(() => {
      expect(mocks.getDiscover).toHaveBeenCalledWith(
        expect.objectContaining({ mediaType: "tv", providerId: 15 }),
      );
    });
    expect(await screen.findByRole("button", { name: "Hulu" })).toBeInTheDocument();
    expect(screen.getByText("TV Series on")).toBeInTheDocument();
  });
});
