import { apiClient } from "./apiClient";

export const movieService = {
  searchMovies: async (query) => {
    if (!query) return [];
    const res = await apiClient.get(`/movies/search`, {
      params: { q: query, platform: "all", _cb: "v2" },
    });
    return res.data;
  },

  getFeaturedMovies: async () => {
    const res = await apiClient.get(`/movies/featured`, {
      params: { platform: "all", _cb: "v2" },
    });
    return res.data;
  },

  getCategories: async (platform) => {
    const res = await apiClient.get(`/movies/categories`, {
      params: { platform, _cb: "v2" },
    });
    return res.data;
  },

  getTop10: async (platform = "all") => {
    const res = await apiClient.get("/movies/top10", {
      params: { platform, _t: Date.now() },
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
    return res.data;
  },

  getRecommendations: async (id, platform) => {
    const res = await apiClient.get(`/movies/${id}/recommendations`, {
      params: { platform, _t: Date.now() },
      headers: { 'Cache-Control': 'no-store' },
    });
    return res.data;
  },

  getMovieDetails: async (id, platform) => {
    const res = await apiClient.get(`/movies/${id}`, {
      params: { platform, _cb: "v2" },
    });
    return res.data;
  },

  getSimilarMovies: async (id, platform) => {
    const res = await apiClient.get(`/movies/${id}/similar`, {
      params: { platform, _cb: "v2" },
    });
    return res.data;
  },

  getSeasonEpisodes: async (id, seasonNumber, platform) => {
    const res = await apiClient.get(`/movies/${id}/season/${seasonNumber}`, {
      params: { platform, _t: Date.now() },
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
    // Read metadata from X-* response headers
    const totalEpisodes = parseInt(res.headers['x-total-episodes'] || '0', 10);
    const releasedEpisodes = parseInt(res.headers['x-released-episodes'] || '0', 10);
    const isAiring = res.headers['x-is-airing'] === 'true';
    return { episodes: res.data, totalEpisodes, releasedEpisodes, isAiring };
  },

  getExternalIds: async (id, platform) => {
    const res = await apiClient.get(`/movies/${id}/external_ids`, {
      params: { platform, _cb: "v2" },
    });
    return res.data;
  },

  getPersonDetails: async (id) => {
    const res = await apiClient.get(`/movies/person/${id}`);
    return res.data;
  },

  getAiringThisWeek: async (platform = 'all') => {
    const res = await apiClient.get('/movies/airing', {
      params: { platform, _t: Date.now() },
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
    return res.data;
  },

  getTrendingThisWeek: async (platform = 'all') => {
    const res = await apiClient.get('/movies/trending', {
      params: { platform, _t: Date.now() },
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
    });
    return res.data;
  },};
