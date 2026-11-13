import { useState, useEffect } from "react";
import { Snowfall as FallingSnow } from "falling-snow/react";
import { useLocation } from "react-router-dom";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";
import { resolveSeasonalEffect } from "../utils/seasonal";

/* Seasonal summer glow — golden sun motes / pollen drifting over every page,
   reusing the `falling-snow` renderer with its soft flake artwork and warm
   palette. Mounted once in Layout. Live only when the shared resolver
   (utils/seasonal) says "glow": calendar summer (Jun 1 -> Aug 31) under the
   default theme or the Summer Sun theme under a manual pick, never when
   Dynamic is off (the single seasonal toggle); gated by reduced motion and
   low-power devices. Slow and sparse: it is ambience, not weather. */
export default function SummerGlow() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const { pathname } = useLocation();
  const month = new Date().getMonth();
  const effect = resolveSeasonalEffect({
    dynamic: prefs?.dynamic !== false,
    theme: prefs?.theme,
    month,
  });
  const lowPower =
    typeof navigator !== "undefined" &&
    (navigator.hardwareConcurrency <= 4 ||
      (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4));
  const enabled = effect === "glow" && !reduceMotion && !lowPower && !pathname.startsWith("/watch/");
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
  }, [enabled, pathname]);

  if (!enabled || scrolledOut) return null;

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
