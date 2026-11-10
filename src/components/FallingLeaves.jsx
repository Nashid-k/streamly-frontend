import { FallingLeaves as FallingLeavesLib } from "falling-leaves/react";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";

/* Seasonal falling-leaves — powered by the `falling-leaves` package (8 KB,
   zero deps, React-ready). Hand-drawn leaf shapes (maple, oak, ginkgo, birch,
   oval) with sway, spin, tumble. Mounted once in Layout so it covers every
   route. Active Sep 1 -> Nov 30 (autumn) or when the Autumn theme is selected;
   gated by the `fallingLeaves` preference and reduced motion. */
export default function FallingLeaves() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const theme = prefs?.theme;
  const now = new Date();
  const month = now.getMonth();
  // Autumn window: September (8) and October (9) only — kept separate from
  // the winter snowfall window (Nov-Dec) so the two seasonal effects never
  // collide on screen.
  const seasonal = month === 8 || month === 9 || theme === "autumn";
  const enabled = seasonal && prefs?.fallingLeaves !== false && !reduceMotion;

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
