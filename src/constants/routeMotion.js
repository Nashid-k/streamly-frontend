import { DURATION, EASE_OUT } from "./motion";

export const ROUTE_EASE = EASE_OUT;

const BASE_TRANSITION = {
  duration: DURATION.MED,
  ease: ROUTE_EASE,
};

export const ROUTE_TRANSITIONS = {
  "fade-up-subtle": { duration: 0.24, ease: ROUTE_EASE },
  "fade-up": { duration: 0.26, ease: ROUTE_EASE },
  "fade-only": { duration: 0.2, ease: ROUTE_EASE },
  crossfade: { duration: 0.22, ease: ROUTE_EASE },
};

export const ROUTE_EXIT_TRANSITIONS = {
  "fade-up-subtle": { duration: 0.18, ease: ROUTE_EASE },
  "fade-up": { duration: 0.2, ease: ROUTE_EASE },
  "fade-only": { duration: 0.16, ease: ROUTE_EASE },
  crossfade: { duration: 0.18, ease: ROUTE_EASE },
};

export const REDUCED_ROUTE_TRANSITION = { duration: 0 };

export const ROUTE_VARIANTS = {
  "fade-up-subtle": {
    initial: { opacity: 0, y: 10, scale: 0.995, translateZ: 0, willChange: "transform, opacity" },
    animate: { opacity: 1, y: 0, scale: 1, translateZ: 0, willChange: "auto" },
    exit: { opacity: 0, y: -6, scale: 0.998, translateZ: 0, willChange: "transform, opacity" },
  },
  "fade-up": {
    initial: { opacity: 0, y: 14, scale: 0.994, translateZ: 0, willChange: "transform, opacity" },
    animate: { opacity: 1, y: 0, scale: 1, translateZ: 0, willChange: "auto" },
    exit: { opacity: 0, y: -8, scale: 0.997, translateZ: 0, willChange: "transform, opacity" },
  },
  "fade-only": {
    initial: { opacity: 0, translateZ: 0, willChange: "opacity" },
    animate: { opacity: 1, translateZ: 0, willChange: "auto" },
    exit: { opacity: 0, translateZ: 0, willChange: "opacity" },
  },
  crossfade: {
    initial: { opacity: 0, translateZ: 0, willChange: "opacity" },
    animate: { opacity: 1, translateZ: 0, willChange: "auto" },
    exit: { opacity: 0, translateZ: 0, willChange: "opacity" },
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
  if (pathname.startsWith("/title/")) return "fade-up";
  if (pathname.startsWith("/person/")) return "fade-up-subtle";
  if (pathname.startsWith("/genre/")) return "fade-up-subtle";
  if (pathname.startsWith("/collections") || pathname.startsWith("/public-collection")) {
    return "fade-up-subtle";
  }
  return "fade-up-subtle";
}

export { BASE_TRANSITION };
