import { useCallback, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Play, Plus, Check, Star, X } from "lucide-react";
import slugify from "slugify";
import { getTMDBWeekdayShort } from "../utils/timezone";
import { useNavigate } from "react-router-dom";
import { buildMovieAddedNotification } from "../utils/notificationEngine";
import CountdownBadge from "./CountdownBadge";
import { useAppAuth } from "../context/AuthContext";
import { useToast } from "./Toast";

/* ─────────────────────────────────────────────────────────────
   MovieCard — "Cinematic Curtain" hover design
   
   How it works:
   • Everything lives INSIDE .poster-wrapper (overflow: hidden)
   • Hover state is driven by framer-motion whileHover on the
     single root div — zero JS state, zero timeouts, zero bugs
   • The curtain panel slides up from translateY(100%) → 0
   • The image dims + scales cinematically via CSS
   • Mouse enter/leave is on one element — can never get stuck
   ─────────────────────────────────────────────────────────────*/

// Animation variants — defined outside component so they're stable refs.
// Stagger: scale first (instant lift), then dim + curtain slides up,
// then title → meta → actions cascade in. Feels fast but layered.
const EASE_OUT = [0.16, 1, 0.3, 1];

const cardVariants = {
  rest: { scale: 1, zIndex: 1, transition: { duration: 0.25, ease: "easeOut" } },
  hover: {
    // A modest lift preserves the rhythm of a dense rail and prevents one
    // card from visually swallowing its neighbours.
    scale: 1.035,
    zIndex: 20,
    transition: { duration: 0.4, ease: EASE_OUT },
  },
};
const curtainVariants = {
  rest: { opacity: 0, y: "24%", transition: { duration: 0.25, ease: "easeOut" } },
  hover: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: 0.2, ease: EASE_OUT },
  },
};

const imageVariants = {
  rest: {
    filter: "brightness(1) saturate(1)",
    transition: { duration: 0.3, ease: "easeOut" },
  },
  hover: {
    filter: "brightness(0.6) saturate(1.25)",
    transition: { duration: 0.45, delay: 0.18, ease: EASE_OUT },
  },
};

const metaVariants = {
  rest: { opacity: 0, y: 8, transition: { duration: 0.2, ease: "easeOut" } },
  hover: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: 0.43, ease: EASE_OUT },
  },
};

const btnVariants = {
  rest: { opacity: 0, y: 10, transition: { duration: 0.2, ease: "easeOut" } },
  hover: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: 0.5, ease: EASE_OUT },
  },
};

import { PrefetchAdapter } from "../api/prefetchAdapter";

import { useVirtualRenderAdapter } from "../api/virtualRenderAdapter";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { useOptionalPreferences } from "../context/preferences";
import { logWarn } from "../utils/debugLogger";

