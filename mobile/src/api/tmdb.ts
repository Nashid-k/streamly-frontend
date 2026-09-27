/* TMDB client for the Android app.
 *
 * Port of src/api/tmdbClient.js + src/api/movieService/normalize.js with two
 * deliberate differences, both because this is a native client and not a browser
 * tab:
 *   1. No same-origin /api/tmdb first hop. There is no same origin; the app goes
 *      straight at TMDB with its own key, or at a configured proxy. React
 *      Native's fetch does not enforce CORS, so the proxy only matters for
 *      keyless setups.
 *   2. Concurrent identical GETs still share ONE round trip (cold Home mounts
 *      every rail in the same commit and three of them ask for /trending/all/week).
 *
 * `normalizeResult` is the FROZEN data contract (see architecture.md §2): the
 * same field names the web rails, details and search depend on, so both clients
 * can share stored titles and the app can be extended without a migration. */

import { getConfig, REQUEST_TIMEOUT_MS, TMDB_DIRECT_BASE } from "../config";
import { logDebug, logEmptyData, logError, logInfo, logWarn } from "../utils/logger";

export interface MediaItem {
  id: string;
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  overview: string;
  description: string;
  longDescription: string;
  imdbRating: number | null;
  year: string | null;
  isSeries: boolean;
  type: "movie" | "tv";
  genres: string[];
  mediaType: string;
  popularity: number;
  originalLanguage: string | null;
}

export interface Episode {
  episodeNumber: number;
  seasonNumber: number;
  title: string;
  overview: string;
  thumbnailUrl: string | null;
  durationMins: number | null;
  airDate: string | null;
  stillExists: boolean;
}

export interface Season {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  airDate: string | null;
}

const GENRE_MAP: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance",
  878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
  10759: "Action & Adventure", 10762: "Kids", 10763: "News", 10764: "Reality",
  10765: "Sci-Fi & Fantasy", 10766: "Soap", 10767: "Talk", 10768: "War & Politics",
};

/* Frozen contract - identical field set to the web build's normalizeResult. */
export function normalizeResult(item: any): MediaItem {
  const isTV =
    item.media_type === "tv" ||
    (item.media_type == null && Boolean(item.first_air_date) && !item.release_date);
  const tmdbId = Number(item.id) || 0;
  return {
    id: isTV ? `tv-${tmdbId}` : `movie-${tmdbId}`,
    tmdbId,
    title: item.title || item.name || "Untitled",
    posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
    backdropUrl: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : null,
    overview: item.overview || "",
    description: item.overview || "",
    longDescription: item.overview || "",
    imdbRating: item.vote_average ? parseFloat(Number(item.vote_average).toFixed(1)) : null,
    year: (item.release_date || item.first_air_date || "").slice(0, 4) || null,
    isSeries: isTV,
    type: isTV ? "tv" : "movie",
    genres: (item.genre_ids || []).map((gid: number) => GENRE_MAP[gid]).filter(Boolean),
    mediaType: item.media_type || (isTV ? "tv" : "movie"),
    popularity: item.popularity || 0,
    originalLanguage: item.original_language || null,
  };
}

/* The numeric TMDB id every stream resolver needs (our stored ids are prefixed
 * with "movie-"/"tv-"). */
export function numericId(id: string): string {
  const match = String(id || "").match(/\d+/);
  return match ? match[0] : "";
}

/* A MediaItem carrying only what the player knows (id/title/type). Progress
 * writes need the full shape; the player navigates by id, so it does not carry
 * the whole record. */
export function minimalMediaItem(id: string, title: string, type: "movie" | "tv"): MediaItem {
  return {
    id,
    tmdbId: Number(numericId(id)) || 0,
    title,
    posterUrl: null,
    backdropUrl: null,
    overview: "",
    description: "",
    longDescription: "",
    imdbRating: null,
    year: null,
    isSeries: type === "tv",
    type,
    genres: [],
    mediaType: type,
    popularity: 0,
    originalLanguage: null,
  };
}

function redact(url: string): string {
  return String(url).replace(/api_key=[^&]*/i, "api_key=***");
}

function buildQuery(path: string, params: Record<string, unknown> = {}, apiKey: string): string {
  const q = new URLSearchParams();
  // An EMPTY api_key defeats the proxy's server-side injection, so only ever send
  // a key we actually have (same rule as the web client).
  if (apiKey) q.set("api_key", apiKey);
  q.set("language", "en");
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    q.set(k, String(v));
  }
  void path;
  return q.toString();
}

const inFlight = new Map<string, Promise<any>>();

