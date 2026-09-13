import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import slugify from "slugify";
import { useOptionalPreferences } from "../context/preferences";
import TitleInfoModal from "../components/TitleInfoModal";

/* ── useDetailView — one gateway for every "open details" affordance ──
   Honors the Detail View Type preference everywhere:
     · "page"  → navigate to /watch/:id/:slug
     · "modal" → open the shared Netflix-style TitleInfoModal

   Returns openDetails(movie) plus a `modalHost` node to render once at
   the call-site root (the modal portals itself to document.body, so its
   position in the tree doesn't matter and no transformed ancestor can
   trap it). Call sites: MovieCard, hero banner click / Info button,
   LeavingSoonBanner rows. */

export default function useDetailView() {
  const navigate = useNavigate();
  const preferences = useOptionalPreferences();
  const detailViewType = preferences?.detailViewType || "page";
  const [modalMovie, setModalMovie] = useState(null);

  const openDetails = useCallback(
    (movie) => {
      if (!movie) return;
      if (detailViewType === "modal") {
        setModalMovie(movie);
      } else {
        const slug = slugify(movie.title || "title", { lower: true, strict: true });
        navigate(`/watch/${movie.id}/${slug}`);
      }
    },
    [detailViewType, navigate],
  );

  const closeDetails = useCallback(() => setModalMovie(null), []);

  const modalHost = modalMovie ? (
    <TitleInfoModal movie={modalMovie} onClose={closeDetails} />
  ) : null;

  return {
    detailViewType,
    openDetails,
    closeDetails,
    modalHost,
    isModalOpen: Boolean(modalMovie),
  };
}
