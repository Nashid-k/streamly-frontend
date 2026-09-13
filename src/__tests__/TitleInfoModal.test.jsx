import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import TitleInfoModal from "../components/TitleInfoModal";
import { buildMetaFacts } from "../utils/metaFacts";
import { AuthProvider } from "../context/AuthContext";
import { PreferencesProvider } from "../context/PreferencesContext";
import { ToastProvider } from "../components/Toast.jsx";

/* The modal fetches live details via React Query — stub the network layer so
   the summary object the caller already has is what drives assertions. */
vi.mock("../api/movieService", () => ({
  movieService: {
    getMovieDetails: vi.fn().mockResolvedValue({
      id: "movie-550",
      tmdbId: 550,
      title: "Fight Club",
      overview: "A ticking-time-bomb insomniac and a slippery soap salesman.",
      genres: ["Drama"],
      runtime: 139,
      seasonsCount: null,
      isSeries: false,
      imdbRating: 8.4,
      year: "1999",
      releaseYear: "1999",
      backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
      cast: [{ name: "Brad Pitt" }, { name: "Edward Norton" }],
    }),
  },
}));

const TEST_MOVIE = {
  id: "movie-550",
  tmdbId: 550,
  title: "Fight Club",
  overview: "A ticking-time-bomb insomniac and a slippery soap salesman.",
  backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
  posterUrl: null,
  imdbRating: 8.4,
  releaseYear: "1999",
  isSeries: false,
  genres: ["Drama"],
};

/* MemoryRouter keeps window.location untouched — probe the router's own
   location to assert that Play navigated. */
function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location-probe">{location.pathname}</span>;
}

function renderModal(overrides = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <QueryClientProvider client={client}>
        <PreferencesProvider>
          <AuthProvider>
            <ToastProvider>
              <LocationProbe />
              <TitleInfoModal movie={{ ...TEST_MOVIE, ...overrides }} onClose={() => {}} />
            </ToastProvider>
          </AuthProvider>
        </PreferencesProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.body.style.overflow = "";
});

describe("TitleInfoModal", () => {
  it("renders the Netflix-style anatomy: title, meta facts, overview, actions", async () => {
    renderModal();

    expect(screen.getByRole("dialog", { name: /fight club info/i })).toBeInTheDocument();
    expect(await screen.findByText("A ticking-time-bomb insomniac and a slippery soap salesman.")).toBeInTheDocument();

    // Meta facts: match %, year — runtime arrives with the mocked live details
    const meta = screen.getByTestId("title-info-meta");
    expect(meta).toHaveTextContent("84% Match");
    expect(meta).toHaveTextContent("1999");
    expect(await screen.findByText("2h 19m")).toBeInTheDocument();

    // Genre chip + cast strip arrive from the mocked live details
    expect(await screen.findByText("Drama")).toBeInTheDocument();
    expect(await screen.findByText(/Brad Pitt/)).toBeInTheDocument();

    // Action row: Play, My List, Full Details
    expect(screen.getByRole("button", { name: /^play$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add to my list/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /full details/i })).toBeInTheDocument();
  });

  it("Play navigates to the watch route", async () => {
    renderModal();
    const play = await screen.findByRole("button", { name: /^play$/i });
    fireEvent.click(play);
    await waitFor(() => {
      expect(screen.getByTestId("location-probe")).toHaveTextContent("/watch/movie-550/fight-club");
    });
  });

  it("Escape closes the modal via onClose", async () => {
    const onClose = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <QueryClientProvider client={client}>
          <PreferencesProvider>
            <AuthProvider>
              <ToastProvider>
                <TitleInfoModal movie={TEST_MOVIE} onClose={onClose} />
              </ToastProvider>
            </AuthProvider>
          </PreferencesProvider>
        </QueryClientProvider>
      </MemoryRouter>
    );
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    // The exit animation delay (~180ms) precedes onClose.
    await waitFor(() => expect(onClose).toHaveBeenCalled(), { timeout: 1000 });
  });

  it("locks body scroll while open and restores it after unmount", async () => {
    const { unmount } = renderModal();
    await screen.findByRole("dialog");
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("My List toggle adds the movie and reflects the in-list state", async () => {
    renderModal();
    const listBtn = await screen.findByRole("button", { name: /add to my list/i });
    fireEvent.click(listBtn);
    // After toggling, the button re-renders in the in-list state.
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /remove from my list/i })).toBeInTheDocument();
    });
    const stored = JSON.parse(localStorage.getItem("aios_my_list") || "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe("movie-550");
  });
});

describe("buildMetaFacts", () => {
  it("composes match/year/seasons/runtime and drops missing parts", () => {
    const facts = buildMetaFacts(
      { imdbRating: 9.7, releaseYear: "2021", isSeries: true, seasonsCount: 2, runtime: 58 },
      {},
    ).map((f) => f.text);
    expect(facts).toEqual(["97% Match", "2021", "2 Seasons", "58m"]);
  });

  it("formats hours, treats date-like duration strings as missing, keeps rail strings", () => {
    expect(buildMetaFacts({ runtime: 143 }, {}).map((f) => f.text)).toEqual(["2h 23m"]);
    expect(buildMetaFacts({ duration: "2021-10-12" }, {})).toEqual([]);
    expect(buildMetaFacts({ duration: "1h 53m" }, {}).map((f) => f.text)).toEqual(["1h 53m"]);
  });
});
