const OMDB_BASE = "https://www.omdbapi.com/";
// Hardcoded (per project decision). 1,000 requests/day — results are cached
// in localStorage by ratingService so revisits don't burn the quota. If this
// ships publicly, move the key behind a server-side proxy.
const OMDB_API_KEY = "7c3c6453";

export function hasOmdbKey() {
  return true;
}

export async function fetchOmdbByImdbId(imdbId, type) {
  if (!imdbId) return null;
  const url = new URL(OMDB_BASE);
  url.searchParams.set("apikey", OMDB_API_KEY);
  url.searchParams.set("i", imdbId);
  url.searchParams.set("plot", "short");
  if (type) url.searchParams.set("type", type);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`OMDb ${imdbId} failed: ${res.status}`);
  const json = await res.json();
  if (!json || json.Response === "False") return null;
  return json;
}