import { pageLoaders } from "./routeLoaders";
import { logDebug, logWarn } from "../utils/debugLogger";

/* Route chunk warm-up — the React.lazy equivalent of Cinejoy's
   `data-sveltekit-preload-data="hover"` + install-time route precache.

   Two triggers, one shared promise map:
   1. IDLE: after window load, every page chunk is imported one per idle slice,
      so the first click on any nav item or card finds the module already in
      the registry and Suspense never drops a full-page Loader.
   2. HOVER/FOCUS on any same-origin link: the destination's chunk starts
      downloading the moment a pointer lands on (or a keyboard focuses) its
      anchor — navigation after that is instant.

   The ESM module registry itself dedupes downloads, so React.lazy's own
   import on the click after a warm pass resolves from cache either way. */

// Exact paths first; prefix rules cover the param routes. Legacy aliases map
// to their redirect target so hovering /mylist warms the page the router
// actually lands on.
const EXACT = {
  "/": pageLoaders.home,
  "/movies": pageLoaders.discovery,
  "/series": pageLoaders.discovery,
  "/search": pageLoaders.search,
  "/watchlist": pageLoaders.watchlist,
  "/mylist": pageLoaders.watchlist,
  "/history": pageLoaders.history,
  "/continue-watching": pageLoaders.history,
  "/settings": pageLoaders.settings,
  "/explore/collections": pageLoaders.exploreCollections,
};
const PREFIX = [
  ["/category/", pageLoaders.category],
  ["/genre/", pageLoaders.genre],
  ["/watch/", pageLoaders.titleDetails],
  ["/person/", pageLoaders.personDetails],
  ["/collections/", pageLoaders.publicCollection],
];

export function routeLoaderForPath(pathname) {
  if (!pathname) return null;
  // "/movies/" and "/movies" are the same route; only the root keeps its slash.
  const path =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const exact = EXACT[path];
  if (exact) return exact;
  for (const [prefix, loader] of PREFIX) {
    if (path.startsWith(prefix)) return loader;
  }
  return null;
}

// Idle order: the home page (already in flight at boot) first, then every nav
// destination, then the rail/card destinations (details beats person — card
// clicks dwarf person-link clicks), then the long-tail collection routes.
export const WARM_ORDER = [
  pageLoaders.home,
  pageLoaders.discovery,
  pageLoaders.search,
  pageLoaders.watchlist,
  pageLoaders.history,
  pageLoaders.settings,
  pageLoaders.titleDetails,
  pageLoaders.category,
  pageLoaders.genre,
  pageLoaders.personDetails,
  pageLoaders.publicCollection,
  pageLoaders.exploreCollections,
  pageLoaders.notFound,
];

const started = new Map();

function warm(loader) {
  let promise = started.get(loader);
  if (!promise) {
    try {
      promise = loader();
    } catch (err) {
      logWarn("routeWarmup", "Route chunk import threw synchronously.", { err });
      return Promise.resolve();
    }
    const tracked = promise.catch((err) => {
      // A failed warm must not poison the retry: React.lazy will import again
      // on the actual click, and the module registry does the right thing.
      started.delete(loader);
      logWarn("routeWarmup", "Warm import failed — click still fetches it lazily.", { err });
      return null;
    });
    started.set(loader, tracked);
  }
  return promise;
}

// Data-saver / slow connections pay for every byte twice (warm + real use is
// free here, but a cold device on 2G should not spend its load budget on
// speculation).
function warmDisabled() {
  const conn = typeof navigator !== "undefined" ? navigator.connection : undefined;
  if (!conn) return false;
  return Boolean(conn.saveData) || /(^|-)2g$/.test(conn.effectiveType || "");
}

const nextIdle = (cb) =>
  "requestIdleCallback" in window
    ? window.requestIdleCallback(cb, { timeout: 5000 })
    : window.setTimeout(cb, 300);

function loaderForAnchor(anchor) {
  if (!anchor?.href || !anchor.hasAttribute) return null;
  if (anchor.origin !== window.location.origin) return null;
  if (anchor.hasAttribute("download")) return null;
  if (anchor.hasAttribute("data-no-prefetch")) return null;
  return routeLoaderForPath(anchor.pathname);
}

/**
 * Starts idle warm-up + delegated link hover/focus prefetch.
 * Returns a cleanup for React (StrictMode double-mount safe: the cancelled
 * flag stops an in-flight idle loop).
 */
export function startRouteWarmup() {
  if (typeof window === "undefined" || typeof document === "undefined") return () => {};

  if (warmDisabled()) {
    logDebug("routeWarmup", "Skipped — data saver or slow connection.");
    return () => {};
  }

  const warmFromEvent = (event) => {
    const anchor = event.target?.closest?.("a[href]");
    const loader = loaderForAnchor(anchor);
    if (loader) warm(loader);
  };
  // mouseover bubbles (mouseenter does not), so one document listener covers
  // every link; repeated hovers hit the promise map and cost a lookup.
  document.addEventListener("mouseover", warmFromEvent);
  document.addEventListener("focusin", warmFromEvent);

  let cancelled = false;
  const warmAll = async () => {
    for (const loader of WARM_ORDER) {
      if (cancelled) return;
      await warm(loader);
      await new Promise((resolve) => {
        if (cancelled) resolve();
        else nextIdle(resolve);
      });
    }
    if (!cancelled) logDebug("routeWarmup", "All route chunks warmed during idle.");
  };
  const kick = () => {
    if (!cancelled) warmAll();
  };
  if (document.readyState === "complete") kick();
  else window.addEventListener("load", kick, { once: true });

  return () => {
    cancelled = true;
    document.removeEventListener("mouseover", warmFromEvent);
    document.removeEventListener("focusin", warmFromEvent);
    window.removeEventListener("load", kick);
  };
}
