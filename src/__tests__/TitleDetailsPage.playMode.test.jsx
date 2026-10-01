import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import TitleDetailsPage from "../pages/TitleDetailsPage";
import { renderWithProviders } from "../test/testUtils";

/* playMode regression guard.
 *
 * The bug: `setPlayMode` was written in only three places — the state
 * initialiser (":241" -> "movie"), the main Play button (":997" -> "movie") and
 * the trailer card (":1824" -> "trailer"). The episode-card handler
 * (`playEpisode`) called `setIsPlaying(true)` WITHOUT resetting `playMode`, and
 * the overlay branches on `playMode === "trailer"` to choose between the
 * YouTube iframe and the native HLS player.
 *
 * The consequence was total, not cosmetic: watch a trailer, close it, click any
 * episode, and the app reopened the TRAILER full-screen. The native player never
 * mounted, so there was no player chrome, no scrubber and no episode navigation
 * to notice anything was wrong.
 *
 * `playEpisode` now calls `setPlayMode("movie")`. This test pins the sequence
 * that produced the bug, because the two handlers are far apart in the file and
 * a future "simplification" of either one silently reintroduces it.
 *
 * jsdom has no MediaSource, so the native player takes its honest fatal path and
 * prints "No MediaSource support". That string is the signal that the NATIVE
 * branch rendered — which is exactly what this test needs to observe.
 *
 * TEST_TIMEOUT: this renders the whole details page, then drives five
 * sequential state transitions (trailer -> close -> episode -> native branch).
 * It needs ~2-4s of real work, and vitest's default per-test budget is 5s. That
 * only fits when the file runs alone; under the full-suite's parallel load it
 * overflowed and failed, i.e. the earlier green was partly luck of scheduling.
 * The budget is stated rather than left to chance — a flaky guard that fails
 * under load trains people to re-run until green instead of reading the failure.
 */

const TEST_TIMEOUT = 30000;

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
      seasonsCount: 2,
      episodesCount: 4,
      lastAiredDate: "2026-06-30",
      seasons: [1, 2].map((n) => ({
        seasonNumber: n,
        name: `Season ${n}`,
        episodeCount: 2,
        airDate: "2022-02-04",
        lastAiredDate: "2022-02-11",
      })),
      airingSeasonNumber: 2,
      backdropUrl: "/test-backdrop.jpg",
      posterUrl: "/test-poster.jpg",
      voteCount: 2000,
      imdbRating: 8.1,
      cast: [],
      productionCompanies: [],
      networks: ["Prime Video"],
      // The trailer row renders only when `movie.videos` is non-empty
      // (TitleDetailsPage.jsx:1799), so without this the first half of the test
      // has nothing to click and the regression goes untested.
      videos: [{ key: "dQw4w9WgXcQ", name: "Official Trailer" }],
    }),
    getSeasonEpisodes: vi.fn().mockResolvedValue(
      Array.from({ length: 2 }, (_, i) => ({
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
  },
  /* Named export, not a movieService method — the page imports it directly
   * (`import { movieService, classifyTrailer }`). It is only ever CALLED when
   * `movie.videos` is non-empty, which is why the TDZ guard's mock omits it. */
  classifyTrailer: vi.fn(() => "trailer"),
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

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/watch/:id" element={<TitleDetailsPage />} />
    </Routes>,
    { route: "/watch/tv-108978" },
  );
}

const trailerIframe = () =>
  document.querySelector('iframe[src*="youtube.com/embed"]');

/* ── Variant awareness (task.md 0.4) ─────────────────────────────────────────
 *
 * These tests guard the playMode bug, not the rollout flag. When the flag was
 * wired they both failed, because they asserted a string that only the LEGACY
 * player can print — which was a silent assumption that the episode branch always
 * renders NativePlayerView. It no longer does: v2 is the default (0.3).
 *
 * So the assertion is now "a PLAYER mounted, not the trailer", checked against
 * each variant's own honest signal, and the whole suite runs under both. That is
 * strictly more coverage than before: the playMode guarantee is now proven on the
 * branch production actually serves, not just the one that was convenient.
 */
const LEGACY_KEY = "streamly-player-legacy";

// jsdom has no MediaSource, so the legacy player takes its fatal path and says so.
const legacyMounted = () => screen.queryByText(/no MediaSource support/i);
// v2 has no PlayerVideo yet (Phase 2 / 6.3), so it mounts at `resolving` and its
// loader announces via a live region. Assert the shell marker too, so a shell that
// rendered with no announcement at all would not be mistaken for a pass.
const v2Mounted = () => document.querySelector(".pv2-shell[data-state]");

const mountedFor = (variant) => (variant === "legacy" ? legacyMounted() : v2Mounted());

async function expectPlayerMounted(variant) {
  await waitFor(() => {
    expect(
      legacyMounted() || v2Mounted(),
      "neither variant's player mounted",
    ).toBeTruthy();
  }, { timeout: 5000 });
  expect(mountedFor(variant), `expected the ${variant} player specifically`).toBeTruthy();
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
  console.warn.mockRestore();
});

describe.each([
  ["v2", null],
  ["legacy", "1"],
])("playMode on the %s player: an episode after a trailer must mount the player", (variant, flag) => {
  beforeEach(() => {
    // The flag is read once, in useState's initialiser, so it must be set before
    // render. Clearing it matters as much as setting it: a leaked "1" would
    // silently turn the next v2 case into a second legacy case.
    window.localStorage.removeItem(LEGACY_KEY);
    if (flag !== null) window.localStorage.setItem(LEGACY_KEY, flag);
  });

  it("resets playMode so the episode renders the player, not the trailer iframe", async () => {
    renderPage();

    // 1. Watch a trailer. This is the only writer that sets playMode="trailer".
    const art = await screen.findByAltText("Official Trailer", {}, { timeout: 5000 });
    fireEvent.click(art);

    // Sanity: the trailer branch really did mount, otherwise steps 2-3 would
    // pass vacuously and the test would prove nothing.
    await waitFor(() => expect(trailerIframe()).toBeTruthy(), { timeout: 5000 });

    // 2. Close it.
    fireEvent.click(await screen.findByLabelText("Back to browse"));

    await waitFor(() => expect(trailerIframe()).toBeNull(), { timeout: 5000 });

    // 3. Play an episode. Before the fix this re-entered the trailer branch and
    //    reopened the YouTube iframe full-screen.
    const episode = await screen.findByText("Episode 1", {}, { timeout: 5000 });
    fireEvent.click(episode);

    // The regression assertion: no trailer iframe may be present.
    await waitFor(() => expect(trailerIframe()).toBeNull(), { timeout: 5000 });

    await expectPlayerMounted(variant);
  }, TEST_TIMEOUT);

  it("mounts the player on a first-time episode play with no trailer seen", async () => {
    renderPage();

    const episode = await screen.findByText("Episode 1", {}, { timeout: 5000 });
    fireEvent.click(episode);

    expect(trailerIframe()).toBeNull();
    await expectPlayerMounted(variant);
  }, TEST_TIMEOUT);
});
