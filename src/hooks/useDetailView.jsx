import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import slugify from "slugify";
import { usePreferenceValue } from "../context/preferences";
import TitleInfoModal from "../components/TitleInfoModal";
import { queryClient } from "../queryClient";
import { movieService } from "../api/movieService";

const POSTER_MORPH_NAME = "streamly-poster";
const RAIL_SELECTOR = "[data-detail-rail], .movie-rail, .track.scroll-x";
export const DETAIL_B_HOLD_MS = 1090; /* --detail-b-duration: 640 + 55*6 + 120 */

const transitionListeners = new Set();
let transitionSnapshot = { overlay: false, bypass: false, session: null };
let activeTransitionTask = null;
let activeSource = null;
let pendingRestoreSession = null;
let pendingRestoreTimer = 0;
const popGuard = { active: false, pendingForward: false, timer: 0 };

export function isDetailRestoring() {
  return Boolean(
    pendingRestoreSession ||
    (typeof window !== "undefined" && window.__streamlyDetailScrollRestored),
  );
}

export function getSavedDetailHeroIndex() {
  if (!pendingRestoreSession) return null;
  return Number.isFinite(pendingRestoreSession.heroIndex)
    ? pendingRestoreSession.heroIndex
    : null;
}

export function getSavedDetailRailScroll(label) {
  if (!label || !pendingRestoreSession) return null;
  if (
    pendingRestoreSession.railKey === label &&
    Number.isFinite(pendingRestoreSession.railScrollLeft)
  ) {
    return pendingRestoreSession.railScrollLeft;
  }
  if (
    pendingRestoreSession.rails &&
    Object.prototype.hasOwnProperty.call(pendingRestoreSession.rails, label) &&
    Number.isFinite(pendingRestoreSession.rails[label])
  ) {
    return pendingRestoreSession.rails[label];
  }
  return null;
}

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

function flushViewTransitionName(el) {
  if (!el || typeof el.offsetWidth !== "number") return;
  void el.offsetWidth;
  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    void window.getComputedStyle(el).viewTransitionName;
  }
}

function clearStrayViewTransitionNames() {
  if (typeof document === "undefined") return;
  document
    .querySelectorAll("[data-detail-token], [data-detail-source], [data-vt], .dp .dh > .po, .detail-transition-poster")
    .forEach((node) => {
      if (node.style && node.style.viewTransitionName) {
        node.style.viewTransitionName = "";
      }
    });
}

function clearCardTiltState(el) {
  if (!el?.classList) return;
  el.classList.remove("tilting");
  el.style?.removeProperty?.("--rx");
  el.style?.removeProperty?.("--ry");
  const hero = el.closest?.(".hero");
  hero?.classList?.remove?.("sw");
}

function capturePlace({ sourceElement, movie, from, detailToken, heroIndex }) {
  const rails = {};
  document.querySelectorAll(RAIL_SELECTOR).forEach((rail) => {
    const key = railKey(rail);
    if (key) rails[key] = rail.scrollLeft;
  });
  const sourceRail = sourceElement?.closest?.(RAIL_SELECTOR);
  const resolvedToken = String(
    detailToken ||
      sourceElement?.dataset?.detailToken ||
      sourceElement?.dataset?.vt ||
      `${from.pathname}:grid:${movie.id}`,
  );
  let resolvedHeroIndex = Number.isFinite(heroIndex) ? heroIndex : null;
  if (resolvedHeroIndex == null && typeof document !== "undefined") {
    const heroAttr = document.querySelector(".home-page > .hero[data-hero-index]")?.dataset?.heroIndex;
    const parsedHero = heroAttr != null ? Number.parseInt(heroAttr, 10) : NaN;
    if (Number.isFinite(parsedHero)) resolvedHeroIndex = parsedHero;
  }
  return {
    sourceId: String(sourceElement?.dataset?.detailSource || movie.id),
    movieId: movie?.id ?? null,
    title: movie?.title || "",
    detailToken: resolvedToken,
    fromPath: from.pathname,
    fromSearch: from.search,
    scrollY: window.scrollY,
    railKey: railKey(sourceRail),
    railScrollLeft: sourceRail?.scrollLeft ?? null,
    rails,
    heroIndex: resolvedHeroIndex,
    isHero: Boolean(
      sourceElement?.classList?.contains?.("hbd") ||
      resolvedToken.startsWith("hero:"),
    ),
    hasBackdrop: Boolean(movie.backdropUrl || movie.posterUrl),
    isTv: Boolean(
      movie?.isSeries ||
      movie?.type === "tv" ||
      String(movie?.id || "").startsWith("tmdb-tv-"),
    ),
    posterUrl: movie.posterUrl || movie.backdropUrl || movie.poster || null,
    backdropUrl: movie.backdropUrl || movie.posterUrl || null,
  };
}

