import tmdb from '../tmdbClient';
import { logWarn } from '../../utils/debugLogger';
import { logServiceError, warnIfEmpty } from './core';
import { normalizeResult } from './normalize';
import { getSearchRelevance } from '../../utils/searchRanking';

export const searchMovies = async (query, opts = {}) => {
  if (!query) {
    logWarn('movieService', `searchMovies called with empty query — returning [].`, {});
    return [];
  }
  try {
    const data = await tmdb(
      '/search/multi',
      { query, include_adult: false },
      // Forwarded so react-query can cancel a search for a query the viewer has
      // already typed past. Without it the previous request races the new one
      // and the slower (older) answer can paint last.
      { signal: opts.signal },
    );
    const out = (data.results || [])
      .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
      .map(r => {
        const item = normalizeResult(r);
        // matchScore backs the "N% match" callout on details pages. Sampled
        // here so every search-derived title carries it (rankSearchResults
        // re-derives it on re-sorts). matchScore is an OUTPUT of the scorer,
        // never an input — the scorer reads `popularity`, not matchScore, so
        // there is nothing to zero out and no way for a score to buy itself
        // a higher score.
        const relevance = getSearchRelevance(item, query);
        return { ...item, matchScore: Math.max(0, Math.min(100, Math.round(relevance))) };
      });
    warnIfEmpty('searchMovies', out, { query });
    return out;
  } catch (error) {
    // A cancelled search is not a failure — the viewer typed another letter.
    // Logging it would put "search failed" in the diagnostics for a success.
    if (error?.name !== 'AbortError') logServiceError('searchMovies', error, { query });
    throw error;
  }
};