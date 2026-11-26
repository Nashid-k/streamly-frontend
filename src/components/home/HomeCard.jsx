import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Play, Plus, X } from "lucide-react";
import slugify from "slugify";

import { CdnImageAdapter } from "../../api/cdnImageAdapter";
import { PrefetchAdapter } from "../../api/prefetchAdapter";
import { useAppAuth } from "../../context/auth";
import { usePreferenceValue } from "../../context/preferences";
import { useOptionalNotifications } from "../../context/notifications";
import useDetailView, { isDetailRestoring } from "../../hooks/useDetailView";
import { useVirtualRenderAdapter } from "../../hooks/useVirtualRenderAdapter";
import { useOptionalToast } from "../Toast";
import { getContentTags } from "../../utils/contentTags";
import { logWarn } from "../../utils/debugLogger";
import { buildMovieAddedNotification, fireListMilestone } from "../../utils/notificationEngine";
import { pickImageWidth, sceneHues } from "../../utils/artwork";
import { hasLoadedMediaUrl, markMediaUrlLoaded } from "../../utils/posterCache";

const isTouchDevice =
  typeof window !== "undefined" &&
  Boolean(window.matchMedia) &&
  window.matchMedia("(hover: none), (pointer: coarse)").matches;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  Boolean(window.matchMedia) &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* The 2.0 home card. It deliberately shares no DOM with the legacy MovieCard:
   `.cw > .cd > .po` plus sibling `.qp/.qa` is the canonical target markup.
   Loading, monogram and progress are CSS states of `.po`, not extra wrappers. */
