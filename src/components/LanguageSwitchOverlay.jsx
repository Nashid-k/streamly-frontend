import { useEffect, useRef } from "react";
import { EASE_OUT } from "../constants/motion";
import { motion } from "framer-motion";
import { useIsFetching } from "@tanstack/react-query";
import { LANGUAGE_SENSITIVE_QUERY_PREFIXES } from "../context/preferencesConstants";
import Loader from "./Loader";

/* ── LanguageSwitchOverlay ────────────────────────────────────────────────
   Switching the subtitle/catalog language invalidates every TMDB-backed query
   (the query keys are language-agnostic — see PreferencesContext), so the whole
   catalogue refetches at once. React Query keeps serving the OLD payload while
   that refetch is in flight, which meant the viewer was dropped onto a Home
   page that silently held the previous language's titles for several seconds
   with no indication anything was happening.

   This is the deliberate signal: a branded curtain that holds the viewer in
   Settings while the new-language catalogue lands behind it, then reveals the
   freshly-fetched UI.

   Settle detection is a small state machine, because the refetch is kicked off
   by the same click that mounts this overlay:
     1. wait for the invalidated queries to actually start (fetching > 0) — on
        the first paint they are still 0, so "0" must not mean "done";
     2. once they have been seen in flight, wait for them to fall back to 0;
     3. honour a minimum dwell so this never reads as a flicker, and a hard cap
        so a hung request can never trap the viewer on this screen. */

const MIN_VISIBLE_MS = 700;
const MAX_WAIT_MS = 15000;

export default function LanguageSwitchOverlay({ active, onDone }) {
  const fetching = useIsFetching({
    predicate: (query) => {
      const key = query.queryKey;
      if (!Array.isArray(key) || key.length === 0) return false;
      const head = key[0];
      return LANGUAGE_SENSITIVE_QUERY_PREFIXES.some((prefix) => prefix[0] === head);
    },
  });

  const sawWorkRef = useRef(false);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!active) {
      sawWorkRef.current = false;
      doneRef.current = false;
      return;
    }
    if (fetching > 0) sawWorkRef.current = true;
  }, [active, fetching]);

  useEffect(() => {
    if (!active) return undefined;
    const started = sawWorkRef.current || fetching > 0;
    const finished = sawWorkRef.current && fetching === 0;

    if (finished) {
      const timer = setTimeout(() => {
        if (doneRef.current) return;
        doneRef.current = true;
        onDone?.();
      }, MIN_VISIBLE_MS);
      return () => clearTimeout(timer);
    }
    // Never observed any work: the click may not have triggered a refetch (all
    // queries were already fresh, or the switch was a no-op). Dismiss on the
    // dwell rather than hanging — but give the invalidation a beat to land first.
    if (!started) {
      const grace = setTimeout(() => {
        if (sawWorkRef.current || doneRef.current) return;
        doneRef.current = true;
        onDone?.();
      }, MIN_VISIBLE_MS);
      return () => clearTimeout(grace);
    }
    return undefined;
  }, [active, fetching, onDone]);

  useEffect(() => {
    if (!active) return undefined;
    // Hard cap: a request that never resolves must not strand the viewer here.
    const cap = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      onDone?.();
    }, MAX_WAIT_MS);
    return () => clearTimeout(cap);
  }, [active, onDone]);

  return (
    <motion.div
      className="language-switch-overlay"
      role="status"
      aria-live="polite"
      aria-busy="true"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      <img
        src="/brand/cinejoy-logo.svg"
        alt=""
        aria-hidden="true"
        className="language-switch-overlay__logo logo-legible"
        draggable={false}
      />
      <Loader variant="inline" size="52px" />
      <p className="language-switch-overlay__label">Switching language…</p>
      <p className="language-switch-overlay__hint">
        Loading titles in your new language. This only takes a moment.
      </p>
    </motion.div>
  );
}
