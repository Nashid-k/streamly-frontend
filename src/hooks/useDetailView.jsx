import { useCallback, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import slugify from "slugify";
import { usePreferenceValue } from "../context/preferences";
import TitleInfoModal from "../components/TitleInfoModal";

const POSTER_MORPH_NAME = "streamly-poster";
export const DETAIL_B_HOLD_MS = 1090; /* --detail-b-duration: 640 + 55*6 + 120 */

const transitionListeners = new Set();
let transitionSnapshot = { overlay: false, bypass: false, session: null };
let activeTransitionTask = null;
let activeSource = null;

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

async function runForwardDetailTransition({ sourceElement, movie, from, commit }) {
  const session = {
    sourceId: String(sourceElement?.dataset?.detailSource || movie.id),
    fromPath: from.pathname,
    fromSearch: from.search,
  };

  return enqueue(async () => {
    activeSource = sourceElement;
    sourceElement.style.viewTransitionName = POSTER_MORPH_NAME;
    document.documentElement.dataset.posterMorph = "true";
    markRouteAnimating();
    publish(false, true, session);

    try {
      /* A → B: old snapshot is the card route, new snapshot is the fixed
         shape-matched detail skeleton. B lives in Layout as an overlay, not a
         new history entry. */
      await runViewTransition(() => {
        /* Old snapshot already captured the source poster. Clear it before the
           new snapshot so only B's skeleton poster owns the shared name. */
        sourceElement.style.viewTransitionName = "";
        document.documentElement.dataset.detailTransition = "B";
        publish(true, true, session);
      });

      await delay(detailBHoldMs());

      /* B → C: the overlay leaves in the same commit that lands the details
         route. The destination hero artwork inherits the shared name. */
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
      /* C → B: the loaded page morphs back into the same detail skeleton.
         The hero name is scoped away while B is on screen so only the
         skeleton poster is the shared element. */
      await runViewTransition(() => {
        if (hero) hero.style.viewTransitionName = "";
        activeSource = null;
        document.documentElement.dataset.detailTransition = "B";
        publish(true, true, session);
      });

      await delay(detailBHoldMs());

      /* B → A: pop the history entry, then name the original card poster in
         the SAME update callback so the browser captures it as the new
         snapshot. That is what makes the reverse artwork morph land. */
      await runViewTransition(() => {
        document.documentElement.dataset.detailTransition = "A";
        publish(false, true, session);
        if (location.key !== "default") navigate(-1);
        else navigate(session.fromPath || "/");
        const source = Array.from(document.querySelectorAll("[data-detail-source]")).find(
          (el) => el.dataset.detailSource === String(session.sourceId),
        );
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

   Returns openDetails(movie, { forceModal, sourceElement }) plus a `modalHost`
   node to render once at the call-site root (the modal portals itself to
   document.body, so its position in the tree doesn't matter and no transformed
   ancestor can trap it). `forceModal` bypasses the preference for call sites
   that need instant content with zero loading chrome (e.g. the Random picker).

   A card click with `sourceElement` runs the full 2.0 motion sequence:
   A (card route) → B (shape-matched skeleton overlay) → C (details route), and
   the matching reverse on the in-app back control. Framer Motion keeps its
   route plane for every other navigation; during this sequence Layout switches
   to instant variants so the View Transition is the only animation. */
export default function useDetailView() {
  const navigate = useNavigate();
  const location = useLocation();
  const detailViewType = usePreferenceValue("detailViewType", "page") || "page";
  const reduceMotionPref = usePreferenceValue("reduceMotion", false);
  const [modalMovie, setModalMovie] = useState(null);

  const openDetails = useCallback(
    (movie, { forceModal = false, sourceElement } = {}) => {
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
        runForwardDetailTransition({ sourceElement, movie, from: location, commit });
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
