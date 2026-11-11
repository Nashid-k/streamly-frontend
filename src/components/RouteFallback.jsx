import { motion, useReducedMotion } from "framer-motion";
import { DURATION, EASE_OUT } from "../constants/motion";
import { useOptionalPreferences } from "../context/preferences";

/* Suspense fallback for lazy route chunks — the neon Streamly page loader
   (public/brand/streamly-page-loader.gif) centred on the page canvas, shown
   while the next route's chunk streams in. With routeWarmup preloading chunks
   on idle and on hover this rarely renders, but when it does (first visit to a
   route, a slow network) it should feel branded, not like a bare spinner.
   Reduced motion (OS or the in-app preference) swaps the animated GIF for the
   still logo — an animated GIF cannot be paused by CSS, so the honest
   fallback is the static mark. */
export default function RouteFallback() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const stillLoader = osReduced || prefs?.reduceMotion === true;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION.FAST, ease: EASE_OUT }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "6rem var(--content-gutter, 2rem) 4rem",
        minHeight: "60dvh",
        width: "100%",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      <img
        src={stillLoader ? "/brand/streamly-logo-transparent.png" : "/brand/streamly-page-loader.gif"}
        alt="Loading Streamly"
        aria-hidden="true"
        draggable="false"
        style={{
          width: "auto",
          height: stillLoader ? "clamp(3rem, 8vw, 4.5rem)" : "clamp(5.5rem, 12vw, 8rem)",
          maxWidth: "min(70vw, 340px)",
          objectFit: "contain",
        }}
      />
    </motion.div>
  );
}
