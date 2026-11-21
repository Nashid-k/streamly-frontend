import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import slugify from "slugify";
import { usePreferenceValue } from "../context/preferences";
import TitleInfoModal from "../components/TitleInfoModal";

const POSTER_MORPH_NAME = "streamly-poster";
const RAIL_SELECTOR = "[data-detail-rail], .movie-rail, .track.scroll-x";
export const DETAIL_B_HOLD_MS = 1090; /* --detail-b-duration: 640 + 55*6 + 120 */

const transitionListeners = new Set();
let transitionSnapshot = { overlay: false, bypass: false, session: null };
let activeTransitionTask = null;
let activeSource = null;
const popGuard = { active: false, pendingForward: false, timer: 0 };

function publish(overlay, bypass, session) {
  transitionSnapshot = { overlay, bypass, session };
  transitionListeners.forEach((listener) => listener());
}

export function subscribeDetailTransition(listener) {
  transitionListeners.add(listener);
  return () => transitionListeners.delete(listener);
}

export function getDetailTransitionSnapshot() {
  return transitionSnapshot;
}

export function useDetailTransition() {
  return useSyncExternalStore(
    subscribeDetailTransition,
    getDetailTransitionSnapshot,
    getDetailTransitionSnapshot,
  );
}

function supportsViewTransitions() {
  return typeof document !== "undefined" && typeof document.startViewTransition === "function";
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function isDetailsPath(pathname) {
  return /^\/watch\//.test(pathname || "");
}

function railKey(rail) {
  return rail?.dataset?.detailRail || rail?.getAttribute?.("aria-label") || "";
}

function capturePlace({ sourceElement, movie, from, detailToken }) {
  const rails = {};
  document.querySelectorAll(RAIL_SELECTOR).forEach((rail) => {
    const key = railKey(rail);
    if (key) rails[key] = rail.scrollLeft;
  });
  const sourceRail = sourceElement?.closest?.(RAIL_SELECTOR);
  return {
    sourceId: String(sourceElement?.dataset?.detailSource || movie.id),
    detailToken: String(
      detailToken ||
        sourceElement?.dataset?.detailToken ||
        `${from.pathname}:grid:${movie.id}`,
    ),
    fromPath: from.pathname,
    fromSearch: from.search,
    scrollY: window.scrollY,
    railKey: railKey(sourceRail),
    railScrollLeft: sourceRail?.scrollLeft ?? null,
    rails,
    hasBackdrop: Boolean(movie.backdropUrl || movie.posterUrl),
    backdropUrl: movie.backdropUrl || movie.posterUrl || null,
  };
}

function findSessionSource(session) {
  const candidates = Array.from(
    document.querySelectorAll("[data-detail-token], [data-detail-source]"),
  );
  if (session.detailToken) {
    const exact = candidates.find((el) => el.dataset.detailToken === session.detailToken);
    if (exact) return exact;
  }
  return candidates.find(
    (el) => String(el.dataset.detailSource) === String(session.sourceId),
  );
}

function restorePlace(session) {
  if (!session) return null;
  if (Number.isFinite(session.scrollY)) {
    window.scrollTo({ top: session.scrollY, left: 0, behavior: "instant" });
  }
  const rails = Array.from(document.querySelectorAll(RAIL_SELECTOR));
  rails.forEach((rail) => {
    const key = railKey(rail);
    if (
      key &&
      session.rails &&
      Object.prototype.hasOwnProperty.call(session.rails, key)
    ) {
      rail.scrollLeft = session.rails[key];
    }
  });
  if (session.railKey && session.railScrollLeft != null) {
    const sourceRail = rails.find((rail) => railKey(rail) === session.railKey);
    if (sourceRail) sourceRail.scrollLeft = session.railScrollLeft;
  }

  const source = findSessionSource(session);
  const focusTarget = source?.closest?.("[role='button'], a, button") || source;
  focusTarget?.focus?.({ preventScroll: true });
  window.__streamlyDetailScrollRestored = true;
  return source;
}

function preloadBackdrop(url) {
  if (!url) return;
  const image = new Image();
  image.src = url;
}

/* history.go(-1) is processed asynchronously by the router. Keep B on screen
   until A's cards are actually mounted, otherwise the B→A update callback has
   no source element to name and the reverse snapshot lands on an empty page. */
async function waitForSource(session, timeout = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const source = findSessionSource(session);
    if (source) return source;
    await delay(50);
  }
  return null;
}

