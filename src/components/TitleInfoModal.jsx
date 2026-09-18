import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Check, ChevronRight, GalleryHorizontal, LayoutGrid, List, Play, Plus, X } from "lucide-react";
import slugify from "slugify";
import { movieService } from "../api/movieService";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { useAppAuth } from "../context/auth";
import { useOptionalPreferences } from "../context/preferences";
import { useToast } from "./Toast";
import { buildMetaFacts } from "../utils/metaFacts";

/* ── TitleInfoModal — Netflix-style quick info ──────────────────────
   One shared modal for every "more info" affordance:
     · hero banner Info button (always, like Netflix)
     · MovieCard / banner-card clicks when Detail View Type = "modal"

   Anatomy (matches Netflix's title modal):
     backdrop header with gradient fade → title → match % · year ·
     runtime/seasons → genre chips → full overview → cast →
     [▶ Play] [+ My List] [Full Details] actions.

   Ergonomics: centered card sized min(92vw, 780px) with a viewport-capped
   max-height and internal scroll; ≤640px it becomes a full-width
   bottom sheet with rounded top corners and safe-area padding, so it
   never touches the top/bottom edges or spans the whole screen.

   Portaling: rendered via createPortal(document.body). Without it, any
   ancestor with a transform/will-change (carousel rows animate y on
   hover/entry) becomes the containing block for position:fixed, stretching
   the backdrop across the whole document — and the initial focus() then
   makes the browser scroll the page to reveal the close button. */

const SPRING = { type: "spring", stiffness: 380, damping: 30 };

const SIMILAR_MODES = ["carousel", "grid", "list"];

