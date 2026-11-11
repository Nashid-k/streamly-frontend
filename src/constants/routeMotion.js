import { DURATION, EASE_OUT, EASE_IN, SPRING } from "./motion";

/* ── Route planes ──────────────────────────────────────────────────────────
   A navigation reads as ONE continuous motion: the leaving page drifts off
   toward the side you came from while the arriving page slides in from the
   direction you are travelling and spring-settles into place. Both planes
   overlap under AnimatePresence mode="popLayout", so the handoff never goes
   through a blank or sequential state. The direction (custom `dir`) is
   computed in Layout: +1 = travelling forward/right (enter from the right),
   -1 = travelling back/left (enter from the left). Transform + opacity only
   — everything here animates on the compositor, never layout. The spring is
   SPRING.SHEET so pages, sheets and the tab rail (+ its pill) share one
   motion vocabulary.

   Two flavours of arrival. The rail variants ("fade-up-subtle" and friends)
   slide AND rise a little — lateral travel with a hint of depth. The details
   push ("fade-up", /watch + /category + collections) is a depth-first move:
   the page rises further and materialises from a 4.5% scale on the same
   spring (scale used to tween on its own clock, which split the motion in
   two), its opacity ramps over MED so the page appears THROUGH the travel
   instead of snapping opaque before it, and the exit recedes toward the
   viewer's back rather than sliding away — pushing into a title should feel
   like walking into it, not swapping slides. */

const ENTER_SPRING = SPRING.SHEET;

export const ROUTE_TRANSITIONS = {
  "fade-up-subtle": {
    x: ENTER_SPRING,
    y: ENTER_SPRING,
    opacity: { duration: DURATION.FAST, ease: EASE_OUT },
  },
  "fade-up": {
    x: ENTER_SPRING,
    y: ENTER_SPRING,
    scale: ENTER_SPRING,
    opacity: { duration: DURATION.MED, ease: EASE_OUT },
  },
  "fade-only": { opacity: { duration: DURATION.FAST, ease: EASE_OUT } },
  crossfade: { opacity: { duration: DURATION.FAST, ease: EASE_OUT } },
};

export const REDUCED_ROUTE_TRANSITION = { duration: 0 };

/* The exiting page is lifted out of flow by AnimatePresence mode="popLayout"
   and keeps its shape while it fades UNDER the entering page — which starts
   at opacity 0. `pointerEvents: "none"` stops the still-fading ghost from
   swallowing the click the viewer just made while the new page is invisible.
// The exit transition is baked into the exit values: exit runs on its own
// clock (ease-in, accelerating away) instead of the enter spring. */
const planeEnter = (dir, { x = 44, y = 0, scale = 1 } = {}) => ({
  opacity: 0,
  x: x * dir,
  y,
  scale,
  translateZ: 0,
  willChange: "transform, opacity",
});

const planeExit = (dir, { x = 30, y = 0, scale = 1 } = {}) => ({
  opacity: 0,
  x: -x * dir,
  y,
  scale,
  pointerEvents: "none",
  translateZ: 0,
  willChange: "transform, opacity",
  transition: { duration: DURATION.MED, ease: EASE_IN },
});

export const ROUTE_VARIANTS = {
  "fade-up-subtle": {
    initial: (dir = 1) => planeEnter(dir, { y: 12, scale: 0.991 }),
    animate: { opacity: 1, x: 0, y: 0, scale: 1, translateZ: 0, willChange: "auto" },
    exit: (dir = 1) => planeExit(dir, { y: -10, scale: 0.996 }),
  },
  "fade-up": {
    initial: (dir = 1) => planeEnter(dir, { y: 34, scale: 0.955 }),
    animate: { opacity: 1, x: 0, y: 0, scale: 1, translateZ: 0, willChange: "auto" },
    /* The depth push: drilling into a title descends INTO the stack, so the
       leaving page recedes (scales down, no upward drift) under the arriving
       one instead of sliding off a rail. Back navigation reverses the depth:
       the details page recedes while the list page surfaces. */
    exit: (dir = 1) => planeExit(dir, { y: 0, scale: 0.965 }),
  },
  /* Direction-neutral characters (search, settings stay phrase-level fades —
     a sliding settings panel reads wrong). */
  "fade-only": {
    initial: { opacity: 0, translateZ: 0, willChange: "opacity" },
    animate: { opacity: 1, translateZ: 0, willChange: "auto" },
    exit: {
      opacity: 0,
      pointerEvents: "none",
      willChange: "opacity",
      transition: { duration: DURATION.FAST, ease: EASE_IN },
    },
  },
  crossfade: {
    initial: { opacity: 0, translateZ: 0, willChange: "opacity" },
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
