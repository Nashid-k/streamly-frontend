import tmdb from './tmdbClient';

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

// Normalize a TMDB result to the shape the app expects
function normalizeResult(item) {
  const isTV = item.media_type === 'tv' || item.first_air_date !== undefined;
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

export const movieService = {
  searchMovies: async (query) => {
    if (!query) return [];
    const data = await tmdb('/search/multi', { query, include_adult: false });
    return (data.results || []).filter(r => r.media_type === 'movie' || r.media_type === 'tv').map(normalizeResult);
  },

  getFeaturedMovies: async () => {
    const data = await tmdb('/trending/all/week');
    const results = (data.results || []).slice(0, 5);
    // Fetch details for the featured movies to get logos
    return await Promise.all(results.map(async (r) => {
      try {
        const detail = await tmdb(`/${r.media_type || 'movie'}/${r.id}`, { append_to_response: 'images' });
        const item = { ...r, ...detail };
        const base = normalizeResult(item);
        const logoUrl = (detail.images?.logos || []).find(l => l.iso_639_1 === 'en' || !l.iso_639_1)?.file_path ? `https://image.tmdb.org/t/p/w500${(detail.images?.logos || []).find(l => l.iso_639_1 === 'en' || !l.iso_639_1).file_path}` : null;
        return { ...base, logoUrl };
      } catch {
        return normalizeResult(r);
      }
    }));
  },

  getCategories: async () => {
    const [movies, tv] = await Promise.all([
      tmdb('/trending/movie/week'),
      tmdb('/trending/tv/week'),
    ]);
    const movieItems = (movies.results || []).map(r => normalizeResult({ ...r, media_type: 'movie' }));
    const tvItems = (tv.results || []).map(r => normalizeResult({ ...r, media_type: 'tv' }));
    // Return as an array of category objects matching the app's expected shape
    return [
      { name: 'Trending Movies', movies: movieItems },
      { name: 'Trending TV Shows', movies: tvItems },
    ];
  },

  getAiringThisWeek: async () => {
    const data = await tmdb('/tv/on_the_air');
    return (data.results || []).map(normalizeResult);
  },

  getTrendingThisWeek: async () => {
    const data = await tmdb('/trending/all/week');
    return (data.results || []).map(normalizeResult);
  },

  getTop10: async () => {
    const data = await tmdb('/trending/all/week');
    return (data.results || []).slice(0, 10).map(normalizeResult);
  },

  getRecommendations: async (id) => {
    const isTV = isTvId(id);
    const rid = rawId(id);
    const data = await tmdb(`/${isTV ? 'tv' : 'movie'}/${rid}/recommendations`);
    return (data.results || []).map(r => normalizeResult({ ...r, media_type: isTV ? 'tv' : 'movie' }));
  },

  getMovieDetails: async (id) => {
    const isTV = isTvId(id);
    const rid = rawId(id);
    const endpoint = isTV ? 'tv' : 'movie';
    const [detail, credits, externalIds] = await Promise.all([
      tmdb(`/${endpoint}/${rid}`, { append_to_response: 'credits,videos,images' }),
      tmdb(`/${endpoint}/${rid}/credits`),
      tmdb(`/${endpoint}/${rid}/external_ids`),
    ]);
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
      logoUrl: (detail.images?.logos || []).find(l => l.iso_639_1 === 'en' || !l.iso_639_1)?.file_path ? `https://image.tmdb.org/t/p/w500${(detail.images?.logos || []).find(l => l.iso_639_1 === 'en' || !l.iso_639_1).file_path}` : null,
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
      productionCompanies: (detail.production_companies || []).map(p => p.name),
      filmingLocations: (detail.production_countries || []).map(p => p.name),
      videos: (detail.videos?.results || []).filter(v => v.site === 'YouTube').map(v => ({
        id: v.id,
        key: v.key,
        name: v.name,
        type: v.type,
      })),
      trailer: (detail.videos?.results || []).find(v => v.type === 'Trailer' && v.site === 'YouTube')?.key || null,
      seasonsCount: detail.number_of_seasons || null,
      seasons: (detail.seasons || []).filter(s => s.season_number > 0),
      imdbId: externalIds.imdb_id || null,
      status: detail.status || null,
      networks: (detail.networks || []).map(n => n.name),
    };
  },

  getSimilarMovies: async (id) => {
    const isTV = isTvId(id);
    const rid = rawId(id);
    const data = await tmdb(`/${isTV ? 'tv' : 'movie'}/${rid}/similar`);
    return (data.results || []).map(r => normalizeResult({ ...r, media_type: isTV ? 'tv' : 'movie' }));
  },

  getSeasonEpisodes: async (id, seasonNumber) => {
    const rid = rawId(id);
    const data = await tmdb(`/tv/${rid}/season/${seasonNumber}`);
    const episodes = (data.episodes || []).map(ep => ({
      id: ep.id,
      episodeNumber: ep.episode_number,
      seasonNumber: ep.season_number,
      title: ep.name,
      description: ep.overview,
      airDate: ep.air_date,
      thumbnailUrl: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null,
      durationMins: ep.runtime,
      duration: ep.runtime ? `${ep.runtime}m` : '',
      voteAverage: ep.vote_average,
    }));
    const now = new Date();
    const releasedEpisodes = episodes.filter(ep => ep.airDate && new Date(ep.airDate) <= now).length;
    const lastEpDate = episodes.at(-1)?.airDate;
    const isAiring = Boolean(lastEpDate && new Date(lastEpDate) > now);
    return { episodes, totalEpisodes: episodes.length, releasedEpisodes, isAiring };
  },

  getExternalIds: async (id) => {
    const isTV = isTvId(id);
    const rid = rawId(id);
    const data = await tmdb(`/${isTV ? 'tv' : 'movie'}/${rid}/external_ids`);
    return { imdbId: data.imdb_id || null, ...data };
  },

  getPersonDetails: async (id) => {
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
      knownForDepartment: person.known_for_department,
      credits: (credits.cast || []).map(c => normalizeResult({ ...c, media_type: c.media_type })).slice(0, 40),
    };
  },

  getAiringThisWeek: async () => {
    const data = await tmdb('/tv/on_the_air');
    return (data.results || []).map(r => normalizeResult({ ...r, media_type: 'tv' }));
  },

  getTrendingThisWeek: async () => {
    const data = await tmdb('/trending/all/week');
    return (data.results || []).map(normalizeResult);
  },
};
