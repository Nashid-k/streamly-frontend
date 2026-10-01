import { screen, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import TitleDetailsPage from "../pages/TitleDetailsPage";
import { renderWithProviders } from "../test/testUtils";

/* PLAYER V2 rollout wiring (task.md 0.4).
 *
 * What 0.4 actually is: one place that picks which player renders. Two things
 * make it dangerous, and neither is the `if` statement itself:
 *
 *  1. POLARITY. v2 is the DEFAULT (0.3). This flag can only force the OLD player
 *     back. A mistake here does not merely pick the wrong player, it silently
 *     disables the safety net in production.
 *
 *  2. PROP DRIFT. Both branches are handed one prop list. If a prop were added
 *     for one branch only, that feature would be disabled with no error
 *     anywhere — the worst failure mode in this codebase, because both branches
 *     still look like they work. So instead of asserting "the flag flips", these
 *     tests mock BOTH players, capture the props each actually received, and
 *     assert the two sets are identical. The drift guard is the point.
 *
 * The real players are deliberately NOT rendered here: NativePlayerView needs
 * MediaSource and PlayerShell has no PlayerVideo yet (Phase 2 / 6.3). Mocking
 * both is what makes the prop comparison possible at all, and it is why this
 * file stays fast where the playMode file takes 44s.
 */

const TEST_TIMEOUT = 30000;
const LEGACY_KEY = "streamly-player-legacy";

/** Props as each variant actually received them, captured during render. */
const captured = { v2: null, legacy: null };

vi.mock("../components/player/v2/PlayerShell", () => ({
  default: (props) => {
    captured.v2 = props;
    return <div data-testid="player-v2" />;
  },
}));

vi.mock("../components/NativePlayerView", () => ({
  default: (props) => {
    captured.legacy = props;
    return <div data-testid="player-legacy" />;
  },
}));

vi.mock("../api/movieService", () => ({
  movieService: {
    getMovieDetails: vi.fn().mockResolvedValue({
      id: "tv-108978",
      title: "Reacher",
      isSeries: true,
      type: "tv",
      originalLanguage: "en",
      releaseDate: "2022-02-04",
      seasonsCount: 1,
      episodesCount: 2,
      seasons: [{ seasonNumber: 1, name: "Season 1", episodeCount: 2 }],
      backdropUrl: "/test-backdrop.jpg",
      posterUrl: "/test-poster.jpg",
      logoUrl: "/test-logo.png",
      imdbId: "tt-9322662",
      imdbRating: 8.1,
      cast: [],
      productionCompanies: [],
      networks: ["Prime Video"],
      videos: [{ key: "dQw4w9WgXcQ", name: "Official Trailer" }],
    }),
    getSeasonEpisodes: vi.fn().mockResolvedValue(
      Array.from({ length: 2 }, (_, i) => ({
        id: i + 1,
        episodeNumber: i + 1,
        title: `Episode ${i + 1}`,
        overview: "Overview.",
        releaseDate: "2022-02-04",
        stillPath: null,
      })),
    ),
    getSimilarMovies: vi.fn().mockResolvedValue([]),
  },
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

const legacyTestId = () => screen.queryByTestId("player-legacy");
const v2TestId = () => screen.queryByTestId("player-v2");

/**
 * Open the episode overlay and wait for a SPECIFIC player.
 *
 * `getEl` must be the expected variant's getter. An earlier version waited for
 * "either player mounted", which is a false positive waiting to happen: a second
 * render in the same test was already satisfied by the first render's leftover
 * tree, so it never waited for the variant it was actually asserting on.
 */
async function playEpisode(getEl) {
  const episode = await screen.findByText("Episode 1", {}, { timeout: 5000 });
  episode.click();
  await waitFor(() => expect(getEl()).toBeTruthy(), { timeout: 5000 });
}

/**
 * Reduce props to something comparable across two separate renders.
 *
 * Functions are replaced by a placeholder, RECURSIVELY — and that recursion is
 * not tidiness, it is the whole test. `party` is the Watch Party context value,
 * which carries callbacks (`create`, `join`, `leave`, `sendChat`, …). Stripping
 * only TOP-LEVEL functions left those nested callbacks in place, and `toEqual`
 * compares functions by identity, so the two renders could never match.
 *
 * That produced the most misleading failure mode available: JSON.stringify drops
 * functions, so a probe showed the two prop objects as byte-identical
 * ("Compared values have no visual difference") while `toEqual` still failed.
 * Nothing was actually wrong with the wiring. Comparing callbacks for identity
 * across two renders can never succeed, and leaving that in would have meant
 * either deleting the drift guard or learning to ignore it.
 *
 * `undefined` is dropped because a component default (`posterUrl = ""`) is not
 * the same as the page passing nothing, yet neither is drift.
 */
function comparable(props) {
  const strip = (value) => {
    if (typeof value === "function") return "[fn]";
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, v]) => v !== undefined)
          .sort(([x], [y]) => x.localeCompare(y))
          .map(([k, v]) => [k, strip(v)]),
      );
    }
    return value;
  };
  return Object.fromEntries(
    Object.entries(props)
      .filter(([, value]) => typeof value !== "function" && value !== undefined)
      .map(([key, value]) => [key, strip(value)])
      .sort(([x], [y]) => x.localeCompare(y)),
  );
}

