import { Snowfall as FallingSnow } from "falling-snow/react";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";

/* Seasonal snowfall — powered by the `falling-snow` package (4.4 KB gzipped,
   zero deps, React-ready). Hand-drawn flake styles (classic stellar,
   dendrite, plate, soft bokeh) with real depth-of-field, retina sharpness,
   reduced-motion support (still frame), and pause-on-hidden-tab. Mounted once
   in Layout so it covers every route. Active Nov 1 -> Dec 31 or when the
   Christmas theme is selected; gated by the `snowfall` preference. */
export default function Snowfall() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const theme = prefs?.theme;
  const now = new Date();
  const month = now.getMonth();
  const seasonal = month === 10 || month === 11 || theme === "christmas";
  const enabled = seasonal && prefs?.snowfall !== false && !reduceMotion;

  if (!enabled) return null;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <FallingSnow
      fullScreen
      flake="mixed"
      count={isMobile ? 90 : 180}
      speed={1}
      wind={0.25}
      size={[3, 14]}
      colors={["#ffffff", "#eaf4ff", "#f0f8ff"]}
      opacity={[0.3, 0.9]}
      spin={1}
      sway={1}
      depth={1}
      zIndex={5000}
      respectReducedMotion
    />
  );
}
