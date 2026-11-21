import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import slugify from "slugify";
import { usePreferenceValue } from "../context/preferences";
import TitleInfoModal from "../components/TitleInfoModal";

const POSTER_MORPH_NAME = "streamly-poster";
let activeMorph = null;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function finishMorph(morph) {
  if (!morph || activeMorph !== morph) return;
  morph.sourceElement.style.viewTransitionName = "";
  document.documentElement.removeAttribute("data-poster-morph");
  activeMorph = null;
}

function startPosterMorph(sourceElement, commit) {
  if (activeMorph) finishMorph(activeMorph);
  const morph = { sourceElement };
  activeMorph = morph;
  sourceElement.style.viewTransitionName = POSTER_MORPH_NAME;
  document.documentElement.setAttribute("data-poster-morph", "true");
  const transition = document.startViewTransition(() => {
    flushSync(commit);
  });
  transition.finished.then(() => finishMorph(morph), () => finishMorph(morph));
}

/* ── useDetailView — one gateway for every "open details" affordance ──
   Honors the Detail View Type preference everywhere:
     · "page"  → navigate to /watch/:id/:slug
     · "modal" → open the shared Streamly-style TitleInfoModal

   Returns openDetails(movie, { forceModal }) plus a `modalHost` node to
   render once at the call-site root (the modal portals itself to
   document.body, so its position in the tree doesn't matter and no
   transformed ancestor can trap it). `forceModal` bypasses the preference
   for call sites that need instant content with zero loading chrome (e.g.
   the Random picker). Call sites: MovieCard, hero banner click / Info
   button.

   A card click may also pass `sourceElement`: when the browser supports View
   Transitions and motion is allowed, that poster is named for one shared
   element morph into the detail hero artwork. Framer Motion still owns the
   route plane — only the artwork is a shared element. */
export default function useDetailView() {
  const navigate = useNavigate();
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
      const commit = () => navigate(`/watch/${movie.id}/${slug}`, { state: { movie } });
      const canMorph =
        !!sourceElement &&
        typeof document !== "undefined" &&
        typeof document.startViewTransition === "function" &&
        !reduceMotionPref &&
        !prefersReducedMotion();

      if (canMorph) startPosterMorph(sourceElement, commit);
      else commit();
    },
    [detailViewType, navigate, reduceMotionPref],
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
