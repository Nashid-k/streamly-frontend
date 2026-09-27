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

import {
  DIRECT_BREAKER_MS,
  FALLBACK_TIMEOUT_MS,
  getConfig,
  PROXY_BREAKER_MS,
  REQUEST_TIMEOUT_MS,
  RETRY_BACKOFF_MS,
  STALE_MS,
  TMDB_DIRECT_BASE,
  TTL,
} from "../config";
import { logDebug, logEmptyData, logError, logInfo, logWarn } from "../utils/logger";
import { readCache, writeCache } from "./cache";

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

/* Route health, so a dead host is not paid for twice.
 *
 * api.themoviedb.org is blocked DNS-side on a lot of networks (including the
 * machine this was built on). Without this, EVERY rail and EVERY search that
 * arrived while the proxy was slow first waited out its own timeout and then
 * waited out another full one on the direct fallback - a 12s error, a second
 * 12s, and nothing on screen. After one failure the fallback is skipped for
 * DIRECT_BREAKER_MS; if the proxy itself is the thing that is failing, the direct
 * leg is tried FIRST for the next PROXY_BREAKER_MS instead of after it. */
const breaker = { proxyUntil: 0, directUntil: 0 };

function noteFailure(route: "proxy" | "direct") {
  const window = route === "proxy" ? PROXY_BREAKER_MS : DIRECT_BREAKER_MS;
  if (route === "proxy") breaker.proxyUntil = Date.now() + window;
  else breaker.directUntil = Date.now() + window;
  logWarn("tmdb", `${route} route marked unhealthy for ${Math.round(window / 1000)}s.`, {
    route,
    windowMs: window,
  });
}

function noteSuccess(route: "proxy" | "direct") {
  if (route === "proxy") breaker.proxyUntil = 0;
  else breaker.directUntil = 0;
}

/* A retry is worth it for the failures that are usually transient (a dropped
 * packet, a cold lambda, a 5xx, a rate limit) and pointless for the ones that are
 * not (401 bad key, 404 no such title) - retrying those only delays the answer. */
function isWorthRetrying(error: unknown): boolean {
  const message = String((error as Error)?.message || "");
  if (/\b(401|403|404)\b/.test(message)) return false;
  return /timed out|Network error|failed: (429|5\d\d)/.test(message);
}

async function fetchJson(url: string, path: string, via: string, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
      const timeoutErr = new Error(`TMDB ${path} timed out after ${timeoutMs}ms via ${via}.`);
      logError("tmdb", `Request timed out: ${path}`, timeoutErr, { path, via, timeoutMs });
      throw timeoutErr;
    }
    if (String(error?.message || "").startsWith("TMDB ")) throw error;
    logError("tmdb", `Network error for ${path} (offline, DNS or blocked host?)`, error, { path, via });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithRetry(url: string, path: string, via: string, timeoutMs: number) {
  try {
    return await fetchJson(url, path, via, timeoutMs);
  } catch (error) {
    if (!isWorthRetrying(error)) throw error;
    logInfo("tmdb", `Retrying ${path} via ${via} once.`, {
      path,
      via,
      reason: String((error as Error)?.message || error),
    });
    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    return fetchJson(url, path, via, timeoutMs);
  }
}

export interface TmdbOptions {
  /** How long a cached response is served without revalidating. */
  ttlMs?: number;
  /** Ignore the cache and force a network read (pull-to-refresh). */
  forceFresh?: boolean;
}

