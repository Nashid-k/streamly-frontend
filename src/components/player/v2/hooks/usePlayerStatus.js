/**
 * React binding for the status line.
 *
 * Thin by design, for the same reason `usePlaybackState` is: all the decisions
 * live in the pure reducer, so the parts worth testing (repeat suppression,
 * dismissal persistence, blank-message clearing) need no renderer.
 */

import { useCallback, useEffect, useMemo, useReducer } from "react";
import {
  DEFAULT_STATUS_TTL_MS,
  INITIAL_STATUS,
  STATUS_KIND,
  selectStatus,
  statusActions,
  statusReducer,
} from "../statusMachine";

/**
 * @param {{ defaultTtlMs?: number }} [options] the lifetime used by any push that
 *   does not bring its own. Individual pushes override it, which is how a
 *   persistent failure coexists with a self-clearing transient one.
 */
export default function usePlayerStatus({ defaultTtlMs = DEFAULT_STATUS_TTL_MS } = {}) {
  const [state, dispatch] = useReducer(statusReducer, INITIAL_STATUS);
  const view = useMemo(() => selectStatus(state), [state]);

  const push = useCallback(
    (message, kind = STATUS_KIND.INFO, key = null, ttlMs = defaultTtlMs) => {
      dispatch(statusActions.push(message, kind, key, ttlMs));
    },
    [dispatch, defaultTtlMs],
  );

  const dismiss = useCallback(() => dispatch(statusActions.dismiss()), [dispatch]);
  const clear = useCallback(() => dispatch(statusActions.clear()), [dispatch]);

  useEffect(() => {
    if (!view.show || view.ttlMs <= 0) return undefined;
    const timer = setTimeout(() => dispatch(statusActions.clear()), view.ttlMs);
    return () => clearTimeout(timer);
  }, [view.show, view.seq, view.ttlMs]);

  return { ...view, push, dismiss, clear };
}
