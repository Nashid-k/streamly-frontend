/* Streamly (Android app) configuration.
 *
 * The app is pre-wired: a release APK works the moment it is installed, with no
 * account, no setup screen and nothing to type. That is the whole point of the
 * `DEPLOYED_API_BASE` default below - the same trick the website uses, where the
 * visitor never sees a key.
 *
 * One baked origin buys both halves of the product:
 *   - `<origin>/api/tmdb`        catalogue, with TMDB_API_KEY injected server-side
 *                                (api/tmdb.js:78-100 injects it ONLY when the
 *                                client omits one, so the app sends no key at all),
 *   - `<origin>/api/downloadify` the stream resolver, which scrapes providers
 *                                server-side and therefore cannot be bundled.
 *
 * Two layers still exist, in priority order, because a fork or a self-hosted copy
 * must be able to point somewhere else:
 *   1. RUNTIME settings - typed on the phone in Settings, persisted in AsyncStorage
 *      (`streamly.mobile.settings`).
 *   2. BUILD-TIME env - `EXPO_PUBLIC_*` inlined into the JS bundle (see
 *      .env.example), then `DEPLOYED_API_BASE` as the shipped default.
 *
 * There is deliberately NO TMDB key in the app: it is not needed (the proxy holds
 * it) and shipping one would put a credential in every APK for no gain. The direct
 * api.themoviedb.org path stays available as a fallback for anyone who wants it -
 * note it is blocked on some ISPs, which is the reason the proxy exists at all.
 *
 * The app is a real native client, not the web build in a WebView: it calls TMDB
 * over its own HTTP stack (no CORS involved), resolves streams through the
 * deployed functions, and plays the result in ExoPlayer with the Referer the
 * source host requires. */

import { runtimeSettings } from "./store/settings";

export interface AppConfig {
  /** TMDB read token for direct api.themoviedb.org calls. Empty in a normal build. */
  tmdbApiKey: string;
  /** Catalogue proxy that injects the key server-side, e.g. https://site/api/tmdb. */
  tmdbProxy: string;
  /** Deployed Streamly origin (no trailing slash) - hosts /api/tmdb + /api/downloadify. */
  apiBase: string;
  /** Cloudflare passthrough used only as the playback fallback. */
  relayUrl: string;
  hasTmdbAccess: boolean;
  hasResolver: boolean;
}

const clean = (value: string | undefined | null) => String(value || "").trim();

const stripSlashes = (value: string) => clean(value).replace(/\/+$/, "");

/* Build-time overrides. Kept as functions so a value read at module load can never
 * freeze an empty string into the shipped default's place. */
const ENV = {
  tmdbApiKey: () => clean(process.env.EXPO_PUBLIC_TMDB_API_KEY),
  tmdbProxy: () => stripSlashes(process.env.EXPO_PUBLIC_TMDB_PROXY),
  apiBase: () => stripSlashes(process.env.EXPO_PUBLIC_API_BASE),
  relayUrl: () => clean(process.env.EXPO_PUBLIC_RELAY_URL),
};

/* The shipped default. Public infrastructure, not a secret: it is the same origin
 * the website is served from, and it is what makes the APK usable with zero setup. */
export const DEPLOYED_API_BASE = "https://streamlyvercelin.vercel.app";

/* Cloudflare passthrough, kept as the playback fallback for hosts that need every
 * URI rewritten rather than a Referer header. */
export const DEFAULT_RELAY_URL = "https://streamly-proxy.nashidk1999.workers.dev";

/* Resolved on every read: the runtime layer wins, then build-time env, then the
 * baked deployment. The catalogue proxy is derived from the origin when it is not
 * set explicitly, so one origin is all a normal build needs. */
export function getConfig(): AppConfig {
  const runtime = runtimeSettings();
  const apiBase = stripSlashes(runtime.apiBase || ENV.apiBase()) || DEPLOYED_API_BASE;
  const tmdbProxy =
    stripSlashes(runtime.tmdbProxy || ENV.tmdbProxy()) || (apiBase ? `${apiBase}/api/tmdb` : "");
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

/* True when TMDB is reachable without typing anything - which, thanks to
 * DEPLOYED_API_BASE, is every build. Kept so the Settings copy can tell the user
 * the app is already wired instead of implying something is missing. */
export function isPreconfigured(): boolean {
  return true;
}

export const TMDB_DIRECT_BASE = "https://api.themoviedb.org/3";

/* Timeouts are PER LEG, not per call, and the split is the point.
 *
 * The 12s single budget this replaces was a real bug with two faces:
 *   - it applied to the direct-TMDB FALLBACK too, so on a network where
 *     api.themoviedb.org is blocked (DNS/ISP) a single failed proxy leg could burn
 *     12s and then ANOTHER 12s on the fallback before the user saw an error - which
 *     is where "search failed after 12000ms" came from, and why a search could take
 *     half a minute to report a failure it should have reported in two;
 *   - it was a hard give-up with no retry, so one dropped packet on a train turned
 *     into an error screen.
 * The primary leg is generous (a real answer is worth waiting for, and with the
 * cache most of the time it is not even fetched), the fallback leg is short (it is
 * a bonus route and must not eat the budget), and failures are retried once. */
export const REQUEST_TIMEOUT_MS = 20_000;
export const FALLBACK_TIMEOUT_MS = 4_000;
export const RETRY_BACKOFF_MS = 350;

/* How long a failed route is skipped. Direct TMDB is blocked outright on plenty of
 * networks (it is blocked on the build machine), so retrying it per rail is pure
 * latency; five minutes is long enough to skip the rest of a session's rails. */
export const DIRECT_BREAKER_MS = 5 * 60_000;
export const PROXY_BREAKER_MS = 30_000;

/* Freshness windows, matched to what the data actually is. Trending and rails move
 * on a scale of hours, a search should feel current, a title's details barely
 * change. Anything older than STALE_MS is still shown while it is refetched - a
 * saved catalogue beats an empty screen on a bad connection. */
export const TTL = {
  rail: 15 * 60_000,
  search: 5 * 60_000,
  detail: 30 * 60_000,
  config: 24 * 60 * 60_000,
} as const;
export const STALE_MS = 24 * 60 * 60_000;
