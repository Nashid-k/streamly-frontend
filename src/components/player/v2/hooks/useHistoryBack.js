import { useEffect, useRef } from "react";

/**
 * Make the browser Back button close an overlay instead of leaving the page
 * (task.md 3.38).
 *
 * The player is mounted only while it is open, so this runs for exactly the open
 * window. The mechanism is one pushed history entry: Back then walks back to the
 * entry the page was already on and fires `popstate` — which we turn into the
 * same close the shell's own button and Escape already call. Without it, Back
 * navigated away from the page and unmounted the player mid-playback.
 *
 * ── Why a marker in the state, not just "some entry" ──────────────────────────
 * The cleanup has to know whether OUR entry is still the current one. After a
 * Back-close the browser has already moved to the previous entry, so calling
 * `back()` again would skip a page the viewer never asked to leave. The marker
 * answers that directly. `popstate` is also filtered by removing the listener in
 * the same cleanup, so a close triggered by anything else cannot double-fire.
 *
 * This is deliberately applied ONLY to the v2 player; the legacy player keeps its
 * own behaviour until R6 deletes it.
 *
 * @param {object} options
 * @param {boolean} [options.enabled] set false in a context that must not touch
 *   history (tests, embeds).
 * @param {() => void} [options.onBack] called when the viewer presses Back.
 */
const BACK_STATE_KEY = "__pv2Back";

export default function useHistoryBack({ enabled = true, onBack } = {}) {
  /* Latest callback without re-running the effect. A caller commonly passes an
   * inline arrow (`onClose={() => ...}`), whose identity changes every render;
   * depending on it directly would push a new history entry on every render. */
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof window === "undefined" || typeof window.history?.pushState !== "function") {
      return undefined;
    }

    // Same URL, so Back is a state change and not a navigation — no reload, no
    // fetch, just the popstate we are here for.
    window.history.pushState({ [BACK_STATE_KEY]: true }, "");

    const handlePop = () => {
      onBackRef.current?.();
    };
    window.addEventListener("popstate", handlePop);

    return () => {
      window.removeEventListener("popstate", handlePop);
      /* Only peel our own entry. If a Back-close already moved past it, the
       * marker is gone and doing nothing is the correct behaviour. */
      if (window.history.state?.[BACK_STATE_KEY]) {
        window.history.back();
      }
    };
  }, [enabled]);
}

export { BACK_STATE_KEY };