function SimilarPoster({ sim, size }) {
  const poster = sim.posterUrl || sim.poster;
  if (!poster) {
    return (
      <span className="title-info-similar-fallback" aria-hidden="true">
        {(sim.title || "?").trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return <img src={CdnImageAdapter.getUrl(poster, size)} alt="" loading="lazy" decoding="async" />;
}

export default function TitleInfoModal({ movie, onClose, onSelectMovie }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isInList, toggleMyList } = useAppAuth();
  const prefs = useOptionalPreferences();
  const [isClosing, setIsClosing] = useState(false);
  const closeButtonRef = useRef(null);
  const cardRef = useRef(null);
  const episodeViewStyle = prefs?.episodeViewStyle || "carousel";
  const [similarLayout, setSimilarLayout] = useState(
    SIMILAR_MODES.includes(episodeViewStyle) ? episodeViewStyle : "carousel",
  );

  /* Live details (tagline, runtime, seasons, genres, cast) — the summary
     object from the card/banner renders instantly, then this enriches it. */
  const { data: detail, isError } = useQuery({
    queryKey: ["infoModal", movie?.id],
    queryFn: () => movieService.getMovieDetails(movie.id),
    enabled: Boolean(movie?.id),
    staleTime: 1000 * 60 * 10,
    retry: 1,
  });

  const { data: similarData } = useQuery({
    queryKey: ["infoModalSimilar", movie?.id],
    queryFn: () => movieService.getSimilarMovies(movie.id),
    enabled: Boolean(movie?.id),
    staleTime: 1000 * 60 * 10,
    retry: 0,
  });
  const similar = Array.isArray(similarData) ? similarData.slice(0, 20) : [];

  /* Scroll lock + Escape + initial focus. handleClose is stable enough via
     the isClosing guard that it must not rebind the key listener. */
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // preventScroll: never let focus reposition the page under the modal.
    closeButtonRef.current?.focus?.({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see comment above
  }, []);

  /* Follow the global "Episode View Style" preference (Settings and the
     details page). When onSelectMovie swaps the movie in place, reset the
     card scroll so a new title always starts at the top. */
  useEffect(() => {
    if (SIMILAR_MODES.includes(episodeViewStyle)) {
      setSimilarLayout(episodeViewStyle);
    }
  }, [episodeViewStyle]);

  useEffect(() => {
    cardRef.current?.scrollTo?.({ top: 0, left: 0 });
  }, [movie?.id]);

  /* Toggle inside the modal persists the layout preference so Settings and
     the details page stay in sync (same key as the episode view style). */
  const setSimilarStyle = (val) => {
    setSimilarLayout(val);
    prefs?.setPreference?.("episodeViewStyle", val);
  };

  const pickSimilar = (sim) => {
    if (!sim) return;
    // Swap the modal in place (Netflix hops) when the parent supports it.
    if (onSelectMovie) {
      onSelectMovie(sim);
      return;
    }
    const slug = slugify(sim.title || "title", { lower: true, strict: true });
    navigate(`/watch/${sim.id}/${slug}`);
  };

  function handleClose() {
    if (isClosing) return;
    setIsClosing(true);
    // Let the exit animation play before the parent unmounts us.
    setTimeout(() => onClose?.(), 180);
  }

  if (!movie) return null;

  const inList = isInList(movie.id);
  const slug = slugify(movie.title, { lower: true, strict: true });
  const playRoute = `/watch/${movie.id}/${slug}`;
  const metaFacts = buildMetaFacts(detail, movie);
  const genres = (detail?.genres?.length ? detail.genres : movie.genres) || [];
  const overview = detail?.overview || movie.overview || movie.description || movie.longDescription || "";
  const backdrop = CdnImageAdapter.getUrl(
    movie.backdropUrl || detail?.backdropUrl || movie.posterUrl || detail?.posterUrl,
    "w780",
  );
  const castStrip = (detail?.cast || []).slice(0, 8);

  const play = () => navigate(playRoute);

  const toggleList = (e) => {
    e?.stopPropagation?.();
    const wasInList = inList;
    toggleMyList(movie);
    toast({
      title: wasInList ? "Removed from List" : "Added to My List",
      message: wasInList ? `"${movie.title}" was removed.` : `"${movie.title}" saved to your list.`,
      type: wasInList ? "info" : "success",
      duration: 2500,
    });
  };

  return createPortal(
    <motion.div
      className="title-info-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: isClosing ? 0 : 1 }}
      transition={{ duration: 0.18 }}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${movie.title} info`}
      data-testid="title-info-modal"
    >
      <motion.div
        ref={cardRef}
        className="title-info-card"
        initial={{ opacity: 0, scale: 0.94, y: 24 }}
        animate={isClosing ? { opacity: 0, scale: 0.96, y: 16 } : { opacity: 1, scale: 1, y: 0 }}
        transition={SPRING}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Backdrop header ── */}
        <div className="title-info-hero">
          {backdrop ? (
            <img src={backdrop} alt="" className="title-info-backdrop-img" loading="eager" decoding="async" />
          ) : (
            <div className="title-info-backdrop-fallback" aria-hidden="true" />
          )}
          <div className="title-info-hero-fade" />
          <button
            ref={closeButtonRef}
            type="button"
            className="title-info-close"
            aria-label="Close"
            onClick={handleClose}
          >
            <X size={18} strokeWidth={2.5} />
          </button>
          <h2 className="title-info-name">{movie.title}</h2>
          {detail?.tagline && <p className="title-info-tagline">{detail.tagline}</p>}
        </div>

        {/* ── Body ── */}
        <div className="title-info-body">
          {metaFacts.length > 0 && (
            <div className="title-info-meta" data-testid="title-info-meta">
              {metaFacts.map((fact, i) => (
                <span key={`${fact.text}-${i}`} className={`title-info-meta-item${fact.accent ? " title-info-match" : ""}`}>
                  {fact.text}
                </span>
              ))}
            </div>
          )}

          {genres.length > 0 && (
            <div className="title-info-genres">
              {genres.slice(0, 5).map((g) => (
                <span key={g} className="title-info-genre">{g}</span>
              ))}
            </div>
          )}

          {overview ? (
            <p className="title-info-overview">{overview}</p>
          ) : isError ? (
            <p className="title-info-overview title-info-overview--muted">
              Couldn&apos;t load the full story for this title right now.
            </p>
          ) : (
            <p className="title-info-overview title-info-overview--muted">Loading story…</p>
          )}

          {castStrip.length > 0 && (
            <p className="title-info-cast">
              <span className="title-info-cast-label">Cast: </span>
              {castStrip.map((c) => c.name).filter(Boolean).join(", ")}
            </p>
          )}

          {/* ── Actions ── */}
          <div className="title-info-actions">
            <button type="button" className="title-info-play" onClick={play}>
              <Play size={16} strokeWidth={2.5} fill="currentColor" stroke="none" />
              Play
            </button>
            <button
              type="button"
              className={`title-info-list${inList ? " is-in-list" : ""}`}
              onClick={toggleList}
              aria-label={inList ? "Remove from My List" : "Add to My List"}
              title={inList ? "Remove from My List" : "Add to My List"}
            >
              {inList ? <Check size={16} strokeWidth={2.5} /> : <Plus size={16} strokeWidth={2.5} />}
              {inList ? "In My List" : "My List"}
            </button>
            <button type="button" className="title-info-details" onClick={() => navigate(playRoute)}>
              Full Details
              <span aria-hidden="true">→</span>
            </button>
          </div>

          {/* ── You May Also Like ── */}
          {similar.length > 0 && (
            <section className="title-info-similar" aria-label="You May Also Like">
              <div className="title-info-similar-head">
                <h3 className="title-info-similar-title">You May Also Like</h3>
                <div className="title-info-similar-toggle" role="radiogroup" aria-label="You May Also Like layout">
                  {[
                    { id: "carousel", icon: <GalleryHorizontal size={15} strokeWidth={2} />, label: "Carousel view" },
                    { id: "grid", icon: <LayoutGrid size={15} strokeWidth={2} />, label: "Grid view" },
                    { id: "list", icon: <List size={15} strokeWidth={2} />, label: "List view" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      className="title-info-similar-mode"
                      aria-pressed={similarLayout === mode.id}
                      aria-label={mode.label}
                      title={mode.label}
                      data-active={similarLayout === mode.id}
                      onClick={() => setSimilarStyle(mode.id)}
                    >
                      {mode.icon}
                    </button>
                  ))}
                </div>
              </div>

              {similarLayout === "carousel" && (
                <div className="title-info-similar-rail hide-scrollbar">
                  {similar.map((sim) => (
                    <button
                      key={sim.id}
                      type="button"
                      className="title-info-similar-card"
                      onClick={() => pickSimilar(sim)}
                      aria-label={`Open ${sim.title}`}
                    >
                      <span className="title-info-similar-poster">
                        <SimilarPoster sim={sim} size="w342" />
                      </span>
                      <span className="title-info-similar-name">{sim.title}</span>
                    </button>
                  ))}
                </div>
              )}

              {similarLayout === "grid" && (
                <div className="movie-grid title-info-similar-grid">
                  {similar.map((sim) => (
                    <button
                      key={sim.id}
                      type="button"
                      className="title-info-similar-gridcard"
                      onClick={() => pickSimilar(sim)}
                      aria-label={`Open ${sim.title}`}
                    >
                      <span className="title-info-similar-poster">
                        <SimilarPoster sim={sim} size="w342" />
                      </span>
                      <span className="title-info-similar-name">{sim.title}</span>
                    </button>
                  ))}
                </div>
              )}

              {similarLayout === "list" && (
                <div className="title-info-similar-list">
                  {similar.map((sim) => (
                    <button
                      key={sim.id}
                      type="button"
                      className="title-info-similar-row"
                      onClick={() => pickSimilar(sim)}
                      aria-label={`Open ${sim.title}`}
                    >
                      <span className="title-info-similar-row-poster">
                        <SimilarPoster sim={sim} size="w185" />
                      </span>
                      <span className="title-info-similar-row-body">
                        <span className="title-info-similar-row-title">{sim.title}</span>
                        <span className="title-info-similar-row-meta">
                          {[
                            sim.releaseYear || sim.year,
                            sim.isSeries ? "Series" : "Movie",
                            sim.imdbRating ? `★ ${sim.imdbRating}` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <ChevronRight className="title-info-similar-row-arrow" size={15} strokeWidth={2} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  );
}
