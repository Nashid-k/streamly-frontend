import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../context/AuthContext";
import { PreferencesProvider } from "../context/PreferencesContext";
import { ToastProvider } from "../components/Toast.jsx";
import TitleDetailsPage from "../pages/TitleDetailsPage";

/* Regression guard for the TDZ-class crashes that blanked the details page
   behind the ErrorBoundary ("Cannot access 'z' before initialization").
   Mounts the real page over a resolved TV data path so the ENTIRE component
   body (header controls, episodes rail, cards, season/sort dropdowns) renders
   — any binding read before its declaration throws right here in jsdom. */

vi.mock("../api/movieService", () => ({
  movieService: {
    getMovieDetails: vi.fn().mockResolvedValue({
      id: "tv-108978",
      title: "Reacher",
      isSeries: true,
      type: "tv",
      originalLanguage: "en",
      releaseDate: "2022-02-04",
      status: "Returning Series",
      seasonsCount: 4,
      episodesCount: 32,
      lastAiredDate: "2026-06-30",
      seasons: [1, 2, 3, 4].map((n) => ({
        seasonNumber: n,
        name: `Season ${n}`,
        episodeCount: 8,
        airDate: n === 1 ? "2022-02-04" : `202${n}-01-01`,
      })),
      airingSeasonNumber: 4,
      nextEpisode: {
        seasonNumber: 4,
        episodeNumber: 3,
        releaseDate: "2026-09-20",
      },
      backdropUrl: "/test-backdrop.jpg",
      posterUrl: "/test-poster.jpg",
      voteCount: 2000,
      imdbRating: 8.1,
      cast: [],
      productionCompanies: [],
      networks: ["Prime Video"],
    }),
    getSeasonEpisodes: vi.fn().mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        episodeNumber: i + 1,
        title: `Episode ${i + 1}`,
        overview: "Overview.",
        airDate: "2022-02-04",
        durationMins: 50,
        stillPath: null,
      })),
    ),
    getSimilarMovies: vi.fn().mockResolvedValue([]),
    classifyTrailer: vi.fn(() => "trailer"),
  },
}));

/* jsdom lacks these; the page's rails/hero read them at mount. */
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  });
}
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!window.scrollTo) window.scrollTo = () => {};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter initialEntries={["/watch/tv-108978"]}>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <PreferencesProvider>
            <ToastProvider>
              <Routes>
                <Route path="/watch/:id" element={<TitleDetailsPage />} />
              </Routes>
            </ToastProvider>
          </PreferencesProvider>
        </AuthProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
  console.warn.mockRestore();
});

describe("TitleDetailsPage TDZ regression guard", () => {
  it("renders a series page end-to-end without ordering crashes", async () => {
    renderPage();
    // The resolved TV path renders the full page including the episodes
    // header + rail. Failing to appear means a render-time crash.
    expect(await screen.findByText("Reacher")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: /episodes/i })).toBeInTheDocument();
  });

  it("renders the Cinejoy-style series info table", async () => {
    renderPage();
    // Status / Language / First Aired / Last Aired / Seasons / Episodes rows
    // (mobile + desktop blocks both render, so use getAllByText).
    expect((await screen.findAllByText("Status")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("First Aired").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Last Aired").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Seasons").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Returning Series").length).toBeGreaterThan(0);
    expect(screen.getAllByText("32").length).toBeGreaterThan(0);
  });

  it("renders each episode card after the season query resolves", async () => {
    renderPage();
    // Generous timeout: the empty-suite passes in ~1s but a slow parallel run
    // hovers right at findByText's 1s default and flakes the gate.
    expect(await screen.findByText("Episode 1", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText("E1")).toBeInTheDocument();
  });
});