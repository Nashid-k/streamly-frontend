import { logDebug, logError, logWarn } from '../utils/debugLogger';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const API_KEY = import.meta.env.VITE_TMDB_API_KEY || '522f1f08eda5e03bf93100ba29471d5d';
const REQUEST_TIMEOUT_MS = 10_000;

if (!import.meta.env.VITE_TMDB_API_KEY) {
  logWarn(
    'tmdb',
    'VITE_TMDB_API_KEY is not set — using bundled fallback key. ' +
      'If TMDB returns 401, set VITE_TMDB_API_KEY in .env (see .env.example).',
  );
}

function redact(url) {
  return String(url).replace(/api_key=[^&]*/i, 'api_key=***');
}

async function tmdb(path, params = {}) {
  const url = new URL(`${TMDB_BASE}${path}`);
  url.searchParams.set('api_key', API_KEY);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }
  const safeUrl = redact(url.toString());
  logDebug('tmdb', `GET ${path}`, { url: safeUrl, params });

  const setTimeoutFn =
    (typeof window !== 'undefined' && window.setTimeout) || globalThis.setTimeout;
  const clearTimeoutFn =
    (typeof window !== 'undefined' && window.clearTimeout) || globalThis.clearTimeout;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    logError('tmdb', `Offline — cannot fetch ${path}. Check network connection.`, null, {
      path,
      url: safeUrl,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeoutFn(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) {
      let hint = '';
      if (res.status === 401) hint = 'Invalid/blocked TMDB API key. Check VITE_TMDB_API_KEY in .env.';
      else if (res.status === 404) hint = 'TMDB has no resource at this path/id (removed or wrong media type).';
      else if (res.status === 429) hint = 'TMDB rate limit hit — retry shortly.';
      else if (res.status >= 500) hint = 'TMDB server error — retry shortly.';
      const err = new Error(`TMDB ${path} failed: ${res.status}${hint ? ` — ${hint}` : ''}`);
      err.status = res.status;
      logError('tmdb', `TMDB request failed: ${path}`, err, {
        path,
        status: res.status,
        url: safeUrl,
        online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
      });
      throw err;
    }
    const data = await res.json();
    const resultCount = Array.isArray(data?.results)
      ? data.results.length
      : data
        ? 1
        : 0;
    logDebug('tmdb', `OK ${path}`, { results: resultCount });
    if (Array.isArray(data?.results) && data.results.length === 0) {
      logWarn('tmdb', `TMDB returned 0 results for ${path}. Check query params / media type.`, {
        path,
        url: safeUrl,
        params,
      });
    }
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutErr = new Error(`TMDB ${path} timed out after ${REQUEST_TIMEOUT_MS}ms. Please try again.`);
      logError('tmdb', `TMDB request timed out: ${path}`, timeoutErr, {
        path,
        timeoutMs: REQUEST_TIMEOUT_MS,
        url: safeUrl,
        online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
      });
      throw timeoutErr;
    }
    if (error?.status) throw error; // already logged above
    logError('tmdb', `Network/fetch error for ${path}. Possible offline, CORS, DNS or ad-blocker issue.`, error, {
      path,
      url: safeUrl,
      online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
    });
    throw error;
  } finally {
    clearTimeoutFn(timeout);
  }
}

export default tmdb;
