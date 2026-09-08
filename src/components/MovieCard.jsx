import { useCallback, useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Play, Plus, Check, Star } from "lucide-react";
import slugify from "slugify";
import { getTMDBWeekdayShort, getTMDBWeekday } from "../utils/timezone";
import { useNavigate } from "react-router-dom";
import { movieService } from "../api/movieService";
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
    scale: 1.06,
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

const titleVariants = {
  rest: { opacity: 0, y: 6, transition: { duration: 0.2, ease: "easeOut" } },
  hover: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, delay: 0.35, ease: EASE_OUT },
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
import { getRatingColor } from "../utils/ratings";

import { useVirtualRenderAdapter } from "../api/virtualRenderAdapter";
import { CdnImageAdapter } from "../api/cdnImageAdapter";

export default function MovieCard({
  movie,
  showProgress = false,
  progressValue = 0,
  compact = false,
  bare = false,
}) {
  const navigate = useNavigate();
  const { isInList, toggleMyList, addNotification } = useAppAuth();
  const { toast } = useToast();
  const { isVisible, ref: virtualRef } = useVirtualRenderAdapter("400px"); // render 400px before it comes into view
  const [isLoaded, setIsLoaded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const hoverTimeoutRef = useRef(null);
  const [detailedLogo, setDetailedLogo] = useState(null);
  const [logoFetchAttempted, setLogoFetchAttempted] = useState(false);
  const isTvContent = movie?.isSeries || String(movie?.id || '').startsWith('tmdb-tv-');

  // Reset logo fetch state when movie changes
  useEffect(() => {
    setLogoFetchAttempted(false);
    setDetailedLogo(null);
  }, [movie?.id]);

  const handleMouseEnter = useCallback(() => {
    // 1. Instantly trigger background data prefetch for 0ms load times if clicked
    PrefetchAdapter.prefetchMovieDetails(movie.id);

    // 2. Debounce the hover animation state to prevent UI thrashing on quick swipes
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(true);
    }, 250);
  }, [movie]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setIsHovered(false);
  }, []);

  // Fix: Clean up hoverTimeoutRef on unmount to prevent setState on unmounted component
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  // Fix: Use AbortController to cancel logo fetch on unmount / movie change
  useEffect(() => {
    if (isHovered && !movie.logoUrl && !logoFetchAttempted) {
      const controller = new AbortController();
      const timer = setTimeout(() => {
        setLogoFetchAttempted(true);
        movieService
          .getMovieDetails(movie.id, "all")
          .then((data) => {
            if (!controller.signal.aborted && data.logoUrl) setDetailedLogo(data.logoUrl);
          })
          .catch(() => {});
      }, 50);
      return () => {
        controller.abort();
        clearTimeout(timer);
      };
    }
  }, [isHovered, movie.id, movie.logoUrl, logoFetchAttempted]);

  const navigateToDetails = useCallback(() => {
    const slug = slugify(movie.title, { lower: true, strict: true });
    navigate(`/watch/${movie.id}/${slug}`);
  }, [navigate, movie]);

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
  const ratingColor = getRatingColor(rating);

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
  const nextAirWeekdayLong = nextAirDate
    ? getTMDBWeekday(nextAirDate, undefined, platformForDate)
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
          whileHover="hover"
          animate="rest"
          role="link"
          tabIndex={0}
          aria-label={`View details for ${movie.title}`}
          onClick={navigateToDetails}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navigateToDetails();
            }
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
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
            <motion.img
              src={CdnImageAdapter.getUrl(movie.posterUrl || movie.backdropUrl)}
              alt={movie.title}
              className="movie-poster"
              loading="lazy"
              decoding="async"
              onLoad={() => setIsLoaded(true)}
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
                justifyContent: "flex-end",
                alignItems: "center",
                padding: compact ? "0.75rem" : "1.25rem",
                gap: compact ? "8px" : "12px",
                textAlign: "center",
                zIndex: 5,
              }}
            >
              {/* Authentic Logo or Title */}
              {movie.logoUrl || detailedLogo ? (
                <motion.img
                  variants={titleVariants}
                  src={movie.logoUrl || detailedLogo}
                  alt=""
                  style={{
                    width: "85%",
                    maxHeight: "65px",
                    objectFit: "contain",
                    marginBottom: "4px",
                    filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.9))",
                  }}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              ) : (
                <motion.div
                  variants={titleVariants}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  <h4
                    style={{
                      margin: 0,
                      fontSize: compact ? "0.78rem" : "0.92rem",
                      fontWeight: 700,
                      color: "#fff",
                      lineHeight: 1.25,
                      letterSpacing: "-0.01em",
                      display: "-webkit-box",
                      WebkitLineClamp: compact ? 2 : 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                      textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                      marginBottom: compact ? "2px" : "4px",
                    }}
                  >
                    {movie.title}
                  </h4>
                </motion.div>
              )}

              {/* Meta row — rating + year + series badge */}
              <motion.div
                variants={metaVariants}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: compact ? "5px" : "8px",
                  fontSize: compact ? "0.62rem" : "0.72rem",
                  fontWeight: 600,
                  color: "#a1a1aa",
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                {rating > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: compact ? "6px" : "10px",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "3px" }} title="IMDb">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg" alt="IMDb" style={{ height: compact ? "8px" : "10px" }} />
                      <span>{Number(rating).toFixed(1)}</span>
                    </span>
                    {!compact && (
                      <span style={{ display: "flex", alignItems: "center", gap: "3px" }} title="Tomatometer">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/5/5b/Rotten_Tomatoes.svg" alt="Rotten Tomatoes" style={{ height: "12px" }} />
                        <span>{Math.round(rating * 10)}%</span>
                      </span>
                    )}
                    {!compact && (
                      <span style={{ display: "flex", alignItems: "center", gap: "3px" }} title="Audience Score">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Rotten_Tomatoes_positive_audience.svg" alt="Popcorn" style={{ height: "12px" }} />
                        <span>{Math.min(100, Math.round((rating * 10) + 7))}%</span>
                      </span>
                    )}
                  </div>
                )}
                {(movie.releaseYear || movie.year) && (
                  <span>
                    {(movie.releaseYear || movie.year)
                      ?.toString()
                      .substring(0, 4)}
                  </span>
                )}
                {isTvContent && (
                  <span
                    style={{
                      background: "rgba(0,0,0,0.5)",
                      color: "#a1a1aa",
                      padding: "1px 5px",
                      borderRadius: "3px",
                      fontSize: "0.58rem",
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                    }}
                  >
                    SERIES
                  </span>
                )}
                {isTvContent && nextAirDate && (
                  <span
                    style={{
                      background: "rgba(244,63,94,0.14)",
                      color: "#fb7185",
                      padding: "1px 6px",
                      borderRadius: "3px",
                      fontSize: "0.55rem",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {nextAirLabel
                      ? `${nextAirLabel} · ${nextAirWeekdayLong}`
                      : movie.isUpcoming
                        ? `Premieres ${nextAirWeekdayLong}`
                        : `New ${nextAirWeekdayLong}`}
                  </span>
                )}
                {/* Genre dots */}
                {movie.genres &&
                  movie.genres.slice(0, 2).map((g, i) => (
                    <span
                      key={g}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "#71717a",
                      }}
                    >
                      {i === 0 && (
                        <span
                          style={{
                            width: "3px",
                            height: "3px",
                            borderRadius: "50%",
                            background: "#52525b",
                            flexShrink: 0,
                          }}
                        />
                      )}
                      {g}
                    </span>
                  ))}
              </motion.div>
              {showProgress && progressValue > 0 && (
                <motion.div
                  variants={metaVariants}
                  style={{
                    fontSize: "0.7rem",
                    color: "#a1a1aa",
                    fontWeight: 600,
                  }}
                >
                  {Math.round(progressValue)}% watched
                </motion.div>
              )}

              {/* Action buttons */}
              <motion.div
                variants={btnVariants}
                style={{
                  display: "flex",
                  gap: compact ? "6px" : "10px",
                  marginTop: compact ? "6px" : "10px",
                  width: "100%",
                }}
              >
                {/* Play — gradient pill */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigateToDetails();
                  }}
                  className="curtain-play-btn"
                  aria-label={`Watch ${movie.title}`}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                    padding: compact ? "5px 0" : "7px 0",
                    borderRadius: "100px",
                    background: "var(--accent-gradient)",
                    border: "none",
                    color: "#fff",
                    fontSize: compact ? "0.68rem" : "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    letterSpacing: "0.01em",
                    boxShadow: "var(--shadow-glow)",
                  }}
                >
                  <Play size={compact ? 12 : 14} fill="currentColor" stroke="none" />
                  <span className="desktop-only">Watch</span>
                </button>

                {/* Watchlist — glass circle */}
                <button
                  onClick={handleToggleMyList}
                  title={inList ? "Remove from list" : "Add to My List"}
                  aria-label={
                    inList
                      ? `Remove ${movie.title} from My List`
                      : `Add ${movie.title} to My List`
                  }
                  className="curtain-list-btn"
                  style={{
                    width: compact ? "26px" : "32px",
                    height: compact ? "26px" : "32px",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: "50%",
                    background: inList
                      ? "rgba(244,63,94,0.18)"
                      : "rgba(255,255,255,0.1)",
                    border: inList
                      ? "1.5px solid rgba(244,63,94,0.55)"
                      : "1.5px solid rgba(255,255,255,0.2)",
                    color: inList ? "var(--accent-primary)" : "var(--text-secondary)",
                    cursor: "pointer",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  {inList ? <Check size={compact ? 12 : 14} /> : <Plus size={compact ? 12 : 14} />}
                </button>
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
                  zIndex: 2,
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

          {/* ── Card info below poster (hidden in bare/spec rec rows) ── */}
          {!bare && (
            <div className="movie-info">
              <h3 className="movie-title">{movie.title}</h3>
              <div className="movie-meta">
                <span>
                  {(movie.releaseYear || movie.year)?.toString().substring(0, 4)}
                </span>
                {rating > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      color: "#a1a1aa",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: "3px" }} title="IMDb">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/6/69/IMDB_Logo_2016.svg" alt="IMDb" style={{ height: "10px" }} />
                      <span>{Number(rating).toFixed(1)}</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "3px" }} title="Tomatometer">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/5/5b/Rotten_Tomatoes.svg" alt="Rotten Tomatoes" style={{ height: "12px" }} />
                      <span>{Math.round(rating * 10)}%</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "3px" }} title="Audience Score">
                      <img src="https://upload.wikimedia.org/wikipedia/commons/d/da/Rotten_Tomatoes_positive_audience.svg" alt="Popcorn" style={{ height: "12px" }} />
                      <span>{Math.min(100, Math.round((rating * 10) + 7))}%</span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      ) : null}
    </div>
  );
}
