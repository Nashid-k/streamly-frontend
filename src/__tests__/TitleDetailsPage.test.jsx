import { screen, fireEvent } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import TitleDetailsPage from "../pages/TitleDetailsPage";
import { renderWithProviders } from "../test/testUtils";

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
    // The logo lookup the details hero AND the player's cold-open stage share.
    // Null here = TMDB has no wordmark for this title, so both must draw text.
    getTitleLogo: vi.fn().mockResolvedValue(null),
    classifyTrailer: vi.fn(() => "trailer"),
  },
}));

/* Pressing play mounts the lazily-imported player, which would try to resolve a
   real stream. Stub both engines: these tests assert the progress write, not
   playback. */
vi.mock("../components/NativePlayerView", () => ({
  default: () => <div data-testid="native-player" />,
}));
vi.mock("../components/ProviderEmbedPlayer", () => ({
  default: () => <div data-testid="embed-player" />,
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
  // The page reads /watch/:id params, so the route table mounts INSIDE the
  // harness's MemoryRouter (which carries the initial location).
  return renderWithProviders(
    <Routes>
      <Route path="/watch/:id" element={<TitleDetailsPage />} />
    </Routes>,
    { route: "/watch/tv-108978" },
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

  it("draws the text title when TMDB has no logo instead of the poster art", async () => {
    renderPage();
    // getTitleLogo resolves null above, so the hero must fall back to the styled
    // text name. It used to be fed `posterUrl`/`backdropUrl` as a stand-in,
    // which put a full preview still where the wordmark belongs.
    expect(
      await screen.findByRole("heading", { level: 1, name: "Reacher" }),
    ).toBeInTheDocument();
    expect(document.querySelector(".details-hero__logo")).toBeNull();
  });
});

/* Starting playback must never move a stored resume point backwards. These
   mount the page over a synthetic session whose only continue-watching entry is
   the episode in flight, then assert the 4th updateProgress argument: `null`
   keeps the stored timestamp, `0` starts a different episode fresh. */
function renderPageWithAuth(authValue) {
  return renderWithProviders(
    <Routes>
      <Route path="/watch/:id" element={<TitleDetailsPage />} />
    </Routes>,
    { route: "/watch/tv-108978", authValue },
  );
}

function baseAuth({ updateProgress, continueWatching }) {
  return {
    user: { accountId: "acc-1" },
    isInList: () => false,
    toggleMyList: vi.fn(),
    collections: [],
    toggleInCollection: vi.fn(),
    createCollectionWithItems: vi.fn(),
    continueWatching,
    updateProgress,
    removeFromContinueWatching: vi.fn(),
    addNotification: vi.fn(),
    requireAuth: () => true,
  };
}

const STORED_ENTRY = { id: "tv-108978", savedSeason: 1, savedEpisode: 1, timestamp: 640 };

describe("TitleDetailsPage start-playback resume guard", () => {
  it("hero Resume keeps the stored timestamp for the episode about to play", async () => {
    const updateProgress = vi.fn();
    renderPageWithAuth(baseAuth({ updateProgress, continueWatching: [STORED_ENTRY] }));

    fireEvent.click(await screen.findByRole("button", { name: /resume/i }, { timeout: 5000 }));

    const call = updateProgress.mock.calls.at(-1);
    expect(call[1]).toBe(1);
    expect(call[2]).toBe(1);
    // null => updateProgress keeps the entry's existing timestamp (not 0).
    expect(call[3]).toBeNull();
  });

  it("playing a different episode starts it at 0 instead of inheriting the timestamp", async () => {
    const updateProgress = vi.fn();
    renderPageWithAuth(baseAuth({ updateProgress, continueWatching: [STORED_ENTRY] }));

    fireEvent.click(await screen.findByRole("button", { name: "Play Episode 2" }, { timeout: 5000 }));

    const call = updateProgress.mock.calls.at(-1);
    expect(call[1]).toBe(1);
    expect(call[2]).toBe(2);
    expect(call[3]).toBe(0);
  });

  it("reopening the stored episode keeps its timestamp", async () => {
    const updateProgress = vi.fn();
    renderPageWithAuth(baseAuth({ updateProgress, continueWatching: [STORED_ENTRY] }));

    fireEvent.click(await screen.findByRole("button", { name: "Play Episode 1" }, { timeout: 5000 }));

    const call = updateProgress.mock.calls.at(-1);
    expect(call[1]).toBe(1);
    expect(call[2]).toBe(1);
    expect(call[3]).toBeNull();
  });
});