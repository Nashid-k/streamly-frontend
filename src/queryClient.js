import { QueryClient, QueryCache } from "@tanstack/react-query";
import { logError } from "./utils/debugLogger";

const queryCache = new QueryCache({
  onError: (error, query) => {
    try {
      logError("react-query", `Query failed: ${query.queryKey.join(" / ")} — UI may show empty rails/skeletons.`, error, {
        queryKey: query.queryKey,
        online: typeof navigator !== "undefined" ? navigator.onLine : undefined,
        state: query.state?.status,
        failureCount: query.state?.fetchFailureCount,
      });
    } catch {
      // never break the cache callback
    }
  },
});

export const queryClient = new QueryClient({
  queryCache,
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Catalog data barely changes — 30min stale + 30min GC reduces
      // superfluous refetches on tab focus, back-navigation, and rail remounts.
      // GC was 15min: returning after a longer break evicted everything, so
      // every route remount paid the full fetch again ("no proper caching").
      // 30min covers a typical viewing session; past that, queryCachePersister
      // still restores the persisted whitelist, so routes keep painting from
      // cache and only genuinely stale entries refresh in the background.
      // Viewer directive (2026-10-31): once a page has loaded, cache it — a
      // revisit inside the session must never re-skeleton or re-fetch.
      staleTime: 30 * 60 * 1000,
      gcTime:   30 * 60 * 1000,
      // A media browse page has several concurrent requests. One retry gives
      // transient mobile connections a second chance without trapping the UI
      // behind a long sequence of loading skeletons.
      retry: (failureCount, error) =>
        failureCount < 1 && !/timed out/i.test(error?.message || ""),
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
      networkMode: 'online',
    },
  },
});
