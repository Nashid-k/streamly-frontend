import tmdb from './tmdbClient';
import { CdnImageAdapter } from './cdnImageAdapter';
import { logDebug, logEmptyData, logError, logWarn } from '../utils/debugLogger';

function logServiceError(method, error, context) {
  logError('movieService', `${method} failed — rail/page using this will render empty.`, error, context);
}

function warnIfEmpty(method, list, context) {
  if (!list || (Array.isArray(list) && list.length === 0)) {
    logEmptyData('movieService', `${method} returned 0 items — check TMDB response / filters.`, context);
  }
  return list;
}

// Helper: detect if a TMDB id refers to a TV show
function isTvId(id) {
  if (typeof id !== 'string') return false;
  return id.startsWith('tmdb-tv-') || id.startsWith('tv-') || id.includes('-tv-');
}
function rawId(id) {
  if (typeof id === 'string') {
    // Strip everything before the first number
    const match = id.match(/\d+$/);
    if (match) return match[0];
  }
  return id;
}

// Helper: pick the English (or any) title logo from a TMDB images payload.
// Prefers the given size (default w500) and dedupes against the highly
// decorated primary logo that TMDB sometimes returns with a white/key-art
// version — those block-type logos are excluded so brand wordmarks win.
const LOGO_SIZE_SCORE = { original: 3, w500: 2, w185: 1 };
function logoUrlFromImages(images, size = 'w500') {
  const logos = (images?.logos || []).filter((l) => {
    if (l.file_path === undefined || l.file_path === null) return false;
    const type = (l.type || '').toLowerCase();
    if (type.includes('white') && type.includes('purple')) return false;
    return true;
  });
  const best = logos.find((l) => l.iso_639_1 === 'en') || logos.find((l) => !l.iso_639_1) || logos[0];
  if (!best) return null;
  const resolvedSize = LOGO_SIZE_SCORE[size] != null ? size : 'w500';
  return CdnImageAdapter.getUrl(best.file_path, resolvedSize);
}

export function isBrowsableTitle(item) {
  return item?.media_type === 'movie' || item?.media_type === 'tv';
}