function detailBHoldMs() {
  if (typeof window === "undefined") return DETAIL_B_HOLD_MS;
  const token = getComputedStyle(document.documentElement)
    .getPropertyValue("--detail-b-duration")
    .trim();
  return parseFloat(token) || DETAIL_B_HOLD_MS;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markRouteAnimating() {
  if (typeof window === "undefined") return;
  window.__streamlyRouteAnimating = true;
  document.documentElement.dataset.routeAnimating = "true";
}

function clearRouteAnimating() {
  if (typeof window === "undefined") return;
  window.__streamlyRouteAnimating = false;
  delete document.documentElement.dataset.routeAnimating;
}

function cleanupMorph() {
  if (activeSource) activeSource.style.viewTransitionName = "";
  activeSource = null;
  delete document.documentElement.dataset.posterMorph;
  delete document.documentElement.dataset.detailTransition;
  clearRouteAnimating();
}

function runViewTransition(commit) {
  if (!supportsViewTransitions()) {
    flushSync(commit);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const transition = document.startViewTransition(() => {
      flushSync(commit);
    });
    const done = () => resolve();
    transition.finished.then(done, done);
  });
}

function enqueue(task) {
  /* The first task starts synchronously so the A snapshot can be captured in
     the same click that requested the transition. Later tasks queue behind the
     active one, matching streamly_2.0's serialized VT chain. */
  const run = () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    activeTransitionTask = gate;
    const result = task();
    Promise.resolve(result).then(
      () => {
        release();
        if (activeTransitionTask === gate) activeTransitionTask = null;
      },
      () => {
        release();
        if (activeTransitionTask === gate) activeTransitionTask = null;
      },
    );
    return result;
  };

  if (!activeTransitionTask) return run();
  return activeTransitionTask.then(run, run);
}

async function runForwardDetailTransition({ sourceElement, movie, from, detailToken, commit }) {
  const session = capturePlace({ sourceElement, movie, from, detailToken });

  return enqueue(async () => {
    delete window.__streamlyDetailScrollRestored;
    preloadBackdrop(session.backdropUrl);
    activeSource = sourceElement;
    sourceElement.style.viewTransitionName = POSTER_MORPH_NAME;
    document.documentElement.dataset.posterMorph = "true";
    markRouteAnimating();
    publish(false, true, session);

    try {
      /* A → B: old snapshot is the card route, new snapshot is the hero-shaped
         detail skeleton. B lives in Layout as an overlay, not a history entry. */
      await runViewTransition(() => {
        /* Old snapshot already captured the source poster. Clear it before the
           new snapshot so only B's hero skeleton owns the shared name. */
        sourceElement.style.viewTransitionName = "";
        document.documentElement.dataset.detailTransition = "B";
        publish(true, true, session);
      });

      await delay(detailBHoldMs());

      /* B → C: the overlay leaves in the same commit that lands the details
         route. The destination hero backdrop inherits the shared name. */
      await runViewTransition(() => {
        document.documentElement.dataset.detailTransition = "C";
        publish(false, true, session);
        commit(session);
      });
    } finally {
      cleanupMorph();
      publish(false, false, null);
    }
  });
}

async function runReverseDetailTransition({ navigate, location, session }) {
  return enqueue(async () => {
    const hero = document.querySelector(".details-hero__art img.hero-bg");
    if (hero) {
      activeSource = hero;
      hero.style.viewTransitionName = POSTER_MORPH_NAME;
    }
    document.documentElement.dataset.posterMorph = "true";
    markRouteAnimating();
    publish(false, true, session);

    try {
      /* C → B: the loaded page morphs back into the same hero skeleton. The
         hero name is scoped away while B is on screen so only B owns it. */
      await runViewTransition(() => {
        if (hero) hero.style.viewTransitionName = "";
        activeSource = null;
        document.documentElement.dataset.detailTransition = "B";
        publish(true, true, session);
      });

      await delay(detailBHoldMs());

      /* B → A: pop the history entry first, but keep B on screen until A's
         cards are mounted. Then restore the saved page/rail geometry and name
         the EXACT source poster inside the final update callback, so the new
         snapshot captures the card at its original rail position. */
      /* Mark the restore before the POP commits so useScrollRestoration's
         retry timers and MovieRail's remount reset both stand down. */
      window.__streamlyDetailScrollRestored = true;
      if (location.key !== "default") navigate(-1);
      else navigate(session.fromPath || "/");
      await waitForSource(session);

      await runViewTransition(() => {
        document.documentElement.dataset.detailTransition = "A";
        publish(false, true, session);
        const source = restorePlace(session);
        if (source) {
          activeSource = source;
          source.style.viewTransitionName = POSTER_MORPH_NAME;
        }
      });
    } finally {
      cleanupMorph();
      publish(false, false, null);
    }
  });
}

