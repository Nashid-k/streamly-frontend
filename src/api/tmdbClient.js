import { logDebug, logError, logWarn } from '../utils/debugLogger';

// Direct TMDB base — used as fallback when no same-origin proxy is deployed
// (plain static hosting, `vite preview`), and by non-browser runtimes.
const DIRECT_BASE = 'https://api.themoviedb.org/3';
// The key is NEVER bundled: deploys supply VITE_TMDB_API_KEY and the same-origin
// /api/tmdb proxy injects its own server-side key. An empty key 401s TMDB.
const API_KEY = import.meta.env.VITE_TMDB_API_KEY || '';
const REQUEST_TIMEOUT_MS = 10_000;

if (!API_KEY) {
  logWarn(
    'tmdb',
    'VITE_TMDB_API_KEY is not set — direct TMDB fallback requests will 401. ' +
      'Set VITE_TMDB_API_KEY in .env/Vercel (see .env.example); the /api/tmdb ' +
      'proxy also injects a server-side key for same-origin requests.',
  );
}

// Same-origin proxy `/api/tmdb`: the Vercel function in api/tmdb.js in production,
// the Vite dev proxy locally. Requests leave from the host's network, so visitors
// on ISPs that block api.themoviedb.org still get data. Null outside browsers,
// where relative URLs cannot run.
function proxyBase() {
  try {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/api/tmdb`;
    }
  } catch {
    // no window — fall through to direct
  }
  return null;
}

function redact(url) {
  return String(url).replace(/api_key=[^&]*/i, 'api_key=***');
}

function getActiveLanguage() {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('setting-defaultLanguage');
      if (stored) {
        const lang = JSON.parse(stored);
        if (typeof lang === 'string' && lang.trim()) return lang.trim();
      }
    }
  } catch {
    // fallback
  }
  return 'en';
}

function buildQuery(params = {}) {
  const q = new URLSearchParams();
    // Send api_key only when the client actually has one: an EMPTY api_key defeats
    // the /api/tmdb proxy's server-side injection (params.has('api_key') is true for
    // an empty value), quietly 401ing every request when the var is unset.
  if (API_KEY) q.set('api_key', API_KEY);
  const activeLang = params.language !== undefined ? params.language : getActiveLanguage();
  if (activeLang && activeLang !== 'none') {
    q.set('language', activeLang);
  }
  for (const [k, v] of Object.entries(params)) {
    if (k === 'language') continue;
    if (v !== undefined && v !== null) q.set(k, v);
  }
  return q.toString();
}

// A deployed proxy always answers JSON (TMDB payload or TMDB error); anything
// else means no function served the request, so the caller retries direct:
//   - text/html → SPA fallback on plain static hosts (index.html, often 200)
//   - text/plain 404 → Vercel NOT_FOUND on a deploy predating the api function
// Headerless responses (unit-test mocks) count as TMDB-shaped.
function proxyLooksLikeTmdb(res) {
  let ct = '';
  try {
    ct = res.headers?.get?.('content-type') || '';
  } catch {
    ct = '';
  }
  if (ct.includes('text/html')) return false;
  // Proxy gateway failures (502, 503, 504) mean the proxy function or upstream edge failed;
  // fall back immediately to direct TMDB.
  if (res.status === 502 || res.status === 503 || res.status === 504) return false;
  if (ct.includes('json')) return true;
  return ct === '';
}

async function handleResponse(res, path, via, safeUrl, params) {
  if (!res.ok) {
    let hint = '';
    if (res.status === 401) hint = 'Invalid/blocked TMDB API key. Check VITE_TMDB_API_KEY in .env.';
    else if (res.status === 404) {
      hint = via === 'proxy'
        ? 'TMDB reports no such resource — or this deployment predates the /api function. Redeploy on Vercel.'
        : 'TMDB has no resource at this path/id (removed or wrong media type).';
    }
    else if (res.status === 429) hint = 'TMDB rate limit hit — retry shortly.';
    else if (res.status >= 500) hint = 'TMDB server error — retry shortly.';
    const err = new Error(`TMDB ${path} failed: ${res.status}${hint ? ` — ${hint}` : ''}`);
    err.status = res.status;
    logError('tmdb', `TMDB request failed via ${via}: ${path}`, err, {
      path,
      via,
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
  logDebug('tmdb', `OK ${path} (via ${via})`, { results: resultCount });
  if (Array.isArray(data?.results) && data.results.length === 0) {
    logWarn('tmdb', `TMDB returned 0 results for ${path}. Check query params / media type.`, {
      path,
      url: safeUrl,
      params,
    });
  }
  return data;
}

async function fetchTmdb(path, params, query) {
  const proxy = proxyBase();
  logDebug('tmdb', `GET ${path}`, { via: proxy ? 'proxy' : 'direct', params });

  const setTimeoutFn =
    (typeof window !== 'undefined' && window.setTimeout) || globalThis.setTimeout;
  const clearTimeoutFn =
    (typeof window !== 'undefined' && window.clearTimeout) || globalThis.clearTimeout;

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    logError('tmdb', `Offline — cannot fetch ${path}. Check network connection.`, null, {
      path,
    });
  }

  const toTimeoutError = () =>
    new Error(`TMDB ${path} timed out after ${REQUEST_TIMEOUT_MS}ms. Please try again.`);

  const controller = new AbortController();
  const timeout = setTimeoutFn(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    // 1. Same-origin proxy first — works on every ISP once deployed.
    if (proxy) {
      let proxyRes = null;
      let proxyUnusable = false;
      try {
        proxyRes = await fetch(`${proxy}${path}?${query}`, { signal: controller.signal });
        // No function served this (static host fallback, stale Vercel
        // deploy, failed function)? Fall back to direct TMDB.
        proxyUnusable = !proxyLooksLikeTmdb(proxyRes);
        if (proxyUnusable) {
          let ct = '';
          try {
            ct = proxyRes.headers?.get?.('content-type') || 'no content-type';
          } catch {
            ct = 'unknown content-type';
          }
          logWarn('tmdb', `Same-origin proxy missing for ${path} (HTTP ${proxyRes.status}, ${ct}) — falling back to direct TMDB.`, { path, status: proxyRes.status });
        }
      } catch (error) {
        if (error?.name === 'AbortError') throw error; // converted once, below
        // Same-origin fetch failed before any response — proxy not deployed
        // in this environment. Direct is the only remaining path.
        logWarn('tmdb', `Same-origin proxy unreachable for ${path} — falling back to direct TMDB.`, {
          path,
          message: error?.message,
        });
        proxyUnusable = true;
      }
      if (!proxyUnusable && proxyRes) {
        return await handleResponse(proxyRes, path, 'proxy', redact(`${proxy}${path}?${query}`), params);
      }
    }

    // 2. Direct TMDB — today's behavior; fails on ISPs that block the API.
    const directUrl = `${DIRECT_BASE}${path}?${query}`;
    const res = await fetch(directUrl, { signal: controller.signal });
    return await handleResponse(res, path, 'direct', redact(directUrl), params);
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutErr = toTimeoutError();
      logError('tmdb', `TMDB request timed out: ${path}`, timeoutErr, {
        path,
        timeoutMs: REQUEST_TIMEOUT_MS,
        online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
      });
      throw timeoutErr;
    }
    if (error?.status) throw error; // already logged above
    logError('tmdb', `Network/fetch error for ${path}. Possible ISP block of api.themoviedb.org (try the same-origin proxy deploy), offline, CORS, DNS or ad-blocker issue.`, error, {
      path,
      online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
    });
    throw error;
  } finally {
    clearTimeoutFn(timeout);
  }
}

/* Identical GETs that are in flight at the same moment share ONE round trip.
   A cold Home load mounts every rail in the same commit, and three of them ask
   for /trending/all/week (featuredMovies, top10, trendingThisWeek) plus any URL
   two genres share — the browser allowed 6 of them to go at once, so the extras
   were pure queueing delay. Each caller still gets its OWN parsed object
   (structuredClone) because the movieService normalizers are free to annotate
   what they are handed. */
const inFlightRequests = new Map();

async function tmdb(path, params = {}) {
  const query = buildQuery(params);
  const key = `${path}?${query}`;
  const shared = inFlightRequests.get(key);
  if (shared) {
    logDebug('tmdb', `deduped concurrent GET ${path}`, { path, params });
    const data = await shared;
    return typeof structuredClone === 'function' ? structuredClone(data) : data;
  }
  const request = fetchTmdb(path, params, query);
  inFlightRequests.set(key, request);
  try {
    return await request;
  } finally {
    inFlightRequests.delete(key);
  }
}

export default tmdb;
