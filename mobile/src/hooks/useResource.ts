/* Tiny data hook. The web build uses React Query; a five-screen app does not
 * need a cache layer, but it does need the same non-negotiables: every failure is
 * logged with a [Streamly] scope and surfaced to the user, never swallowed into
 * an empty screen. */

import { useCallback, useEffect, useRef, useState } from "react";

import { describe, logEmptyData, logError } from "../utils/logger";

export interface Resource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useResource<T>(loader: () => Promise<T>, deps: unknown[], label: string): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loader()
      .then((value) => {
        if (cancelled) return;
        if (value == null || (Array.isArray(value) && value.length === 0)) {
          logEmptyData("data", label);
        }
        setData(value);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logError("data", `${label} failed to load.`, err);
        setError(describe(err));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, loading, error, reload };
}
