import { FallingLeaves as FallingLeavesLib } from "falling-leaves/react";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";

/* Seasonal spring blossoms — powered by `falling-leaves` with pink/white
   petal colors and ginkgo/oval shapes. Mounted once in Layout. Active Mar 1
   -> May 31 or when the Spring Bloom theme is selected; gated by the
   `fallingLeaves` preference (shared with autumn) and reduced motion. */
export default function SpringBlossoms() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const theme = prefs?.theme;
  const now = new Date();
  const month = now.getMonth();
  const seasonal = month === 2 || month === 3 || month === 4 || theme === "spring";
  const enabled = seasonal && prefs?.fallingLeaves !== false && !reduceMotion;

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
      colors={["#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#ffffff", "#fdf2f8"]}
      opacity={0.9}
      zIndex={5000}
      respectReducedMotion
    />
  );
}
