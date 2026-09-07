/**
 * env — single source of truth for backend origins.
 *
 * After the backend migration, the API (Nest app) and the stream router
 * (NetMirror / proxy / direct extraction) run inside ONE server: the merged
 * backend is deployed as the same Vercel serverless function that serves the
 * SPA. So every backend origin — API and stream — is derived from the same
 * `VITE_API_URL` base:
 *
 *   - Production: VITE_API_URL=/api      → stream is same-origin `/api`
 *   - Local dev:  VITE_API_URL=http://localhost:4000/api
 *                                        → stream is http://localhost:4000/api
 *
 * The old standalone `VITE_STREAM_SERVICE_URL` (a separate Render service) is
 * gone. If it is still set to a legacy Render host we ignore it so the app
 * stops probing dead hosts (CORS/503 errors on load).
 */
const API_URL = (import.meta.env.VITE_API_URL || "/api").trim();

/** Render hosts retired when the backend merged into this deployment. */
const LEGACY_STREAM_HOSTS = [
  "streamly-service-stream.onrender.com",
  "streamly-backend-9q7i.onrender.com",
];

/** Origin (scheme + host) of the merged backend, without trailing slash. */
export function backendOrigin() {
  if (/^https?:\/\//.test(API_URL)) {
    return API_URL.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  }
  // Relative VITE_API_URL (production "/api") — the backend is same-origin.
  return "";
}

function isLegacyStreamHost(url) {
  return LEGACY_STREAM_HOSTS.some((host) => url.includes(host));
}

/** Base origin of the merged backend (same for API and stream router). */
export const STREAM_BASE = (() => {
  const raw = (import.meta.env.VITE_STREAM_SERVICE_URL || "").trim();
  if (raw && !isLegacyStreamHost(raw)) {
    // Allow an explicit override (e.g. an external netmirror worker), but
    // never fall back to a retired Render host.
    return raw.replace(/\/api\/?$/, "").replace(/\/+$/, "");
  }
  return backendOrigin();
})();

/** Build a stream-router URL (proxy, netmirror, health) on the backend origin. */
export function streamUrl(path) {
  const base = STREAM_BASE || "";
  return base + (path.startsWith("/") ? path : `/${path}`);
}