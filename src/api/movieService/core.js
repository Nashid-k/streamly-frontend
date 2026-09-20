import { logEmptyData, logError } from '../../utils/debugLogger';

export function logServiceError(method, error, context) {
  logError('movieService', `${method} failed — rail/page using this will render empty.`, error, context);
}

export function warnIfEmpty(method, list, context) {
  if (!list || (Array.isArray(list) && list.length === 0)) {
    logEmptyData('movieService', `${method} returned 0 items — check TMDB response / filters.`, context);
  }
  return list;
}

// Helper: detect if a TMDB id refers to a TV show
export function isTvId(id) {
  if (typeof id !== 'string') return false;
  return id.startsWith('tmdb-tv-') || id.startsWith('tv-') || id.includes('-tv-');
}

export function rawId(id) {
  if (typeof id === 'string') {
    // Strip everything before the first number
    const match = id.match(/\d+$/);
    if (match) return match[0];
  }
  return id;
}