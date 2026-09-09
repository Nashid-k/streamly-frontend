import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
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
