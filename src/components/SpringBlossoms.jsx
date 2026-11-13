import { useState, useEffect } from "react";
import { FallingLeaves as FallingLeavesLib } from "falling-leaves/react";
import { useLocation } from "react-router-dom";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";
import { resolveSeasonalEffect } from "../utils/seasonal";

/* Seasonal spring blossoms — powered by `falling-leaves` with pink/white
   petal colors and ginkgo/oval shapes. Mounted once in Layout. Live only when
   the shared resolver (utils/seasonal) says "blossoms": calendar spring
   (Mar 1 -> May 31) under the default theme or the Spring Bloom theme under a
   manual pick, never when Dynamic is off (the single seasonal toggle); gated
   by reduced motion and low-power devices. */
export default function SpringBlossoms() {
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
  const enabled = effect === "blossoms" && !reduceMotion && !lowPower && !pathname.startsWith("/watch/");
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
