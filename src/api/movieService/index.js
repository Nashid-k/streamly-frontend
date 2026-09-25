/**
 * Streamly movieService facade.
 *
 * The TMDB-backed data service is split by concern under src/api/movieService/
 * (core, normalize, search, featured, discover, detail, editorial, person) and
 * re-assembled here into ONE stable surface so consumers keep importing
 * `movieService` (or the small set of named helpers) from "../api/movieService"
 * unchanged.
 */
import { searchMovies } from './search';
import {
  getFeaturedMovies,
  getTitleLogo,
  getTitleTrailer,
  getCategories,
  getTop10,
  getTrendingThisWeek,
} from './featured';
import {
  getMovieDetails,
  getRecommendations,
  getSimilarMovies,
  getSeasonEpisodes,
  getExternalIds,
  getPopular,
  getTopRated,
  getNowPlaying,
  getAiringThisWeek,
  getRegionalAiring,
  getAiringRail,
} from './detail';
import {
  getDiscover,
  getGenres,
  getWatchProviders,
  getRegions,
  getUpcomingMovies,
  getFutureMovies,
  getRegionalUpcoming,
  getDiscoverByGenre,
  getNewReleases,
} from './discover';
import { getEditorialRail } from './editorial';
import { getPersonDetails } from './person';

export const movieService = {
  searchMovies,
  getFeaturedMovies,
  getTitleLogo,
  getTitleTrailer,
  getCategories,
  getTop10,
  getRecommendations,
  getMovieDetails,
  getSimilarMovies,
  getSeasonEpisodes,
  getExternalIds,
  getPersonDetails,
  getPopular,
  getTopRated,
  getNowPlaying,
  getAiringThisWeek,
  getRegionalAiring,
  getDiscover,
  getGenres,
  getWatchProviders,
  getRegions,
  getUpcomingMovies,
  getFutureMovies,
  getRegionalUpcoming,
  getAiringRail,
  getTrendingThisWeek,
  getDiscoverByGenre,
  getEditorialRail,
  getNewReleases,
};

export { EDITORIAL_RAILS } from './editorial';
export { certificationFromDetail, isBrowsableTitle, normalizeResult, classifyTrailer } from './normalize';