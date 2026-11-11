import { FallingLeaves as FallingLeavesLib } from "falling-leaves/react";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";
import { resolveSeasonalEffect } from "../utils/seasonal";

/* Seasonal falling-leaves — powered by the `falling-leaves` package (8 KB,
   zero deps, React-ready). Hand-drawn leaf shapes (maple, oak, ginkgo, birch,
   oval) with sway, spin, tumble. Mounted once in Layout so it covers every
   route. Whether leaves are live is decided solely by the shared resolver
   (utils/seasonal): calendar autumn (Sep 1 -> Oct 31) under the default
   theme, the Autumn theme under a manual pick (which also suspends the
   calendar's snow window — no leaves + snow collision), and never at all
   when Dynamic is off; gated by the `fallingLeaves` preference and reduced
   motion. */
export default function FallingLeaves() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const month = new Date().getMonth();
  const effect = resolveSeasonalEffect({
    dynamic: prefs?.dynamic !== false,
    theme: prefs?.theme,
    month,
  });
  const enabled = effect === "leaves" && prefs?.fallingLeaves !== false && !reduceMotion;

  if (!enabled) return null;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <FallingLeavesLib
      fullScreen
      count={isMobile ? 18 : 32}
      speed={[0.4, 1.0]}
      wind={[-0.4, 0.6]}
      sway={[0.3, 0.9]}
      rotationSpeed={[-1, 1]}
      size={[10, 22]}
      shapes={["maple", "oak", "ginkgo", "birch", "oval"]}
      colors={["#f97316", "#ea580c", "#d97706", "#b45309", "#ca8a04", "#a16207"]}
      opacity={0.85}
      zIndex={5000}
      respectReducedMotion
    />
  );
}
