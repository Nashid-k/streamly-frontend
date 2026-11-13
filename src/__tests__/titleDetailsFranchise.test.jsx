import { screen, within } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import TitleDetailsPage from "../pages/TitleDetailsPage";
import { renderWithProviders } from "../test/testUtils";

/* The two context rails added to the details page, modelled on cinejoy.pk:
   "Part of <collection>" (a franchise's parts, in release order, current title
   marked) and "More from <studio>" (the primary production company's
   catalogue). Both are data-shaped decisions, so each test drives one branch of
   the rule: the rail exists only when it carries real information. */

const mocks = vi.hoisted(() => ({
  getMovieDetails: vi.fn(),
  getCollection: vi.fn(),
  getDiscover: vi.fn(),
  getSimilarMovies: vi.fn(),
}));

vi.mock("../api/movieService", () => ({
  movieService: {
    getMovieDetails: mocks.getMovieDetails,
    getCollection: mocks.getCollection,
    getDiscover: mocks.getDiscover,
    getSimilarMovies: mocks.getSimilarMovies,
    getSeasonEpisodes: vi.fn().mockResolvedValue([]),
    getTitleLogo: vi.fn().mockResolvedValue(null),
    classifyTrailer: vi.fn(() => "trailer"),
  },
}));

/* The rail's job is which titles it shows and in what order; the card itself
   (poster, hover curtain, lazy mount) is covered by its own tests and renders
   nothing meaningful in jsdom. Stand it in as plain text. */
vi.mock("../components/MovieCard", () => ({
  default: ({ movie }) => <div data-testid="movie-card">{movie.title}</div>,
}));

vi.mock("../components/NativePlayerView", () => ({
  default: () => <div data-testid="native-player" />,
}));
vi.mock("../components/ProviderEmbedPlayer", () => ({
  default: () => <div data-testid="embed-player" />,
}));

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

/* The page mounts a lot of tree before the rails resolve; the default 1s find
   timeout is enough alone but not while the rest of the suite is saturating the
   machine, which showed up as an intermittent first-test failure. */
const FIND = { timeout: 5000 };

const CURRENT_ID = "movie-2";
const COLLECTION = { id: 86311, name: "The Avengers Collection", posterUrl: null, backdropUrl: null };

function movieDetails(overrides = {}) {
  return {
    id: CURRENT_ID,
    title: "Age of Ultron",
    mediaType: "movie",
    releaseDate: "2015-05-01",
    backdropUrl: "/backdrop.jpg",
    posterUrl: "/poster.jpg",
    imdbRating: 7.3,
    voteCount: 12000,
    genres: ["Action"],
    cast: [],
    productionCompanies: [
      { id: 420, name: "Marvel Studios", logo_path: "/marvel.png", logoUrl: "https://image.tmdb.org/t/p/w300/marvel.png", originCountry: "US" },
    ],
    collection: COLLECTION,
    ...overrides,
  };
}

function part(id, title, releaseDate) {
  return { id, title, releaseDate, posterUrl: "/p.jpg", mediaType: "movie" };
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/watch/:id" element={<TitleDetailsPage />} />
    </Routes>,
    { route: `/watch/${CURRENT_ID}` },
  );
}

beforeEach(() => {
  localStorage.clear();
  mocks.getMovieDetails.mockReset();
  mocks.getCollection.mockReset();
  mocks.getDiscover.mockReset();
  mocks.getSimilarMovies.mockReset();
  mocks.getSimilarMovies.mockResolvedValue([]);
  mocks.getMovieDetails.mockResolvedValue(movieDetails());
  // getCollection already sorts by release date (covered in movieService.test);
  // the page must preserve that order rather than re-sorting or reversing it.
  mocks.getCollection.mockResolvedValue({
    id: 86311,
    name: "The Avengers Collection",
    parts: [
      part("movie-1", "Assemble", "2012-05-04"),
      part(CURRENT_ID, "Age of Ultron", "2015-05-01"),
      part("movie-3", "Endgame", "2019-04-26"),
    ],
  });
  mocks.getDiscover.mockResolvedValue([
    part(CURRENT_ID, "Age of Ultron", "2015-05-01"),
    part("movie-1", "Assemble", "2012-05-04"),
    part("movie-3", "Endgame", "2019-04-26"),
    part("movie-4", "Infinity War", "2018-04-27"),
    part("movie-5", "Civil War", "2016-05-06"),
    part("movie-6", "Iron Man", "2008-05-02"),
  ]);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
  console.warn.mockRestore();
});