/* ── useDetailView — one gateway for every "open details" affordance ──
   Honors the Detail View Type preference everywhere:
     · "page"  → navigate to /watch/:id/:slug
     · "modal" → open the shared Streamly-style TitleInfoModal

   Returns openDetails(movie, { forceModal, sourceElement, detailToken }) plus
   a `modalHost` node to render once at the call-site root (the modal portals
   itself to document.body, so its position in the tree doesn't matter and no
   transformed ancestor can trap it). `forceModal` bypasses the preference for
   call sites that need instant content with zero loading chrome (e.g. the
   Random picker).

   A card click with `sourceElement` runs the real 1.0 motion sequence:
   A (card route) → B (hero-shaped skeleton overlay) → C (details backdrop),
   and the matching reverse on back. Framer Motion keeps its route plane for
   every other navigation; during this sequence Layout switches to instant
   variants so the View Transition is the only animation. */
export default function useDetailView() {
  const navigate = useNavigate();
  const location = useLocation();
  const detailViewType = usePreferenceValue("detailViewType", "page") || "page";
  const reduceMotionPref = usePreferenceValue("reduceMotion", false);
  const [modalMovie, setModalMovie] = useState(null);

  const openDetails = useCallback(
    (movie, { forceModal = false, sourceElement, detailToken } = {}) => {
      if (!movie) return;
      if (forceModal || detailViewType === "modal") {
        setModalMovie(movie);
        return;
      }

      const slug = slugify(movie.title || "title", { lower: true, strict: true });
      const path = `/watch/${movie.id}/${slug}`;
      const commit = (session) =>
        navigate(path, {
          state: session ? { movie, detailTransition: session } : { movie },
        });
      const canMorph =
        !!sourceElement &&
        supportsViewTransitions() &&
        !reduceMotionPref &&
        !prefersReducedMotion();

      if (canMorph) {
        runForwardDetailTransition({
          sourceElement,
          movie,
          from: location,
          detailToken,
          commit,
        });
      } else {
        commit(null);
      }
    },
    [detailViewType, location, navigate, reduceMotionPref],
  );

  const closeDetails = useCallback(() => setModalMovie(null), []);

  const modalHost = modalMovie ? (
    <TitleInfoModal movie={modalMovie} onClose={closeDetails} onSelectMovie={setModalMovie} />
  ) : null;

  return {
    detailViewType,
    openDetails,
    closeDetails,
    modalHost,
    isModalOpen: Boolean(modalMovie),
  };
}

export function useDetailBack() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotionPref = usePreferenceValue("reduceMotion", false);

  return useCallback(() => {
    const session = location.state?.detailTransition;
    const goBack = () => {
      if (location.key !== "default") navigate(-1);
      else navigate(session?.fromPath || "/");
    };

    if (!session || !supportsViewTransitions() || reduceMotionPref || prefersReducedMotion()) {
      goBack();
      return;
    }

    runReverseDetailTransition({ navigate, location, session });
  }, [location, navigate, reduceMotionPref]);
}

/* Browser Back arrives as a POP before React Router commits the new location.
   Letting it through would capture A without B; re-forwarding to the details
   entry keeps C on screen while our reverse controller runs C→B→A. The final
   navigate(-1) is allowed through because popGuard.active is already set. */
export function useDetailPopGuard() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduceMotionPref = usePreferenceValue("reduceMotion", false);

  useEffect(() => {
    if (!supportsViewTransitions() || reduceMotionPref) return undefined;
    const session = location.state?.detailTransition;
    if (!isDetailsPath(location.pathname) || !session) return undefined;

    const onPop = (event) => {
      if (popGuard.active) {
        if (popGuard.pendingForward) {
          event.stopImmediatePropagation();
          popGuard.pendingForward = false;
        }
        return;
      }

      event.stopImmediatePropagation();
      popGuard.active = true;
      popGuard.pendingForward = true;
      window.clearTimeout(popGuard.timer);
      popGuard.timer = window.setTimeout(() => {
        popGuard.pendingForward = false;
      }, 300);
      window.history.forward();
      runReverseDetailTransition({ navigate, location, session }).finally(() => {
        popGuard.active = false;
        popGuard.pendingForward = false;
        window.clearTimeout(popGuard.timer);
      });
    };

    window.addEventListener("popstate", onPop, true);
    return () => window.removeEventListener("popstate", onPop, true);
  }, [location, navigate, reduceMotionPref]);
}
