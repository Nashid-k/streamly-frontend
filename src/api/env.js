/**
 * env — single source of truth for backend origins.
 *
 * After migrating to direct TMDB API calls, the NestJS backend and stream
 * router are no longer used by movieService. VITE_API_URL and
 * VITE_STREAM_SERVICE_URL are retained here only as stubs so that any
 * remaining references in the codebase (e.g. stream proxy, health checks)
 * do not crash during migration.
 *
 * Active env vars:
 *   - VITE_TMDB_API_KEY — used by tmdbClient.js for all movie/TV data
 *   - VITE_SITE_URL     — canonical origin for SEO/OpenGraph links
 */

import { logWarn } from '../utils/debugLogger';

let warnedStreamStub = false;
function warnStreamStub(caller) {
  if (warnedStreamStub) return;
  warnedStreamStub = true;
  logWarn(
    'env',
    `streamUrl() called by ${caller || 'unknown'} but the stream backend is decommissioned (returns ''). ` +
      'TMDB browsing still works; stream/proxy/thumbnail lookups that need the backend will fail. ' +
      'This is expected after the direct-TMDB migration.',
  );
}

/** @deprecated No longer used by movieService — TMDB calls are direct. */
export const streamUrl = (path = '', caller = '') => {
  warnStreamStub(caller || path || 'unknown');
  return '';
};

/** @deprecated No longer used by movieService — TMDB calls are direct. */
export const STREAM_BASE = '';

/** @deprecated No longer used by movieService — TMDB calls are direct. */
export function backendOrigin() {
  return '';
}