import { useCallback, useState, useEffect, useMemo, memo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Check, Star, Play } from "lucide-react";
import slugify from "slugify";
import { highlightSegments } from "../utils/highlightMatch";
import { buildMovieAddedNotification, fireListMilestone } from "../utils/notificationEngine";
import CountdownBadge from "./CountdownBadge";
import ContentTag from "./ContentTag";
import { getContentTags } from "../utils/contentTags";
import useDetailView from "../hooks/useDetailView";
import { useAppAuth } from "../context/auth";
import { useOptionalNotifications } from "../context/notifications";
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
import { pickImageWidth } from "../utils/artwork";
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
  const { isInList, toggleMyList, myList } = useAppAuth();
  const { addNotification } = useOptionalNotifications() || {};
  const { toast } = useToast();
  const preferences = useOptionalPreferences();
  const hdThumbs = preferences?.hdThumbs;
  const { isVisible, ref: virtualRef } = useVirtualRenderAdapter("400px"); // render 400px before it comes into view
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasImageError, setHasImageError] = useState(false);
  const isTvContent = movie?.isSeries || String(movie?.id || '').startsWith('tmdb-tv-');
  // Below-card metadata removed per user request (shows on hover).
  // Kept only when highlightQuery exists so search term <mark> highlighting in .movie-title works.
  const showBelowMeta = Boolean(highlightQuery);


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
  const navigate = useNavigate();
  // Direct play affordance: the watch route auto-resumes, so Play lands the
  // viewer on the title's playback page whatever the Detail View Type is
  // (same contract as the hero banner's Play button and CW's Resume pill).
  const watchTo = `/watch/${movie.id}/${slugify(movie.title || "watch", {
    lower: true,
    strict: true,
  })}`;
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
        fireListMilestone((myList?.length || 0) + 1, addNotification);
      }
    },
    [movie, isInList, toggleMyList, toast, addNotification, isTvContent],
  );

  const inList = isInList(movie.id);

  const rating = movie.imdbRating;

  // Fallback so every card has an image: poster → backdrop, else a branded
  // monogram tile. Never render a broken <img>.
  const posterPath = movie.posterUrl || movie.backdropUrl;
  const posterSrc = useMemo(
    () => CdnImageAdapter.getUrl(posterPath, pickImageWidth("card", { hdThumbs })),
    [posterPath, hdThumbs],
  );

  /* Placeholder served pre-blurred by the CDN, so the loading state costs one
     plain <img> instead of a runtime filter layer per mounted card. */
  const posterTinySrc = useMemo(
    () => CdnImageAdapter.getTinyUrl(posterPath, { blur: 12 }),
    [posterPath],
  );

  /* One URL per card was resolved once at render, so a phone and a 4K desktop
     both downloaded the same rendition. srcSet lets the browser pick per DPR
     and width; `hdThumbs === false` keeps the single small URL because that is
     an explicit bandwidth preference, not a layout decision. */
  const posterSrcSet = useMemo(
    () => (hdThumbs === false ? undefined : CdnImageAdapter.getSrcSet(posterPath, "card")),
    [posterPath, hdThumbs],
  );

  useEffect(() => {
    setIsLoaded(false);
    setHasImageError(false);
  }, [posterSrc]);

  const platformForDate = movie.source || movie.platform;

  // Content tags ("NEW" = recently released) come from one pure helper so the
  // rule lives in contentTags.js and is unit-tested there, not re-derived here.
  // Empty for unreleased titles — those are CountdownBadge's job.
  const contentTags = getContentTags(movie);

  return (
    <div
      ref={virtualRef}
      /* content-visibility: auto makes the browser skip layout/paint — and the
         blur-up skeleton's shimmer raster with it — for every card outside the
         render gap, so an idle populated page paints ~a dozen cards instead of
         135. contain-intrinsic-size (with `auto`) keeps scroll geometry stable
         while skipped and reuses the last real size once one exists. */
      style={{
        width: "100%",
        height: "100%",
        minHeight: "200px",
        contentVisibility: "auto",
        containIntrinsicSize: "auto 320px",
      }}
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
                {posterTinySrc && (
                  <img
                    src={posterTinySrc}
                    alt=""
                    /* Lazy like the real poster: a rail mounts every card, and
                       without this each one eagerly fetched its 92px blur-up
                       even far outside the viewport, spending a request slot
                       that the poster it precedes then had to queue behind. */
                    loading="lazy"
                    decoding="async"
                    /* The blur is baked into the CDN response (getTinyUrl
                       `blur`), so this layer is a plain <img>: no filter, no
                       scale transform, nothing to re-rasterise per scroll
                       frame across 15 cards a rail. */
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      opacity: 0.85,
                    }}
                  />
                )}
              </div>
            )}



            {/* Bottom-left badges: content tags (NEW) + release chips — one
                row so nothing overlaps. Always mounted; the CSS curtain
                choreography fades the row out while the curtain is open (old
                code unmounted it on a debounced hover state, which re-rendered
                the card on every hover). */}
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
                      color: "var(--white)",
                      padding: "2px 6px",
                      borderRadius: "3px",
                      fontSize: "var(--text-2xs)",
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
                srcSet={posterSrcSet}
                sizes={posterSrcSet ? CdnImageAdapter.getSizes("card") : undefined}
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

            {/* Centred play disc — appears on hover/focus above every layer
                (z 15), plays the title straight from the poster. */}
            <div className="card-play-disc">
              <button
                type="button"
                className="card-play-disc__btn"
                aria-label={`Play ${movie.title}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate(watchTo);
                }}
              >
                <Play
                  size={20}
                  fill="currentColor"
                  stroke="none"
                  style={{ marginLeft: "2px" }}
                  aria-hidden="true"
                />
              </button>
            </div>

            {/* ── Cinematic curtain ─────────────────────────── */}
            <div
              className="card-curtain"
              /* rivo.st's card hover layer, taken from their shipped markup:
                 a BOTTOM gradient band (`from-black/85 via-black/40 to-
                 transparent`, `p-3 pt-10`) that rises 8px and fades in over
                 `duration-300 ease-tv`. Their band stops at the rating/year
                 line; ours adds the title. Play lives in the centred disc
                 above this layer — the band itself carries no controls. */
              style={{
                position: "absolute",
                inset: "auto 0 0 0",
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.4) 55%, transparent)",
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                padding: compact ? "0.6rem" : "0.75rem",
                paddingTop: compact ? "1.6rem" : "2.5rem",
                gap: "4px",
                textAlign: "left",
                zIndex: 5,
              }}
            >
              {/* Hover title — the card's name, one line, ellipsis-clipped */}
              <div className="curtain-title">
                {movie.title}
              </div>

              {/* rivo.st's hover meta line — `flex items-center gap-1.5
                  text-[13px] font-semibold text-white/90`: amber star, rating,
                  a dim `·`, then the year. The centred disc is the only
                  control on the card; the band carries none. */}
              <div
                className="curtain-meta"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.9)",
                  whiteSpace: "nowrap",
                }}
              >
                {rating > 0 && (
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "3px",
                      color: "#fcd34d",
                    }}
                    title="IMDb"
                  >
                    <Star size={14} fill="currentColor" stroke="none" />
                    <span>{Number(rating).toFixed(1)}</span>
                  </span>
                )}
                {rating > 0 && (movie.releaseYear || movie.year) && (
                  <span aria-hidden="true" style={{ color: "rgba(255,255,255,0.5)" }}>
                    ·
                  </span>
                )}
                {(movie.releaseYear || movie.year) && (
                  <span>
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

      {/* Streamly-style info modal host — shown when Detail View Type = "modal".
          One shared modal for cards and the hero banner (TitleInfoModal). */}
      {modalHost}
    </div>
  );
});

export default MovieCard;