describe("TitleDetailsPage franchise rails", () => {
  it("lists the franchise's parts in release order and marks the current title", async () => {
    renderPage();

    const heading = await screen.findByRole(
      "heading",
      { name: /part of the avengers collection/i },
      FIND,
    );
    expect(heading).toBeInTheDocument();
    expect(mocks.getCollection).toHaveBeenCalledWith(86311);

    const rail = screen.getByRole("list", { name: "Titles in The Avengers Collection" });
    const cards = within(rail).getAllByRole("listitem");
    // Service order (release date) is preserved, never re-sorted by the view.
    expect(cards[0].textContent).toContain("Assemble");
    expect(cards[1].textContent).toContain("Age of Ultron");
    expect(cards[2].textContent).toContain("Endgame");
    // Current title stays in the rail, but is labelled so it cannot be mistaken
    // for an unwatched chapter.
    expect(within(cards[1]).getByText(/you’re here/i)).toBeInTheDocument();
  });

  it("shows the studio's own catalogue with the current title removed", async () => {
    renderPage();

    const heading = await screen.findByRole("heading", { name: /more from marvel studios/i }, FIND);
    expect(heading).toBeInTheDocument();
    expect(mocks.getDiscover).toHaveBeenCalledWith(
      expect.objectContaining({ mediaType: "movie", companyId: 420 }),
    );

    const rail = screen.getByRole("list", { name: "More from Marvel Studios" });
    const cards = within(rail).getAllByRole("listitem");
    // 6 returned including the current title → 5 rows; also proves dedupe.
    expect(cards).toHaveLength(5);
    expect(within(rail).queryByText("Age of Ultron")).toBeNull();
  });

  it("places the studio rail above the algorithmic suggestions", async () => {
    mocks.getSimilarMovies.mockResolvedValue([part("movie-9", "Thor", "2011-05-06")]);
    renderPage();

    const studio = await screen.findByRole("heading", { name: /more from marvel studios/i }, FIND);
    const similar = await screen.findByRole("heading", { name: /you might also like/i }, FIND);
    // The order is the user's: franchise chapters, then the studio's catalogue,
    // then suggestions. DOCUMENT_POSITION_FOLLOWING means `similar` is later.
    expect(
      studio.compareDocumentPosition(similar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("drops both rails when there is nothing real to show", async () => {
    mocks.getMovieDetails.mockResolvedValue(
      movieDetails({ collection: null, productionCompanies: [] }),
    );
    renderPage();

    expect(await screen.findByRole("heading", { level: 1 }, FIND)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /part of/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /more from/i })).toBeNull();
    // Neither query should even be attempted without a collection/company.
    expect(mocks.getCollection).not.toHaveBeenCalled();
    expect(mocks.getDiscover).not.toHaveBeenCalled();
  });

  it("hides the studio rail when the catalogue is too small to be a row", async () => {
    mocks.getDiscover.mockResolvedValue([
      part("movie-1", "Assemble", "2012-05-04"),
      part(CURRENT_ID, "Age of Ultron", "2015-05-01"),
      part("movie-3", "Endgame", "2019-04-26"),
    ]);
    renderPage();

    await screen.findByRole("heading", { name: /part of the avengers collection/i }, FIND);
    expect(screen.queryByRole("heading", { name: /more from marvel studios/i })).toBeNull();
  });
});
