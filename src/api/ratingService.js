import tmdb from "./tmdbClient";
import { fetchOmdbByImdbId } from "./omdbClient";

// OMDb is limited to 1,000 requests/day, so every resolved title (including
// misses) is cached in localStorage for 24h. Revisits never hit the API again.
const CACHE_PREFIX = "streamly:realRatings:";
const CACHE_TTL = 1000 * 60 * 60 * 24;

function readCache(id) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + id);
    if (!raw) return undefined;
    const entry = JSON.parse(raw);
    if (!entry || Date.now() - entry.ts > CACHE_TTL) return undefined;
    return entry.value;
  } catch {
    return undefined;
  }
}

function writeCache(id, value) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + id,
      JSON.stringify({ ts: Date.now(), value })
    );
  } catch {
    // storage unavailable (private mode) — ignore, ratings still work, just refetch
  }
}

// User-initiated refresh affordance: drop the 24h entry so the next fetch hits
// OMDb again (sparingly — it consumes part of the 1,000 req/day quota).
function clearCache(id) {
  try {
    localStorage.removeItem(CACHE_PREFIX + id);
  } catch {
    // ignore — nothing to clear
  }
}

function pickRating(ratings, source) {
  if (!Array.isArray(ratings)) return null;
  const row = ratings.find((r) => r?.Source === source);
  if (!row?.Value) return null;
  if (source === "Internet Movie Database") {
    const n = parseFloat(String(row.Value).split("/")[0]);
    return Number.isFinite(n) ? n : null;
  }
  if (source === "Rotten Tomatoes") {
    const n = parseFloat(String(row.Value).replace("%", ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export const ratingService = {
  // Map an app title id ("movie-123" / "tv-123") to the raw TMDB id + type
  identFromId(id) {
    const isTV =
      typeof id === "string" &&
      (id.startsWith("tv-") || id.includes("-tv-"));
    const match = typeof id === "string" ? id.match(/\d+$/) : null;
    return {
      tmdbId: match ? match[0] : id,
      type: isTV ? "series" : "movie",
    };
  },

  // Resolve REAL ratings via TMDB external_ids → OMDb (IMDb + Rotten Tomatoes).
  // Cached in localStorage for 24h to respect OMDb's daily quota. Returns null
  // when there's no key/imdb id/OMDb data, or on any API failure — callers then
  // fall back to showing only the TMDB community score.
  async getRealRatings(movie) {
    if (!movie?.id) return null;
    const cached = readCache(movie.id);
    if (cached !== undefined) return cached;

    const { tmdbId, type } = ratingService.identFromId(movie.id);
    const kind = type === "series" ? "tv" : "movie";
    try {
      const external = await tmdb(`/${kind}/${tmdbId}/external_ids`);
      if (!external?.imdb_id) {
        writeCache(movie.id, null);
        return null;
      }
      const omdb = await fetchOmdbByImdbId(external.imdb_id, type);
      const result = omdb
        ? {
            imdbId: external.imdb_id,
            imdb: pickRating(omdb.Ratings, "Internet Movie Database"),
            rt: pickRating(omdb.Ratings, "Rotten Tomatoes"),
          }
        : null;
      writeCache(movie.id, result);
      return result;
    } catch {
      writeCache(movie.id, null);
      return null;
    }
  },

  // Manual refresh — clears the cached entry (caller re-fetches immediately)
  clearCache(movieId) {
    if (movieId) clearCache(movieId);
  },
};