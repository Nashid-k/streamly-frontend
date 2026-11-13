import { useEffect, useState } from "react";
import { Snowfall as FallingSnow } from "falling-snow/react";
import { useLocation } from "react-router-dom";
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
   at all when Dynamic is off; gated by the `snowfall` preference.

   Cost control: the renderer is a full-viewport canvas cleared and redrawn
   every animation frame, so the flake count is the whole bill. 18 desktop /
   10 mobile still reads as snow; the old 70/30 was an 8 MP clear plus 70 blits
   60 times a second, forever. It is also suspended over /watch (playback is
   the one place the compositor must stay free) and on low-core/low-memory
   devices, where a decorative overlay must never outrank a frame. */
export default function Snowfall() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const month = new Date().getMonth();
  const { pathname } = useLocation();
  const effect = resolveSeasonalEffect({
    dynamic: prefs?.dynamic !== false,
    theme: prefs?.theme,
    month,
  });

  const lowPower =
    typeof navigator !== "undefined" &&
    (navigator.hardwareConcurrency <= 4 ||
      (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4));

  const enabled =
    effect === "snow" &&
    prefs?.snowfall !== false &&
    !reduceMotion &&
    !lowPower &&
    !pathname.startsWith("/watch/");

  /* Suspend once the banner moment is scrolled away: the renderer clears and
     redraws a full-viewport canvas every animation frame, and snow only reads
     as ambience over the hero/browse banners at the top of a page. Coalesced
     through rAF so scrolling pays one boolean check per frame; the state only
     flips at the threshold, so no re-render churn while scrolling. */
  const [scrolledOut, setScrolledOut] = useState(false);
  useEffect(() => {
    if (!enabled) return undefined;
    let raf = 0;
    const check = () => {
      raf = 0;
      const out = window.scrollY > window.innerHeight * 1.25;
      setScrolledOut((prev) => (prev === out ? prev : out));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
    // pathname: a route change can reset scroll without firing a scroll event,
    // so the deep-scroll suspension must re-check on navigation.
  }, [enabled, pathname]);

  if (!enabled || scrolledOut) return null;

  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  return (
    <FallingSnow
      fullScreen
      flake="mixed"
      count={isMobile ? 10 : 18}
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
