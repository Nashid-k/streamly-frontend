import { FallingLeaves as FallingLeavesLib } from "falling-leaves/react";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";
import { resolveSeasonalEffect } from "../utils/seasonal";

/* Seasonal spring blossoms — powered by `falling-leaves` with pink/white
   petal colors and ginkgo/oval shapes. Mounted once in Layout. Live only when
   the shared resolver (utils/seasonal) says "blossoms": calendar spring
   (Mar 1 -> May 31) under the default theme or the Spring Bloom theme under a
   manual pick, never when Dynamic is off; gated by the `fallingLeaves`
   preference (shared with autumn) and reduced motion. */
export default function SpringBlossoms() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const month = new Date().getMonth();
  const effect = resolveSeasonalEffect({
    dynamic: prefs?.dynamic !== false,
    theme: prefs?.theme,
    month,
  });
  const enabled = effect === "blossoms" && prefs?.fallingLeaves !== false && !reduceMotion;

  if (!enabled) return null;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <FallingLeavesLib
      fullScreen
      count={isMobile ? 16 : 28}
      speed={[0.3, 0.8]}
      wind={[-0.3, 0.5]}
      sway={[0.4, 1.0]}
      rotationSpeed={[-0.8, 0.8]}
      size={[8, 18]}
      shapes={["ginkgo", "oval", "birch"]}
      colors={["#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "var(--white)", "#fdf2f8"]}
      opacity={0.9}
      zIndex={5000}
      respectReducedMotion
    />
  );
}
