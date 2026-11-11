import { Snowfall as FallingSnow } from "falling-snow/react";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";

/* Seasonal summer glow — golden sun motes / pollen drifting over every page,
   reusing the `falling-snow` renderer with its soft flake artwork and warm
   palette. Mounted once in Layout. Active Jun 1 -> Aug 31 (summer) or when the
   Summer Sun theme is selected; gated by the `summerGlow` preference and
   reduced motion. Slow and sparse: it is ambience, not weather. */
export default function SummerGlow() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const theme = prefs?.theme;
  const now = new Date();
  const month = now.getMonth();
  const seasonal = month === 5 || month === 6 || month === 7 || theme === "summer";
  const enabled = seasonal && prefs?.summerGlow !== false && !reduceMotion;

  if (!enabled) return null;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <FallingSnow
      fullScreen
      flake="soft"
      count={isMobile ? 14 : 26}
      speed={0.35}
      wind={0.1}
      size={[3, 10]}
      colors={["#fde68a", "#fcd34d", "#fbbf24", "var(--white)"]}
      opacity={[0.2, 0.55]}
      spin={0.2}
      sway={0.7}
      depth={0.5}
      zIndex={5000}
      respectReducedMotion
    />
  );
}