beforeEach(() => {
  captured.v2 = null;
  captured.legacy = null;
  window.localStorage.removeItem(LEGACY_KEY);
  vi.stubEnv("VITE_PLAYER_LEGACY", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  console.error.mockRestore();
  console.warn.mockRestore();
  vi.unstubAllEnvs();
  window.localStorage.removeItem(LEGACY_KEY);
});

describe("task.md 0.4 — the rollout flag selects the player", () => {
  it("serves v2 by default, with the flag unset", async () => {
    renderPage();
    await playEpisode(v2TestId);

    expect(v2TestId()).toBeTruthy();
    expect(legacyTestId()).toBeNull();
  }, TEST_TIMEOUT);

  it("serves the legacy player when the env flag is set", async () => {
    vi.stubEnv("VITE_PLAYER_LEGACY", "1");
    renderPage();
    await playEpisode(legacyTestId);

    expect(legacyTestId()).toBeTruthy();
    expect(v2TestId()).toBeNull();
  }, TEST_TIMEOUT);

  it("rolls back at runtime via localStorage, with no redeploy", async () => {
    // The reason localStorage exists at all: a build-time-only flag cannot answer
    // an incident, because by the time a redeploy lands the viewers have left.
    window.localStorage.setItem(LEGACY_KEY, "1");
    renderPage();
    await playEpisode(legacyTestId);

    expect(legacyTestId()).toBeTruthy();
    expect(v2TestId()).toBeNull();
  }, TEST_TIMEOUT);

  it("lets the runtime override beat the env flag in both directions", async () => {
    // env says legacy, override says "no" -> v2. And env says nothing, override
    // says yes -> legacy (covered above). Both directions are asserted because a
    // one-directional precedence bug would strand viewers on whichever player
    // the flag author happened to test.
    vi.stubEnv("VITE_PLAYER_LEGACY", "1");
    window.localStorage.setItem(LEGACY_KEY, "0");
    renderPage();
    await playEpisode(v2TestId);

    expect(v2TestId()).toBeTruthy();
    expect(legacyTestId()).toBeNull();
  }, TEST_TIMEOUT);

  it("treats a misspelled flag as 'no opinion', never as 'legacy on'", async () => {
    // A typo must not quietly pin everyone to the old player — that reads as
    // "the flag is protecting us" while the new player is untested.
    vi.stubEnv("VITE_PLAYER_LEGACY", "tru");
    renderPage();
    await playEpisode(v2TestId);

    expect(v2TestId()).toBeTruthy();
  }, TEST_TIMEOUT);
});

describe("task.md 0.4 — prop drift between the two branches", () => {
  it("hands both players an identical prop list", async () => {
    const first = renderPage();
    await playEpisode(v2TestId);
    const v2Props = captured.v2;

    // Unmount before the second render. Leaving two trees mounted lets the first
    // one satisfy the second one's waits, which would make this test pass without
    // ever proving anything about the legacy branch.
    first.unmount();

    window.localStorage.setItem(LEGACY_KEY, "1");
    renderPage();
    await playEpisode(legacyTestId);
    const legacyProps = captured.legacy;

    // Both must have been captured, or the comparison below is vacuous.
    expect(v2Props).toBeTruthy();
    expect(legacyProps).toBeTruthy();

    // The drift guard. Adding a prop for one branch only is what silently
    // disables a feature with no error anywhere.
    expect(Object.keys(v2Props).sort()).toEqual(Object.keys(legacyProps).sort());

    // Same names is not enough — the values must agree too, or the two branches
    // would show different titles for the same title.
    const a = comparable(v2Props);
    const b = comparable(legacyProps);
    expect(a).toEqual(b);
  }, TEST_TIMEOUT);

  it("passes the identity fields a player needs to load anything", async () => {
    renderPage();
    await playEpisode(v2TestId);

    const props = captured.v2;
    expect(props.type).toBe("tv");
    // `numericId`, NOT the route id: the page strips the "tv-" prefix before
    // handing it over, because the source resolver keys on the bare TMDB id.
    // Asserting the route id here would have been wrong, not the code.
    expect(props.id).toBe("108978");
    expect(props.season).toBe(1);
    expect(props.episode).toBe(1);
    expect(props.title).toBe("Reacher");
    // `imdbId` is what the source resolver keys on; a dropped imdbId here would
    // look like "the source is unavailable" rather than "a prop went missing".
    expect(props.imdbId).toBe("tt-9322662");
    expect(props.episodes.length).toBe(2);
  }, TEST_TIMEOUT);

  it("forwards reduceMotion, so the v2 shell honours the in-app preference", async () => {
    renderPage();
    await playEpisode(v2TestId);

    // Reduced-motion is a preference the viewer set; it must reach the player.
    // Falsy is still an assertion here: the prop has to EXIST, because
    // `reduceMotion={undefined}` and `reduceMotion={false}` are not the same
    // thing once a component starts defaulting it.
    expect(captured.v2).toHaveProperty("reduceMotion");
  }, TEST_TIMEOUT);
});

describe("task.md 0.4 — the flag must not touch trailers", () => {
  it("still mounts the YouTube iframe for a trailer with the legacy flag on", async () => {
    window.localStorage.setItem(LEGACY_KEY, "1");
    renderPage();

    const art = await screen.findByAltText("Official Trailer", {}, { timeout: 5000 });
    art.click();

    await waitFor(
      () => expect(document.querySelector('iframe[src*="youtube.com/embed"]')).toBeTruthy(),
      { timeout: 5000 },
    );

    // A trailer is not "the player" — swapping it for a video shell would lose
    // YouTube playback entirely and look like a rollback bug.
    expect(legacyTestId()).toBeNull();
    expect(v2TestId()).toBeNull();
  }, TEST_TIMEOUT);
});
