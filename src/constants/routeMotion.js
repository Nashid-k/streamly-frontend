import { DURATION, EASE_OUT, EASE_IN } from "./motion";

/* ── Route planes ──────────────────────────────────────────────────────────
   A navigation reads as ONE continuous fade: the leaving page dims out while
   the arriving page fades in, overlapping under AnimatePresence
   mode="popLayout", so the handoff never goes through a blank or sequential
   state.

   (2026-11-11 user order: the old directional rail — a ±44px x-slide with a
   y/scale depth push — read as the whole screen tilting sideways every time a
   route's data landed. Every route now arrives with a clean opacity fade and
   NO directional travel.) Opacity-only keeps the whole handoff compositor-
   owned; the variant names stay because Layout resolves them per route. */

export const ROUTE_TRANSITIONS = {
  "fade-up-subtle": { opacity: { duration: DURATION.FAST, ease: EASE_OUT } },
  "fade-up": { opacity: { duration: DURATION.MED, ease: EASE_OUT } },
  "fade-only": { opacity: { duration: DURATION.FAST, ease: EASE_OUT } },
  crossfade: { opacity: { duration: DURATION.FAST, ease: EASE_OUT } },
};

export const REDUCED_ROUTE_TRANSITION = { duration: 0 };

/* The exiting page is lifted out of flow by AnimatePresence mode="popLayout"
   and fades out UNDER the entering page — which starts at opacity 0.
   `pointerEvents: "none"` stops the still-fading ghost from swallowing the
   click the viewer just made while the new page is invisible. The exit runs
   on its own clock (ease-in, accelerating away) instead of the enter curve. */
const planeEnter = () => ({
  opacity: 0,
  translateZ: 0,
  willChange: "opacity",
});

const planeExit = (duration = DURATION.FAST) => ({
  opacity: 0,
  pointerEvents: "none",
  translateZ: 0,
  willChange: "opacity",
  transition: { duration, ease: EASE_IN },
});

export const ROUTE_VARIANTS = {
  "fade-up-subtle": {
    initial: planeEnter(),
    animate: { opacity: 1, translateZ: 0, willChange: "auto" },
    exit: planeExit(),
  },
  /* The deeper arrivals (/watch + /category + collections) keep a slightly
     longer fade so drilling in still reads as one beat, not a flash. */
  "fade-up": {
    initial: planeEnter(),
    animate: { opacity: 1, translateZ: 0, willChange: "auto" },
    exit: planeExit(DURATION.MED),
  },
  /* Direction-neutral characters (search, settings stay phrase-level fades —
     a sliding settings panel reads wrong). */
  "fade-only": {
    initial: planeEnter(),
    animate: { opacity: 1, translateZ: 0, willChange: "auto" },
    exit: planeExit(),
  },
  crossfade: {
    initial: planeEnter(),
    animate: { opacity: 1, translateZ: 0, willChange: "auto" },
    exit: {
      opacity: 0.15,
      pointerEvents: "none",
      willChange: "opacity",
      transition: { duration: DURATION.FAST, ease: EASE_IN },
    },
  },
};

export const REDUCED_ROUTE_VARIANTS = {
  "fade-up-subtle": {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  "fade-up": {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  "fade-only": {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  crossfade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
};

export function getRouteVariant(pathname = "") {
  if (!pathname) return "fade-up-subtle";
  if (pathname === "/") return "fade-up-subtle";
  if (pathname === "/movies" || pathname === "/series") return "fade-up-subtle";
  if (pathname.startsWith("/search")) return "fade-only";
  if (pathname === "/watchlist" || pathname === "/history") return "fade-up-subtle";
  if (pathname.startsWith("/settings")) return "fade-only";
  // Details and collection pages live deeper in the browsing hierarchy
  if (pathname.startsWith("/watch/") || pathname.startsWith("/category/")) return "fade-up";
  if (pathname.startsWith("/person/")) return "fade-up-subtle";
  if (pathname.startsWith("/genre/")) return "fade-up-subtle";
  if (pathname.startsWith("/collections") || pathname.startsWith("/public-collection") || pathname.startsWith("/explore/collections")) {
    return "fade-up";
  }
  return "fade-up-subtle";
}