function findSessionSource(session) {
  const candidates = Array.from(
    document.querySelectorAll("[data-detail-token], [data-vt], [data-detail-source]"),
  );
  if (session.detailToken) {
    const exact = candidates.find(
      (el) =>
        el.dataset.detailToken === session.detailToken ||
        el.dataset.vt === session.detailToken,
    );
    if (exact) return exact;
  }
  return candidates.find(
    (el) => String(el.dataset.detailSource) === String(session.sourceId),
  );
}

function restoreScrollGeometry(session) {
  if (!session) return;
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
}

function restorePlace(session) {
  if (!session) return null;
  restoreScrollGeometry(session);

  const source = findSessionSource(session);
  const focusTarget =
    (session.isHero && document.querySelector(`[data-focus="${session.detailToken}"]`)) ||
    source?.closest?.("[role='button'], a, button") ||
    source;
  focusTarget?.focus?.({ preventScroll: true });
  window.__streamlyDetailScrollRestored = true;
  return source;
}

function preloadBackdrop(url) {
  if (!url) return;
  const image = new Image();
  image.src = url;
}

function prefetchMovieDetails(id) {
  if (!id) return;
  try {
    queryClient.prefetchQuery({
      queryKey: ["movie", String(id)],
      queryFn: () => movieService.getMovieDetails(id),
      staleTime: 1000 * 60 * 60 * 24,
    });
  } catch {
    // best-effort prefetch
  }
}

/* history.go(-1) is processed asynchronously by the router. Keep B on screen
   until A's cards are actually mounted, otherwise the B→A update callback has
   no source element to name and the reverse snapshot lands on an empty page. */
async function waitForSource(session, timeout = 4000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    restoreScrollGeometry(session);
    const source = findSessionSource(session);
    if (source) return source;
    await delay(32);
  }
  return null;
}

function nextFrame() {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    return Promise.resolve();
  }
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function detailBHoldMs(isReverse = false) {
  if (typeof window === "undefined") return DETAIL_B_HOLD_MS;
  const token = getComputedStyle(document.documentElement)
    .getPropertyValue("--detail-b-duration")
    .trim();
  const parsed = parseFloat(token) || DETAIL_B_HOLD_MS;
  if (isReverse) return Math.min(parsed, 80);
  return parsed;
}

async function waitForDetailDwell(id, bStartedAt = performance.now()) {
  const totalBudget = detailBHoldMs(false);
  const elapsed = performance.now() - bStartedAt;
  const remainingBudget = Math.max(0, totalBudget - elapsed);
  const minTail = totalBudget < 100 ? totalBudget : Math.min(remainingBudget, 180);

  if (minTail > 0) {
    await delay(minTail);
  }

  const afterMinElapsed = performance.now() - bStartedAt;
  const remaining = Math.max(0, totalBudget - afterMinElapsed);
  if (remaining <= 0) return;

  const deadline = performance.now() + remaining;
  while (performance.now() < deadline) {
    const cached = queryClient.getQueryData(["movie", String(id)]);
    if (cached) break;
    await delay(25);
  }
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
  clearStrayViewTransitionNames();
  delete document.documentElement.dataset.posterMorph;
  delete document.documentElement.dataset.detailTransition;
  delete document.documentElement.dataset.detailDirection;
  clearRouteAnimating();
}

