import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { logDebug, logError } from "./utils/debugLogger";

/* Persistent query cache — the missing half of "every routing gives fresh
   loading".
   ─────────────────────────────────────────────────────────────────────────────
   queryClient.js already answers SPA back-navigation from memory: staleTime
   (8 min default, 24 h for details) means a remounted route paints cached data
   and never re-shows skeletons. But that cache is MEMORY-only, so a hard
   reload, a tab reopen or an app restart re-pays every request and shows the
   full skeleton experience again — even seconds after the page was on screen.
   This module dehydrates the cache into localStorage on change and hydrates it
   before first paint, so a London-day return trip lands the catalogue the way
   the viewer last saw it, and React Query's own staleness rules (restored
   entries older than their staleTime refetch in the background) decide when a
   network refresh happens on top of that.

   Two invariants carry over from the memory cache, and this module must not
   break them:
   • Account hygiene — `discardLocalLibrary()` (AuthContext) wipes the cache on
     sign-out/account change so the next person on a shared device never sees
     the previous account's data. The persisted copy is part of that library:
     `removePersistedQueryCache()` is exported for AuthContext to call.
   • Language / preferences invalidation — PreferencesContext invalidates
     language-shaped queries at runtime; that marks the hydrated entries stale
     in-place, which refetches what changed while still painting instantly.  */

/** localStorage key. Changing it unfailingly discards every old cached entry. */
// Exported so tests (and debugging) can address the row directly.
export const PERSIST_STORAGE_KEY = "streamly_rq_cache";

/** Versioned buster: bumping this drops the persisted cache of old builds. */
const CACHE_BUSTER = "streamly-rq-v1";

/** Hard ceiling: persisted entries older than 24 h are dropped on restore. */
export const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/* Only these query families leave the process. Everything else lives
   memory-only for the session:
   • PERSONALIZED — `recommendations` is keyed on the viewer's last watched
     title and differs per account, exactly the kind of row the sign-out wipe
     defends; nothing keeps it in storage.
   • PRIVATE — `search` holds the viewer's own typed queries; they are cheap
     and belong to the session.
   • RAIL WEIGHT — rails are re-derivable catalogue sweeps (single proxy-hit
     each, short staleTimes); if the persisted payload nears the ~5 MB
     localStorage ceiling, the quota retry prunes them FIRST and keeps the
     per-title entries, which are the ones burned by real round trips. */
const PER_TITLE_FAMILIES = new Set([
  "movie",
  "similar",
  "episodes",
  "person",
  "titleLogo",
  "realRatings",
]);
const RAIL_FAMILIES = new Set([
  "featuredMovies",
  "categories",
  "trending-this-week",
  "airing-this-week",
  "top10",
  "popular",
  "topRated",
  "nowPlaying",
  "upcoming-regional",
  "airing-regional",
  "new-releases",
  "editorial",
  "discover-genres",
  "discover-providers",
  "discover-regions",
  "discover-rail",
  "discover-series-upcoming",
  "genre-search",
  "genre-showcase",
  "public-collection",
  "public-collection-items",
  "category-fallback",
]);
const PERSISTED_FAMILIES = new Set([...PER_TITLE_FAMILIES, ...RAIL_FAMILIES]);

const RAIL_FAMILY_LIST = [...RAIL_FAMILIES];
const EPISODE_FAMILY = "episodes";

/**
 * The persisted snapshot, pruned by family. Prune order is newest-importance:
 * episodes arrays (a season is 24+ episode objects and the heaviest rows we
 * cache), then the rails, then similar. Only when even the per-title entries
 * cannot fit does the client give up entirely (returns undefined → nothing is
 * written this round; the next mutation retries with fresh data).
 * Exported for tests — it is the only non-standard behaviour of the persister.
 */
export function prunePersistedClientForQuota({ persistedClient, error }) {
  // `persistedClient` is the PERSISTED ENVELOPE ({buster, timestamp,
  // clientState}) — the dehydrated queries live under `clientState.queries`.
  // Each retry pass drops the heaviest family still present (a season's
  // episode array, then the similar-list, then the rails one by one) and
  // nothing means nothing was removable — give up for this round.
  const families = [EPISODE_FAMILY, "similar", ...RAIL_FAMILY_LIST];
  let client = persistedClient;
  for (const family of families) {
    const before = (client?.clientState?.queries || []).length;
    const queries = (client?.clientState?.queries || []).filter(
      (q) => q.queryKey?.[0] !== family,
    );
    if (queries.length === before) continue; // family absent — try the next
    client = { ...client, clientState: { ...client?.clientState, queries } };
    logDebug(
      "queryCache",
      `Persisted cache pruned family "${family}" for localStorage quota.`,
      { message: error?.message, remaining: queries.length },
    );
    return client;
  }
  logError(
    "queryCache",
    "Persisted cache could not fit localStorage even per-title only; skipping this write.",
    error,
  );
  return undefined;
}

function shouldDehydrateQuery(query) {
  // Successful, non-error, non-searching queries only — hydration never
  // restores a pending or failed fetch, and must never resurrect data a
  // failed request surfaced.
  if (query.state.status !== "success" || query.isFetching) return false;
  const family = query.queryKey?.[0];
  return typeof family === "string" && PERSISTED_FAMILIES.has(family);
}

function getStorage() {
  try {
    if (typeof window === "undefined") return undefined;
    const probe = `__streamly_probe__${Date.now()}`;
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch (error) {
    // Private-mode / storage-blocked browsers just get the in-memory cache as
    // before — never a broken boot. Logged so "was anything persisted?" has
    // an answer.
    logDebug("queryCache", "localStorage is unavailable; query cache stays memory-only.", {
      message: error?.message,
    });
    return undefined;
  }
}

const storage = getStorage();

export const queryPersister = createSyncStoragePersister({
  // Same row the app-level removePersistedQueryCache() and the tests address;
  // without this the persister defaults to `REACT_QUERY_OFFLINE_CACHE` and
  // reads a row the app never writes.
  key: PERSIST_STORAGE_KEY,
  throttleTime: 1000,
  serialize: (client) => JSON.stringify(client),
  deserialize: (str) => JSON.parse(str),
  retry: prunePersistedClientForQuota,
  ...(storage
    ? {
        storage: {
          getItem: (...args) => storage.getItem(...args),
          setItem: (...args) => storage.setItem(...args),
          removeItem: (...args) => storage.removeItem(...args),
        },
      }
    : undefined),
});

export const persistQueryCacheOptions = {
  persister: queryPersister,
  maxAge: PERSIST_MAX_AGE_MS,
  buster: CACHE_BUSTER,
  dehydrate: { shouldDehydrateQuery },
};

export function removePersistedQueryCache() {
  if (!storage) return;
  try {
    storage.removeItem(PERSIST_STORAGE_KEY);
    logDebug("queryCache", "Persisted query cache removed (library wipe / account change).");
  } catch (error) {
    logError("queryCache", "Could not remove the persisted query cache.", error);
  }
}