// Normalize a TMDB result to the shape the app expects
export function normalizeResult(item) {
  const isTV = item.media_type === 'tv' || (
    item.media_type == null && Boolean(item.first_air_date) && !item.release_date
  );
  const id = isTV ? `tv-${item.id}` : `movie-${item.id}`;
  return {
    id,
    tmdbId: item.id,
    title: item.title || item.name || 'Untitled',
    posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
    backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w1280${item.backdrop_path}` : null,
    overview: item.overview || '',
    description: item.overview || '',
    longDescription: item.overview || '',
    imdbRating: item.vote_average ? parseFloat(item.vote_average.toFixed(1)) : null,
    year: (item.release_date || item.first_air_date || '').slice(0, 4) || null,
    isSeries: isTV,
    type: isTV ? 'tv' : 'movie',
    genres: (item.genre_ids || []).map(gid => GENRE_MAP[gid]).filter(Boolean),
    mediaType: item.media_type || (isTV ? 'tv' : 'movie'),
    popularity: item.popularity || 0,
  };
}

const GENRE_MAP = {
  28:'Action',12:'Adventure',16:'Animation',35:'Comedy',80:'Crime',
  99:'Documentary',18:'Drama',10751:'Family',14:'Fantasy',36:'History',
  27:'Horror',10402:'Music',9648:'Mystery',10749:'Romance',
  878:'Sci-Fi',10770:'TV Movie',53:'Thriller',10752:'War',37:'Western',
  10759:'Action & Adventure',10762:'Kids',10763:'News',10764:'Reality',
  10765:'Sci-Fi & Fantasy',10766:'Soap',10767:'Talk',10768:'War & Politics',
};

// ── Trailer curation ────────────────────────────────────────────────────────
// "Authentic platform" rules: never dump every Clip/Featurette on the page.
// Rank trailer-family videos by prominence — Final → Official → Trailer →
// Teaser → Extended — one per rank, bounded.
const TRAILER_ORDER = ['final', 'official', 'trailer', 'teaser', 'extended'];
export function classifyTrailer(v) {
  const name = (v.name || '').toLowerCase();
  const type = (v.type || '').toLowerCase();
  if (name.includes('final')) return 'final';
  if (name.includes('official')) return 'official';
  if (name.includes('superbowl') || name.includes('super bowl') || type === 'trailer' || name.includes(' trailer')) return 'trailer';
  if (name.includes('teaser') || type === 'teaser') return 'teaser';
  if (name.includes('extended')) return 'extended';
  return null;
}
function rankTrailerVideos(videos, limit = 4) {
  const byRank = {};
  for (const v of videos || []) {
    if (v?.site && v.site !== 'YouTube') continue;
    if (!v?.key || !String(v.key).trim()) continue;
    const rank = classifyTrailer(v);
    if (rank && !byRank[rank]) byRank[rank] = v;
  }
  return TRAILER_ORDER.map((r) => byRank[r]).filter(Boolean).slice(0, limit);
}

export const movieService = {
  searchMovies: async (query) => {
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
  },

  getFeaturedMovies: async () => {
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
  },

  // Fetch just the English title logo for a movie or TV show. Used by the
  // hero banner to render the actual show logo image instead of the text
  // fallback. Returns the biggest available logo (original) for crispness.
  getTitleLogo: async (id) => {
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
  },

  // Fetch an embeddable YouTube trailer key for any movie/TV id. Reaches
  // into the live details so even titles stored before trailers were wired
  // up (old continue-watching entries) get a preview. Picks the most
  // prominent trailer (Final → Official → Trailer → Teaser → Extended),
  // falling back to the first usable YouTube video for legacy titles.
  getTitleTrailer: async (id) => {
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
  },

  getCategories: async () => {
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
  },

  getTop10: async () => {
    try {
      const data = await tmdb('/trending/all/week');
      const out = (data.results || []).filter(isBrowsableTitle).slice(0, 10).map(normalizeResult);
      warnIfEmpty('getTop10', out, { total: (data.results || []).length });
      return out;
    } catch (error) {
      logServiceError('getTop10', error, {});
      throw error;
    }
  },

  getRecommendations: async (id) => {
    try {
      const isTV = isTvId(id);
      const rid = rawId(id);
      const data = await tmdb(`/${isTV ? 'tv' : 'movie'}/${rid}/recommendations`);
      const out = (data.results || []).map(r => normalizeResult({ ...r, media_type: isTV ? 'tv' : 'movie' }));
      warnIfEmpty('getRecommendations', out, { id });
      return out;
    } catch (error) {
      logServiceError('getRecommendations', error, { id });
      throw error;
    }
  },

  getMovieDetails: async (id) => {
    const isTV = isTvId(id);
    const rid = rawId(id);
    const endpoint = isTV ? 'tv' : 'movie';
    try {
      const [detail, externalIds] = await Promise.all([
        tmdb(`/${endpoint}/${rid}`, { append_to_response: 'credits,videos,images' }),
        // Ratings enrich the page but should not make a perfectly usable title
        // fail when TMDB's external-id endpoint is temporarily unavailable.
        tmdb(`/${endpoint}/${rid}/external_ids`).catch((error) => {
          logWarn('movieService', `getMovieDetails: external_ids failed for ${id} — continuing without IMDb id.`, {
            id,
            message: error?.message,
          });
          return {};
        }),
      ]);
    const credits = detail.credits || {};
    const item = { ...detail, media_type: isTV ? 'tv' : 'movie' };
    const base = normalizeResult(item);
    return {
      ...base,
      tagline: detail.tagline || '',
      runtime: detail.runtime || (detail.episode_run_time?.[0]) || null,
      durationMins: detail.runtime || (detail.episode_run_time?.[0]) || null,
      releaseDate: detail.release_date || detail.first_air_date || null,
      originalLanguage: detail.original_language || null,
      genres: (detail.genres || []).map(g => g.name),
      logoUrl: logoUrlFromImages(detail.images),
      cast: (credits.cast || []).slice(0, 20).map(c => ({
        id: c.id,
        name: c.name,
        character: c.character,
        profileUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
      })),
      director: (credits.crew || []).find(c => c.job === 'Director')?.name || null,
      writers: (credits.crew || []).filter(c => c.department === 'Writing').map(c => c.name),
      budget: detail.budget || 0,
      revenue: detail.revenue || 0,
      productionCompanies: (detail.production_companies || []).map(p => ({
        id: p.id,
        name: p.name,
        logo_path: p.logo_path || null,
        logoUrl: p.logo_path ? `https://image.tmdb.org/t/p/w300${p.logo_path}` : null,
        originCountry: p.origin_country || null,
      })),
      filmingLocations: (detail.production_countries || []).map(p => p.name),
      // Curated trailer set — Final → Official → Trailer → Teaser → Extended,
      // one per rank, max 4. No clip/featurette spam.
      videos: rankTrailerVideos(detail.videos?.results || []).map(v => ({
        id: v.id,
        key: v.key,
        name: v.name,
        type: v.type,
      })),
      trailer: (rankTrailerVideos(detail.videos?.results || [], 1)[0] ||
        (detail.videos?.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube'))?.key || null,
      seasonsCount: detail.number_of_seasons || null,
      // Preserve the real season numbers instead of deriving options from the
      // count. TMDB includes specials in the count, so counting from one can
      // point the watch page at a season that does not exist.
      seasons: (detail.seasons || [])
        .filter(s => s.season_number > 0)
        .map(s => ({
          seasonNumber: s.season_number,
          name: s.name || `Season ${s.season_number}`,
          episodeCount: s.episode_count || 0,
          airDate: s.air_date || null,
        })),
      nextEpisode: detail.next_episode_to_air ? {
        seasonNumber: detail.next_episode_to_air.season_number,
        episodeNumber: detail.next_episode_to_air.episode_number,
        releaseDate: detail.next_episode_to_air.air_date || null,
        title: detail.next_episode_to_air.name || null,
      } : null,
      lastEpisode: detail.last_episode_to_air ? {
        seasonNumber: detail.last_episode_to_air.season_number,
        episodeNumber: detail.last_episode_to_air.episode_number,
        releaseDate: detail.last_episode_to_air.air_date || null,
        title: detail.last_episode_to_air.name || null,
      } : null,
      // Only a scheduled next episode means the show is actively airing. A
      // last episode exists for completed shows too, which should keep their
      // normal Season 1 landing state unless the viewer has a resume point.
      airingSeasonNumber: detail.next_episode_to_air?.season_number || null,
      imdbId: externalIds.imdb_id || null,
      voteCount: detail.vote_count || 0,
      status: detail.status || null,
      networks: (detail.networks || []).map(n => n.name),
    };
    } catch (error) {
      logServiceError('getMovieDetails', error, { id });
      throw error;
    }
  },

  getSimilarMovies: async (id) => {
    try {
      const isTV = isTvId(id);
      const rid = rawId(id);
      const data = await tmdb(`/${isTV ? 'tv' : 'movie'}/${rid}/similar`);
      const out = (data.results || []).map(r => normalizeResult({ ...r, media_type: isTV ? 'tv' : 'movie' }));
      if (out.length === 0) {
        logDebug('movieService', `getSimilarMovies: no similar titles for ${id}.`, { id });
      }
      return out;
    } catch (error) {
      logServiceError('getSimilarMovies', error, { id });
      throw error;
    }
  },

  getSeasonEpisodes: async (id, seasonNumber) => {
    const rid = rawId(id);
    try {
      const data = await tmdb(`/tv/${rid}/season/${seasonNumber}`);
    const episodes = (data.episodes || []).map(ep => ({
      id: ep.id,
      episodeNumber: ep.episode_number,
      seasonNumber: ep.season_number,
      title: ep.name,
      description: ep.overview,
      airDate: ep.air_date,
      thumbnailUrl: ep.still_path ? CdnImageAdapter.getUrl(ep.still_path, 'w500') : null,
      durationMins: ep.runtime,
      duration: ep.runtime ? `${ep.runtime}m` : '',
      voteAverage: ep.vote_average,
    }));
    const now = new Date();
    const releasedEpisodes = episodes.filter(ep => ep.airDate && new Date(ep.airDate) <= now).length;
    const lastEpDate = episodes.at(-1)?.airDate;
    const isAiring = Boolean(lastEpDate && new Date(lastEpDate) > now);
    if (episodes.length === 0) {
      logEmptyData('movieService', `getSeasonEpisodes: TMDB returned 0 episodes for ${id} season ${seasonNumber}.`, { id, seasonNumber });
    }
    return { episodes, totalEpisodes: episodes.length, releasedEpisodes, isAiring };
  } catch (error) {
    logServiceError('getSeasonEpisodes', error, { id, seasonNumber });
    throw error;
  }
  },

  getExternalIds: async (id) => {
    try {
      const isTV = isTvId(id);
      const rid = rawId(id);
      const data = await tmdb(`/${isTV ? 'tv' : 'movie'}/${rid}/external_ids`);
      if (!data?.imdb_id) {
        logDebug('movieService', `getExternalIds: no IMDb id for ${id} — OMDb ratings will be skipped.`, { id });
      }
      return { imdbId: data.imdb_id || null, ...data };
    } catch (error) {
      logServiceError('getExternalIds', error, { id });
      throw error;
    }
  },

  getPersonDetails: async (id) => {
    try {
      const [person, credits] = await Promise.all([
        tmdb(`/person/${id}`),
        tmdb(`/person/${id}/combined_credits`),
      ]);
    return {
      id: person.id,
      name: person.name,
      biography: person.biography,
      birthday: person.birthday,
      deathday: person.deathday,
      placeOfBirth: person.place_of_birth,
      profileUrl: person.profile_path ? `https://image.tmdb.org/t/p/w185${person.profile_path}` : null,
      knownFor: person.known_for_department || null,
      knownForDepartment: person.known_for_department || null,
      credits: (credits.cast || [])
        .filter(isBrowsableTitle)
        .map((c) => normalizeResult({ ...c, media_type: c.media_type, roleDepartment: 'Acting' }))
        .slice(0, 50),
      castCredits: (credits.cast || [])
        .filter(isBrowsableTitle)
        .map((c) => normalizeResult({ ...c, media_type: c.media_type, roleDepartment: 'Acting' }))
        .slice(0, 40),
      crewCredits: (credits.crew || [])
        .filter(isBrowsableTitle)
        .map((c) => normalizeResult({ ...c, media_type: c.media_type, roleDepartment: c.department || 'Production' }))
        .slice(0, 40),
    };
    } catch (error) {
      logServiceError('getPersonDetails', error, { id });
      throw error;
    }
  },

  getPopular: async () => {
    try {
      const [movies, tv] = await Promise.all([
        tmdb('/movie/popular'),
        tmdb('/tv/popular'),
      ]);
      const out = [
        ...(movies.results || []).map(r => normalizeResult({ ...r, media_type: 'movie' })),
        ...(tv.results || []).map(r => normalizeResult({ ...r, media_type: 'tv' })),
      ];
      warnIfEmpty('getPopular', out, {});
      return out;
    } catch (error) {
      logServiceError('getPopular', error, {});
      throw error;
    }
  },

  getTopRated: async () => {
    try {
      const [movies, tv] = await Promise.all([
        tmdb('/movie/top_rated'),
        tmdb('/tv/top_rated'),
      ]);
      const out = [
        ...(movies.results || []).map(r => normalizeResult({ ...r, media_type: 'movie' })),
        ...(tv.results || []).map(r => normalizeResult({ ...r, media_type: 'tv' })),
      ];
      warnIfEmpty('getTopRated', out, {});
      return out;
    } catch (error) {
      logServiceError('getTopRated', error, {});
      throw error;
    }
  },

  getNowPlaying: async () => {
    try {
      const data = await tmdb('/movie/now_playing');
      const out = (data.results || []).map(r => normalizeResult({ ...r, media_type: 'movie' }));
      warnIfEmpty('getNowPlaying', out, {});
      return out;
    } catch (error) {
      logServiceError('getNowPlaying', error, {});
      throw error;
    }
  },

  getAiringThisWeek: async () => {
    try {
      const data = await tmdb('/tv/on_the_air');
      const out = (data.results || []).map(r => normalizeResult({ ...r, media_type: 'tv' }));
      warnIfEmpty('getAiringThisWeek', out, {});
      return out;
    } catch (error) {
      logServiceError('getAiringThisWeek', error, {});
      throw error;
    }
  },

  getTrendingThisWeek: async () => {
    try {
      const data = await tmdb('/trending/all/week');
      const out = (data.results || []).filter(isBrowsableTitle).map(normalizeResult);
      warnIfEmpty('getTrendingThisWeek', out, { total: (data.results || []).length });
      return out;
    } catch (error) {
      logServiceError('getTrendingThisWeek', error, {});
      throw error;
    }
  },

  // Genre-cluster discover rails for the home showcase ("Action & Adventure",
  // "Sci-Fi & Fantasy", "Comedies" ...). Accepts per-type genre id lists so a
  // single rail can mix the movie genre (28) with its TV equivalent (10759).
  // Results from movie + tv are interleaved so the row feels curated. Quality
  // floor via vote_count_gte mirrors what authentic platforms surface.
  getDiscoverByGenre: async ({ movies = [], tv = [] } = {}) => {
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
  },

  // ── Editorial curated rails (Cinejoy-style rows) ─────────────────────────
  // Keyword-keyed rails resolve their TMDB keyword ids once (cached in a
  // module-level map) then run /discover with with_keywords so every row the
  // catalog can fill is genuinely curated. Sort-mode rails ("Top Rated",
  // "Rotten Tomatoes Best") just use sort_by + a vote-count floor. Rows with
  // no resolvable keyword or no results return [] — the rail hides itself.
  getEditorialRail: async (key) => {
    const cfg = EDITORIAL_RAILS.find((r) => r.key === key);
    if (!cfg) {
      logWarn('movieService', `getEditorialRail: unknown rail key "${key}" — returning [].`, { key });
      return [];
    }

    const byType = async (mt) => {
      const params = { include_adult: 'false', include_video: 'false' };
      if (cfg.keywords) {
        const keywordId = await resolveEditorialKeyword(cfg.keywords);
        if (!keywordId) {
          logEmptyData('movieService', `getEditorialRail[${key}]: no TMDB keyword resolved for "${cfg.keywords.join(' / ')}".`, { key, keywords: cfg.keywords });
          return [];
        }
        params.with_keywords = String(keywordId);
        params.sort_by = 'popularity.desc';
        params.vote_count_gte = 30;
      } else {
        params.sort_by = cfg.sort.field;
        params.vote_count_gte = cfg.sort.voteCountGte;
      }
      const data = await tmdb(`/discover/${mt}`, params);
      return (data.results || []).map((r) =>
        normalizeResult({ ...r, media_type: mt }),
      );
    };

    try {
      const grouped = await Promise.all(
        (cfg.types || ['movie']).filter(Boolean).map(async (mt) => {
          try {
            return await byType(mt);
          } catch (error) {
            logServiceError(`getEditorialRail[${key}][${mt}]`, error, { key });
            throw error;
          }
        }),
      );
      const out = [];
      const max = grouped.reduce((m, g) => Math.max(m, g.length), 0);
      for (let i = 0; i < max; i++) {
        for (const g of grouped) if (g[i]) out.push(g[i]);
      }
      warnIfEmpty('getEditorialRail', out, { key });
      return out.slice(0, 24);
    } catch (error) {
      logServiceError('getEditorialRail', error, { key });
      throw error;
    }
  },
};