async function fetchJson(url: string, path: string, via: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      let hint = "";
      if (res.status === 401) hint = "Invalid/blocked TMDB key (EXPO_PUBLIC_TMDB_API_KEY).";
      else if (res.status === 404) hint = "No such resource at this path/id.";
      else if (res.status === 429) hint = "TMDB rate limit - retry shortly.";
      else if (res.status >= 500) hint = "TMDB server error - retry shortly.";
      const err = new Error(`TMDB ${path} failed: ${res.status}${hint ? ` - ${hint}` : ""}`);
      logError("tmdb", `Request failed via ${via}: ${path}`, err, { path, via, status: res.status });
      throw err;
    }
    return await res.json();
  } catch (error: any) {
    if (error?.name === "AbortError") {
      const timeoutErr = new Error(`TMDB ${path} timed out after ${REQUEST_TIMEOUT_MS}ms.`);
      logError("tmdb", `Request timed out: ${path}`, timeoutErr, { path, via });
      throw timeoutErr;
    }
    if (String(error?.message || "").startsWith("TMDB ")) throw error;
    logError("tmdb", `Network error for ${path} (offline, DNS or blocked host?)`, error, { path, via });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function tmdb<T = any>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  // Read per request: the user can paste credentials in Settings while the app is
  // open, and the very next call must use them.
  const { tmdbApiKey, tmdbProxy } = getConfig();
  const query = buildQuery(path, params, tmdbApiKey);
  const directUrl = `${TMDB_DIRECT_BASE}${path}?${query}`;
  const key = `${path}?${query}`;

  const shared = inFlight.get(key);
  if (shared) {
    logDebug("tmdb", `deduped concurrent GET ${path}`, { path });
    return shared as Promise<T>;
  }

  const request = (async () => {
    if (tmdbProxy) {
      try {
        const data = await fetchJson(`${tmdbProxy}${path}?${query}`, path, "proxy");
        logEmptyCheck(path, data);
        return data;
      } catch (error) {
        logWarn("tmdb", `Proxy ${tmdbProxy} failed - falling back to direct TMDB.`, {
          path,
          message: String((error as Error)?.message || error),
        });
      }
    }
    if (!tmdbApiKey && !tmdbProxy) {
      const err = new Error(
        "TMDB is not configured. Open Settings in the app and enter a TMDB read key, a " +
          "/api/tmdb proxy URL, or the deployed Streamly URL (used for both).",
      );
      logError("tmdb", "No TMDB credentials configured.", err, { path });
      throw err;
    }
    const data = await fetchJson(redact(directUrl), path, "direct");
    logEmptyCheck(path, data);
    return data;
  })();

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

function logEmptyCheck(path: string, data: any) {
  if (Array.isArray(data?.results) && data.results.length === 0) {
    logEmptyData("tmdb", `TMDB ${path}`, { path });
  }
}

/* Connection probe for the Settings screen.
 *
 * It has to be honest about two things, so it lives HERE next to the real client
 * instead of being a fetch() in the screen: it must use the same config
 * resolution and the same proxy-first-then-direct order as every real call, and
 * it must report the route that ACTUALLY answered. A proxy that fails silently
 * falls back to direct TMDB, and a user who thinks they are on a keyless proxy
 * while their own (absent) key is being used deserves to be told. */
export interface TmdbProbeResult {
  via: "proxy" | "direct";
  imageBaseUrl: string | null;
}

export async function probeTmdb(): Promise<TmdbProbeResult> {
  const { tmdbApiKey, tmdbProxy } = getConfig();
  const path = "/configuration";
  const query = buildQuery(path, {}, tmdbApiKey);

  if (tmdbProxy) {
    try {
      const data = await fetchJson(`${tmdbProxy}${path}?${query}`, path, "proxy");
      logInfo("tmdb", "Probe succeeded through the configured proxy.", { proxy: tmdbProxy });
      return { via: "proxy", imageBaseUrl: data?.images?.secure_base_url ?? null };
    } catch (error) {
      logWarn("tmdb", "Probe: the configured proxy failed; will test direct TMDB instead.", {
        proxy: tmdbProxy,
        message: String((error as Error)?.message || error),
      });
    }
  }

  const data = await fetchJson(`${TMDB_DIRECT_BASE}${path}?${query}`, path, "direct");
  logInfo("tmdb", "Probe succeeded against TMDB directly.", { hasKey: Boolean(tmdbApiKey) });
  return { via: "direct", imageBaseUrl: data?.images?.secure_base_url ?? null };
}

/* ── Rail + search endpoints ──────────────────────────────────────────────── */

const asItems = (data: any): MediaItem[] =>
  Array.isArray(data?.results) ? data.results.map(normalizeResult) : [];

export async function getTrending(): Promise<MediaItem[]> {
  return asItems(await tmdb("/trending/all/week"));
}

export async function getTopRated(): Promise<MediaItem[]> {
  return asItems(await tmdb("/movie/top_rated"));
}

export async function getPopular(): Promise<MediaItem[]> {
  return asItems(await tmdb("/trending/all/day"));
}

export async function getNowPlaying(): Promise<MediaItem[]> {
  return asItems(await tmdb("/movie/now_playing"));
}

export async function getAiringThisWeek(): Promise<MediaItem[]> {
  return asItems(await tmdb("/tv/airing_today"));
}

export async function searchMulti(query: string): Promise<MediaItem[]> {
  const q = query.trim();
  if (!q) return [];
  return asItems(await tmdb("/search/multi", { query: q, include_adult: "false" }));
}

export async function getTrailers(id: string): Promise<{ key: string; name: string; type: string }[]> {
  const tmdbId = numericId(id);
  const isTv = String(id).startsWith("tv-");
  const data = await tmdb(`/${isTv ? "tv" : "movie"}/${tmdbId}/videos`);
  const videos: any[] = Array.isArray(data?.results) ? data.results : [];
  const wanted = ["Trailer", "Teaser"];
  return videos
    .filter((v) => v.site === "YouTube" && wanted.includes(v.type) && v.key)
    .slice(0, 4)
    .map((v) => ({ key: v.key, name: v.name, type: v.type }));
}

/* ── Detail ───────────────────────────────────────────────────────────────── */

export interface TitleDetail extends MediaItem {
  runtimeMins: number | null;
  tagline: string;
  status: string;
  voteCount: number;
  cast: { id: number; name: string; character: string; profileUrl: string | null }[];
  seasons: Season[];
  trailerKey: string | null;
}

export async function getDetail(id: string): Promise<TitleDetail> {
  const tmdbId = numericId(id);
  const isTv = String(id).startsWith("tv-");
  const kind = isTv ? "tv" : "movie";
  const [detail, credits, videos] = await Promise.all([
    tmdb(`/${kind}/${tmdbId}`, { append_to_response: "external_ids" }),
    tmdb(`/${kind}/${tmdbId}/credits`),
    tmdb(`/${kind}/${tmdbId}/videos`),
  ]);

  const trailer = (videos?.results || []).find(
    (v: any) => v.site === "YouTube" && v.type === "Trailer" && v.key,
  );

  return {
    ...normalizeResult({ ...detail, media_type: kind }),
    runtimeMins: detail.runtime || null,
    tagline: detail.tagline || "",
    status: detail.status || "",
    voteCount: detail.vote_count || 0,
    imdbRating: detail.vote_average ? parseFloat(Number(detail.vote_average).toFixed(1)) : null,
    trailerKey: trailer?.key || null,
    cast: (credits?.cast || []).slice(0, 12).map((c: any) => ({
      id: c.id,
      name: c.name,
      character: c.character || "",
      profileUrl: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
    })),
    seasons: (detail.seasons || [])
      .filter((s: any) => s.season_number > 0)
      .map((s: any) => ({
        seasonNumber: s.season_number,
        name: s.name || `Season ${s.season_number}`,
        episodeCount: s.episode_count || 0,
        airDate: s.air_date || null,
      })),
  };
}

export async function getEpisodes(id: string, season: number): Promise<Episode[]> {
  const tmdbId = numericId(id);
  const isTv = String(id).startsWith("tv-");
  if (!isTv) return [];
  const data = await tmdb(`/tv/${tmdbId}/season/${season}`);
  const episodes: any[] = Array.isArray(data?.episodes) ? data.episodes : [];
  return episodes.map((e) => ({
    episodeNumber: e.episode_number,
    seasonNumber: e.season_number ?? season,
    title: e.name || `Episode ${e.episode_number}`,
    overview: e.overview || "",
    thumbnailUrl: e.still_path ? `https://image.tmdb.org/t/p/w300${e.still_path}` : null,
    durationMins: e.runtime || null,
    airDate: e.air_date || null,
    stillExists: Boolean(e.still_path),
  }));
}

/* An episode is playable once its air date is not in the future (null counts as
 * aired). SAME rule as the web build's utils/titleDetails.js isEpAired, so the
 * app and the site never disagree about what can be played. */
export function isEpAired(ep: Pick<Episode, "airDate">, now = new Date()): boolean {
  if (!ep?.airDate) return true;
  const t = new Date(ep.airDate).getTime();
  return !Number.isFinite(t) || t <= now.getTime();
}
