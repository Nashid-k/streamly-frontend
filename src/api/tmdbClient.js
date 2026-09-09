const TMDB_BASE = 'https://api.themoviedb.org/3';
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const REQUEST_TIMEOUT_MS = 10_000;

async function tmdb(path, params = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) throw new Error(`TMDB ${path} failed: ${res.status}`);
    return res.json();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`TMDB ${path} timed out. Please try again.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export default tmdb;