export async function tmdb<T = any>(
  path: string,
  params: Record<string, unknown> = {},
  options: TmdbOptions = {},
): Promise<T> {
  // Read per request: the user can paste credentials in Settings while the app is
  // open, and the very next call must use them.
  const { tmdbApiKey, tmdbProxy } = getConfig();
  const query = buildQuery(path, params, tmdbApiKey);
  const directUrl = `${TMDB_DIRECT_BASE}${path}?${query}`;
  /* The cache key deliberately omits the api_key: it is a credential, not part of
   * the question, and keying on it would orphan every entry the day a key changed. */
  const key = `${path}?${new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, String(v)]),
  ).toString()}`;

  const fresh = async (): Promise<T> => {
    if (!tmdbProxy && !tmdbApiKey) {
      const err = new Error(
        "TMDB is not configured. Open Settings in the app and enter a TMDB read key, a " +
          "/api/tmdb proxy URL, or the deployed Streamly URL (used for both).",
      );
      logError("tmdb", "No TMDB credentials configured.", err, { path });
      throw err;
    }

    /* Which routes exist, and which of them are worth touching. A route on
     * cooldown is only skipped when there is somewhere else to go - if the proxy is
     * the ONLY way to TMDB, a cold cache still tries it rather than refusing. */
    const proxyOpen = Date.now() >= breaker.proxyUntil;
    const directOpen = Date.now() >= breaker.directUntil;
    const order: ("proxy" | "direct")[] = [];
    if (tmdbProxy) {
      if (proxyOpen || !tmdbApiKey) order.push("proxy");
      if (tmdbApiKey && (directOpen || !tmdbProxy)) order.push("direct");
    } else if (tmdbApiKey) {
      order.push("direct");
    }

    let lastError: unknown = null;
    for (const route of order) {
      try {
        const url = route === "proxy" ? `${tmdbProxy}${path}?${query}` : redact(directUrl);
        const data = await fetchJsonWithRetry(
          url,
          path,
          route,
          route === "proxy" ? REQUEST_TIMEOUT_MS : FALLBACK_TIMEOUT_MS,
        );
        noteSuccess(route);
        return data as T;
      } catch (error) {
        noteFailure(route);
        lastError = error;
      }
    }
    throw lastError || new Error(`TMDB ${path} could not be reached.`);
  };

  /* Concurrent identical GETs still share ONE round trip: a cold Home mount fires
   * every rail in the same commit and three of them ask for /trending/all/week.
   * The dedup wraps the NETWORK leg only, so a cached answer still returns
   * instantly instead of waiting behind a refresh. */
  const netKey = `net:${key}`;
  const request = async (): Promise<T> => {
    const shared = inFlight.get(netKey);
    if (shared) {
      logDebug("tmdb", `deduped concurrent GET ${path}`, { path });
      return shared as Promise<T>;
    }
    const promise = fresh();
    inFlight.set(netKey, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(netKey);
    }
  };

  /* Stale-while-revalidate. Fresh cache: answer instantly, no network. Stale but
   * usable: answer instantly and refresh behind the user's back - the catalogue is
   * on screen before the request is even sent, which is the whole point. */
  if (!options.forceFresh) {
    const entry = await readCache<T>(key);
    if (entry) {
      const age = Date.now() - entry.savedAt;
      if (age < (options.ttlMs ?? TTL.rail)) {
        logDebug("tmdb", `cache hit ${path}`, { path, ageMs: age });
        return entry.data;
      }
      if (age < STALE_MS) {
        logInfo("tmdb", `Serving stale ${path} while revalidating.`, { path, ageMs: age });
        void request()
          .then((data) => writeCache(key, data))
          .catch((error) =>
            logWarn("tmdb", `Background revalidate failed for ${path}; keeping the saved copy.`, {
              path,
              message: String((error as Error)?.message || error),
            }),
          );
        return entry.data;
      }
    }
  }

  const data = await request();
  void writeCache(key, data);
  logEmptyCheck(path, data);
  return data as T;
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
      const data = await fetchJson(`${tmdbProxy}${path}?${query}`, path, "proxy", REQUEST_TIMEOUT_MS);
      logInfo("tmdb", "Probe succeeded through the configured proxy.", { proxy: tmdbProxy });
      return { via: "proxy", imageBaseUrl: data?.images?.secure_base_url ?? null };
    } catch (error) {
      logWarn("tmdb", "Probe: the configured proxy failed; will test direct TMDB instead.", {
        proxy: tmdbProxy,
        message: String((error as Error)?.message || error),
      });
    }
  }

  const data = await fetchJson(`${TMDB_DIRECT_BASE}${path}?${query}`, path, "direct", FALLBACK_TIMEOUT_MS);
  logInfo("tmdb", "Probe succeeded against TMDB directly.", { hasKey: Boolean(tmdbApiKey) });
  return { via: "direct", imageBaseUrl: data?.images?.secure_base_url ?? null };
}

/* ── Rail + search endpoints ──────────────────────────────────────────────── */

const asItems = (data: any): MediaItem[] =>
  Array.isArray(data?.results) ? data.results.map(normalizeResult) : [];

export async function getTrending(): Promise<MediaItem[]> {
  return asItems(await tmdb("/trending/all/week", {}, { ttlMs: TTL.rail }));
}

export async function getTopRated(): Promise<MediaItem[]> {
  return asItems(await tmdb("/movie/top_rated", {}, { ttlMs: TTL.rail }));
}

export async function getPopular(): Promise<MediaItem[]> {
  return asItems(await tmdb("/trending/all/day", {}, { ttlMs: TTL.rail }));
}

export async function getNowPlaying(): Promise<MediaItem[]> {
  return asItems(await tmdb("/movie/now_playing", {}, { ttlMs: TTL.rail }));
}

export async function getAiringThisWeek(): Promise<MediaItem[]> {
  return asItems(await tmdb("/tv/airing_today", {}, { ttlMs: TTL.rail }));
}

export async function searchMulti(query: string): Promise<MediaItem[]> {
  const q = query.trim();
  if (!q) return [];
  /* Short TTL: a search is the one screen where "current" is the whole point, but
   * the answer is still cached so retyping a query, or coming back from a title,
   * paints instantly instead of spinning. */
  return asItems(await tmdb("/search/multi", { query: q, include_adult: "false" }, { ttlMs: TTL.search }));
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
    tmdb(`/${kind}/${tmdbId}`, { append_to_response: "external_ids" }, { ttlMs: TTL.detail }),
    tmdb(`/${kind}/${tmdbId}/credits`, {}, { ttlMs: TTL.detail }),
    tmdb(`/${kind}/${tmdbId}/videos`, {}, { ttlMs: TTL.detail }),
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
  const data = await tmdb(`/tv/${tmdbId}/season/${season}`, {}, { ttlMs: TTL.detail });
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
