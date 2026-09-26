import tmdb from '../tmdbClient';
import { logDebug, logEmptyData, logWarn } from '../../utils/debugLogger';
import { logServiceError, warnIfEmpty, isTvId, rawId } from './core';
import { normalizeResult, isBrowsableTitle, logoUrlFromImages, rankTrailerVideos } from './normalize';

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
    // Fetch details for the featured movies to get logos
    return await Promise.all(results.map(async (r) => {
      try {
        const detail = await tmdb(`/${r.media_type || 'movie'}/${r.id}`, { append_to_response: 'images' });
        const item = { ...r, ...detail };
        const base = normalizeResult(item);
        const logoUrl = logoUrlFromImages(detail.images);
        return { ...base, logoUrl };
      } catch (error) {
        logWarn('movieService', `getFeaturedMovies: detail fetch failed for ${r.media_type || 'movie'}/${r.id} — using list item without logo.`, {
          id: r.id,
          media_type: r.media_type,
          message: error?.message,
        });
        return normalizeResult(r);
      }
    }));
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

// Fetch an embeddable YouTube trailer key for any movie/TV id, reaching into the
// live details so titles stored before trailers were wired up still get a preview.
// Most prominent trailer wins (Final → Official → Trailer → Teaser → Extended),
// falling back to the first usable YouTube video for legacy titles.
export const getTitleTrailer = async (id) => {
  const isTV = isTvId(id);
  const rid = rawId(id);
  try {
    const data = await tmdb(`/${isTV ? 'tv' : 'movie'}/${rid}/videos`);
    const videos = (data.results || []).filter(
      (v) => v.site === 'YouTube' && v.key && v.key.trim(),
    );
    if (videos.length === 0) {
      logDebug('movieService', `getTitleTrailer: no YouTube videos for ${id}.`, { id });
      return null;
    }
    const ranked = rankTrailerVideos(videos, 1);
    return ranked[0]?.key || videos[0].key;
  } catch (error) {
    logServiceError('getTitleTrailer', error, { id });
    throw error;
  }
};

export const getCategories = async () => {
  try {
    const [movies, tv] = await Promise.all([
      tmdb('/trending/movie/week'),
      tmdb('/trending/tv/week'),
    ]);
    const movieItems = (movies.results || []).map(r => normalizeResult({ ...r, media_type: 'movie' }));
    const tvItems = (tv.results || []).map(r => normalizeResult({ ...r, media_type: 'tv' }));
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