import { Snowfall as FallingSnow } from "falling-snow/react";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";

/* Seasonal snowfall — powered by the `falling-snow` package (4.4 KB gzipped,
   zero deps, React-ready). Hand-drawn flake styles (classic stellar, dendrite,
   plate, soft bokeh) with real depth-of-field, retina sharpness, reduced-motion
   support (still frame), and pause-on-hidden-tab. Mounted once in Layout so it
   covers every route. Active Nov 1 -> Feb 28/29 (winter) or when the
   Christmas / Winter theme is selected; gated by the `snowfall` preference.
   Intensity reduced for performance: lower count, gentler speed/wind/sway,
   lighter depth. */
export default function Snowfall() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const theme = prefs?.theme;
  const now = new Date();
  const month = now.getMonth();
  // Winter window: November (10) -> February (1), so the season carries across
  // New Year's Day instead of stopping on Dec 31.
  const seasonal =
    month === 10 || month === 11 || month === 0 || month === 1 || theme === "christmas" || theme === "winter";
  const enabled = seasonal && prefs?.snowfall !== false && !reduceMotion;

  if (!enabled) return null;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <FallingSnow
      fullScreen
      flake="mixed"
      count={isMobile ? 30 : 70}
      speed={0.6}
      wind={0.15}
      size={[2, 10]}
      colors={["#ffffff", "#eaf4ff"]}
      opacity={[0.25, 0.7]}
      spin={0.5}
      sway={0.5}
      depth={0.6}
      zIndex={5000}
      respectReducedMotion
    />
  );
}
