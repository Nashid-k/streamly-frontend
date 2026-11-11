import { Snowfall as FallingSnow } from "falling-snow/react";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";
import { resolveSeasonalEffect } from "../utils/seasonal";

/* Seasonal snowfall — powered by the `falling-snow` package (4.4 KB gzipped,
   zero deps, React-ready). Hand-drawn flake styles (classic stellar, dendrite,
   plate, soft bokeh) with real depth-of-field, retina sharpness, reduced-motion
   support (still frame), and pause-on-hidden-tab. Mounted once in Layout so it
   covers every route. Whether snow is live is decided solely by the shared
   resolver (utils/seasonal): calendar winter (Nov 1 -> Feb 28/29) under the
   default theme, the Christmas / Winter theme under a manual pick, and never
   at all when Dynamic is off; gated by the `snowfall` preference. Intensity
   reduced for performance: lower count, gentler speed/wind/sway, lighter
   depth. */
export default function Snowfall() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const month = new Date().getMonth();
  const effect = resolveSeasonalEffect({
    dynamic: prefs?.dynamic !== false,
    theme: prefs?.theme,
    month,
  });
  const enabled = effect === "snow" && prefs?.snowfall !== false && !reduceMotion;

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
      colors={["var(--white)", "#eaf4ff"]}
      opacity={[0.25, 0.7]}
      spin={0.5}
      sway={0.5}
      depth={0.6}
      zIndex={5000}
      respectReducedMotion
    />
  );
}
