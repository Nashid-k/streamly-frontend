import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setSkipBoundariesForTest,
  clearSkipBoundaryCache,
  fetchSkipBoundaries,
  getCachedSkipBoundaries,
} from "../api/skipBoundarySource";

/* Shapes copied verbatim from live api.skipdb.tv responses, because the
   important one is the one that looks like a success. */
const TV_OK = {
  imdb_id: "tt0903747",
  season: 1,
  episode: 1,
  segments: {
    intro: { start_ms: 229500, end_ms: 246500, adjusted: false, match: "agnostic", confidence: 0.75 },
    recap: null,
    outro: { start_ms: 3434000, end_ms: 3500000, adjusted: false, match: "agnostic", confidence: 0.75 },
    preview: null,
  },
  intro_length_estimate_ms: 17000,
};
const MOVIE_OUTRO_ONLY = {
  imdb_id: "tt0111161",
  season: null,
  episode: null,
  segments: {
    intro: null,
    recap: null,
    outro: { start_ms: 8331300, end_ms: 8552600, adjusted: false, match: "agnostic", confidence: 0.75 },
    preview: null,
  },
  intro_length_estimate_ms: null,
};
/* A miss is HTTP 200 with every segment null. No 404 to catch. */
const MISS = {
  imdb_id: "tt9999999",
  season: 1,
  episode: 1,
  segments: { intro: null, recap: null, outro: null, preview: null },
  intro_length_estimate_ms: null,
};

function jsonOk(body) {
  return { ok: true, status: 200, json: async () => body };
}

beforeEach(() => {
  clearSkipBoundaryCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearSkipBoundaryCache();
});

describe("fetchSkipBoundaries", () => {
  it("converts a real TV response into seconds", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk(TV_OK)));
    const bounds = await fetchSkipBoundaries({ imdbId: "tt0903747", season: 1, episode: 1 });
    expect(bounds).toEqual({ introStartSeconds: 229.5, introEndSeconds: 246.5, creditsStartSeconds: 3434, creditsEndSeconds: 3500, confidence: 0.75 });
  });

  it("handles a movie with an outro but no intro", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk(MOVIE_OUTRO_ONLY)));
    const bounds = await fetchSkipBoundaries({ imdbId: "tt0111161" });
    expect(bounds.introEndSeconds).toBe(0);
    expect(bounds.creditsStartSeconds).toBeCloseTo(8331.3, 1);
  });

  it("treats a 200 full of nulls as a miss, not data", async () => {
    // This is the real trap: no 404, so a naive `if (res.ok)` would hand the
    // player a boundary of 0 for every uncrowdsourced title.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk(MISS)));
    expect(await fetchSkipBoundaries({ imdbId: "tt9999999", season: 1, episode: 1 })).toBeNull();
  });

  it("returns null without an imdb id and never calls the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await fetchSkipBoundaries({ season: 1, episode: 1 })).toBeNull();
    expect(await fetchSkipBoundaries({})).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends season/episode only for TV, so a movie is not read as S1E1", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonOk(MOVIE_OUTRO_ONLY));
    vi.stubGlobal("fetch", fetchMock);
    await fetchSkipBoundaries({ imdbId: "tt0111161" });
    const movieUrl = String(fetchMock.mock.calls[0][0]);
    expect(movieUrl).not.toContain("season=");
    expect(movieUrl).not.toContain("episode=");

    clearSkipBoundaryCache();
    const tvMock = vi.fn().mockResolvedValue(jsonOk(TV_OK));
    vi.stubGlobal("fetch", tvMock);
    await fetchSkipBoundaries({ imdbId: "tt0903747", season: 2, episode: 5 });
    const tvUrl = String(tvMock.mock.calls[0][0]);
    expect(tvUrl).toContain("season=2");
    expect(tvUrl).toContain("episode=5");
  });

  it("caches a hit so a re-render costs no second request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonOk(TV_OK));
    vi.stubGlobal("fetch", fetchMock);
    const args = { imdbId: "tt0903747", season: 1, episode: 1 };
    await fetchSkipBoundaries(args);
    await fetchSkipBoundaries(args);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches a miss too, so uncrowdsourced titles are not re-asked every render", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonOk(MISS));
    vi.stubGlobal("fetch", fetchMock);
    const args = { imdbId: "tt9999999", season: 1, episode: 1 };
    expect(await fetchSkipBoundaries(args)).toBeNull();
    expect(await fetchSkipBoundaries(args)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates concurrent requests for the same title", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonOk(TV_OK));
    vi.stubGlobal("fetch", fetchMock);
    const args = { imdbId: "tt0903747", season: 1, episode: 1 };
    const [a, b] = await Promise.all([fetchSkipBoundaries(args), fetchSkipBoundaries(args)]);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("degrades to null on a server error rather than surfacing a failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    expect(await fetchSkipBoundaries({ imdbId: "tt0903747", season: 1, episode: 1 })).toBeNull();
  });

  it("degrades to null when the network is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    expect(await fetchSkipBoundaries({ imdbId: "tt0903747", season: 1, episode: 1 })).toBeNull();
  });

  it("degrades to null on malformed JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad json"); } }),
    );
    expect(await fetchSkipBoundaries({ imdbId: "tt0903747", season: 1, episode: 1 })).toBeNull();
  });

  it("ignores a nonsense timestamp instead of producing NaN", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonOk({ segments: { intro: { start_ms: 0, end_ms: "abc" }, outro: null } }),
      ),
    );
    expect(await fetchSkipBoundaries({ imdbId: "tt0903747", season: 1, episode: 1 })).toBeNull();
  });

  it("cancels the request when the owning playback goes away", async () => {
    const controller = new AbortController();
    let seen = null;
    vi.stubGlobal(
      "fetch",
      // A real fetch REJECTS with AbortError when its signal aborts. A stub that
      // only pends would hang this test and prove nothing about our wiring.
      vi.fn().mockImplementation(
        (url, init) =>
          new Promise((resolve, reject) => {
            seen = init?.signal;
            init?.signal?.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
      ),
    );
    const pending = fetchSkipBoundaries({
      imdbId: "tt0903747",
      season: 1,
      episode: 1,
      signal: controller.signal,
    });
    controller.abort();
    expect(await pending).toBeNull();
    expect(seen?.aborted).toBe(true);
  });
});

