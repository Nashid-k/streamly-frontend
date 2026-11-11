import { motion, useReducedMotion } from "framer-motion";
import { DURATION, EASE_OUT } from "../constants/motion";
import { useOptionalPreferences } from "../context/preferences";
import { StreamlyLoader } from "./StreamlyLoader";

/* Suspense fallback for lazy route chunks — the compact neon Streamly spinner
   (routine navigation loading; the animated logo GIF stays reserved for the
   player's video startup). With routeWarmup preloading chunks on idle and on
   hover this rarely renders, but when it does (first visit to a route, a slow
   network) it should feel branded, not like a bare spinner. Reduced motion
   (OS or the in-app preference) swaps the spinning ring for the still logo —
   the CSS ring parks itself under the OS media query, but the in-app
   preference is JS-only, so it is honoured here. */
export default function RouteFallback() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const stillLoader = osReduced || prefs?.reduceMotion === true;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION.FAST, ease: EASE_OUT }}
      aria-busy="true"
      aria-live="polite"
    >
      <div className="streamly-loading-screen streamly-loading-screen--route">
        {stillLoader ? (
          <img
            src="/brand/streamly-logo-transparent.png"
            alt=""
            aria-hidden="true"
            draggable="false"
            style={{
              height: "clamp(3rem, 8vw, 4.5rem)",
              width: "auto",
              objectFit: "contain",
            }}
          />
        ) : (
          <StreamlyLoader size={58} label="Loading Streamly" />
        )}
        <span className="streamly-loading-screen__label">
          Loading your experience
        </span>
      </div>
    </motion.div>
  );
}
