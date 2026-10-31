import { useCallback, useState, useEffect, memo } from "react";
import { Play, Plus, Check, Star } from "lucide-react";
import { getTMDBWeekdayShort } from "../utils/timezone";
import { highlightSegments } from "../utils/highlightMatch";
import { buildMovieAddedNotification } from "../utils/notificationEngine";
import CountdownBadge from "./CountdownBadge";
import ContentTag from "./ContentTag";
import { getContentTags } from "../utils/contentTags";
import useDetailView from "../hooks/useDetailView";
import { useAppAuth } from "../context/auth";
import { useToast } from "./Toast";

/* ─────────────────────────────────────────────────────────────
MovieCard — "Cinematic Curtain" hover design

   The choreography (lift, veil, curtain, meta, badges) is pure CSS, declared
   next to the card styles in styles/grids.css: transitions start on the first
   frame of hover with no debounced state, `:hover` is scoped to real pointing
   devices, `:focus-visible` reproduces the keyboard behaviour, and hovering a
   card runs ZERO React work. The JS handlers here only trigger background
   prefetch of the details data so the click lands on a warm cache. ─────── */

import { PrefetchAdapter } from "../api/prefetchAdapter";

import { useVirtualRenderAdapter } from "../hooks/useVirtualRenderAdapter";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { useOptionalPreferences } from "../context/preferences";
import { logWarn } from "../utils/debugLogger";

// Device capability is static per session — computed once at module scope so it
// never re-runs on every card render. "Touch" means the PRIMARY pointer has no
// hover (phones/tablets); touchscreen laptops keep the curtain.
const isTouchDevice =
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(hover: none), (pointer: coarse)").matches;

