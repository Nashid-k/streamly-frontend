import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import ProviderPage from "../pages/ProviderPage";
import { movieService } from "../api/movieService";
import { renderWithProviders } from "../test/testUtils";

vi.mock("../api/movieService", () => ({
  movieService: {
    getDiscover: vi.fn(),
  },
}));

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
    vi.clearAllMocks();
  });

  it("renders the provider hero with logo and title for Netflix (id 8)", async () => {
    movieService.getDiscover.mockResolvedValue([]);

    renderProviderPage("/provider/8");

    expect(screen.getByRole("heading", { name: "Netflix" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Movies/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Series/i })).toBeInTheDocument();
  });

  it("switches tabs between Movies and Series", async () => {
    movieService.getDiscover.mockResolvedValue([]);

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

  it("resolves slug aliases and renders curated catalog for Peacock (id 386)", async () => {
    movieService.getDiscover.mockResolvedValue([]);

    renderProviderPage("/provider/peacock");

    expect(screen.getByRole("heading", { name: "Peacock Premium" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back/i })).toBeInTheDocument();
    // Curated catalog has 8 movies for Peacock
    const moviesTab = screen.getByRole("tab", { name: /^Movies/i });
    expect(moviesTab).toBeInTheDocument();
    expect(moviesTab).toHaveTextContent("8");
  });

  it("resolves prime-video slug to Amazon Prime Video with curated catalog", async () => {
    movieService.getDiscover.mockResolvedValue([]);

    renderProviderPage("/provider/prime-video");

    expect(screen.getByRole("heading", { name: "Amazon Prime Video" })).toBeInTheDocument();
  });
});

