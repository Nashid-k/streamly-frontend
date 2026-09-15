/**
 * Streamly API Layer Barrel
 *
 * Consolidated exports for network boundary clients, services, and adapters.
 */

export { default as tmdb } from "./tmdbClient";
export { movieService } from "./movieService";
export { fetchOmdbByImdbId } from "./omdbClient";
export { ratingService } from "./ratingService";
export {
  VideoSourceAdapter,
  BASE_SERVERS,
} from "./videoSourceAdapter";
export { SubtitleFetcher } from "./subtitleFetcher";
export { PrefetchAdapter } from "./prefetchAdapter";
export { CdnImageAdapter } from "./cdnImageAdapter";
export { useVirtualRenderAdapter } from "./virtualRenderAdapter";