describe("getCachedSkipBoundaries", () => {
  it("exposes a fetched title without another request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk(TV_OK)));
    await fetchSkipBoundaries({ imdbId: "tt0903747", season: 1, episode: 1 });
    expect(getCachedSkipBoundaries({ imdbId: "tt0903747", season: 1, episode: 1 })).toEqual({
      introStartSeconds: 229.5,
      introEndSeconds: 246.5,
      creditsStartSeconds: 3434,
      creditsEndSeconds: 3500,
      confidence: 0.75,
    });
  });

  it("returns null for a title never asked about", () => {
    expect(getCachedSkipBoundaries({ imdbId: "tt0000000", season: 1, episode: 1 })).toBeNull();
  });

  it("keeps a TV episode distinct from the movie record", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk(TV_OK)));
    await fetchSkipBoundaries({ imdbId: "tt0903747", season: 1, episode: 1 });
    expect(getCachedSkipBoundaries({ imdbId: "tt0903747" })).toBeNull();
    expect(getCachedSkipBoundaries({ imdbId: "tt0903747", season: 2, episode: 1 })).toBeNull();
  });

  it("can be seeded locally, and cleared again", async () => {
    __setSkipBoundariesForTest("tt0903747|1|1", { introEndSeconds: 10, creditsStartSeconds: 20, confidence: null });
    expect(getCachedSkipBoundaries({ imdbId: "tt0903747", season: 1, episode: 1 })).toEqual({
      introEndSeconds: 10,
      creditsStartSeconds: 20,
      confidence: null,
    });
    __setSkipBoundariesForTest("tt0903747|1|1", null);
    expect(getCachedSkipBoundaries({ imdbId: "tt0903747", season: 1, episode: 1 })).toBeNull();
  });
});
