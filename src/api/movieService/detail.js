import tmdb from '../tmdbClient';
import { logDebug, logEmptyData, logWarn } from '../../utils/debugLogger';
import { logServiceError, warnIfEmpty, isTvId, rawId } from './core';
import {
  normalizeResult,
  certificationFromDetail,
  logoUrlFromImages,
  rankTrailerVideos,
  REGIONAL_PRIMARY_LANGUAGES,
} from './normalize';

export const getMovieDetails = async (id) => {
  const isTV = isTvId(id);
  const rid = rawId(id);
  const endpoint = isTV ? 'tv' : 'movie';
  try {
    const [detail, externalIds] = await Promise.all([
      tmdb(`/${endpoint}/${rid}`, {
        append_to_response: `credits,videos,images,${isTV ? 'content_ratings' : 'release_dates'}`,
      }),
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
    directorId: (credits.crew || []).find(c => c.job === 'Director')?.id || null,
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
    episodesCount: detail.number_of_episodes || null,
    lastAiredDate: detail.last_air_date || null,
        // Preserve real season numbers instead of deriving options from the count:
        // TMDB includes specials in the count, so counting from one can point the
        // watch page at a season that does not exist.
    seasons: (detail.seasons || [])
      .filter(s => s.season_number > 0)
      .map(s => ({
        seasonNumber: s.season_number,
        name: s.name || `Season ${s.season_number}`,
        episodeCount: s.episode_count || 0,
        airDate: s.air_date || null,
      })),
        // Canonical next-episode shape ({ season, episode, releaseDate, title }).
        // Consumers still union the old { seasonNumber, episodeNumber } fields, so
        // emit ONE shape for the domain contract.
    nextEpisode: detail.next_episode_to_air ? {
      season: detail.next_episode_to_air.season_number,
      episode: detail.next_episode_to_air.episode_number,
      releaseDate: detail.next_episode_to_air.air_date || null,
      title: detail.next_episode_to_air.name || null,
    } : null,
    lastEpisode: detail.last_episode_to_air ? {
      seasonNumber: detail.last_episode_to_air.season_number,
      episodeNumber: detail.last_episode_to_air.episode_number,
      releaseDate: detail.last_episode_to_air.air_date || null,
      title: detail.last_episode_to_air.name || null,
    } : null,
        // Only a scheduled next episode means the show is actively airing; a "last
        // episode" also exists for completed shows, which keep their normal Season 1
        // landing state unless the viewer has a resume point.
    airingSeasonNumber: detail.next_episode_to_air?.season_number || null,
    imdbId: externalIds.imdb_id || null,
    voteCount: detail.vote_count || 0,
    status: detail.status || null,
    certification: certificationFromDetail(detail, isTV),
    networks: (detail.networks || []).map(n => n.name),
  };
  } catch (error) {
    logServiceError('getMovieDetails', error, { id });
    throw error;
  }
};

export const getRecommendations = async (id) => {
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
};

export const getSimilarMovies = async (id) => {
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
};

export const getSeasonEpisodes = async (id, seasonNumber) => {
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
        // Episode thumbs come straight from TMDB's still CDN (w500), skipping the
        // wsrv proxy so an upstream optimizer can never drop a still.
    thumbnailUrl: ep.still_path ? `https://image.tmdb.org/t/p/w500${ep.still_path}` : null,
    durationMins: ep.runtime,
    duration: ep.runtime ? `${ep.runtime}m` : '',
    voteAverage: ep.vote_average,
    voteCount: ep.vote_count || 0,
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
};

export const getExternalIds = async (id) => {
  try {
    const isTV = isTvId(id);
    const rid = rawId(id);
    const data = await tmdb(`/${isTV ? 'tv' : 'movie'}/${rid}/external_ids`);
    if (!data?.imdb_id) {
      logDebug('movieService', `getExternalIds: no IMDb id for ${id} — OMDb ratings will be skipped.`, { id });
    }
        // Return ONLY the normalized imdbId — spreading the raw TMDB payload leaked
        // snake_case `imdb_id` across the domain boundary into the player.
    return { imdbId: data?.imdb_id || null };
  } catch (error) {
    logServiceError('getExternalIds', error, { id });
    throw error;
  }
};

export const getPopular = async () => {
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
};

export const getTopRated = async () => {
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
};

export const getNowPlaying = async () => {
  try {
    const data = await tmdb('/movie/now_playing');
    const out = (data.results || []).map(r => normalizeResult({ ...r, media_type: 'movie' }));
    warnIfEmpty('getNowPlaying', out, {});
    return out;
  } catch (error) {
    logServiceError('getNowPlaying', error, {});
    throw error;
  }
};

export const getAiringThisWeek = async () => {
  try {
    const data = await tmdb('/tv/on_the_air');
    const out = (data.results || []).map(r => normalizeResult({ ...r, media_type: 'tv' }));
    warnIfEmpty('getAiringThisWeek', out, {});
    return out;
  } catch (error) {
    logServiceError('getAiringThisWeek', error, {});
    throw error;
  }
};

// Regional (Indian-language) now-airing series — /discover/tv per primary Indian
// language (Tamil/Hindi/Malayalam/Telugu) airing in the last week, sorted by
// popularity then enriched with next_episode_to_air for the top titles so the
// Airing rails can show "Ep X · Mon DD" chips. A failed detail look-up never
// kills the rail. No `region` param: /discover/tv region filters by first-air-date
// country, which TMDB rarely tags as IN; with_original_language is the reliable
// regional signal.
export const getRegionalAiring = async (limit = 10) => {
  try {
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const from = new Date(now);
    from.setDate(now.getDate() - 7);
    const fromStr = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
    const toStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const pages = await Promise.allSettled(
      REGIONAL_PRIMARY_LANGUAGES.map((lang) =>
        tmdb('/discover/tv', {
          page: 1,
          sort_by: 'popularity.desc',
          air_date_gte: fromStr,
          air_date_lte: toStr,
          with_original_language: lang,
        }),
      ),
    );
    const base = [];
    const seen = new Set();
    for (const res of pages) {
      if (res.status !== 'fulfilled') continue;
      for (const r of (res.value.results || [])) {
        const item = normalizeResult({ ...r, media_type: 'tv' });
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        if (r.first_air_date) item.releaseDate = r.first_air_date;
        base.push(item);
      }
    }
    if (base.length === 0) {
      logEmptyData('movieService', 'getRegionalAiring: no regional TV titles with an air date this week.', {
        languages: REGIONAL_PRIMARY_LANGUAGES.join(','),
      });
      return [];
    }
    const slice = base.slice(0, Math.min(limit, base.length));
    const enriched = await Promise.allSettled(
      slice.map(async (item) => {
        const rid = rawId(item.id);
        const brief = await tmdb(`/tv/${rid}`, { append_to_response: 'next_episode_to_air' });
        const nx = brief.next_episode_to_air;
        if (!nx || !nx.air_date) return item;
        return {
          ...item,
          nextEpisode: {
            releaseDate: nx.air_date,
            season: nx.season_number,
            episode: nx.episode_number,
            title: nx.name || null,
          },
          airingSeasonNumber: nx.season_number || null,
        };
      }),
    );
    const out = enriched.map((r, i) => (r.status === 'fulfilled' ? r.value : slice[i]));
    warnIfEmpty('getRegionalAiring', out, { limit, languages: REGIONAL_PRIMARY_LANGUAGES.join(',') });
    return out;
  } catch (error) {
    logServiceError('getRegionalAiring', error, { limit, languages: REGIONAL_PRIMARY_LANGUAGES.join(',') });
    throw error;
  }
};

// Series rail ("New Seasons Airing") — /tv/on_the_air plus a light next-episode
// look-up for the first few titles so cards can show the "Season N" badge and
// "Ep X · Mon DD" overlay. A failed look-up falls back to the plain list item.
export const getAiringRail = async (limit = 10) => {
  try {
    const data = await tmdb('/tv/on_the_air');
    const base = (data.results || []).map(r => normalizeResult({ ...r, media_type: 'tv' }));
    if (base.length === 0) {
      logEmptyData('movieService', 'getAiringRail: /tv/on_the_air returned 0 titles.', {});
      return [];
    }
    const slice = base.slice(0, Math.min(limit, base.length));
    const enriched = await Promise.allSettled(
      slice.map(async (item) => {
        const rid = rawId(item.id);
        const brief = await tmdb(`/tv/${rid}`, { append_to_response: 'next_episode_to_air' });
        const nx = brief.next_episode_to_air;
        if (!nx || !nx.air_date) return item;
        return {
          ...item,
          nextEpisode: {
            releaseDate: nx.air_date,
            season: nx.season_number,
            episode: nx.episode_number,
            title: nx.name || null,
          },
          airingSeasonNumber: nx.season_number || null,
        };
      }),
    );
    const out = enriched.map((r, i) => (r.status === 'fulfilled' ? r.value : slice[i]));
    warnIfEmpty('getAiringRail', out, { limit });
    return out;
  } catch (error) {
    logServiceError('getAiringRail', error, { limit });
    throw error;
  }
};