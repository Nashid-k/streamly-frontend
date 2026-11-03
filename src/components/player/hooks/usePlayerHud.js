/* The player's transient HUD (volume / aspect / seek / play / pause / hold2x).

   Lifted out of NativePlayerView so the component body stops owning a timer it
   never reads: the HUD is one piece of state plus one auto-dismiss timeout, and
   every caller only ever wants "show this badge for a moment".

   Two details are load-bearing and preserved exactly from the inline version:

   - `showHudRef` is a MIRROR of `showHud`. The play/pause toggle and the seek
     handlers are bound once (media-session actions, once-registered listeners)
     and must be able to flash a badge without capturing the first render's
     `showHud`. Writing the ref during render keeps it a consequence of the
     hook rather than something every call site has to remember.
   - the timer is cleared on unmount. A HUD timeout that outlives the player
     calls `setHud` on a torn-down component.

   The hook owns its own timer ref, so a future redesign can swap the HUD
   entirely without touching the engine. */

import { useCallback, useEffect, useRef, useState } from "react";

/** How long a HUD badge stays on screen before it dismisses itself. */
export const HUD_MS = 1100;

/**
 * @param {object} [options]
 * @param {number} [options.duration] override the auto-dismiss window (ms).
 * @returns {{
 *   hud: { kind: "volume" | "aspect" | "seek" | "play" | "pause" | "hold2x", value?: number } | null,
 *   setHud: (value: any) => void,
 *   showHud: (kind: string, value?: number) => void,
 *   showHudRef: { current: (kind: string, value?: number) => void },
 *   hideHud: () => void,
 * }}
 */
export default function usePlayerHud({ duration = HUD_MS } = {}) {
  const [hud, setHud] = useState(null);
  const timerRef = useRef(null);

  const hideHud = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHud(null);
  }, []);

  const showHud = useCallback(
    (kind, value) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      setHud({ kind, value });
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setHud(null);
      }, duration);
    },
    [duration],
  );

  // Mirror for once-bound closures (togglePlay, media-session handlers) — the
  // same pattern the component uses for its value refs, so a HUD flash from a
  // stale closure still lands on the live setter.
  const showHudRef = useRef(showHud);
  showHudRef.current = showHud;

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return { hud, setHud, showHud, showHudRef, hideHud };
}
