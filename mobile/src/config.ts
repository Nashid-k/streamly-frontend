/* Streamly (Android app) configuration.
 *
 * Two layers, in priority order:
 *
 *   1. RUNTIME settings - typed on the phone in Settings, persisted in
 *      AsyncStorage (`streamly.mobile.settings`). This is the layer that makes a
 *      shipped APK usable: build-time env is for CI/dev, runtime is for the
 *      device in someone's hand.
 *   2. BUILD-TIME env - `EXPO_PUBLIC_*` inlined into the JS bundle at build time
 *      (see .env.example). Sets the defaults; a blank runtime field falls back
 *      here, so a build that baked in a key keeps working with no typing.
 *
 * Nothing here is a secret-by-design except the TMDB key, which is a public read
 * token (the deployed /api/tmdb proxy exists precisely so it can be omitted).
 *
 * The app is a real native client, not the web build in a WebView: it calls
 * TMDB over its own HTTP stack (no CORS involved), resolves streams through the
 * same Cloudflare relay the web player uses, and hands ExoPlayer a local
 * playlist file. */

import { runtimeSettings } from "./store/settings";

export interface AppConfig {
  /** TMDB read token for direct api.themoviedb.org calls. */
  tmdbApiKey: string;
  /** Catalogue proxy that injects the key server-side, e.g. https://site/api/tmdb. */
  tmdbProxy: string;
  /** Deployed Streamly origin (no trailing slash) - hosts /api/tmdb + /api/downloadify. */
  apiBase: string;
  /** Cloudflare passthrough that injects the Referer/User-Agent sources require. */
  relayUrl: string;
  hasTmdbAccess: boolean;
  hasResolver: boolean;
}

const clean = (value: string | undefined | null) => String(value || "").trim();

const stripSlashes = (value: string) => clean(value).replace(/\/+$/, "");

/* Build-time defaults. Kept as functions so a value read at module load can never
 * freeze an empty string into the runtime layer's place. */
const ENV = {
  tmdbApiKey: () => clean(process.env.EXPO_PUBLIC_TMDB_API_KEY),
  tmdbProxy: () => stripSlashes(process.env.EXPO_PUBLIC_TMDB_PROXY),
  apiBase: () => stripSlashes(process.env.EXPO_PUBLIC_API_BASE),
  relayUrl: () => clean(process.env.EXPO_PUBLIC_RELAY_URL),
};

/* Public infrastructure, safe to ship as a default. */
export const DEFAULT_RELAY_URL = "https://streamly-proxy.nashidk1999.workers.dev";

/* Resolved on every read: the runtime layer wins, build-time env is the
 * fallback, and the relay always has a usable default. */
export function getConfig(): AppConfig {
  const runtime = runtimeSettings();
  const apiBase = stripSlashes(runtime.apiBase || ENV.apiBase());
  const tmdbProxy = stripSlashes(runtime.tmdbProxy || ENV.tmdbProxy()) ||
    (apiBase ? `${apiBase}/api/tmdb` : "");
  const tmdbApiKey = clean(runtime.tmdbApiKey || ENV.tmdbApiKey());
  return {
    tmdbApiKey,
    tmdbProxy,
    apiBase,
    relayUrl: stripSlashes(runtime.relayUrl || ENV.relayUrl()) || DEFAULT_RELAY_URL,
    hasTmdbAccess: Boolean(tmdbApiKey || tmdbProxy),
    hasResolver: Boolean(apiBase),
  };
}

/* True when TMDB can be reached WITHOUT typing anything on the device - i.e. a
 * build that shipped with a key or an API base baked in. Drives the one-time
 * nudge to open Settings, never a wall: the app stays fully usable. */
export function isPreconfigured(): boolean {
  return Boolean(clean(process.env.EXPO_PUBLIC_TMDB_API_KEY) || ENV.tmdbProxy() || ENV.apiBase());
}

export const TMDB_DIRECT_BASE = "https://api.themoviedb.org/3";

export const REQUEST_TIMEOUT_MS = 12_000;
