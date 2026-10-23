import tmdb from '../tmdbClient';
import { logDebug, logEmptyData } from '../../utils/debugLogger';
import { logServiceError, warnIfEmpty, isTvId, rawId } from './core';
import { normalizeResult, isBrowsableTitle, logoUrlFromImages } from './normalize';

export const getFeaturedMovies = async () => {
  try {
    const data = await tmdb('/trending/all/week');
    // TMDB's `all` feed also includes people. A person has no title, poster
    // route, or playable detail page, so filter before slicing to keep five
    // real hero candidates rather than rendering "Untitled" cards.
    const results = (data.results || []).filter(isBrowsableTitle).slice(0, 5);
    if (results.length === 0) {
      logEmptyData('movieService', 'getFeaturedMovies: trending feed had no browsable titles.', {
        total: (data.results || []).length,
      });
    }
    // The list payload is enough to paint the hero. `normalizeResult` already
    // carries title, artwork, genres and rating, and the wordmark is resolved
    // lazily per title by `HeroTitleLogo`/`useTitleLogo` through the cached
    // `titleLogo` query, which draws the styled text title until it lands.
    // Fetching every candidate's detail here only added `logoUrl`
    // (normalizeResult discards the rest) at the cost of blocking the whole
    // hero on five extra round trips.
    return results.map(normalizeResult);
  } catch (error) {
    logServiceError('getFeaturedMovies', error, {});
    throw error;
  }
};

// Fetch just the English title logo for a movie or TV show, so the hero banner
// renders the real logo instead of the text fallback. Biggest available (original).
export const getTitleLogo = async (id) => {
  const isTV = isTvId(id);
  const rid = rawId(id);
  try {
    const data = await tmdb(`/${isTV ? 'tv' : 'movie'}/${rid}/images`);
    const out = logoUrlFromImages(data, 'original');
    if (!out) {
      logDebug('movieService', `getTitleLogo: no logo on TMDB for ${id} — hero falls back to text title.`, { id });
    }
    return out;
  } catch (error) {
    logServiceError('getTitleLogo', error, { id });
    throw error;
  }
};

export const getCategories = async () => {
  try {
    const [movies, tv] = await Promise.all([
      tmdb('/trending/movie/week'),
      tmdb('/trending/tv/week'),
    ]);
    // Categories feed the "Latest Releases" rail, which needs the real release
    // date — normalizeResult only carries `year`. Attach it additively (the
    // field name `releaseDate` is what releaseCalendar/contentTags read) so the
    // rail can filter/sort on already-released titles.
    const withReleaseDate = (r, mediaType) => {
      const item = { ...r, media_type: mediaType };
      return {
        ...normalizeResult(item),
        releaseDate: item.release_date || item.first_air_date || null,
      };
    };
    const movieItems = (movies.results || []).map(r => withReleaseDate(r, 'movie'));
    const tvItems = (tv.results || []).map(r => withReleaseDate(r, 'tv'));
    if (movieItems.length === 0 && tvItems.length === 0) {
      logEmptyData('movieService', 'getCategories: both trending feeds were empty.', {});
    }
    // Return as an array of category objects matching the app's expected shape
    return [
      { name: 'Trending Movies', movies: movieItems },
      { name: 'Trending TV Shows', movies: tvItems },
    ];
  } catch (error) {
    logServiceError('getCategories', error, {});
    throw error;
  }
};

export const getTop10 = async () => {
  try {
    const data = await tmdb('/trending/all/week');
    const out = (data.results || []).filter(isBrowsableTitle).slice(0, 10).map(normalizeResult);
    warnIfEmpty('getTop10', out, { total: (data.results || []).length });
    return out;
  } catch (error) {
    logServiceError('getTop10', error, {});
    throw error;
  }
};

export const getTrendingThisWeek = async () => {
  try {
    const data = await tmdb('/trending/all/week');
    const out = (data.results || []).filter(isBrowsableTitle).map(normalizeResult);
    warnIfEmpty('getTrendingThisWeek', out, { total: (data.results || []).length });
    return out;
  } catch (error) {
    logServiceError('getTrendingThisWeek', error, {});
    throw error;
  }
};