/**
 * Streamly API Layer Barrel
 *
 * Consolidated exports for network boundary clients, services, and adapters.
 */

export { default as tmdb } from "./tmdbClient";
export { movieService } from "./movieService";
export { fetchOmdbByImdbId } from "./omdbClient";
export { ratingService } from "./ratingService";
export { SubtitleFetcher } from "./subtitleFetcher";
export { streamResolve } from "./streamResolve";
export { PrefetchAdapter } from "./prefetchAdapter";
export { CdnImageAdapter } from "./cdnImageAdapter";
export { useVirtualRenderAdapter } from "./virtualRenderAdapter";
export { fetchPublicCollections, fetchPublicCollection } from "./publicCollections";
