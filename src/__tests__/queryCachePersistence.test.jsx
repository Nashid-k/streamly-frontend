import { describe, it, expect, beforeEach, vi } from "vitest";
import { QueryClient, dehydrate } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { render, screen, waitFor } from "@testing-library/react";
import { useQuery } from "@tanstack/react-query";
import {
  PERSIST_STORAGE_KEY,
  PERSIST_MAX_AGE_MS,
  persistQueryCacheOptions,
  queryPersister,
  prunePersistedClientForQuota,
  removePersistedQueryCache,
} from "../queryCachePersister";

/* The persisted query cache must genuinely work, not just exist:
   1. it writes only whitelisted families (never personalised/secret ones),
   2. restore serves route data WITHOUT a network round trip (the entire
      purpose — "no proper caching, every routing gives a fresh loading"),
   3. the account-change wipe removes the persisted copy, not just memory,
   4. a localStorage quota error prunes the heaviest families first and keeps
      the per-title data. */

const TwentyFourHours = PERSIST_MAX_AGE_MS;

function fakeQuery({ key, status = "success", isFetching = false }) {
  // Only the fields shouldDehydrateQuery reads.
  return { queryKey: key, isFetching, state: { status } };
}

function snapshot(client) {
  return dehydrate(client);
}

describe("persisted query cache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("dehydrate whitelist", () => {
    const should = persistQueryCacheOptions.dehydrate.shouldDehydrateQuery;

    it("persists per-title and rail data", () => {
      expect(should(fakeQuery({ key: ["movie", "tmdb-movie-1"] }))).toBe(true);
      expect(should(fakeQuery({ key: ["episodes", "tmdb-tv-1", 2] }))).toBe(true);
      expect(should(fakeQuery({ key: ["similar", "tmdb-movie-1"] }))).toBe(true);
      expect(should(fakeQuery({ key: ["person", "tmdb-person-1"] }))).toBe(true);
      expect(should(fakeQuery({ key: ["trending-this-week"] }))).toBe(true);
      expect(should(fakeQuery({ key: ["featuredMovies"] }))).toBe(true);
    });

    it("never persists personalised or private queries", () => {
      // Per-account personalisation + the viewer's own typed history: these
      // are the families the sign-out wipe protects.
      expect(should(fakeQuery({ key: ["recommendations", 550] }))).toBe(false);
      expect(should(fakeQuery({ key: ["search", "avatar"] }))).toBe(false);
    });

    it("never persists failed or in-flight queries", () => {
      expect(
        should(fakeQuery({ key: ["movie", "x"], status: "error" })),
      ).toBe(false);
      expect(
        should(fakeQuery({ key: ["movie", "x"], status: "pending" })),
      ).toBe(false);
      expect(
        should(fakeQuery({ key: ["movie", "x"], isFetching: true })),
      ).toBe(false);
    });
  });

  describe("restore paints routes from cache without refetching", () => {
    it("serves a persisted movie entry with zero queryFn calls", async () => {
      const seedClient = new QueryClient();
      seedClient.setQueryData(["movie", "tmdb-movie-1"], {
        id: "tmdb-movie-1",
        title: "Cached Title",
      });
      localStorage.setItem(
        PERSIST_STORAGE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          buster: persistQueryCacheOptions.buster,
          clientState: snapshot(seedClient),
        }),
      );

      const queryFn = vi.fn();
      function Consumer() {
        const { data } = useQuery({
          queryKey: ["movie", "tmdb-movie-1"],
          queryFn,
          // Matches TitleDetailsPage's details staleness: fresh for a day.
          staleTime: TwentyFourHours,
        });
        return <div>{data ? data.title : "loading"}</div>;
      }

      render(
        <PersistQueryClientProvider
          client={new QueryClient({
            defaultOptions: {
              queries: {
                retry: false,
                gcTime: Infinity,
                refetchOnWindowFocus: false,
              },
            },
          })}
          persistOptions={persistQueryCacheOptions}
        >
          <Consumer />
        </PersistQueryClientProvider>,
      );

      await waitFor(() => expect(screen.getByText("Cached Title")).toBeInTheDocument());
      // The whole point: restore served the route without a network call.
      expect(queryFn).not.toHaveBeenCalled();
    });

    it("drops entries older than the 24h maxAge", async () => {
      const seedClient = new QueryClient();
      seedClient.setQueryData(["movie", "tmdb-movie-2"], {
        id: "tmdb-movie-2",
        title: "Ancient Title",
      });
      localStorage.setItem(
        PERSIST_STORAGE_KEY,
        JSON.stringify({
          timestamp: Date.now() - (PERSIST_MAX_AGE_MS + 60_000),
          buster: persistQueryCacheOptions.buster,
          clientState: snapshot(seedClient),
        }),
      );

      const queryFn = vi.fn().mockResolvedValue({ id: "tmdb-movie-2", title: "Fresh Title" });
      function Consumer() {
        const { data } = useQuery({
          queryKey: ["movie", "tmdb-movie-2"],
          queryFn,
        });
        return <div>{data ? data.title : "loading"}</div>;
      }

      render(
        <PersistQueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
          persistOptions={persistQueryCacheOptions}
        >
          <Consumer />
        </PersistQueryClientProvider>,
      );

      await waitFor(() => expect(screen.getByText("Fresh Title")).toBeInTheDocument());
      // The expired entry was dropped; the data on screen came from the fetch.
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it("ignores a snapshot written by a different app version (buster)", async () => {
      const seedClient = new QueryClient();
      seedClient.setQueryData(["movie", "tmdb-movie-3"], { id: "tmdb-movie-3", title: "Old Build" });
      localStorage.setItem(
        PERSIST_STORAGE_KEY,
        JSON.stringify({
          timestamp: Date.now(),
          buster: "streamly-rq-v0",
          clientState: snapshot(seedClient),
        }),
      );

      const queryFn = vi.fn().mockResolvedValue({ id: "tmdb-movie-3", title: "Current Build" });
      function Consumer() {
        const { data } = useQuery({ queryKey: ["movie", "tmdb-movie-3"], queryFn });
        return <div>{data ? data.title : "loading"}</div>;
      }

      render(
        <PersistQueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })}
          persistOptions={persistQueryCacheOptions}
        >
          <Consumer />
        </PersistQueryClientProvider>,
      );

      await waitFor(() => expect(screen.getByText("Current Build")).toBeInTheDocument());
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    it("removes the persisted copy on demand", () => {
      localStorage.setItem(PERSIST_STORAGE_KEY, JSON.stringify({ timestamp: 1 }));
      removePersistedQueryCache();
      expect(localStorage.getItem(PERSIST_STORAGE_KEY)).toBeNull();
    });

    it("tolerates a missing persisted row", () => {
      expect(() => queryPersister.restoreClient()).not.toThrow();
      expect(queryPersister.restoreClient()).toBeUndefined();
    });
  });

  describe("quota pruning", () => {
    const quotaError = { name: "QuotaExceededError", message: "exceeded quota" };
    const entry = (family, id) => ({ queryKey: [family, id] });

    function clientWith() {
      return {
        timestamp: 1,
        buster: "test",
        clientState: {
          queries: [
            entry("movie", "a"),
            entry("episodes", "a", 1),
            entry("episodes", "b", 2),
            entry("similar", "a"),
            entry("popular"),
            entry("top10"),
            entry("person", "a"),
          ],
        },
      };
    }

    it("drops the heaviest family first, per-title data last", () => {
      // First pass: episodes (a season is the biggest row the cache holds).
      let next = prunePersistedClientForQuota({ persistedClient: clientWith(), error: quotaError });
      let keys = next.clientState.queries.map((q) => q.queryKey[0]);
      expect(keys).not.toContain("episodes");
      expect(keys).toContain("movie");

      // Second pass: the similar-list, then the rails one family at a time.
      next = prunePersistedClientForQuota({ persistedClient: next, error: quotaError });
      keys = next.clientState.queries.map((q) => q.queryKey[0]);
      expect(keys).not.toContain("similar");
      expect(keys).toContain("movie");

      // Eventually only the per-title data remains, then it gives up.
      let guard = 0;
      while (next && guard < 50) {
        next = prunePersistedClientForQuota({ persistedClient: next, error: quotaError });
        guard += 1;
      }
      expect(next).toBeUndefined();
    });
  });
});
