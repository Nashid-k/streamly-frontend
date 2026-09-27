/* Tiny data hook. The web build uses React Query; a five-screen app does not
 * need a cache layer, but it does need the same non-negotiables: every failure is
 * logged with a [Streamly] scope and surfaced to the user, never swallowed into
 * an empty screen.
 *
 * `loading` and `error` are deliberately about "is there anything to show", not
 * "did the last request succeed":
 *   - `loading` is true only while there is NO data. A refresh over existing
 *     content reports `refreshing` instead, so re-entering a screen never throws
 *     away a catalogue the user is already looking at;
 *   - `error` is set only when there is no data to fall back on. A failed
 *     revalidation of a screen that already has content is logged and reported as
 *     `refreshing: false, stale: true`, not turned into an error screen - the same
 *     stale-while-revalidate bargain api/tmdb.ts makes about the network. */

import { useCallback, useEffect, useRef, useState } from "react";

import { describe, logEmptyData, logError, logWarn } from "../utils/logger";

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  stale: boolean;
  error: string | null;
  reload: () => void;
}

export function useResource<T>(loader: () => Promise<T>, deps: unknown[], label: string): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);
  /* Mirror of `data !== null` the effect below can read synchronously, because
   * `data` in its scope would still be the previous render's value. */
  const hasContentRef = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    /* Keep the previous value visible across a reload. */
    setLoading((current) => current && !hasContentRef.current);
    setRefreshing(hasContentRef.current);
    loader()
      .then((value) => {
        if (cancelled) return;
        if (value == null || (Array.isArray(value) && value.length === 0)) {
          logEmptyData("data", label);
        }
        setData(value);
        setStale(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (hasContentRef.current) {
          /* Content is on screen and the refresh did not land: keep the content,
           * mark it stale, and say so in the log rather than on the screen. */
          logWarn("data", `${label} could not be refreshed; showing the saved copy.`, {
            message: describe(err),
          });
          setStale(true);
        } else {
          logError("data", `${label} failed to load.`, err);
          setError(describe(err));
        }
      })
      .finally(() => {
        if (cancelled) return;
        hasContentRef.current = true;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  useEffect(() => {
    hasContentRef.current = data !== null;
  }, [data]);

  const reload = useCallback(() => {
    setError(null);
    setNonce((n) => n + 1);
  }, []);

  return { data, loading, refreshing, stale, error, reload };
}

