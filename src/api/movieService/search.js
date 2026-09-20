import tmdb from '../tmdbClient';
import { logWarn } from '../../utils/debugLogger';
import { logServiceError, warnIfEmpty } from './core';
import { normalizeResult } from './normalize';

export const searchMovies = async (query) => {
  if (!query) {
    logWarn('movieService', 'searchMovies called with empty query — returning [].', {});
    return [];
  }
  try {
    const data = await tmdb('/search/multi', { query, include_adult: false });
    const out = (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').map(normalizeResult);
    warnIfEmpty('searchMovies', out, { query });
    return out;
  } catch (error) {
    logServiceError('searchMovies', error, { query });
    throw error;
  }
};