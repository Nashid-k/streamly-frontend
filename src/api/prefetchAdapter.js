import { queryClient } from "../queryClient";
import { movieService } from "./movieService";
import { logError } from "../utils/debugLogger";

// Track in-flight prefetches to avoid duplicate requests (#19 fix)
const inFlightPrefetches = new Set();

export class PrefetchAdapter {
  /**
   * Prefetches full movie details (and similar movies) on hover.
   * Call this on onMouseEnter of a MovieCard.
   *
   * IMPORTANT: the query keys MUST match what TitleDetails consumes
   * (["movie", id] / ["similar", id] with no platform qualifier),
   * otherwise every hover fires backend requests whose results are cached
   * under keys nothing reads — wasted load + cache garbage.
   */
  static prefetchMovieDetails(movieId) {
    if (!movieId) {
      logError("prefetch", "prefetchMovieDetails called without movieId — skipping.", null, {});
      return;
    }

    const key = `${movieId}`;
    if (inFlightPrefetches.has(key)) return; // Already prefetching
    inFlightPrefetches.add(key);

    // Safety: remove from in-flight set after 30s even if promise never resolves
    const safetyTimer = setTimeout(() => inFlightPrefetches.delete(key), 30000);

    // 1. Prefetch core movie details
    const p1 = queryClient.prefetchQuery({
      queryKey: ["movie", movieId],
      queryFn: () => movieService.getMovieDetails(movieId),
      staleTime: 10 * 60 * 1000,
    });
    if (p1 && typeof p1.finally === 'function') {
      p1.catch((error) => {
        logError("prefetch", `Prefetch of movie details failed for ${movieId} — details page will fetch on open instead.`, error, { movieId });
      });
      p1.finally(() => { clearTimeout(safetyTimer); inFlightPrefetches.delete(key); });
    } else {
      clearTimeout(safetyTimer);
      inFlightPrefetches.delete(key);
    }

    // 2. Prefetch similar movies to make the bottom of the page feel instant
    queryClient.prefetchQuery({
      queryKey: ["similar", movieId],
      queryFn: () => movieService.getSimilarMovies(movieId),
      staleTime: 10 * 60 * 1000,
    }).catch((error) => {
      logError("prefetch", `Prefetch of similar titles failed for ${movieId}.`, error, { movieId });
    });
  }
}
