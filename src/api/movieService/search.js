import tmdb from '../tmdbClient';
import { logWarn } from '../../utils/debugLogger';
import { logServiceError, warnIfEmpty } from './core';
import { normalizeResult } from './normalize';
import { getSearchRelevance } from '../../utils/searchRanking';

export const searchMovies = async (query) => {
  if (!query) {
    logWarn('movieService', 'searchMovies called with empty query — returning [].', {});
    return [];
  }
  try {
    const data = await tmdb('/search/multi', { query, include_adult: false });
    const out = (data.results || [])
      .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
      .map(r => {
        const item = normalizeResult(r);
        // matchScore backs the "N% match" callout on details pages. Sampled
        // here so every search-derived title carries it (rankSearchResults
        // re-derives it on re-sorts). Relevance is computed with the boost
        // input zeroed to stay non-recursive.
        const relevance = getSearchRelevance({ ...item, matchScore: 0 }, query);
        return { ...item, matchScore: Math.max(0, Math.min(100, Math.round(relevance))) };
      });
    warnIfEmpty('searchMovies', out, { query });
    return out;
  } catch (error) {
    logServiceError('searchMovies', error, { query });
    throw error;
  }
};