// Ordered home editorial rows — the rows render top→bottom; an empty result
// simply hides a row. Keyword ids are resolved at runtime (never hardcoded).
export const EDITORIAL_RAILS = [
  { key: 'top-rated-editors', label: 'Top Rated Movies & Series', sort: { field: 'vote_count.desc', voteCountGte: 2000 }, types: ['movie', 'tv'] },
  { key: 'award-winning', label: 'Award Winning Movies & Shows', keywords: ['award-winning', 'award winner'], types: ['movie', 'tv'] },
  { key: 'oscar-nominees', label: 'Oscar Nominees', keywords: ['oscar winner', 'oscar'], types: ['movie'] },
  { key: 'psychological-thrillers', label: 'Psychological Thrillers', keywords: ['psychological thriller'], types: ['movie', 'tv'] },
  { key: 'cannes-film-festival', label: 'Cannes Film Festival', keywords: ['cannes'], types: ['movie'] },
  { key: 'top-100-halloween', label: 'Top 100 Halloween Movies', keywords: ['halloween'], types: ['movie'] },
  { key: 'rotten-tomatoes-best', label: 'Rotten Tomatoes Best Movies', sort: { field: 'vote_average.desc', voteCountGte: 500 }, types: ['movie'] },
  { key: 'mindfuck-movies', label: 'Mindf*ck Movies', keywords: ['mindfuck', 'mind f*ck'], types: ['movie'] },
  { key: 'based-on-true-story', label: 'Based on a True Story', keywords: ['based on true story', 'true story'], types: ['movie', 'tv'] },
];

/* Keyword → keyword-id resolution: TMDB has no static id list here, so we
   search once, cache per phrase, and match exact-ish or accept the top hit. */
const editorKeywordCache = new Map();
async function resolveEditorialKeyword(candidates) {
  for (const q of candidates) {
    const lower = String(q).toLowerCase();
    if (editorKeywordCache.has(lower)) {
      const cached = editorKeywordCache.get(lower);
      return cached || null;
    }
    try {
      const data = await tmdb('/search/keyword', { query: lower });
      const list = (data.results || []);
      const normalized = list.map((k) => ({ id: k.id, name: (k.name || '').toLowerCase() }));
      const exact = normalized.find((k) => k.name === lower);
      const fuzzy = normalized.find((k) => k.name.includes(lower));
      const chosen = exact || fuzzy || normalized[0];
      editorKeywordCache.set(lower, chosen ? String(chosen.id) : '');
      if (chosen) return String(chosen.id);
    } catch (error) {
      logServiceError('resolveEditorialKeyword', error, { query: lower });
      editorKeywordCache.set(lower, '');
    }
  }
  return null;
}