const MovieCard = memo(function MovieCard({
  movie,
  showProgress = false,
  progressValue = 0,
  compact = false,
  // Search-only: when present, the matched span of this query renders as
  // <mark> in the title so a result visibly answers what was typed. Undefined
  // everywhere else, so nothing outside search pays for it.
  highlightQuery,
  // Select mode (Watchlist/History): when present, activating the card toggles
  // this movie's selection instead of opening details, so a click or Enter/Space
  // never navigates away mid-selection. Undefined everywhere else.
  onToggleSelect,
}) {
  const { isInList, toggleMyList, addNotification } = useAppAuth();
  const { toast } = useToast();
  const preferences = useOptionalPreferences();
  const { isVisible, ref: virtualRef } = useVirtualRenderAdapter("400px"); // render 400px before it comes into view
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);
  const isTvContent = movie?.isSeries || String(movie?.id || '').startsWith('tmdb-tv-');
  // Touch devices never see the hover curtain, so metadata moves below the
  // poster (Cinejoy-style "mobile card meta"). Desktop keeps the curtain-only
  // look — EXCEPT when a search query is being highlighted, because a <mark>
  // nobody can see is not a highlight. Search results therefore always print
  // their title, which is also what every other streaming search does.
  const showBelowMeta = isTouchDevice || Boolean(highlightQuery);


  // Hover/focus no longer drive any animation state (that is CSS in
  // styles/grids.css) — the handlers exist purely to warm the details cache so
  // the click after a hover resolves from prefetch instead of the network.
  const handleMouseEnter = useCallback(() => {
    if (isTouchDevice) return;
    PrefetchAdapter.prefetchMovieDetails(movie.id);
  }, [movie]);

  const handleFocus = useCallback(() => {
    PrefetchAdapter.prefetchMovieDetails(movie.id);
  }, [movie.id]);

  // Details open through one shared gateway — page or modal per the
  // Detail View Type preference (same behavior as the hero banner).
  const { openDetails, modalHost } = useDetailView();
  const navigateToDetails = useCallback(() => openDetails(movie), [openDetails, movie]);
  // Card activation is context-dependent: select mode toggles selection instead
  // of navigating, so a click (or Enter/Space) mid-selection can never unmount
  // the page and destroy the selection set.
  const activateCard = useCallback(() => {
    if (onToggleSelect) onToggleSelect(movie.id);
    else navigateToDetails();
  }, [onToggleSelect, navigateToDetails, movie.id]);

  const handleToggleMyList = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const wasInList = isInList(movie.id);
      // Gated: a refusal means the sign-in dialog opened instead, so no toast and
      // no "added to your list" notification for a save that never happened.
      if (toggleMyList(movie) === false) return;
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
    // Airing-rail cards (and any series with an announced next episode) show the
    // DAY it drops plus season/episode: airing-only series use nextEpisode,
    // premiering series their future release date.
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

  // Content tags ("NEW" = recently released) come from one pure helper so the
  // rule lives in contentTags.js and is unit-tested there, not re-derived here.
  // Empty for unreleased titles — those are CountdownBadge's job.
  const contentTags = getContentTags(movie);

  return (
    <div
      ref={virtualRef}
      style={{ width: "100%", height: "100%", minHeight: "200px" }}
    >
      {isVisible ? (
        <div
          className="movie-card"
          role="button"
          tabIndex={0}
          aria-label={
            onToggleSelect
              ? `Select or deselect ${movie.title}`
              : `View details for ${movie.title}`
          }
          onClick={activateCard}
          onKeyDown={(e) => {
            // Only activate when the card itself is focused — inner buttons
            // handle their own keyboard activation and must not bubble here.
            if (e.target !== e.currentTarget) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              activateCard();
            }
          }}
          onMouseEnter={handleMouseEnter}
          onFocus={handleFocus}
          style={{
            cursor: "pointer",
            position: "relative",
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



            {/* Bottom-left badges: SERIES + S/E + NEW {DAY} — one row so nothing
                overlaps. Always mounted; the CSS curtain choreography fades the
                row out while the curtain is open (old code unmounted it on a
                debounced hover state, which re-rendered the card on every
                hover). */}
            <div
              className="card-badges"
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
                {/* Content tags first (NEW). getContentTags suppresses itself
                    when the rail already renders an equivalent label, so this
                    never double-labels a card. */}
                {contentTags.map((tag) => (
                  <ContentTag
                    key={tag.id}
                    label={tag.label}
                    tone={tag.tone}
                    reason={tag.reason}
                  />
                ))}
                {/* Non-series premiere: explicit date chip (rail-provided) or
                    a countdown when only the raw date is known */}
                {!isTvContent && movie.formattedRelease && (
                  <div
                    style={{
                      background: "rgba(0,0,0,0.65)",
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
              <img
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
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  zIndex: 1,
                  opacity: isLoaded ? 1 : 0,
                  transition: "opacity var(--duration-fast) var(--ease-out)",
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

            {/* Flat hover veil (Cinejoy-style): a plain opacity fade instead of
                animating filter: brightness/saturate, which would repaint on
                every frame. Opacity is compositor-only; class-driven from the
                curtain choreography in styles/grids.css. */}
            <div
              className="card-veil"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                background: "rgba(0, 0, 0, 0.45)",
                pointerEvents: "none",
              }}
            />

            {/* ── Cinematic curtain ─────────────────────────── */}
            <div
              className="card-curtain"
              style={{
                position: "absolute",
                inset: 0,
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
              {/* Single centered circular play button — Cinejoy white circle */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  // Same context-dependent activation as the card itself — in
                  // select mode this must not navigate away either.
                  activateCard();
                }}
                className="curtain-play-btn"
                aria-label={
                  onToggleSelect
                    ? `Select or deselect ${movie.title}`
                    : `View details for ${movie.title}`
                }
                style={{
                  width: compact ? "44px" : "52px",
                  height: compact ? "44px" : "52px",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#ffffff",
                  border: "none",
                  color: "#0b0b0f",
                  cursor: "pointer",
                  boxShadow:
                    "0 8px 24px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.9)",
                }}
              >
                  <Play
                    size={compact ? 18 : 22}
                    fill="currentColor"
                    stroke="none"
                    style={{ marginLeft: "2px" }}
                  />
              </button>

              {/* IMDb star rating + year */}
              <div
                className="curtain-meta"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: compact ? "3px 10px" : "4px 12px",
                  borderRadius: "var(--radius-full)",
                  background: "rgba(0,0,0,0.45)",
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
              </div>
            </div>

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
        </div>
      ) : null}

      {/* Below-card metadata — touch devices (no hover curtain) */}
      {isVisible && showBelowMeta && (
        <div className="movie-info" role="presentation">
          <p className="movie-title" title={movie.title}>
            {highlightQuery
              ? highlightSegments(movie.title, highlightQuery).map((seg, i) =>
                  seg.hit ? <mark key={i}>{seg.text}</mark> : seg.text,
                )
              : movie.title}
          </p>
          <div className="movie-meta">
            {rating > 0 ? (
              <span className="movie-meta-rating">
                <Star
                  size={11}
                  fill="currentColor"
                  stroke="none"
                  aria-hidden="true"
                />
                {Number(rating).toFixed(1)}
              </span>
            ) : (
              <span />
            )}
            {(movie.releaseYear || movie.year) && (
              <span className="movie-meta-year">
                {(movie.releaseYear || movie.year).toString().substring(0, 4)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Netflix-style info modal host — shown when Detail View Type = "modal".
          One shared modal for cards and the hero banner (TitleInfoModal). */}
      {modalHost}
    </div>
  );
});

export default MovieCard;