const HomeCard = memo(function HomeCard({
  movie,
  detailToken,
  index = 0,
  progressValue = 0,
  progressLabel,
  editMode = false,
  onRemove,
}) {
  const { isInList, toggleMyList, myList } = useAppAuth();
  const { addNotification } = useOptionalNotifications() || {};
  const { toast } = useOptionalToast();
  const navigate = useNavigate();
  const { openDetails, modalHost } = useDetailView();
  const hdThumbs = usePreferenceValue("hdThumbs");
  const { isVisible: hookVisible, ref: virtualRef } = useVirtualRenderAdapter("400px");
  const isVisible = hookVisible || isDetailRestoring();
  const [hasImageError, setHasImageError] = useState(false);
  const [bump, setBump] = useState(false);

  const cardRef = useRef(null);
  const posterRef = useRef(null);
  const posterImgRef = useRef(null);
  const tiltFrameRef = useRef(0);
  const tiltPointRef = useRef(null);
  const bumpTimersRef = useRef([]);
  const playTimerRef = useRef(0);

  const inList = isInList(movie.id);
  const isSeries = Boolean(
    movie.isSeries || String(movie.id || "").startsWith("tmdb-tv-"),
  );
  const rating = Number(movie.imdbRating) > 0 ? Number(movie.imdbRating).toFixed(1) : null;
  const year = String(movie.releaseYear || movie.year || "").substring(0, 4);

  const posterPath = movie.posterUrl || movie.backdropUrl;
  const posterSrc = useMemo(
    () => CdnImageAdapter.getUrl(posterPath, pickImageWidth("card", { hdThumbs })),
    [posterPath, hdThumbs],
  );
  const posterSrcSet = useMemo(
    () => (hdThumbs === false || !posterPath ? undefined : CdnImageAdapter.getSrcSet(posterPath, "card")),
    [posterPath, hdThumbs],
  );
  const [hueA, hueB] = useMemo(() => sceneHues(movie.id), [movie.id]);
  const [isLoaded, setIsLoaded] = useState(() => hasLoadedMediaUrl(posterSrc));
  const watchTo = useMemo(
    () => `/watch/${movie.id}/${slugify(movie.title || "watch", { lower: true, strict: true })}`,
    [movie.id, movie.title],
  );

  const clearTilt = useCallback(() => {
    tiltPointRef.current = null;
    if (tiltFrameRef.current) {
      window.cancelAnimationFrame?.(tiltFrameRef.current);
      tiltFrameRef.current = 0;
    }
    const poster = posterRef.current;
    if (!poster) return;
    poster.classList.remove("tilting");
    poster.style.removeProperty("--rx");
    poster.style.removeProperty("--ry");
    poster.style.removeProperty("--mx");
    poster.style.removeProperty("--my");
  }, []);

  // Canonical 2.0 arms the play affordance only after a deliberate 320ms hover,
  // so a fast pointer pass across the rail never leaves stale play targets.
  const clearPlayTimer = useCallback(() => {
    if (playTimerRef.current) clearTimeout(playTimerRef.current);
    playTimerRef.current = 0;
    cardRef.current?.closest(".cw")?.classList.remove("play-ready");
  }, []);

  const schedulePlayReady = useCallback(() => {
    clearPlayTimer();
    playTimerRef.current = setTimeout(() => {
      playTimerRef.current = 0;
      cardRef.current?.closest(".cw")?.classList.add("play-ready");
    }, 320);
  }, [clearPlayTimer]);

  const handlePointerMove = useCallback((event) => {
    if (event.pointerType === "touch" || isTouchDevice || reducedMotion()) return;
    tiltPointRef.current = { x: event.clientX, y: event.clientY };
    if (tiltFrameRef.current) return;

    const apply = () => {
      tiltFrameRef.current = 0;
      const point = tiltPointRef.current;
      const poster = posterRef.current;
      if (!point || !poster) return;
      const rect = poster.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = Math.min(1, Math.max(0, (point.x - rect.left) / rect.width));
      const y = Math.min(1, Math.max(0, (point.y - rect.top) / rect.height));
      poster.classList.add("tilting");
      poster.style.setProperty("--rx", `${((0.5 - y) * 7).toFixed(2)}deg`);
      poster.style.setProperty("--ry", `${((x - 0.5) * 7).toFixed(2)}deg`);
      poster.style.setProperty("--mx", `${(x * 100).toFixed(2)}%`);
      poster.style.setProperty("--my", `${(y * 100).toFixed(2)}%`);
    };

    tiltFrameRef.current = window.requestAnimationFrame
      ? window.requestAnimationFrame(apply)
      : 0;
    if (!tiltFrameRef.current) apply();
  }, []);

  const open = useCallback(
    (event) => {
      if (editMode) return;
      const sourceElement =
        event?.currentTarget?.querySelector(".po") || posterRef.current || cardRef.current;
      openDetails(movie, { sourceElement, detailToken });
    },
    [detailToken, editMode, movie, openDetails],
  );

  const play = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      navigate(watchTo);
    },
    [navigate, watchTo],
  );

  const remove = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      onRemove?.(movie);
    },
    [movie, onRemove],
  );

  const clearBumpTimers = useCallback(() => {
    bumpTimersRef.current.forEach(clearTimeout);
    bumpTimersRef.current = [];
  }, []);

  const toggleList = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const wasInList = inList;
      if (toggleMyList(movie) === false) return;
      if (!wasInList) {
        clearBumpTimers();
        setBump(false);
        bumpTimersRef.current.push(
          setTimeout(() => {
            setBump(true);
            bumpTimersRef.current.push(setTimeout(() => setBump(false), 300));
          }, 0),
        );
      }
      toast({
        title: wasInList ? "Removed from List" : "Added to My List",
        message: wasInList
          ? `"${movie.title}" was removed.`
          : `"${movie.title}" saved to your list.`,
        type: wasInList ? "info" : "success",
        duration: 2500,
      });
      if (!wasInList && addNotification) {
        const notification = buildMovieAddedNotification({
          title: movie.title,
          platform: movie.source || movie.sourceName,
          year: movie.releaseYear || movie.year,
          duration: movie.duration,
          imageUrl: movie.backdropUrl || movie.posterUrl,
          movieId: movie.id,
          isSeries,
        });
        addNotification(notification);
        fireListMilestone((myList?.length || 0) + 1, addNotification);
      }
    },
    [addNotification, clearBumpTimers, inList, isSeries, movie, myList, toast, toggleMyList],
  );

  useLayoutEffect(() => {
    setHasImageError(false);
    const img = posterImgRef.current;
    if (posterSrc && (hasLoadedMediaUrl(posterSrc) || (img?.complete && img?.naturalWidth > 0))) {
      markMediaUrlLoaded(posterSrc);
      setIsLoaded(true);
    } else {
      setIsLoaded(false);
    }
  }, [posterSrc]);

  useEffect(() => {
    PrefetchAdapter.prefetchMovieDetails(movie.id);
  }, [movie.id]);

  useEffect(
    () => () => {
      clearBumpTimers();
      if (playTimerRef.current) clearTimeout(playTimerRef.current);
      if (tiltFrameRef.current) window.cancelAnimationFrame?.(tiltFrameRef.current);
    },
    [clearBumpTimers],
  );

  const tags = getContentTags(movie);
  const tagLabel = tags[0]?.label || (!isSeries ? movie.formattedRelease : null);
  const meta = [rating, year, progressLabel].filter(Boolean).join(" · ");
  const progressPercent = Math.min(100, Math.max(0, progressValue));

  return (
    <div ref={virtualRef} className="cw home-card" style={{ "--i": Math.min(index, 5) }}>
      {isVisible && (
        <>
          <div
            ref={cardRef}
            className="cd"
            role="button"
            tabIndex={editMode ? -1 : 0}
            aria-label={editMode ? movie.title : `View details for ${movie.title}`}
            onClick={open}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                open(event);
              }
            }}
            onPointerEnter={schedulePlayReady}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => {
              clearTilt();
              clearPlayTimer();
            }}
          >
            <div
              ref={posterRef}
              className="po"
              data-detail-source={movie.id}
              data-detail-token={detailToken}
              data-initial={(movie.title || "?").trim().charAt(0).toUpperCase()}
              data-loaded={isLoaded && !hasImageError ? "true" : undefined}
              data-failed={!posterSrc || hasImageError ? "true" : undefined}
              style={{
                "--a": hueA,
                "--b": hueB,
                ...(progressPercent > 0 ? { "--progress": `${progressPercent}%` } : {}),
              }}
            >
              {posterSrc && !hasImageError ? (
                <img
                  ref={posterImgRef}
                  className="po-img"
                  src={posterSrc}
                  srcSet={posterSrcSet}
                  sizes={posterSrcSet ? CdnImageAdapter.getSizes("card") : undefined}
                  alt={movie.title}
                  loading={isDetailRestoring() ? "eager" : "lazy"}
                  decoding="async"
                  onLoad={() => {
                    markMediaUrlLoaded(posterSrc);
                    setIsLoaded(true);
                  }}
                  onError={() => {
                    logWarn("HomeCard", `Poster failed for "${movie.title}" — using monogram fallback.`, {
                      id: movie.id,
                      src: posterSrc,
                    });
                    setHasImageError(true);
                    setIsLoaded(false);
                  }}
                  style={{ opacity: isLoaded ? 1 : 0 }}
                />
              ) : null}
              {tagLabel ? <em>{tagLabel}</em> : null}
              <b>{movie.title}</b>
              {progressPercent > 0 ? <span className="po-progress" aria-hidden="true" /> : null}
            </div>
            <span>{movie.title}</span>
            <small>{meta}</small>
          </div>

          {editMode ? (
            <button
              type="button"
              className="qa home-remove"
              onClick={remove}
              aria-label={`Remove ${movie.title} from continue watching`}
            >
              <X size={18} />
            </button>
          ) : (
            <>
              <button
                type="button"
                className="qp glass"
                aria-label={`Play ${movie.title}`}
                onClick={play}
              >
                <Play size={22} fill="currentColor" stroke="none" />
              </button>
              <button
                type="button"
                className={`qa${bump ? " bump" : ""}`}
                aria-pressed={inList}
                aria-label={
                  inList
                    ? `Remove ${movie.title} from My List`
                    : `Add ${movie.title} to My List`
                }
                onClick={toggleList}
              >
                {inList ? <Check size={18} /> : <Plus size={18} />}
              </button>
            </>
          )}
          {modalHost}
        </>
      )}
    </div>
  );
});

export default HomeCard;
