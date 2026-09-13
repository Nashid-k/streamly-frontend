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
      staleTime: 5 * 60 * 1000,
      // A media browse page has several concurrent requests. One retry gives
      // transient mobile connections a second chance without trapping the UI
      // behind a long sequence of loading skeletons.
      retry: (failureCount, error) =>
        failureCount < 1 && !/timed out/i.test(error?.message || ""),
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    },
  },
});
