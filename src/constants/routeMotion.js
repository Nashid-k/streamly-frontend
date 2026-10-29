import { DURATION, EASE_OUT, EASE_IN } from "./motion";

export const ROUTE_EASE = EASE_OUT;

const BASE_TRANSITION = {
  duration: DURATION.MED,
  ease: ROUTE_EASE,
};

export const ROUTE_TRANSITIONS = {
  "fade-up-subtle": { duration: 0.26, ease: ROUTE_EASE },
  "fade-up": { duration: 0.28, ease: ROUTE_EASE },
  "fade-only": { duration: 0.22, ease: ROUTE_EASE },
  crossfade: { duration: 0.24, ease: ROUTE_EASE },
  "slide-right": { duration: 0.26, ease: ROUTE_EASE },
  "slide-left": { duration: 0.26, ease: ROUTE_EASE },
};

export const ROUTE_EXIT_TRANSITIONS = {
  "fade-up-subtle": { duration: 0.2, ease: EASE_IN },
  "fade-up": { duration: 0.22, ease: EASE_IN },
  "fade-only": { duration: 0.18, ease: EASE_IN },
  crossfade: { duration: 0.18, ease: EASE_IN },
  "slide-right": { duration: 0.22, ease: EASE_IN },
  "slide-left": { duration: 0.22, ease: EASE_IN },
};

export const REDUCED_ROUTE_TRANSITION = { duration: 0 };

/* The exiting page is lifted out of flow by AnimatePresence mode="popLayout"
   and keeps its shape while it fades UNDER the entering page — which starts at
   opacity 0. `pointerEvents: "none"` stops the still-fading ghost from
   swallowing the click the viewer just made while the new page is invisible. */
export const ROUTE_VARIANTS = {
  "fade-up-subtle": {
    initial: { opacity: 0, y: 10, scale: 0.995, transform: "translateZ(0)", willChange: "transform, opacity" },
    animate: { opacity: 1, y: 0, scale: 1, transform: "translateZ(0)", willChange: "auto" },
    exit: { opacity: 0, y: -6, scale: 0.998, pointerEvents: "none", transform: "translateZ(0)", willChange: "transform, opacity" },
  },
  "fade-up": {
    initial: { opacity: 0, y: 14, scale: 0.994, transform: "translateZ(0)", willChange: "transform, opacity" },
    animate: { opacity: 1, y: 0, scale: 1, transform: "translateZ(0)", willChange: "auto" },
    exit: { opacity: 0, y: -8, scale: 0.997, pointerEvents: "none", transform: "translateZ(0)", willChange: "transform, opacity" },
  },
  "fade-only": {
    initial: { opacity: 0, translateZ: 0, willChange: "opacity" },
    animate: { opacity: 1, translateZ: 0, willChange: "auto" },
    exit: { opacity: 0, pointerEvents: "none", willChange: "opacity" },
  },
  crossfade: {
    initial: { opacity: 0, translateZ: 0, willChange: "opacity" },
    animate: { opacity: 1, translateZ: 0, willChange: "auto" },
    exit: { opacity: 0.15, pointerEvents: "none", willChange: "opacity" },
  },
  "slide-right": {
    initial: { opacity: 0, x: -28, scale: 0.994, translateZ: 0, willChange: "transform, opacity" },
    animate: { opacity: 1, x: 0, scale: 1, translateZ: 0, willChange: "auto" },
    exit: { opacity: 0, x: 28, scale: 0.997, pointerEvents: "none", willChange: "transform, opacity" },
  },
  "slide-left": {
    initial: { opacity: 0, x: 28, scale: 0.994, translateZ: 0, willChange: "transform, opacity" },
    animate: { opacity: 1, x: 0, scale: 1, translateZ: 0, willChange: "auto" },
    exit: { opacity: 0, x: -28, scale: 0.997, pointerEvents: "none", willChange: "transform, opacity" },
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
  "slide-right": {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  "slide-left": {
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

export { BASE_TRANSITION };
