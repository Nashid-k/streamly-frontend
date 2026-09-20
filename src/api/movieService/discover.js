import tmdb from '../tmdbClient';
import { CdnImageAdapter } from '../cdnImageAdapter';
import { logEmptyData, logWarn } from '../../utils/debugLogger';
import { logServiceError, warnIfEmpty } from './core';
import { normalizeResult, REGIONAL_PRIMARY_LANGUAGES } from './normalize';

// Resolve a browse filter set to TMDB request params. Kept tiny and pure so
// new filters (provider, country) land in exactly one place.
export const getDiscover = async ({ mediaType = 'movie', genreId, year, sortBy = 'popular', region, providerId, country, page = 1 } = {}) => {
  const mt = mediaType === 'tv' ? 'tv' : 'movie';
  try {
    const params = {
      include_adult: 'false',
      include_video: 'false',
      page: String(page),
      sort_by:
        sortBy === 'top_rated' ? 'vote_average.desc'
          : sortBy === 'newest'
            ? (mt === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc')
            : 'popularity.desc',
    };
    if (sortBy === 'top_rated') params.vote_count_gte = 200;
    if (genreId) params.with_genres = String(genreId);
    if (year) params[mt === 'movie' ? 'primary_release_year' : 'first_air_date_year'] = String(year);
    if (country) params.with_origin_country = String(country);
    if (providerId) {
      // Provider filtering always needs the region TMDB watches in; default
      // to the chosen region, the passed country, else US.
      params.watch_region = String(region || country || 'US');
      params.with_watch_providers = String(providerId);
    } else if (region) {
      params.watch_region = String(region);
    }
    const data = await tmdb(`/discover/${mt}`, params);
    const out = (data.results || []).map(r => normalizeResult({ ...r, media_type: mt }));
    warnIfEmpty('getDiscover', out, { mt, genreId, year, sortBy, region, providerId, country, page });
    return out;
  } catch (error) {
    logServiceError('getDiscover', error, { mt, genreId, year, sortBy, region, providerId, country, page });
    throw error;
  }
};

export const getGenres = async (mediaType = 'movie') => {
  const mt = mediaType === 'tv' ? 'tv' : 'movie';
  try {
    const data = await tmdb(`/genre/${mt}/list`);
    const out = (data.genres || []).map((g) => ({ id: g.id, name: g.name }));
    if (out.length === 0) {
      logEmptyData('movieService', `getGenres: TMDB returned an empty ${mt} genre list.`, { mt });
    }
    return out;
  } catch (error) {
    logServiceError('getGenres', error, { mt });
    throw error;
  }
};

export const getWatchProviders = async (mediaType = 'movie') => {
  const mt = mediaType === 'tv' ? 'tv' : 'movie';
  try {
    const data = await tmdb(`/watch/providers/${mt}`);
    const out = (data.results || [])
      .slice()
      .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
      .map((p) => ({
        id: p.provider_id,
        name: p.provider_name,
        logoUrl: p.logo_path ? CdnImageAdapter.getUrl(p.logo_path, 'w92') : null,
      }));
    if (out.length === 0) {
      logEmptyData('movieService', `getWatchProviders: TMDB returned an empty ${mt} provider list.`, { mt });
    }
    return out;
  } catch (error) {
    logServiceError('getWatchProviders', error, { mt });
    throw error;
  }
};

export const getRegions = async () => {
  try {
    const data = await tmdb('/watch/providers/regions');
    const out = (data.results || [])
      .slice()
      .sort((a, b) => String(a.english_name || a.native_name || '').localeCompare(String(b.english_name || b.native_name || '')))
      .map((r) => ({ code: r.iso_3166_1, name: r.english_name || r.native_name }));
    if (out.length === 0) {
      logEmptyData('movieService', 'getRegions: TMDB returned an empty region list.', {});
    }
    return out;
  } catch (error) {
    logServiceError('getRegions', error, {});
    throw error;
  }
};

// Movies rail — near-term theatrical release schedule enriched with the
// release dates buildUpcoming needs to power the "Upcoming / Coming Soon"
// landscape rail on the Movies discovery page. Paginates the first three
// pages so the rail is dense, not a single sparse page.
export const getUpcomingMovies = async () => {
  try {
    const pages = await Promise.allSettled(
      [1, 2, 3].map((page) => tmdb('/movie/upcoming', { page })),
    );
    const out = [];
    for (const res of pages) {
      if (res.status !== 'fulfilled') continue;
      for (const r of (res.value.results || [])) {
        if (!r.release_date) continue;
        out.push({ ...normalizeResult({ ...r, media_type: 'movie' }), releaseDate: r.release_date });
      }
    }
    warnIfEmpty('getUpcomingMovies', out, {});
    return out;
  } catch (error) {
    logServiceError('getUpcomingMovies', error, {});
    throw error;
  }
};

// Future theatrical slate — a /discover/movie sweep of English-language
// titles with a release date within the next year, sorted soonest-first.
// Keeps the Upcoming rail populated when TMDB's /movie/upcoming window is thin.
export const getFutureMovies = async () => {
  try {
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const end = new Date(now);
    end.setDate(now.getDate() + 365);
    const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    const pages = await Promise.allSettled(
      [1, 2].map((page) =>
        tmdb('/discover/movie', {
          page,
          sort_by: 'primary_release_date.asc',
          primary_release_date_gte: start,
          primary_release_date_lte: endStr,
          with_original_language: 'en',
        }),
      ),
    );
    const out = [];
    for (const res of pages) {
      if (res.status !== 'fulfilled') continue;
      for (const r of (res.value.results || [])) {
        if (!r.release_date) continue;
        out.push({ ...normalizeResult({ ...r, media_type: 'movie' }), releaseDate: r.release_date });
      }
    }
    warnIfEmpty('getFutureMovies', out, {});
    return out;
  } catch (error) {
    logServiceError('getFutureMovies', error, {});
    throw error;
  }
};

// Regional upcoming premieres — a future release-date sweep across pages
// 1–2 for each primary Indian language, sorted soonest-first. Merged into
// the global Upcoming / "Coming This Month" rails (Home + Movies discovery)
// so regional theatrical releases share the slate alongside the English
// future-movies sweep. No `region` param: with_original_language is the
// reliable regional signal, and region=IN would require TMDB to tag each
// title with an IN release-date country (many regional films aren't).
export const getRegionalUpcoming = async (windowDays = 90) => {
  try {
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const end = new Date(now);
    end.setDate(now.getDate() + windowDays);
    const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    const pages = await Promise.allSettled(
      REGIONAL_PRIMARY_LANGUAGES.flatMap((lang) =>
        [1, 2].map((page) =>
          tmdb('/discover/movie', {
            page,
            sort_by: 'primary_release_date.asc',
            primary_release_date_gte: start,
            primary_release_date_lte: endStr,
            with_original_language: lang,
          }),
        ),
      ),
    );
    const out = [];
    const seen = new Set();
    for (const res of pages) {
      if (res.status !== 'fulfilled') continue;
      for (const r of (res.value.results || [])) {
        if (!r.release_date) continue;
        const item = normalizeResult({ ...r, media_type: 'movie' });
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        out.push({ ...item, releaseDate: r.release_date });
      }
    }
    out.sort((a, b) => String(a.releaseDate).localeCompare(String(b.releaseDate)));
    warnIfEmpty('getRegionalUpcoming', out, { windowDays, languages: REGIONAL_PRIMARY_LANGUAGES.join(',') });
    return out;
  } catch (error) {
    logServiceError('getRegionalUpcoming', error, { windowDays, languages: REGIONAL_PRIMARY_LANGUAGES.join(',') });
    throw error;
  }
};

// Genre-cluster discover rails for the home showcase ("Action & Adventure",
// "Sci-Fi & Fantasy", "Comedies" ...). Accepts per-type genre id lists so a
// single rail can mix the movie genre (28) with its TV equivalent (10759).
// Results from movie + tv are interleaved so the row feels curated. Quality
// floor via vote_count_gte mirrors what authentic platforms surface.
export const getDiscoverByGenre = async ({ movies = [], tv = [] } = {}) => {
  const jobs = [];
  const typed = (list) => (Array.isArray(list) ? list.filter(Boolean) : []);
  if (typed(movies).length > 0) jobs.push(['movie', typed(movies)]);
  if (typed(tv).length > 0) jobs.push(['tv', typed(tv)]);
  if (jobs.length === 0) {
    logWarn('movieService', 'getDiscoverByGenre called with no genre ids — returning [].', { movies, tv });
    return [];
  }

  try {
    const grouped = await Promise.all(
      jobs.map(async ([mt, genreIds]) => {
        try {
          const data = await tmdb(`/discover/${mt}`, {
            with_genres: genreIds.join(','),
            sort_by: 'popularity.desc',
            vote_count_gte: 30,
            include_adult: 'false',
            include_video: 'false',
          });
          const out = (data.results || []).map(r =>
            normalizeResult({ ...r, media_type: mt }),
          );
          if (out.length === 0) {
            logEmptyData('movieService', `getDiscoverByGenre: no ${mt} titles for genres ${genreIds.join(',')}.`, { mt, genreIds });
          }
          return out;
        } catch (error) {
          logServiceError(`getDiscoverByGenre[${mt}]`, error, { genreIds });
          throw error;
        }
      }),
    );

    const out = [];
    const max = grouped.reduce((m, g) => Math.max(m, g.length), 0);
    for (let i = 0; i < max; i++) {
      for (const g of grouped) if (g[i]) out.push(g[i]);
    }
    return out.slice(0, 24);
  } catch (error) {
    logServiceError('getDiscoverByGenre', error, { movies, tv });
    throw error;
  }
};