function runViewTransition(commit) {
  if (!supportsViewTransitions()) {
    flushSync(commit);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    try {
      const transition = document.startViewTransition(() => {
        flushSync(commit);
      });
      const done = () => resolve();
      transition.finished.then(done, done);
    } catch {
      flushSync(commit);
      resolve();
    }
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

async function runForwardDetailTransition({ sourceElement, movie, from, detailToken, heroIndex, commit }) {
  const session = capturePlace({ sourceElement, movie, from, detailToken, heroIndex });

  return enqueue(async () => {
    delete window.__streamlyDetailScrollRestored;
    preloadBackdrop(session.posterUrl);
    preloadBackdrop(session.backdropUrl);
    prefetchMovieDetails(movie?.id);
    clearStrayViewTransitionNames();
    clearCardTiltState(sourceElement);
    activeSource = sourceElement;
    sourceElement.style.viewTransitionName = POSTER_MORPH_NAME;
    document.documentElement.dataset.posterMorph = "true";
    document.documentElement.dataset.detailDirection = "forward";
    markRouteAnimating();
    flushViewTransitionName(sourceElement);
    const bStartedAt = performance.now();

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

      await waitForDetailDwell(movie?.id, bStartedAt);

      /* B → C: the overlay leaves in the same commit that lands the details
         route. The destination hero poster inherits the shared name. */
      await runViewTransition(() => {
        document.documentElement.dataset.detailTransition = "C";
        try {
          window.scrollTo({ top: 0, left: 0, behavior: "instant" });
        } catch {
          // jsdom/no-op
        }
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
    clearStrayViewTransitionNames();
    const hero =
      document.querySelector(".dp .dh > .po") ||
      document.querySelector(".details-hero__art img.hero-bg");
    if (hero) {
      activeSource = hero;
      hero.style.viewTransitionName = POSTER_MORPH_NAME;
      flushViewTransitionName(hero);
    }
    document.documentElement.dataset.posterMorph = "true";
    document.documentElement.dataset.detailDirection = "reverse";
    markRouteAnimating();

    try {
      /* C → B: the loaded page morphs back into the poster-preserving hero skeleton. */
      await runViewTransition(() => {
        if (hero) hero.style.viewTransitionName = "";
        activeSource = null;
        document.documentElement.dataset.detailTransition = "B";
        publish(true, true, session);
      });

      await delay(detailBHoldMs(true));

      /* B → A: pop the history entry behind the opaque B overlay, restore the
         saved page/rail scroll immediately so lazily virtualized cards mount,
         wait a frame in real browsers for layout stability, then run B → A. */
      window.__streamlyDetailScrollRestored = true;
      pendingRestoreSession = session;
      window.clearTimeout(pendingRestoreTimer);
      pendingRestoreTimer = window.setTimeout(() => {
        if (pendingRestoreSession === session) pendingRestoreSession = null;
      }, 2500);
      if (location.key !== "default") navigate(-1);
      else navigate(session.fromPath || "/");
      await waitForSource(session);
      if (detailBHoldMs(false) >= 100) {
        restoreScrollGeometry(session);
        await nextFrame();
      }

      await runViewTransition(() => {
        document.documentElement.dataset.detailTransition = "A";
        publish(false, true, session);
        const source = restorePlace(session);
        if (source) {
          clearCardTiltState(source);
          activeSource = source;
          source.style.viewTransitionName = POSTER_MORPH_NAME;
          flushViewTransitionName(source);
        }
      });
      if (typeof window !== "undefined") {
        window.requestAnimationFrame(() => restorePlace(session));
      }
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
    (movie, { forceModal = false, sourceElement, detailToken, heroIndex } = {}) => {
      if (!movie) return;
      if (forceModal || detailViewType === "modal") {
        setModalMovie(movie);
        return;
      }

      prefetchMovieDetails(movie?.id);

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
          heroIndex,
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
    if (!supportsViewTransitions() || reduceMotionPref || prefersReducedMotion()) return undefined;
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