export default function MovieCard({
  movie,
  showProgress = false,
  progressValue = 0,
  compact = false,
}) {
  const navigate = useNavigate();
  const { isInList, toggleMyList, addNotification } = useAppAuth();
  const { toast } = useToast();
  const preferences = useOptionalPreferences();
  const { isVisible, ref: virtualRef } = useVirtualRenderAdapter("400px"); // render 400px before it comes into view
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef(null);
  const reduceMotion = useReducedMotion();
  const isTvContent = movie?.isSeries || String(movie?.id || '').startsWith('tmdb-tv-');

  const handleMouseEnter = useCallback(() => {
    // 1. Instantly trigger background data prefetch for 0ms load times if clicked
    PrefetchAdapter.prefetchMovieDetails(movie.id);

    // 2. Debounce the hover animation state to prevent UI thrashing on quick swipes
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 150);
  }, [movie]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsHovered(false);
  }, []);

  const handleFocus = useCallback(() => {
    PrefetchAdapter.prefetchMovieDetails(movie.id);
    setIsHovered(true);
  }, [movie.id]);

  const handleBlur = useCallback((event) => {
    // Keep the curtain open while focus moves between the card and its actions.
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setIsHovered(false);
  }, []);

  // Fix: Clean up hoverTimeoutRef on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const detailViewType = preferences?.detailViewType || "page";
  const [showQuickView, setShowQuickView] = useState(false);

  // Netflix-style quick view: Escape dismisses, background scroll locks.
  useEffect(() => {
    if (!showQuickView) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") setShowQuickView(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [showQuickView]);

  const navigateToDetails = useCallback(() => {
    const slug = slugify(movie.title, { lower: true, strict: true });
    if (detailViewType === "modal") {
      setShowQuickView(true);
    } else {
      navigate(`/watch/${movie.id}/${slug}`);
    }
  }, [navigate, movie, detailViewType]);

  const handleToggleMyList = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wasInList = isInList(movie.id);
      toggleMyList(movie);
      toast({
        title: wasInList ? "Removed from List" : "Added to My List",
        message: wasInList
          ? `"${movie.title}" was removed.`
          : `"${movie.title}" saved to your list.`,
        type: wasInList ? "info" : "success",
        duration: 2500,
      });
      // Generate a rich notification when adding to list
      if (!wasInList && addNotification) {
        const notif = buildMovieAddedNotification({
          title: movie.title,
          platform: movie.source || movie.sourceName,
          year: movie.releaseYear || movie.year,
          duration: movie.duration,
          imageUrl: movie.backdropUrl || movie.posterUrl,
          movieId: movie.id,
          isSeries: isTvContent,
        });
        addNotification(notif);
      }
    },
    [movie, isInList, toggleMyList, toast, addNotification, isTvContent],
  );

  const inList = isInList(movie.id);

  const rating = movie.imdbRating;

  // Fallback so every card has an image: poster → backdrop, else a branded
  // monogram tile. Never render a broken <img>.
  const posterPath = movie.posterUrl || movie.backdropUrl;
  const posterSrc = CdnImageAdapter.getUrl(
    posterPath,
    preferences?.hdThumbs === false ? "w342" : "w500",
  );

  useEffect(() => {
    setIsLoaded(false);
    setHasImageError(false);
  }, [posterSrc]);

  // ── Next-airing info for the rail badges ──────────────────────────────
  // Airing-rail cards (and any series with an announced next episode) show
  // which DAY the episode drops plus its season/episode. Series that are only
  // airing (not premiering) fall back to nextEpisode; premiering series use
  // their future release date.
  const platformForDate = movie.source || movie.platform;
  const nextEpisodeInfo = movie.nextEpisode || {};
  const nextAirDate =
    nextEpisodeInfo.releaseDate ||
    (isTvContent && movie.isUpcoming ? movie.releaseDate : null) ||
    null;
  const nextAirSeason =
    nextEpisodeInfo.season ?? nextEpisodeInfo.seasonNumber ?? null;
  const nextAirEpisodeNumber =
    nextEpisodeInfo.episode ?? nextEpisodeInfo.episodeNumber ?? null;
  const nextAirLabel =
    nextAirEpisodeNumber != null
      ? `S${nextAirSeason || 1} E${nextAirEpisodeNumber}`
      : null;
  const nextAirWeekdayShort = nextAirDate
    ? getTMDBWeekdayShort(nextAirDate, undefined, platformForDate)
    : "";

  return (
    <div
      ref={virtualRef}
      style={{ width: "100%", height: "100%", minHeight: "200px" }}
    >
      {isVisible ? (
        <motion.div
          className="movie-card"
          variants={cardVariants}
          initial="rest"
          whileHover={reduceMotion ? undefined : "hover"}
          whileTap={reduceMotion ? undefined : { scale: 0.96 }}
          animate={isHovered ? "hover" : "rest"}
          role="button"
          tabIndex={0}
          aria-label={`View details for ${movie.title}`}
          onClick={navigateToDetails}
          onKeyDown={(e) => {
            // Only activate when the card itself is focused — inner buttons
            // handle their own keyboard activation and must not bubble here.
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigateToDetails();
            }
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={{
            cursor: "pointer",
            position: "relative",
            willChange: "transform, z-index",
          }}
        >
          {/* ── Poster wrapper ───────────────────────────────── */}
          <div
            className="poster-wrapper"
            style={{
              overflow: "hidden",
              background: "var(--bg-surface)",
              position: "relative",
            }}
          >
            {/* Placeholder blur-up / skeleton while loading */}
            {!isLoaded && (
              <div
                className="skeleton"
                style={{ position: "absolute", inset: 0, zIndex: 0 }}
              >
                {CdnImageAdapter.getTinyUrl(
                  movie.posterUrl || movie.backdropUrl,
                ) && (
                  <img
                    src={CdnImageAdapter.getTinyUrl(
                      movie.posterUrl || movie.backdropUrl,
                    )}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      filter: "blur(10px) brightness(0.8)",
                      transform: "scale(1.1)",
                    }}
                  />
                )}
              </div>
            )}



            {/* Bottom-left badges: SERIES + S/E + NEW {DAY} — one row so nothing overlaps */}
            {!isHovered && (
              <div
                style={{
                  position: "absolute",
                  bottom: "8px",
                  left: "8px",
                  zIndex: 10,
                  display: "flex",
                  gap: "4px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  pointerEvents: "none",
                }}
              >
                {/* Non-series premiere: explicit date chip (rail-provided) or
                    a countdown when only the raw date is known */}
                {!isTvContent && movie.formattedRelease && (
                  <div
                    style={{
                      background: "rgba(0,0,0,0.65)",
                      backdropFilter: "blur(6px)",
                      color: "#fff",
                      padding: "2px 6px",
                      borderRadius: "3px",
                      fontSize: "0.5rem",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  >
                    {movie.formattedRelease}
                  </div>
                )}
                {!isTvContent && movie.releaseDate && !movie.formattedRelease && (
                  <CountdownBadge
                    releaseDate={movie.releaseDate}
                    platform={platformForDate}
                    compact
                  />
                )}
                {/* Series with a known next episode: S/E chip + the air DAY
                    (or full release date when the rail provides it) */}
                {isTvContent && nextAirLabel && nextAirDate && (
                  <>
                    <div
                      style={{
                        background: "rgba(96,165,250,0.18)",
                        color: "#93c5fd",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        fontSize: "0.5rem",
                        fontWeight: 800,
                        letterSpacing: "0.04em",
                        backdropFilter: "blur(6px)",
                        border: "1px solid rgba(96,165,250,0.25)",
                      }}
                    >
                      {nextAirLabel}
                    </div>
                    <div
                      style={{
                        background: "var(--accent-gradient)",
                        color: "#fff",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        fontSize: "0.5rem",
                        fontWeight: 800,
                        letterSpacing: "0.04em",
                        backdropFilter: "blur(6px)",
                        display: "flex",
                        alignItems: "center",
                        gap: "3px",
                        textShadow: "0 1px 2px rgba(0,0,0,0.3)",
                      }}
                    >
                      <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#fff', flexShrink: 0 }} />
                      {movie.formattedRelease || nextAirWeekdayShort.toUpperCase()}
                    </div>
                  </>
                )}
                {/* Series premiere / no episode info yet */}
                {isTvContent && !nextAirLabel && (
                  <>
                    <div
                      style={{
                        background: "rgba(0,0,0,0.7)",
                        backdropFilter: "blur(6px)",
                        color: "#fff",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        fontSize: "0.55rem",
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      SERIES
                    </div>
                    {nextAirDate && movie.formattedRelease && (
                      <div
                        style={{
                          background: "rgba(0,0,0,0.65)",
                          backdropFilter: "blur(6px)",
                          color: "#fff",
                          padding: "2px 6px",
                          borderRadius: "3px",
                          fontSize: "0.5rem",
                          fontWeight: 800,
                          letterSpacing: "0.04em",
                          border: "1px solid rgba(255,255,255,0.12)",
                        }}
                      >
                        {movie.formattedRelease}
                      </div>
                    )}
                    {nextAirDate && !movie.formattedRelease && (
                      <CountdownBadge
                        releaseDate={nextAirDate}
                        platform={platformForDate}
                        compact
                      />
                    )}
                  </>
                )}
              </div>
            )}



            {/* Mobile quick action — only visible on touch devices where
                the hover curtain is unreachable. Tapping navigates to
                details; this button toggles the watchlist. */}
            <button
              onClick={handleToggleMyList}
              className="card-quick-list"
              aria-label={
                inList
                  ? `Remove ${movie.title} from My List`
                  : `Add ${movie.title} to My List`
              }
            >
              {inList ? <Check size={18} /> : <Plus size={18} />}
            </button>

            {/* Poster image (Always visible, darkens on hover) */}
            {posterSrc && !hasImageError ? (
              <motion.img
                src={posterSrc}
                alt={movie.title}
                className="movie-poster"
                loading="lazy"
                decoding="async"
                onLoad={() => setIsLoaded(true)}
                onError={() => {
                  logWarn("MovieCard", `Poster image failed to load for "${movie.title}" — showing monogram fallback. Check TMDB image path / CDN reachability.`, { id: movie.id, src: posterSrc });
                  setHasImageError(true);
                  setIsLoaded(false);
                }}
                variants={imageVariants}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  zIndex: 1,
                  willChange: "transform, opacity, filter",
                  opacity: isLoaded ? 1 : 0,
                  transition: "opacity 0.4s ease",
                }}
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  inset: 0,
                  zIndex: 2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "linear-gradient(160deg, #18181b, #0a0a0c)",
                  color: "rgba(255,255,255,0.22)",
                  fontSize: "2.4rem",
                  fontWeight: 800,
                  letterSpacing: "-0.03em",
                }}
              >
                {(movie.title || "?").trim().charAt(0).toUpperCase()}
              </div>
            )}

            {/* ── Cinematic curtain ─────────────────────────── */}
            <motion.div
              variants={curtainVariants}
              style={{
                position: "absolute",
                inset: 0,
                willChange: "opacity",
                background:
                  "linear-gradient(to top, rgba(9,9,11,0.95) 0%, rgba(9,9,11,0.7) 50%, rgba(9,9,11,0.2) 100%)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                alignItems: "center",
                padding: compact ? "0.75rem" : "1rem",
                gap: compact ? "8px" : "10px",
                textAlign: "center",
                zIndex: 5,
              }}
            >
              {/* Single centered circular play button */}
              <motion.button
                variants={btnVariants}
                onClick={(e) => {
                  e.stopPropagation();
                  navigateToDetails();
                }}
                className="curtain-play-btn"
                aria-label={`View details for ${movie.title}`}
                style={{
                  width: compact ? "44px" : "52px",
                  height: compact ? "44px" : "52px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "var(--accent-gradient)",
                  border: "none",
                  color: "var(--on-accent, #fff)",
                  cursor: "pointer",
                  boxShadow:
                    "0 8px 22px var(--accent-glow, rgba(244,63,94,0.5)), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                <Play
                  size={compact ? 18 : 22}
                  fill="currentColor"
                  stroke="none"
                  style={{ marginLeft: "2px" }}
                />
              </motion.button>

              {/* IMDb star rating + year */}
              <motion.div
                variants={metaVariants}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: compact ? "3px 10px" : "4px 12px",
                  borderRadius: "100px",
                  background: "rgba(0,0,0,0.45)",
                  backdropFilter: "blur(6px)",
                  fontSize: compact ? "0.6rem" : "0.7rem",
                  fontWeight: 700,
                  color: "#fff",
                  letterSpacing: "0.02em",
                  whiteSpace: "nowrap",
                }}
              >
                {rating > 0 && (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                      color: "#f5c518",
                    }}
                    title="IMDb"
                  >
                    <Star size={compact ? 10 : 12} fill="currentColor" stroke="none" />
                    <span>{Number(rating).toFixed(1)}</span>
                  </span>
                )}
                {(movie.releaseYear || movie.year) && (
                  <span style={{ color: "rgba(255,255,255,0.8)" }}>
                    {(movie.releaseYear || movie.year)
                      ?.toString()
                      .substring(0, 4)}
                  </span>
                )}
              </motion.div>
            </motion.div>

            {/* Progress bar — always on top of curtain */}
            {showProgress && (
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: "4px",
                  background: "rgba(255,255,255,0.15)",
                  zIndex: 6,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "var(--accent-gradient)",
                    width: `${progressValue}%`,
                    borderRadius: "0 2px 2px 0",
                  }}
                />
              </div>
            )}
          </div>
        </motion.div>
      ) : null}

      {/* Quick View Modal — shown when detailViewType === "modal" */}
      <AnimatePresence>
        {showQuickView && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)" }}
            onClick={() => setShowQuickView(false)}
            role="dialog"
            aria-modal="true"
            aria-label={`${movie.title} quick view`}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl"
              style={{ background: "#13111c", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              {/* Backdrop */}
              {(movie.backdropUrl || movie.posterUrl) && (
                <div
                  className="w-full aspect-video relative overflow-hidden"
                  style={{
                    backgroundImage: `url(${movie.backdropUrl || movie.posterUrl})`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                  }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(19,17,28,0.95) 100%)",
                    }}
                  />
                  {/* Rating badge */}
                  {movie.imdbRating && (
                    <div
                      className="absolute top-3 left-3 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold"
                      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}
                    >
                      <Star size={10} fill="#fbbf24" color="#fbbf24" />
                      <span style={{ color: "#fbbf24" }}>{movie.imdbRating}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Close button */}
              <button
                onClick={() => setShowQuickView(false)}
                className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                style={{ background: "rgba(0,0,0,0.5)", color: "rgba(255,255,255,0.7)" }}
              >
                <X size={16} />
              </button>

              {/* Info */}
              <div className="p-5">
                <h2 className="text-xl font-bold text-white mb-1 leading-tight">{movie.title}</h2>
                <div className="flex items-center gap-2 text-xs text-white/50 mb-3">
                  {movie.releaseYear && <span>{movie.releaseYear}</span>}
                  {movie.genre && <><span>·</span><span>{Array.isArray(movie.genre) ? movie.genre[0] : movie.genre}</span></>}
                  {movie.duration && <><span>·</span><span>{movie.duration}</span></>}
                </div>
                {movie.overview && (
                  <p className="text-sm text-white/60 leading-relaxed mb-4 line-clamp-3">{movie.overview}</p>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowQuickView(false);
                      const slug = slugify(movie.title, { lower: true, strict: true });
                      navigate(`/watch/${movie.id}/${slug}`);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-colors"
                    style={{ background: "var(--accent-gradient, var(--accent-primary, #f43f5e))", color: "var(--on-accent, #fff)" }}
                  >
                    <Play size={14} fill="currentColor" />
                    Play Now
                  </button>
                  <button
                    onClick={(e) => handleToggleMyList(e)}
                    aria-label={inList ? "Remove from My List" : "Add to My List"}
                    title={inList ? "Remove from My List" : "Add to My List"}
                    className="w-11 shrink-0 py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center"
                    style={{
                      background: inList ? "rgba(var(--accent-primary-rgb), 0.16)" : "rgba(255,255,255,0.08)",
                      border: inList ? "1px solid rgba(var(--accent-primary-rgb), 0.45)" : "1px solid rgba(255,255,255,0.12)",
                      color: inList ? "var(--accent-primary, #fff)" : "rgba(255,255,255,0.8)",
                    }}
                  >
                    {inList ? <Check size={16} /> : <Plus size={16} />}
                  </button>
                  <button
                    onClick={() => {
                      setShowQuickView(false);
                      const slug = slugify(movie.title, { lower: true, strict: true });
                      navigate(`/watch/${movie.id}/${slug}`);
                    }}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white/80 transition-colors"
                    style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}
                  >
                    Full Details
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
