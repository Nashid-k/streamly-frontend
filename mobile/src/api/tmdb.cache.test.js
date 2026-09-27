/* NOTE ON WHERE THIS RUNS: mobile/ has no test runner of its own. This file is
 * executed by the REPOSITORY's vitest (`npm test` from the repo root), which can
 * resolve mobile/src modules and stub the one native import they pull in. That is
 * deliberate: the caching, timeout and circuit-breaker logic in api/tmdb.ts is
 * the part of the app most likely to silently regress, and a regression there
 * looks exactly like "the app got slow", which is not something a type check or a
 * device-free build would ever catch. */

import { beforeEach, describe, expect, it, vi } from "vitest";

/* In-memory stand-in for the phone's AsyncStorage, so these tests can prove the
 * catalogue cache is actually PERSISTED and not just held in a module variable. */
const store = new Map();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItem: vi.fn(async (key, value) => {
      store.set(key, value);
    }),
    removeItem: vi.fn(async (key) => {
      store.delete(key);
    }),
  },
}));

const PROXY = "https://streamlyvercelin.vercel.app/api/tmdb";

let api;

async function loadApi() {
  vi.resetModules();
  api = await import("./tmdb");
  return api;
}

/* Fire-and-forget background work (cache writes are debounced 400ms by design,
 * stale revalidation is not awaited) needs time to settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
/* Long enough for the cache module's debounced write to land in storage. */
const persisted = () => new Promise((resolve) => setTimeout(resolve, 550));

function jsonResponse(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function abortError() {
  const error = new Error("Aborted");
  error.name = "AbortError";
  return error;
}

let fetchMock;

beforeEach(async () => {
  /* Let any write still pending from the previous test land BEFORE clearing, or it
   * fires mid-test and leaks that test's response into this one. */
  await persisted();
  store.clear();
  /* A leaked key would silently add the direct route to every later test, so the
   * keyless shipped configuration is re-asserted per test. */
  delete process.env.EXPO_PUBLIC_TMDB_API_KEY;
  fetchMock = vi.fn(async () => jsonResponse({ results: [] }));
  vi.stubGlobal("fetch", fetchMock);
  await loadApi();
});

describe("catalogue client: routing", () => {
  it("never falls back to direct TMDB when no API key is configured", async () => {
    /* THE BUG THIS FIXES. The old guard was `if (!tmdbApiKey && !tmdbProxy)`, so
     * with the shipped keyless config a failed proxy request fell straight through
     * to https://api.themoviedb.org/3 with no api_key: on a network that blocks or
     * throttles TMDB that is a full extra timeout before the user sees anything,
     * once per rail - which is how "search failed after 12000ms" happened, twice
     * over, for a request that could never have succeeded. Direct TMDB requires a
     * key, so without one the route must not exist. */
    fetchMock.mockRejectedValueOnce(abortError()).mockRejectedValueOnce(abortError());

    await expect(api.getTrending()).rejects.toThrow(/via proxy/);

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toHaveLength(2); // original + one retry
    expect(urls.every((url) => url.startsWith(PROXY))).toBe(true);
    expect(urls.some((url) => url.includes("api.themoviedb.org"))).toBe(false);
  });

  it("reports the leg and its budget in the timeout, not a bare 12000", async () => {
    fetchMock.mockRejectedValue(abortError());
    await expect(api.getTrending()).rejects.toThrow(/timed out after 20000ms via proxy/);
  });

  it("tries direct TMDB when a key IS configured", async () => {
    /* Configure the key through the build-time env layer, which getConfig() reads
     * at request time - the same code path a real .env build takes. */
    process.env.EXPO_PUBLIC_TMDB_API_KEY = "k";
    await loadApi();

    /* Every leg fails, so the whole call rejects - but both hosts must have been
     * tried, proxy first and the keyed direct route second. */
    fetchMock.mockRejectedValue(abortError());

    await expect(api.getTrending()).rejects.toThrow();
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.startsWith(PROXY))).toBe(true);
    expect(urls.some((url) => url.includes("api.themoviedb.org"))).toBe(true);
    expect(urls.findIndex((url) => url.includes("api.themoviedb.org"))).toBeGreaterThan(
      urls.findIndex((url) => url.startsWith(PROXY)),
    );
  });
});

describe("catalogue client: one request, not two, for a cold Home", () => {
  it("dedupes concurrent identical GETs", async () => {
    /* Home mounts every rail in one commit and three of them want the same
     * /trending/all/week. One round trip, not three. */
    const results = await Promise.all([api.getTrending(), api.getTrending(), api.getTrending()]);
    expect(results).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("catalogue client: the cache", () => {
  it("serves a repeat read from cache without touching the network", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ results: [{ id: 1, title: "A" }] }));

    const first = await api.getTrending();
    await persisted();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toHaveLength(1);

    const second = await api.getTrending();
    expect(fetchMock).toHaveBeenCalledTimes(1); // still one: no new request
    expect(second).toHaveLength(1);
  });

  it("serves a stale answer immediately and revalidates behind the user's back", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [{ id: 1, title: "A" }] }));
    await api.getTrending();
    await persisted();

    /* Age the cached copy past its 15-minute rail TTL but inside the 24h
     * stale window, as if the app had been closed for an hour. */
    const key = "streamly.mobile.cache";
    const file = JSON.parse(store.get(key));
    for (const entry of Object.values(file)) entry.savedAt = Date.now() - 60 * 60_000;
    store.set(key, JSON.stringify(file));
    await loadApi();

    fetchMock.mockResolvedValue(jsonResponse({ results: [{ id: 2, title: "B" }] }));
    const callsBefore = fetchMock.mock.calls.length;
    const served = await api.getTrending();

    expect(served[0].title).toBe("A"); // old copy, immediately
    /* Exactly one request, and it was not awaited: the answer the user is already
     * looking at did not wait for it. */
    expect(fetchMock.mock.calls.length - callsBefore).toBe(1);
    await settle();
    await persisted();
    const refreshed = JSON.parse(store.get(key));
    const trendingKey = Object.keys(refreshed).find((k) => k.startsWith("/trending/all/week"));
    expect(refreshed[trendingKey].data.results[0].title).toBe("B");
  });

  it("keeps a saved copy when the network is gone, instead of failing", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [{ id: 1, title: "A" }] }));
    await api.getTrending();
    await persisted();

    const key = "streamly.mobile.cache";
    const file = JSON.parse(store.get(key));
    for (const entry of Object.values(file)) entry.savedAt = Date.now() - 60 * 60_000;
    store.set(key, JSON.stringify(file));
    await loadApi();

    fetchMock.mockRejectedValue(abortError());
    const served = await api.getTrending();
    expect(served[0].title).toBe("A"); // a catalogue beats an error screen
  });

  it("survives a relaunch: the cache is read back from storage", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [{ id: 7, title: "Kept" }] }));
    await api.getTrending();
    await persisted();
    await loadApi(); // simulates the next app launch

    /* Nothing left to fetch: the next launch paints the catalogue from disk without
     * opening a single connection. */
    const callsBefore = fetchMock.mock.calls.length;
    const items = await api.getTrending();
    expect(fetchMock.mock.calls.length - callsBefore).toBe(0);
    expect(items[0].title).toBe("Kept");
  });
});

describe("catalogue client: retry policy", () => {
  it("retries a timeout once, and not a 404", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    await expect(api.getTrending()).rejects.toThrow(/404/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no point retrying "no such title"

    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(abortError()).mockResolvedValue(jsonResponse({ results: [{ id: 3 }] }));
    const items = await api.getTrending();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(items[0].tmdbId).toBe(3);
  });
});
