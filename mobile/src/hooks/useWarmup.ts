/* Pay the connection cost before the user asks for anything.
 *
 * On a phone, the first request to a host is not a request - it is a DNS lookup, a
 * TCP connect and a TLS handshake, and Android is routinely bad at it: a cold
 * resolver, or an IPv6 attempt that has to time out before IPv4 is tried, is
 * several seconds of nothing happening. Paid lazily, that latency lands on
 * whatever the user opened first, which is why the app could sit blank long after
 * the backend had already answered a probe in 300ms.
 *
 * /configuration is 57 bytes and changes about never, so it is the cheapest
 * possible way to open (and keep) the connection. It runs during app start, in
 * parallel with AsyncStorage hydration and the first render, so by the time Home
 * asks for a rail the socket is already warm and the catalogue comes back in one
 * round trip. Its result is cached for a day, so this costs one request per day,
 * not one per launch.
 *
 * A failure here is never fatal and never logged as an error: Home will find out
 * on its own terms, and the breaker in tmdb.ts has already been told. */

import { useEffect } from "react";

import { tmdb } from "../api/tmdb";
import { logInfo, logWarn } from "../utils/logger";

export function useWarmup() {
  useEffect(() => {
    let cancelled = false;
    const started = Date.now();
    tmdb<{ images?: { secure_base_url?: string } }>("/configuration", {}, { ttlMs: 24 * 60 * 60_000 })
      .then((data) => {
        if (cancelled) return;
        logInfo("warmup", "Catalogue connection warmed.", {
          ms: Date.now() - started,
          imageBaseUrl: Boolean(data?.images?.secure_base_url),
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        /* Informational: the app is not broken, the connection is just not warm
         * yet, and the first screen will report any real problem itself. */
        logWarn("warmup", "Could not warm the catalogue connection yet.", {
          message: String((error as Error)?.message || error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);
}
