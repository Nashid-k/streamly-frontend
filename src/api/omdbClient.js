import { logError, logWarn } from "../utils/debugLogger";

const OMDB_BASE = "https://www.omdbapi.com/";
const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY || import.meta.env.VITE_OMDB_APIKEY || "";

export function hasOmdbKey() {
  return !!OMDB_API_KEY;
}

export async function fetchOmdbByImdbId(imdbId, type) {
  if (!imdbId) {
    logWarn("omdb", "fetchOmdbByImdbId called without imdbId — skipping OMDb lookup.", { type });
    return null;
  }
  const url = new URL(OMDB_BASE);
  url.searchParams.set("apikey", OMDB_API_KEY);
  url.searchParams.set("i", imdbId);
  url.searchParams.set("plot", "short");
  if (type) url.searchParams.set("type", type);
  let res;
  try {
    // Ratings sit on the hero/details hot path — a hung connection must release
    // the query instead of leaving the meta row pending forever.
    res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    logError("omdb", `OMDb network error for ${imdbId}. Check connection / ad-blocker.`, error, { imdbId, type });
    throw error;
  }
  if (!res.ok) {
    const err = new Error(`OMDb ${imdbId} failed: ${res.status}`);
    err.status = res.status;
    logError("omdb", `OMDb request failed for ${imdbId}.`, err, { imdbId, type, status: res.status });
    throw err;
  }
  const json = await res.json();
  if (!json || json.Response === "False") {
    logWarn("omdb", `OMDb has no data for ${imdbId} (${json?.Error || "not found"}) — ratings fall back to TMDB only.`, { imdbId, error: json?.Error });
    return null;
  }
  return json;
}
