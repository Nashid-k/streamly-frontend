import SEO from "../components/SEO";
import { EASE_OUT, PRESS_SCALE } from "../constants/motion";
import AmbientBackground from "../components/AmbientBackground";
import MovieDetailsSkeleton from "../components/MovieDetailsSkeleton";
import MovieCardSkeleton from "../components/MovieCardSkeleton";
import EmptyState from "../components/EmptyState";
import CastRail from "../components/CastRail";
import RailArrow from "../components/RailArrow";
import RatingsTable from "../components/RatingsTable";
import useRailArrows from "../hooks/useRailArrows";
import useDialogA11y from "../hooks/useDialogA11y";
import { useTitleLogo } from "../hooks/useTitleLogo";
import { warmResolve } from "../api/warmResolve";
import { useQuery } from "@tanstack/react-query";
import { movieService, classifyTrailer } from "../api/movieService";
import Loader from "../components/Loader";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { createPortal } from "react-dom";
import { useState, useEffect, useRef, useMemo, useLayoutEffect, lazy, Suspense } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import streamResolve from "../api/streamResolve";
import {
  Play,
  Star,
  Plus,
  Check,
  X,
  RotateCcw,
  ThumbsUp,
  Tv,
  Film,
  LayoutGrid,
  List,
  GalleryHorizontal,
  ChevronLeft,
  Calendar,
  ChevronDown as ChevronDownIcon,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Clock,
  Grid3x3,
  ArrowUpDown,
  FolderOpen,
} from "lucide-react";
import {
  motion,
  AnimatePresence,
} from "framer-motion";
import { MotionFade, MotionLeaf } from "../components/MotionLeaf";
import { useAppAuth } from "../context/auth";
import { useToast } from "../components/Toast.jsx";
import MovieCard from "../components/MovieCard";
import CollectionPickerDialog from "../components/CollectionPickerDialog";
import SeasonDropdown from "../components/detail/SeasonDropdown";
import ProductionCompaniesBlock from "../components/detail/ProductionCompaniesBlock";

import { buildMovieAddedNotification } from "../utils/notificationEngine";
import { formatTMDBDate, getTMDBWeekday, LOCAL_RELEASE } from "../utils/timezone";
import { formatRuntimeLabel, isUnreleased, voteSplitPct } from "../utils/titleDetails";
import { buildEpisodeOrder, episodeNumberLabel, isEpAired, formatAirsDate } from "../utils/titleDetails";
import { startPlaybackTimestamp, isEpisodeWatchedEntry, seasonEdgeEpisode } from "../utils/titleDetails";
import { getPlatformName } from "../utils/platforms";
import { logEmptyData, logError, reportQueryError } from "../utils/debugLogger";
// Two engines: NativePlayerView (the app's own HLS player through the
// serverless relay) and ProviderEmbedPlayer (the provider's own iframe player).
// The provider WAF refuses datacenter egress, so native only works once the
// deployment has a relay configured; the `capabilities` probe below picks the
// engine at runtime. PROVIDER_EMBED_PLAYBACK (constants/playback.js) is the
// hard override that forces the embed.
const NativePlayerView = lazy(() => import("../components/NativePlayerView"));
const ProviderEmbedPlayer = lazy(() => import("../components/ProviderEmbedPlayer"));
import { PROVIDER_EMBED_PLAYBACK } from "../constants/playback";
import { getZxcCapabilities } from "../api/streamResolve";
import ErrorBoundary from "../components/ErrorBoundary";

import { progressPct } from "../utils/resumeProgress";
import { usePreferences } from "../context/preferences";
const EMPTY_ARRAY = [];



/* "Ends 5:53 AM" — runtime end time if the viewer pressed play right now
   (mirrors Cinejoy's Runtime row). Null when no runtime is known. */
function formatEndsAt(durationMins) {
  if (!durationMins || durationMins <= 0) return null;
  const end = new Date(Date.now() + durationMins * 60000);
  return end.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

/* Release year for the hero meta row and the player subtitle. Prefer the
   catalogue's parsed `year` and fall back to the date string's first four
   characters — parsing YYYY-MM-DD as a local Date shifted Jan-1 releases back
   a year for US timezones and produced "NaN" when the date was missing. */
function releaseYear(movie) {
  if (movie?.year) return String(movie.year);
  const d = movie?.releaseDate;
  return d ? String(d).slice(0, 4) : "";
}

export default function TitleDetails() {
  const { id } = useParams();
  // Resolved once, unconditionally: MotionLeaf reads the motion preference
  // through hooks, so it must run on every render of this component — never at
  // module scope and never inside a conditional branch.
  const L = new MotionLeaf();
  const navigate = useNavigate();
  const {
    muteTrailers,
    episodeViewStyle = "carousel",
    spoilerFreeMode = false,
    trailers = true,
  } = usePreferences();

  const [selectedSeason, setSelectedSeason] = useState(1);
  const [playingEpisode, setPlayingEpisode] = useState(1);
  const {
    isInList,
    toggleMyList,
    collections,
    toggleInCollection,
    createCollectionWithItems,
    continueWatching,
    updateProgress,
    removeFromContinueWatching,
    addNotification,
    // "Mark as watched" is a deliberate data action, but it arrives at
    // updateProgress() looking identical to a progress tick from the player. The
    // gate cannot tell them apart, so these three handlers ask for an account
    // themselves instead of relying on the wrapped mutators.
    requireAuth,
  } = useAppAuth();
  const { toast } = useToast();
  const cwRef = useRef(continueWatching);
  useEffect(() => {
    cwRef.current = continueWatching;
  }, [continueWatching]);

  // Wrap toggleMyList to show toast feedback
  const handleToggleMyList = async (movieObj) => {
    const wasInList = isInList(movieObj.id);
    // `toggleMyList` is the gated wrapper: an anonymous viewer is stopped at the
    // door with a sign-in prompt and the wrapper returns false WITHOUT toggling.
    // Falling through then would toast "Added"/"Removed" (and open the picker)
    // for a save that never happened.
    if ((await toggleMyList(movieObj)) === false) return;
    try {
      if (wasInList) {
        toast({
          title: "Removed from List",
          message: `"${movieObj.title}" was removed.`,
          type: "info",
          duration: 2500,
        });
      } else {
        toast({
          title: "Added to My List",
          message: `"${movieObj.title}" saved to your list.`,
          type: "success",
          duration: 2500,
        });
        // Generate a rich notification when adding to list
        if (addNotification && movieObj) {
          const notif = buildMovieAddedNotification({
            title: movieObj.title,
            platform: null,
            year: movieObj.releaseYear || movieObj.year,
            duration: movieObj.duration,
            imageUrl: movieObj.backdropUrl || movieObj.posterUrl,
            movieId: movieObj.id,
            isSeries: Boolean(movieObj.isSeries || movieObj.type === 'tv' || String(movieObj.id || '').startsWith('tmdb-tv-')),
          });
          addNotification(notif);
        }
        // If collection folders exist, ask which one to file this under — the
        // picker also allows creating a folder and adding the title in one go.
        if (collections && collections.length > 0) {
          setCollectionPickerOpen(true);
        }
      }
    } catch (listError) {
      logError("TitleDetails", `Failed to update My List for "${movieObj?.title}".`, listError, { id: movieObj?.id });
      toast({
        title: "Error",
        message: `Failed to update list for "${movieObj.title}".`,
        type: "error",
        duration: 3000,
      });
    }
  };

  // "Marked watched" state — a full-run history entry counts as watched.
  const isMarkedWatched = (movieId) =>
    continueWatching?.some(
      (m) => String(m.id) === String(movieId) && (m.timestamp || 0) > 0,
    ) || false;

  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);

  // Mark watched / unwatched — records a full run in watch history (or
  // removes it), mirroring Cinejoy's "Mark As Watched" circular action.
  const handleMarkWatched = (movieObj) => {
    if (!movieObj) return;
    if (!requireAuth("gateWatched")) return;
    if (isMarkedWatched(movieObj.id)) {
      removeFromContinueWatching(movieObj.id);
      toast({
        title: "Marked as not watched",
        message: `"${movieObj.title}" removed from history.`,
        type: "info",
        duration: 2500,
      });
    } else {
      updateProgress(
        movieObj,
        isTvContent ? (selectedSeason ?? 1) : null,
        isTvContent ? (episodeToPlay ?? 1) : null,
        (movieObj.durationMins || 60) * 60,
      );
      toast({
        title: "Marked as watched",
        message: `"${movieObj.title}" added to history.`,
        type: "success",
        duration: 2500,
      });
    }
  };


  const [isPlaying, setIsPlaying] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [unreleasedModalOpen, setUnreleasedModalOpen] = useState(false);
  const unreleasedPanelRef = useRef(null);
  const [iframeLoading, setIframeLoading] = useState(false);

  // Which engine to mount is a DEPLOYMENT capability, not a per-title choice:
  // the server reports whether its egress can reach the provider natively (a
  // relay configured -> native HLS; otherwise the provider WAF refuses us and
  // we must use the embed). `null` = not yet known, so we hold the frame black
  // instead of flashing the embed and then swapping engines.
  const [zxcNative, setZxcNative] = useState(null);
  useEffect(() => {
    if (PROVIDER_EMBED_PLAYBACK) return undefined;
    let alive = true;
    getZxcCapabilities().then((caps) => {
      if (alive) setZxcNative(caps.zxcNative);
    });
    return () => {
      alive = false;
    };
  }, []);
  const [episodeLayout, setEpisodeLayout] = useState(() => (
    episodeViewStyle === "grid" || episodeViewStyle === "list" || episodeViewStyle === "carousel"
      ? episodeViewStyle
      : "carousel"
  ));
  // Live-sync the episode layout when the Appearance setting changes (the
  // manual toggle below still wins until the preference changes again).
  useEffect(() => {
    if (episodeViewStyle === "grid" || episodeViewStyle === "list" || episodeViewStyle === "carousel") {
      setEpisodeLayout(episodeViewStyle);
    }
  }, [episodeViewStyle]);

  const EPISODES_CHUNK_SIZE = 24;
  const [visibleEpisodeCount, setVisibleEpisodeCount] = useState(EPISODES_CHUNK_SIZE);
  useEffect(() => {
    setVisibleEpisodeCount(EPISODES_CHUNK_SIZE);
  }, [selectedSeason, id]);
  const epRailRef = useRef(null);
  const scrollEpRail = (dir) => {
    const el = epRailRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -el.clientWidth * 0.8 : el.clientWidth * 0.8, behavior: "smooth" });
  };
  const { canScrollLeft: epCanLeft, canScrollRight: epCanRight, refresh: refreshEpArrows } =
    useRailArrows(epRailRef, { enabled: episodeLayout === "carousel" });

  const [playMode, setPlayMode] = useState("movie");
  const [playingTrailerKey, setPlayingTrailerKey] = useState(null);
  // Trigger the trailer's loading state when its src/key is about to change
  useEffect(() => {
    if (isPlaying) setIframeLoading(true);
  }, [isPlaying, playMode, playingTrailerKey]);

  const directorRailRef = useRef(null);
  const pageRef = useRef(null);
  const { canScrollLeft, canScrollRight, refresh } = useRailArrows(directorRailRef);

  const scrollDirector = (dir) => {
    if (directorRailRef.current) {
      directorRailRef.current.scrollBy({
        left: dir === "left" ? -500 : 500,
        behavior: "smooth",
      });
      refresh();
    }
  };

  const { data: rawMovie, isLoading: loading, error: movieError } = useQuery({
    queryKey: ["movie", id],
    queryFn: () => movieService.getMovieDetails(id),
    // Details are immutable per day (mirrors the proxy's s-maxage=86400 split,
    // PLAN.md P1.2): repeat visits must paint from cache, never re-fetch.
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (movieError) {
      reportQueryError("TitleDetails", ["movie", id], movieError, { id });
    }
  }, [movieError, id]);

  useEffect(() => {
    if (!loading && !rawMovie && !movieError) {
      logEmptyData("TitleDetails", `getMovieDetails returned nothing for id="${id}". Check id format (movie-<n>/tv-<n>) and TMDB availability.`, { id });
    }
  }, [loading, rawMovie, movieError, id]);

  const movie = rawMovie;

  const movieId = movie?.id;

  /* The hero logo AND the player's cold-open stage both draw this — the stage
     used to receive `logoUrl || posterUrl || backdropUrl`, so a title TMDB has
     no logo for got its full poster/backdrop preview squeezed into the logo
     slot. One lookup, one fallback (text title), same rule as the home hero. */
  const { logoUrl: titleLogoUrl, onLogoError: onTitleLogoError } = useTitleLogo(movie, "TitleDetails");

  // Member of at least one collection → tiny folder badge on the List button.
  const inAnyCollection = useMemo(
    () => (collections || []).some((c) => (c.itemIds || []).includes(movie?.id)),
    [collections, movie],
  );

  // Pickers' inline "create + add" target.
  const handlePickerCreateFromDetails = (name, movieIds, visibility) => {
    if (!movie) return;
    const created = createCollectionWithItems(name, movieIds, { visibility });
    if (created) {
      const count = (movieIds || []).length;
      toast({
        title: "Collection Created",
        message: `"${name}" created with ${count} ${count === 1 ? "title" : "titles"}.`,
        type: "success",
        duration: 2500,
      });
    }
  };

  // Resolve the actual platform — now guaranteed to be a canonical key or null
  const effectivePlatform = movie?.source || undefined;
  // Dates on this page are TMDB calendar facts (release / air dates), not a
  // platform broadcast moment: use the title's own platform when known, else the
  // LOCAL_RELEASE sentinel so a non-ET viewer never sees them a day late.
  const releasePlatform = effectivePlatform || LOCAL_RELEASE;

  const { data: similarData, error: similarError } = useQuery({
    queryKey: ["similar", id],
    queryFn: () => movieService.getSimilarMovies(id),
    enabled: !!movie,
  });

  useEffect(() => {
    if (similarError) {
      reportQueryError("TitleDetails", ["similar", id], similarError, { id });
    }
  }, [similarError, id]);
  const similar = Array.isArray(similarData) ? similarData : EMPTY_ARRAY;

  const [visibleCount, setVisibleCount] = useState(12);
  // Reset visible count when navigating to a different movie
  useEffect(() => {
    setVisibleCount(12);
  }, [id]);
  useEffect(() => {
    let inThrottle;
    const handleScroll = () => {
      if (!inThrottle) {
        if (
          window.innerHeight + window.scrollY >=
          document.body.offsetHeight - 800
        ) {
          setVisibleCount((prev) =>
            Math.min(prev + 12, similar ? similar.length : 0),
          );
        }
        inThrottle = true;
        setTimeout(() => (inThrottle = false), 200);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [similar]);

    // Reset season/episode when navigating to a different movie
  useEffect(() => {
    setSelectedSeason(1);
    setPlayingEpisode(1);
  }, [id]);

  // Detect series: check id prefix (most reliable), isSeries flag, or seasonsCount
  const isTvContent = Boolean(
    String(movie?.id || id).startsWith("tmdb-tv-") ||
    movie?.isSeries === true ||
    (movie?.type === "tv") ||
    (movie?.seasonsCount && Number(movie.seasonsCount) > 0 && !String(movie?.id || id).startsWith("tmdb-movie-")),
  );
  const availableSeasons = isTvContent
    ? (movie?.seasons?.length
      ? movie.seasons
      : Array.from({ length: Math.max(1, Number(movie?.seasonsCount) || 1) }, (_, index) => ({
        seasonNumber: index + 1,
        name: `Season ${index + 1}`,
      })))
    : EMPTY_ARRAY;
  const availableSeasonNumbers = availableSeasons.map((season) => season.seasonNumber);
  const availableSeasonKey = availableSeasonNumbers.join(",");
  const normalizedSeasonCount = availableSeasonNumbers.length;
  const airingSeasonNumber = availableSeasonNumbers.includes(movie?.airingSeasonNumber)
    ? movie.airingSeasonNumber
    : null;
  // Global "series is airing" state — independent of the season the viewer has
  // selected, so the banner can surface a currently-airing show (e.g. S7 headlights).
  const seriesIsAiring = isTvContent && airingSeasonNumber != null;

  const endsAt = formatEndsAt(movie?.durationMins);
  const runtimeLabel = formatRuntimeLabel(movie?.durationMins);
    // Cinejoy-style info table (Status / Language / First & Last Aired / Seasons /
    // Episodes for series; Runtime / Language / Release Date for movies), rendered
    // identically on mobile and desktop. Above the loading early-return so hook
    // order stays unconditional.
  const [serverLanguages, setServerLanguages] = useState(null);

  const infoRows = useMemo(() => {
    const rows = [];
    const dateOpts = { year: "numeric", month: "short", day: "numeric" };
    const spokenLanguages = Array.isArray(movie?.spokenLanguages)
      ? movie.spokenLanguages
          .map((lang) => lang?.english_name || lang?.name || lang?.iso_639_1)
          .filter(Boolean)
          .join(", ")
      : movie?.spoken_languages && Array.isArray(movie.spoken_languages)
        ? movie.spoken_languages
            .map((lang) => lang?.english_name || lang?.name || lang?.iso_639_1)
            .filter(Boolean)
            .join(", ")
        : null;
    const serverLangStr = Array.isArray(serverLanguages) && serverLanguages.length > 0 ? serverLanguages.join(", ") : null;
    const displayLang = serverLangStr || spokenLanguages;
    if (isTvContent) {
      if (movie?.status) rows.push({ label: "Status", value: movie.status });
      if (Array.isArray(serverLanguages)) {
        if (serverLanguages.length > 0) {
          rows.push({ label: "Languages", value: serverLanguages.join(", ") });
        }
      } else if (displayLang) {
        rows.push({ label: "Languages", value: displayLang });
      } else if (movie?.originalLanguage) {
        rows.push({ label: "Language", value: movie.originalLanguage, uppercase: true });
      }
      if (movie?.releaseDate) rows.push({ label: "First Aired", value: formatTMDBDate(movie.releaseDate, dateOpts, undefined, releasePlatform) });
      if (movie?.lastAiredDate) rows.push({ label: "Last Aired", value: formatTMDBDate(movie.lastAiredDate, dateOpts, undefined, releasePlatform) });
      if (movie?.seasonsCount) rows.push({ label: "Seasons", value: String(movie.seasonsCount) });
      if (movie?.episodesCount) rows.push({ label: "Episodes", value: String(movie.episodesCount) });
    } else {
      if (runtimeLabel) rows.push({ label: "Runtime", value: runtimeLabel, extra: endsAt ? `\u2022 Ends ${endsAt}` : null });
      if (Array.isArray(serverLanguages)) {
        if (serverLanguages.length > 0) {
          rows.push({ label: "Languages", value: serverLanguages.join(", ") });
        }
      } else if (displayLang) {
        rows.push({ label: "Languages", value: displayLang });
      } else if (movie?.originalLanguage) {
        rows.push({ label: "Language", value: movie.originalLanguage, uppercase: true });
      }
      if (movie?.releaseDate) rows.push({ label: "Release Date", value: formatTMDBDate(movie.releaseDate, dateOpts, undefined, releasePlatform) });
    }
    return rows;
  }, [isTvContent, runtimeLabel, endsAt, movie, releasePlatform, serverLanguages]);

  const {
    data: episodesData,
    isLoading: episodesLoading,
    // With placeholderData the re-keyed season query reports status "success"
    // while it fetches — only isFetching distinguishes "previous season still
    // on screen" from "these episodes are the selected season's".
    isFetching: episodesFetching,
    isError: episodesFailed,
    refetch: refetchEpisodes,
    error: episodesError,
  } = useQuery({
    // No `platform` in the key: getSeasonEpisodes ignores it, so keying on it
    // only created duplicate cache rows for identical data per platform switch.
    queryKey: ["episodes", id, selectedSeason],
    queryFn: () => movieService.getSeasonEpisodes(id, selectedSeason),
    enabled: isTvContent && !!movie,
    retry: 3,
    retryDelay: 1000,
    // Season lists are as immutable as the details themselves (P1.2); the
    // 24h cache matches. Aired-state still filters client-side per render.
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
    // Switching seasons keeps the current episode grid on screen instead of
    // collapsing it to a spinner for the length of the request.
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (episodesError) {
      reportQueryError("TitleDetails", ["episodes", id, selectedSeason], episodesError, { id, selectedSeason });
    }
  }, [episodesError, id, selectedSeason]);

  useEffect(() => {
    if (isTvContent && !!movie && !episodesLoading && !episodesFetching && !episodesError) {
      const count = Array.isArray(episodesData) ? episodesData.length : (episodesData?.episodes?.length || 0);
      if (count === 0) {
        logEmptyData("TitleDetails", `No episodes for ${id} season ${selectedSeason}. Check TMDB season numbering (specials excluded).`, { id, selectedSeason });
      }
    }
  }, [isTvContent, movie, episodesLoading, episodesFetching, episodesError, episodesData, id, selectedSeason]);
  // Refresh arrow availability at layout time so carousel arrows are correct
  // before paint (no flicker) whenever the rail remounts (season/layout/load).
  useLayoutEffect(() => {
    if (episodeLayout !== "carousel") return;
    refreshEpArrows();
  }, [episodeLayout, selectedSeason, episodesFetching, refreshEpArrows]);
  // Backend returns { episodes, totalEpisodes, releasedEpisodes, isAiring } for running series
  // But also handle plain array format for backward compatibility
  const episodes = useMemo(
    () => Array.isArray(episodesData)
      ? episodesData
      : Array.isArray(episodesData?.episodes)
        ? episodesData.episodes
        : [],
    [episodesData],
  );

  const totalEpisodes = episodesData?.totalEpisodes || episodes.length;
  const releasedEpisodes = episodesData?.releasedEpisodes || episodes.length;
  const isAiring = episodesData?.isAiring
    || (selectedSeason === airingSeasonNumber && !!movie?.nextEpisode?.releaseDate);
  const hasSeriesEpisodes = isTvContent;

  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [sortNewest, setSortNewest] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortRef = useRef(null);
  useEffect(() => {
    if (!sortOpen) return undefined;
    const handler = (e) => {
      if (sortRef.current && !sortRef.current.contains(e.target)) setSortOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setSortOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [sortOpen]);

  // Oldest (default) / Newest — pure, shared by every layout.
  const episodesForLayout = useMemo(
    () => buildEpisodeOrder(episodes, sortNewest),
    [episodes, sortNewest],
  );

  const continueEntryForMovie = useMemo(
    () => continueWatching?.find((m) => String(m.id) === String(movie?.id)),
    [continueWatching, movie?.id],
  );

  // Per-episode watch state lives in the single continue-watching entry as a
  // `watchedEpisodes: { [season]: number[] }` set (same localStorage key).
  const isEpisodeWatched = (ep) => {
    // While the selected season fetches (or after it failed), the episode list
    // is the previous season's placeholder data — ticking it with the NEW
    // season's watched set would show wrong checkmarks.
    if (episodesFetching || episodesFailed) return false;
    return isEpisodeWatchedEntry(continueEntryForMovie, selectedSeason, ep.episodeNumber);
  };

  /** Returns false when the gate refused, so callers skip their own toast. */
  const setEpisodeWatched = (ep, watched) => {
    if (!movie) return false;
    if (!requireAuth("gateWatched")) return false;
    const watchedEpisodes = { ...((continueEntryForMovie?.watchedEpisodes) || {}) };
    const list = new Set(watchedEpisodes[selectedSeason] || []);
    if (watched) list.add(ep.episodeNumber);
    else list.delete(ep.episodeNumber);
    watchedEpisodes[selectedSeason] = [...list];
    updateProgress(
      { ...movie, source: resolvedPlatform, sourceName, watchedEpisodes },
      selectedSeason,
      ep.episodeNumber,
      watched ? (ep.durationMins || 60) * 60 : 0,
    );
    return true;
  };

  const toggleEpisodeWatched = (ep) => {
    const watched = isEpisodeWatched(ep);
    if (!setEpisodeWatched(ep, !watched)) return;
    toast({
      title: watched ? "Marked as not watched" : "Marked as watched",
      message: `${episodeNumberLabel(ep.episodeNumber)} · ${ep.title}`,
      type: watched ? "info" : "success",
      duration: 2200,
    });
  };

  const markSeasonWatched = () => {
    if (!movie || episodesForLayout.length === 0) return;
    const aired = episodesForLayout.filter((ep) => isEpAired(ep));
    if (aired.length === 0) return;
    if (!requireAuth("gateWatched")) return;
    const allWatched = aired.every((ep) => isEpisodeWatched(ep));
    if (allWatched) {
      const watchedEpisodes = { ...((continueEntryForMovie?.watchedEpisodes) || {}) };
      delete watchedEpisodes[selectedSeason];
      const keepTs = continueEntryForMovie?.savedSeason === selectedSeason
        ? continueEntryForMovie?.timestamp ?? null
        : null;
      const keepEp = continueEntryForMovie?.savedSeason === selectedSeason
        ? continueEntryForMovie?.savedEpisode ?? null
        : null;
      updateProgress(
        { ...movie, source: resolvedPlatform, sourceName, watchedEpisodes },
        keepEp != null ? selectedSeason : null,
        keepEp,
        keepTs,
      );
      toast({
        title: "Marked as not watched",
        message: `Season ${selectedSeason} cleared from history.`,
        type: "info",
        duration: 2500,
      });
    } else {
      const numbers = aired.map((ep) => ep.episodeNumber);
      const watchedEpisodes = { ...((continueEntryForMovie?.watchedEpisodes) || {}), [selectedSeason]: numbers };
      const last = aired[aired.length - 1];
      updateProgress(
        { ...movie, source: resolvedPlatform, sourceName, watchedEpisodes },
        selectedSeason,
        last.episodeNumber,
        (last.durationMins || 60) * 60,
      );
      toast({
        title: "Marked as watched",
        message: `Season ${selectedSeason} · ${aired.length} episode${aired.length > 1 ? "s" : ""}.`,
        type: "success",
        duration: 2500,
      });
    }
  };

  useEffect(() => {
    if (!movieId || !isTvContent) return;
    const seasonNumbers = availableSeasonKey
      .split(",")
      .map(Number)
      .filter(Number.isFinite);
    const saved = cwRef.current.find(
      (m) => String(m.id) === String(movieId),
    );
    const savedSeason = Number(saved?.savedSeason);
    const preferredSeason = (savedSeason > 0 && seasonNumbers.includes(savedSeason))
      ? savedSeason
      : (seasonNumbers.includes(1) ? 1 : (seasonNumbers[0] || 1));

    setSelectedSeason(preferredSeason);
    setPlayingEpisode(Number(saved?.savedEpisode) > 0 ? Number(saved.savedEpisode) : 1);
  }, [movieId, isTvContent, availableSeasonKey]);

  // Scroll handled by useScrollRestoration in Layout

  useEffect(() => {
    document.body.style.overflow = isPlaying ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isPlaying]);

    // Close the TRAILER on Escape. NativePlayerView owns Escape itself
    // (dialog-first, then onClose), so the parent must not also close it or a
    // single Esc would kill a session that only meant to close a menu.
  useEffect(() => {
    if (!isPlaying || playMode !== "trailer") return;
    const handleKey = (e) => {
      if (e.key === "Escape") setIsPlaying(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isPlaying, playMode]);

  // The unreleased-notice modal gets the same modal contract as every other
  // dialog: Escape closes, Tab stays inside the panel, the page behind cannot
  // scroll, and focus returns to the button that opened it. It used to be an
  // `aria-modal="true"` panel with a bare Escape listener — a modal claim with
  // none of the modal behaviour.
  useDialogA11y(unreleasedModalOpen, unreleasedPanelRef, () => setUnreleasedModalOpen(false));

  /* Warm resolve (PLAN.md P0.4): pre-mint the default server's stream token
     while the viewer reads the page, so tapping Watch skips the resolve leg
     (2–5s → probe+manifest only). MUST live above the early returns below —
     a hook after `if (loading) return` only runs once data lands, flipping
     this component's hook order between renders (the blank-page bug the
     probe caught). Debounced 1.2s so a scroll-through never fires it; a
     failed warm is silently retried by the player's own resolve. */
  const warmNumericId = movie ? String(movie.id).match(/\d+/)?.[0] || null : null;
  const warmSavedEpisode = movie
    ? (continueWatching || []).find(
        (item) => String(item.id) === String(movie.id)
          && Number(item.savedSeason) === Number(selectedSeason)
          && Number(item.savedEpisode) > 0,
      )?.savedEpisode
    : null;
  const warmEpisode = isTvContent ? (playingEpisode || warmSavedEpisode || 1) : undefined;
  useEffect(() => {
    if (!movie || !warmNumericId || isPlaying) return undefined;
    const args = {
      type: isTvContent ? "tv" : "movie",
      id: warmNumericId,
      season: isTvContent ? selectedSeason : undefined,
      episode: warmEpisode,
    };
    const controller = new AbortController();
    const timer = setTimeout(() => {
      warmResolve(args, { signal: controller.signal });
    }, 1200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [movie, warmNumericId, isTvContent, selectedSeason, warmEpisode, isPlaying]);

  useEffect(() => {
    let alive = true;
    async function fetchServerLangs() {
      if (!movie || !warmNumericId) return;
      try {
        const res = await streamResolve.resolveZxc({
          type: isTvContent ? "tv" : "movie",
          id: warmNumericId,
          season: isTvContent ? selectedSeason : undefined,
          episode: isTvContent ? warmEpisode : undefined,
        });
        if (!alive) return;
        const tracks = Array.isArray(res?.audioTracks) ? res.audioTracks : [];
        const LANG_ALIASES = {
          esla: "Spanish (Latin America)",
          es419: "Spanish (Latin America)",
          esmx: "Spanish (Mexico)",
          ptbr: "Portuguese (Brazil)",
          ptpt: "Portuguese (Portugal)",
          zhcn: "Chinese (Simplified)",
          zhtw: "Chinese (Traditional)",
        };
        const FILM_LANG = {
          en: "English", te: "Telugu", hi: "Hindi", ta: "Tamil", ml: "Malayalam",
          kn: "Kannada", bn: "Bengali", pa: "Punjabi", mr: "Marathi", gu: "Gujarati",
          es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese",
          ru: "Russian", ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic",
          tr: "Turkish", vi: "Vietnamese", th: "Thai", id: "Indonesian", ms: "Malay",
          pl: "Polish", nl: "Dutch", sv: "Swedish", no: "Norwegian", da: "Danish",
        };
        const ISO3_LANG = {
          eng: "English", spa: "Spanish", fra: "French", fre: "French", deu: "German",
          ger: "German", ita: "Italian", por: "Portuguese", rus: "Russian", jpn: "Japanese",
          kor: "Korean", zho: "Chinese", chi: "Chinese", ara: "Arabic", tur: "Turkish",
          vie: "Vietnamese", tha: "Thai", ind: "Indonesian", pol: "Polish", nld: "Dutch",
          dut: "Dutch", swe: "Swedish", nor: "Norwegian", dan: "Danish", hin: "Hindi",
          tam: "Tamil", tel: "Telugu", mal: "Malayalam", kan: "Kannada", ben: "Bengali",
        };
        const NOISE = /\b(dubbed?|dub|audio|track|version|audio\s*track|soundtrack)\b/gi;
        const normalize = (raw) => {
          if (!raw) return "";
          let s = String(raw).trim();
          if (!s) return "";
          const codeLike = s.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (LANG_ALIASES[codeLike]) return LANG_ALIASES[codeLike];
          if (FILM_LANG[codeLike] || ISO3_LANG[codeLike]) return FILM_LANG[codeLike] || ISO3_LANG[codeLike];
          s = s.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
          s = s.replace(NOISE, " ").replace(/\s+/g, " ").trim();
          if (!s) return "";
          // if it's just a 2-3 letter code
          if (/^[a-z]{2,3}$/i.test(s)) {
            const c = s.toLowerCase();
            return LANG_ALIASES[c] || FILM_LANG[c] || ISO3_LANG[c] || s.toUpperCase();
          }
          return s
            .split(" ")
            .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
            .join(" ");
        };
        const langs = tracks
          .map((t) => t?.label || t?.lang)
          .filter((l) => typeof l === "string" && l.trim())
          .map(normalize)
          .filter((l) => l && !/^(original|auto)$/i.test(l));
        const unique = Array.from(new Set(langs));
        setServerLanguages(unique);
      } catch {
        if (alive) setServerLanguages([]);
      }
    }
    fetchServerLangs();
    return () => {
      alive = false;
    };
  }, [movie, warmNumericId, isTvContent, selectedSeason, warmEpisode]);

  if (loading) {
    return <MovieDetailsSkeleton />;
  }

  if (!movie) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "80vh",
          padding: "2rem",
        }}
      >
        <EmptyState
          icon="film"
          title="Title not found"
          description="This title might have been removed or is unavailable in your region. Try searching for something else."
          actions={
            <>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: PRESS_SCALE.CONTROL }}
                onClick={() => navigate(-1)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#fff",
                  padding: "10px 24px",
                  borderRadius: "10px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <ChevronLeft size={18} strokeWidth={1.5} /> Go Back
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: PRESS_SCALE.CONTROL }}
                onClick={() => navigate("/")}
                style={{
                  background: "var(--btn-bg, rgba(242,242,242,0.96))",
                  border: "none",
                  color: "var(--btn-ink, #000000)",
                  padding: "10px 24px",
                  borderRadius: "10px",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Browse Home
              </motion.button>
            </>
          }
        />
      </div>
    );
  }

  const resolvedPlatform = effectivePlatform;
  const sourceName = movie?.sourceName || getPlatformName(resolvedPlatform) || "Streaming";
  const airedEpisodeNumbers = episodes
    .filter((ep) => isEpAired(ep))
    .sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0))
    .map((ep) => ep.episodeNumber);

  const savedEpisodeForSelectedSeason = continueWatching?.find(
    (item) => String(item.id) === String(movie.id)
      && Number(item.savedSeason) === Number(selectedSeason)
      && Number(item.savedEpisode) > 0,
  );
  const episodeToPlay = savedEpisodeForSelectedSeason?.savedEpisode
    || (airedEpisodeNumbers.length > 0 ? airedEpisodeNumbers[0] : 1);

  // Numeric TMDB id for the native player (movie.id can carry a
  // "movie-"/"tv-" prefix).
  const numericId = (() => {
    const m = String(movie?.id || "").match(/\d+/);
    return m ? m[0] : null;
  })();

    // Continue-watching entry matching the player's CURRENT view (movie, or the
    // exact season+episode in flight). Only real resume points (>0s) are offered.
  const viewEpisode = () =>
    isTvContent ? (playingEpisode || episodeToPlay || 1) : 1;
  const watchEntry = (() => {
    if (!movie || !numericId) return null;
    const found = continueWatching?.find(
      (m) =>
        String(m.id) === String(movie.id) &&
        (!isTvContent || (m.savedSeason === selectedSeason && m.savedEpisode === viewEpisode())),
    );
    if (!found || !(Number(found.timestamp) > 0)) return null;
    return found;
  })();

    // ── Season-aware episode navigation ─────────────────────────────────────
    // Step within the *aired* episodes of the selected season and roll across
    // season boundaries to the previous season's last / next season's first
    // episode instead of landing on a number that doesn't exist.
  const currentSeasonIndex = availableSeasonNumbers.indexOf(selectedSeason);
  const hasPrevSeason = currentSeasonIndex > 0;
  const hasNextSeason =
    currentSeasonIndex >= 0 &&
    currentSeasonIndex < availableSeasonNumbers.length - 1;
  const currentEpisodeIndex = airedEpisodeNumbers.indexOf(playingEpisode);
  const canGoPrev =
    currentEpisodeIndex > 0 || hasPrevSeason;
  const canGoNext =
    (currentEpisodeIndex >= 0 &&
      currentEpisodeIndex < airedEpisodeNumbers.length - 1) ||
    hasNextSeason;

  const goToPrevEpisode = () => {
    if (currentEpisodeIndex > 0) {
      setPlayingEpisode(airedEpisodeNumbers[currentEpisodeIndex - 1]);
      return;
    }
    if (!hasPrevSeason) return;
    const prevSeasonIndex = currentSeasonIndex - 1;
    const prevSeason = availableSeasonNumbers[prevSeasonIndex];
    setSelectedSeason(prevSeason);
    // Land on the previous season's LAST episode. `movie.lastEpisode` is the
    // series' last aired episode, so it is authoritative ONLY when it belongs to
    // that season (the season is still airing); otherwise fall back to the
    // season's own episode count — never the series' absolute last episode,
    // which lives in a different season.
    setPlayingEpisode(
      movie?.lastEpisode?.seasonNumber === prevSeason
        ? movie.lastEpisode.episodeNumber
        : seasonEdgeEpisode(availableSeasons[prevSeasonIndex]?.episodeCount, "last"),
    );
  };

  const goToNextEpisode = () => {
    if (
      currentEpisodeIndex >= 0 &&
      currentEpisodeIndex < airedEpisodeNumbers.length - 1
    ) {
      setPlayingEpisode(airedEpisodeNumbers[currentEpisodeIndex + 1]);
      return;
    }
    if (!hasNextSeason) return;
    setSelectedSeason(availableSeasonNumbers[currentSeasonIndex + 1]);
    // First episode of the next season — using movie.lastEpisode here jumped to
    // the series' final episode, skipping most of the season.
    setPlayingEpisode(1);
  };

  const formatTime = (time) => {
    if (!time || isNaN(time)) return "0:00";
    const hours = Math.floor(time / 3600);
    const minutes = Math.floor((time % 3600) / 60);
    const seconds = Math.floor(time % 60);
    if (hours > 0)
      return `${hours}:${minutes < 10 ? "0" : ""}${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  // Derived: true if user has any watch progress for this movie
  const progressItem = continueWatching?.find(
    (m) => String(m.id) === String(movie?.id),
  );
  const hasResume = Boolean(progressItem && progressItem.timestamp > 0);
  const resumePct = hasResume ? Math.round(progressPct(progressItem)) : 0;
  const backdropSrc = movie?.backdropUrl || movie?.posterUrl;
  const backdropOptimized = backdropSrc ? CdnImageAdapter.getBackdropUrl(backdropSrc) : null;
  const voteSplit = voteSplitPct(movie.imdbRating);
  const unreleased = isUnreleased(movie.releaseDate);

  /* No top offset on the page root: .app-main adds none, so the hero artwork
   starts flush at the top of the viewport (behind the floating header island)
   exactly like the home hero. The former `max-md:-mt-[56px]` was a hardcoded
   guess at the header height that cropped the artwork and shoved the title up
   into the back button. */
  return (
    <div ref={pageRef} className="relative min-h-screen font-sans overflow-x-hidden pb-24 bg-[#050505] w-[100vw] ml-[calc(50%-50vw)] page-fade-bottom">
      <SEO
        title={movie.title}
        description={movie.description}
        image={movie.backdropUrl || movie.posterUrl}
        type="video.movie"
      />

      {/* ── Ambient Background ───────────────────────────────────────────────
          The SAME component the home banner uses — one definition of the
          blurred backdrop + gradient wash, so the watch page can never drift
          from the home page's look. It also renders the liquid blobs and the
          ambient sky, which the previous hand-rolled copy here was missing. */}
      <AmbientBackground src={movie.backdropUrl || movie.posterUrl} alt="" />

      {/* Back is handled globally by the header .back-btn beside the logo */}

      {/* A title WITH a backdrop gets .details-hero--fit: the art box becomes the
            picture's own height at device width (whole image, no zoom/crop),
            and the content lift follows from that height. The poster fallback
            has no landscape art to fit and keeps the plain viewport band. */}
      <div className={`relative w-full details-hero${backdropOptimized ? " details-hero--fit" : ""}`}>
        {/* Artwork treatment is the home banner's, verbatim: .hero-bg (fit +
            mask) and .hero-overlay--apple (the gradient/vignette stack). One
            style for both banners — do not fork the values here. */}
        <div className="details-hero__art">
          <img
              className="hero-bg"
              src={backdropOptimized || movie.posterUrl}
              srcSet={CdnImageAdapter.getSrcSet(backdropSrc || movie.posterUrl, "backdrop")}
              sizes={CdnImageAdapter.getSizes("backdrop")}
              alt={movie.title}
              fetchPriority="high"
              loading="eager"
              decoding="async"
            />
          <div className="hero-overlay hero-overlay--apple" />
          {/* Extra shading, watch page only: home's overlay is untouched. The
              title column sits high on this banner (header-anchored), so it needs
              a bed under the type that the bottom-weighted home gradient doesn't
              provide — see .details-hero__shade. */}
          <div className="details-hero__shade" aria-hidden="true" />
        </div>

        {/* Content Overlap — the lift + header clearance live in CSS (.details-hero__body) */}
        <div className="details-hero__body details-gutter">
          {/* Left Column */}
          <div className="w-full max-w-[700px] lg:max-w-[650px] lg:min-w-0 flex flex-col items-center lg:items-start">
            {titleLogoUrl ? (
              <img
                className="details-hero__logo drop-shadow-2xl"
                src={titleLogoUrl}
                alt={movie.title}
                onError={onTitleLogoError}
              />
            ) : (
              <h1 className="details-hero__title font-bold text-white drop-shadow-2xl text-center lg:text-left">
                {movie.title}
              </h1>
            )}

            {movie.genres?.length > 0 && (
              <div className="details-hero__gap flex flex-wrap items-center gap-2 text-sm lg:text-lg text-white/90 font-medium">
                {movie.genres.map((genre, idx) => (
                  <span key={genre} className="flex items-center gap-2">
                    <span>{genre}</span>
                    {idx < movie.genres.length - 1 && <span className="text-white/40">•</span>}
                  </span>
                ))}
              </div>
            )}

            {seriesIsAiring && (
              <div className="details-hero__gap flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-2">
                <span
                  aria-label={
                    airingSeasonNumber > 1
                      ? `Season ${airingSeasonNumber} Airing`
                      : "Airing"
                  }
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    padding: "4px 12px",
                    borderRadius: "7px 7px 0 0",
                    background: "#3c8217",
                    color: "#fff",
                    fontSize: "11px",
                    fontWeight: 500,
                    lineHeight: 1.45,
                    whiteSpace: "nowrap",
                  }}
                >
                  {airingSeasonNumber > 1
                    ? `Season ${airingSeasonNumber} Airing`
                    : "Airing"}
                </span>

                {movie?.nextEpisode?.releaseDate && (
                  <span
                    className="text-xs lg:text-sm text-white/70 font-medium"
                    style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
                  >
                    New episode{" "}
                    {getTMDBWeekday(movie.nextEpisode.releaseDate, undefined, releasePlatform)}
                    <span className="text-white/40 mx-1">·</span>
                    {formatTMDBDate(movie.nextEpisode.releaseDate, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    }, undefined, releasePlatform)}
                  </span>
                )}
              </div>
            )}

            {/* Banner-style resume progress for continue-watching entries */}
            {hasResume && resumePct > 0 && (
              <div className="details-hero__gap flex items-center gap-2.5">
                <div style={{ width: "min(200px, 30vw)", height: 4, borderRadius: "var(--radius-full)", background: "rgba(255,255,255,0.22)", overflow: "hidden" }}>
                  <div style={{ width: `${resumePct}%`, height: "100%", background: "var(--accent-gradient)" }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "0.3px" }}>
                  {resumePct}% Watched
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="details-hero__gap flex items-center gap-3 flex-wrap justify-center lg:justify-start">
              <button
                type="button"
                disabled={unreleased}
                aria-disabled={unreleased}
                title={unreleased ? "Not released yet" : undefined}
                onClick={() => {
                  setPlayMode("movie");
                  setIsPlaying(true);
                  if (isTvContent) {
                    setPlayingEpisode(episodeToPlay);
                  }
                  updateProgress(
                    movie,
                    isTvContent ? selectedSeason : null,
                    isTvContent ? episodeToPlay : null,
                    // Keep the stored resume point for the episode about to play;
                    // a fresh episode (or no progress) starts at 0.
                    startPlaybackTimestamp(continueEntryForMovie, {
                      isTv: isTvContent,
                      season: selectedSeason,
                      episode: episodeToPlay,
                    }),
                  );
                }}
                className={`relative rounded-full flex items-center justify-center transition-all duration-200 font-bold tracking-wide h-[44px] px-6 py-3 text-base min-w-[120px] border-none shadow-xl shadow-black/10 ${
                  unreleased ? "opacity-45 cursor-not-allowed" : "active:scale-95 hover:scale-105"
                }`}
                style={{ background: "var(--btn-bg, rgba(242,242,242,0.96))", color: "var(--btn-ink, #000000)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
              >
                <Play className="w-5 h-5 mr-1.5 fill-current" /> {hasResume ? "Resume" : "Play"}
              </button>

              {/* Cinejoy-style circular actions: Add to List | Mark watched */}
              <div className="flex items-center gap-2.5 shrink-0">
                <div style={{ position: "relative" }} className="flex">
                  {inAnyCollection && (
                    <span
                      className="title-collection-badge"
                      title={`In ${(collections || []).filter((c) => (c.itemIds || []).includes(movie?.id)).map((c) => c.name).join(", ")}`}
                    >
                      <FolderOpen size={10} />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleToggleMyList(movie)}
                    className="hero-circle-btn"
                    aria-label={isInList(movie.id) ? "Remove from My List" : "Add to My List"}
                    title={isInList(movie.id) ? "Remove from My List" : "Add to My List"}
                  >
                    {isInList(movie.id) ? (
                      <Check size={20} />
                    ) : (
                      <Plus size={20} />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleMarkWatched(movie)}
                  className="hero-circle-btn"
                  aria-label={isMarkedWatched(movie.id) ? "Mark as not watched" : "Mark as watched"}
                  title={isMarkedWatched(movie.id) ? "Mark as not watched" : "Mark as watched"}
                >
                  {isMarkedWatched(movie.id) ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {unreleased && (
              <button
                type="button"
                onClick={() => setUnreleasedModalOpen(true)}
                aria-haspopup="dialog"
                className="details-hero__gap inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] backdrop-blur-md px-3.5 py-1.5 transition-colors hover:bg-white/[0.11] cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-white/45" aria-hidden="true" />
                <span className="text-[13px] font-semibold text-white">Not released yet</span>
                <span className="text-white/25">·</span>
                <span className="text-[13px] text-white/55">
                  Available {formatTMDBDate(movie.releaseDate, { month: "short", day: "numeric", year: "numeric" }, undefined, releasePlatform)}
                </span>
              </button>
            )}

            {/* Meta: Year · Runtime · Certification · Votes */}
            <div className="details-hero__gap flex flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:text-base text-white/80 font-medium">
              {movie.releaseDate && <span>{releaseYear(movie)}</span>}
              {runtimeLabel && <span>{runtimeLabel}</span>}
              {movie.certification && (
                <span className="px-1.5 py-0.5 border border-white/30 rounded text-xs lg:text-sm">
                  {movie.certification}
                </span>
              )}
              {voteSplit && (
                <span
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-0.5 text-xs font-semibold"
                  aria-label={`${voteSplit.up}% up ${voteSplit.down}% down split`}
                >
                  <span className="inline-flex items-center gap-0.5 text-emerald-400 tabular-nums">
                    <ArrowUp size={13} aria-hidden="true" />
                    {voteSplit.up}%
                  </span>
                  <span className="inline-flex items-center gap-0.5 text-red-400/90 tabular-nums">
                    <ArrowDown size={13} aria-hidden="true" />
                    {voteSplit.down}%
                  </span>
                </span>
              )}
            </div>

            {movie.director && (
              <div className="details-hero__gap-tight text-sm lg:text-base text-white/60">
                <span className="text-white/40">Director:</span>{" "}
                {movie.directorId ? (
                  <Link
                    to={`/person/${movie.directorId}`}
                    className="text-white/80 hover:text-white hover:underline decoration-white/60 underline-offset-4"
                  >
                    {movie.director}
                  </Link>
                ) : (
                  <span className="text-white/80">{movie.director}</span>
                )}
              </div>
            )}

            {/* Overview / Description */}
            {(movie.description || movie.longDescription || movie.overview) && (
<div className="details-hero__gap">
              <p className={`text-sm lg:text-base text-white/70 leading-relaxed ${showFullDescription ? "" : "line-clamp-3"}`}>
                {movie.description || movie.longDescription || movie.overview}
              </p>
              {(movie.description || movie.longDescription || movie.overview).length > 220 && (
                <button
                  type="button"
                  onClick={() => setShowFullDescription((v) => !v)}
                  className="details-hero__gap-tight block text-sm font-semibold text-white/80 hover:text-white transition-colors"
                >

                    {showFullDescription ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
            )}

            {/* Mobile details block */}
            <div className="details-hero__gap w-full lg:hidden">
              <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden backdrop-blur-sm">
                <div className="divide-y divide-white/[0.06]">
                  {infoRows.map((row) => (
                    <div key={row.label} className="flex items-center justify-between px-3.5 py-2.5">
                      <span className="text-xs text-white/40">{row.label}</span>
                      <span className={`text-xs text-white/80${row.uppercase ? " uppercase" : ""}`}>
                        {row.value}
                        {row.extra && <span className="text-white/50">{" "}{row.extra}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <ProductionCompaniesBlock companies={movie.productionCompanies} />
            </div>
          </div>

          {/* Right Column (Desktop) */}
          <div className="hidden lg:block w-[280px] shrink-0 details-hero__aside">
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden backdrop-blur-sm">
              <div className="divide-y divide-white/[0.06]">
                {infoRows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-white/40">{row.label}</span>
                    <span className={`text-xs text-white/80${row.uppercase ? " uppercase" : ""}`}>
                      {row.value}
                      {row.extra && <span className="text-white/50">{" "}{row.extra}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <ProductionCompaniesBlock companies={movie.productionCompanies} />
          </div>
        </div>
      </div>

      {/* ── Cast & Rest ─────────────────────────────────────────────────────────────── */}
      <div id="title-details-more" className="relative z-20 mt-10 lg:mt-14 details-gutter space-y-10 lg:space-y-14 pb-20">
      {/* ── Episodes ─────────────────────────────────────────────────────────── */}
      {isTvContent && hasSeriesEpisodes && (
        <motion.section
          style={{ position: "relative", zIndex: 1, marginTop: "1.5rem", maxWidth: "100%", marginLeft: "auto", marginRight: "auto" }}
          {...L.Reveal}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3 px-2">
            <motion.h2
              className="text-xl lg:text-2xl font-bold text-white/90 shrink-0"
              style={{ margin: 0 }}
              {...L.Reveal}
            >
              Episodes {isAiring && releasedEpisodes < totalEpisodes
                ? <span style={{ fontSize: '0.7em', color: '#71717a', fontWeight: 400 }}>({releasedEpisodes} of {totalEpisodes} released)</span>
                : episodes.length > 0 && <span style={{ fontSize: '0.7em', color: '#71717a', fontWeight: 400 }}>({episodes.length})</span>}
            </motion.h2>

            <div className="flex items-center gap-2 shrink-0 ml-auto flex-wrap">
              {/* Ratings (opens the per-season episode ratings table) */}
              <button
                onClick={() => setRatingsOpen(true)}
                aria-label="View episode ratings"
                title="Ratings"
                className="w-10 sm:w-auto h-10 sm:px-4 inline-flex items-center justify-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white text-sm font-medium hover:bg-white/15 transition-colors"
              >
                <Grid3x3 size={16} />
                <span className="hidden sm:inline">Ratings</span>
              </button>

              {/* Sort (Oldest / Newest) */}
              <div className="relative" ref={sortRef}>
                <button
                  onClick={() => setSortOpen(o => !o)}
                  aria-haspopup="menu"
                  aria-expanded={sortOpen}
                  className="hidden sm:inline-flex h-10 px-4 items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white text-sm font-medium hover:bg-white/15 transition-colors"
                >
                  <ArrowUpDown size={16} />
                  {sortNewest ? "Newest" : "Oldest"}
                </button>
                <button
                  onClick={() => setSortOpen(o => !o)}
                  aria-label="Sort episodes"
                  aria-haspopup="menu"
                  aria-expanded={sortOpen}
                  className="sm:hidden w-10 h-10 inline-flex items-center justify-center rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white hover:bg-white/15 transition-colors"
                >
                  <ArrowUpDown size={16} />
                </button>
                {sortOpen && (
                  <div
                    role="menu"
                    aria-label="Sort episodes"
                    className="absolute right-0 mt-2 z-50 w-44 rounded-2xl border border-white/10 bg-[#0c0c10] shadow-2xl overflow-hidden"
                  >
                    <button
                      role="menuitemradio"
                      aria-checked={!sortNewest}
                      onClick={() => { setSortNewest(false); setSortOpen(false); }}
                      className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5 flex items-center justify-between"
                    >
                      Oldest {!sortNewest && <Check size={14} />}
                    </button>
                    <button
                      role="menuitemradio"
                      aria-checked={sortNewest}
                      onClick={() => { setSortNewest(true); setSortOpen(false); }}
                      className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/5 flex items-center justify-between"
                    >
                      Newest {sortNewest && <Check size={14} />}
                    </button>
                  </div>
                )}
              </div>

              {/* Mark-watched (season toggle, Cinejoy pill) */}
              <button
                onClick={markSeasonWatched}
                className="h-10 px-4 inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-white text-sm font-medium hover:bg-white/15 transition-colors"
              >
                <Eye size={16} /> Mark watched
              </button>

              {/* Season dropdown */}
              <SeasonDropdown
                seasons={availableSeasons}
                selectedSeason={selectedSeason}
                airingSeasonNumber={airingSeasonNumber}
                onSelect={(s) => { setSelectedSeason(s); }}
              />

              {/* Layout toggle — three icon pills */}
              <div className="inline-flex items-center gap-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 p-1" role="radiogroup" aria-label="Episode layout">
                <motion.button
                  whileTap={{ scale: PRESS_SCALE.ICON }}
                  onClick={() => setEpisodeLayout('carousel')}
                  aria-pressed={episodeLayout === 'carousel'}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full transition-colors"
                  style={{
                    background: episodeLayout === 'carousel' ? 'rgba(255,255,255,0.16)' : 'transparent',
                    color: episodeLayout === 'carousel' ? '#fff' : '#9ca3af',
                  }}
                  title="Carousel view"
                >
                  <GalleryHorizontal size={15} />
                </motion.button>
                <motion.button
                  whileTap={{ scale: PRESS_SCALE.ICON }}
                  onClick={() => setEpisodeLayout('grid')}
                  aria-pressed={episodeLayout === 'grid'}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full transition-colors"
                  style={{
                    background: episodeLayout === 'grid' ? 'rgba(255,255,255,0.16)' : 'transparent',
                    color: episodeLayout === 'grid' ? '#fff' : '#9ca3af',
                  }}
                  title="Grid view"
                >
                  <LayoutGrid size={15} />
                </motion.button>
                <motion.button
                  whileTap={{ scale: PRESS_SCALE.ICON }}
                  onClick={() => setEpisodeLayout('list')}
                  aria-pressed={episodeLayout === 'list'}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full transition-colors"
                  style={{
                    background: episodeLayout === 'list' ? 'rgba(255,255,255,0.16)' : 'transparent',
                    color: episodeLayout === 'list' ? '#fff' : '#9ca3af',
                  }}
                  title="List view"
                >
                  <List size={15} />
                </motion.button>
              </div>
            </div>
          </div>

          {/* Episode Grid/List/Carousel */}
          <div className="relative group/episodes">
          <AnimatePresence mode="wait">
          <motion.div
            ref={episodeLayout === 'carousel' ? epRailRef : undefined}
            key={`season-${selectedSeason}-${episodesFetching}-${episodeLayout}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={
              episodeLayout === 'carousel'
                ? {
                    display: 'flex',
                    flexDirection: 'row',
                    gap: '1.5rem',
                    overflowX: 'auto',
                    scrollSnapType: 'x mandatory',
                    padding: '1rem 2rem 3rem',
                  }
                : {
                    display: episodeLayout === 'grid' ? 'grid' : 'flex',
                    flexDirection: episodeLayout === 'list' ? 'column' : undefined,
                    gridTemplateColumns: episodeLayout === 'grid' ? 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))' : undefined,
                    gap: episodeLayout === 'grid' ? '0.8rem' : '0.5rem',
                  }
            }
            className={episodeLayout === 'carousel' ? 'episodes-rail-mask scrollbar-hide' : 'episode-grid hide-scrollbar'}
          >
            {episodesFailed ? (
              <div style={{ gridColumn: episodeLayout === 'grid' ? '1/-1' : undefined }}>
                <EmptyState
                  icon="error"
                  title="Couldn't load episodes"
                  description="The episode list failed to load. This may be a temporary problem."
                  actions={
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: PRESS_SCALE.CONTROL }}
                      onClick={() => refetchEpisodes()}
                      style={{
                        background: "rgba(var(--accent-primary-rgb),0.08)",
                        border: "1px solid rgba(var(--accent-primary-rgb),0.2)",
                        color: "var(--accent-primary)",
                        padding: "8px 20px",
                        borderRadius: "10px",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <RotateCcw size={14} /> Try Again
                    </motion.button>
                  }
                />
              </div>
            ) : episodesFetching ? (
              // Skeleton placeholders while episodes load (also covers a season
              // switch: placeholderData keeps the PREVIOUS season's episodes in
              // `data`, so isFetching — not isLoading — is the real signal).
              Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    background: "#0a0a0d",
                    borderRadius: "12px",
                    overflow: "hidden",
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}
                >
                  <div
                    className="skeleton"
                    style={{ width: "100%", aspectRatio: "16/9" }}
                  ></div>
                  <div
                    style={{ padding: "0.8rem 1rem", display: "flex", gap: "8px" }}
                  >
                    <div
                      className="skeleton"
                      style={{
                        height: "1.5rem",
                        width: "2rem",
                        borderRadius: "4px",
                      }}
                    ></div>
                    <div
                      style={{
                        flex: 1,
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.6rem",
                      }}
                    >
                      <div
                        className="skeleton"
                        style={{
                          height: "1.1rem",
                          width: "70%",
                          borderRadius: "4px",
                        }}
                      ></div>
                      <div
                        className="skeleton"
                        style={{
                          height: "0.8rem",
                          width: "100%",
                          borderRadius: "4px",
                        }}
                      ></div>
                      <div
                        className="skeleton"
                        style={{
                          height: "0.8rem",
                          width: "80%",
                          borderRadius: "4px",
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))
            ) : episodes.length === 0 ? (
              <div style={{ gridColumn: episodeLayout === 'grid' ? '1/-1' : undefined }}>
                <EmptyState
                  icon="tv"
                  title={`No episodes found for Season ${selectedSeason}.`}
                  description={
                    normalizedSeasonCount > 1
                      ? `This show has ${normalizedSeasonCount} season${normalizedSeasonCount > 1 ? 's' : ''}. Try selecting a different season.`
                      : "Episode data may not be available yet."
                  }
                  actions={
                    normalizedSeasonCount > 1 && (
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: PRESS_SCALE.CONTROL }}
                        onClick={() => {
                          const currentIndex = availableSeasonNumbers.indexOf(selectedSeason);
                          const nextIndex = currentIndex >= 0
                            ? (currentIndex + 1) % availableSeasonNumbers.length
                            : 0;
                          setSelectedSeason(availableSeasonNumbers[nextIndex]);
                        }}
                        style={{
                          background: "rgba(var(--accent-primary-rgb),0.08)",
                          border: "1px solid rgba(var(--accent-primary-rgb),0.2)",
                          color: "var(--accent-primary)",
                          padding: "8px 20px",
                          borderRadius: "10px",
                          fontSize: "0.85rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <RotateCcw size={14} /> Try Another Season
                      </motion.button>
                    )
                  }
                />
              </div>
            ) : (() => {
                const isCarouselLayout = episodeLayout === 'carousel';
                const visibleEps = episodesForLayout.slice(0, isCarouselLayout ? episodesForLayout.length : visibleEpisodeCount);
                const hasMore = !isCarouselLayout && episodesForLayout.length > visibleEpisodeCount;
                const isExpanded = !isCarouselLayout && visibleEpisodeCount > EPISODES_CHUNK_SIZE;
                return (
                  <>
                  {visibleEps.map((ep, idx) => {
                    const isEpPlaying = isPlaying && playingEpisode === ep.episodeNumber && playMode !== 'trailer';
                    const isGrid = episodeLayout === 'grid';
                    const isCard = isGrid || isCarouselLayout;
                    const isWatched = isEpisodeWatched(ep);
                    const isLiveWatched = Number(continueEntryForMovie?.savedSeason) === Number(selectedSeason)
                      && continueEntryForMovie?.savedEpisode === ep.episodeNumber
                      && (continueEntryForMovie?.timestamp || 0) > 0;
                    const watchedTs = isLiveWatched ? (continueEntryForMovie?.timestamp || 0) : 0;
                    const isAired = isEpAired(ep);
                    const playable = isAired;
                                        // Upcoming episodes have no TMDB still — fall back to the
                                        // series artwork so every card shows an image. Catalog objects
                                        // sometimes store art in the non-Url fields.
                    const epThumb = ep.thumbnailUrl || ep.posterUrl || ep.backdropUrl || movie.backdropUrl || movie.posterUrl || movie.backdrop || movie.poster || movie.thumbnailUrl || null;
                    const thumbLoadPriority = idx < 6 ? 'high' : undefined;
                    const thumbLoading = idx < 6 ? 'eager' : 'lazy';
                    const pctWatched = isWatched && watchedTs <= 0
                      ? 100
                      : Math.min(100, (watchedTs / (ep.durationMins ? ep.durationMins * 60 : 3600)) * 100);
                    const playEpisode = () => {
                      if (!playable) return;
                      setIsPlaying(true);
                      setPlayingEpisode(ep.episodeNumber);
                      updateProgress(
                        { ...movie, source: resolvedPlatform, sourceName },
                        selectedSeason,
                        ep.episodeNumber,
                        // A different episode starts fresh; reopening the stored
                        // episode keeps its resume point instead of inheriting it.
                        startPlaybackTimestamp(continueEntryForMovie, {
                          isTv: true,
                          season: selectedSeason,
                          episode: ep.episodeNumber,
                        }),
                      );
                    };
                    const playEpKeyboard = (e) => {
                      if (e.target !== e.currentTarget || !playable) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        playEpisode();
                      }
                    };

                    if (isCard) {
                                          // Grid / carousel card
                      return (
                        <motion.div
                          key={ep.id || idx}
                          initial={{ opacity: 0, scale: 0.95, y: 16 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -8 }}
                          transition={{ duration: 0.35, delay: Math.min(idx * 0.04, 0.3), ease: [0.16, 1, 0.3, 1] }}
                          whileHover={{ y: -4 }}
                          whileTap={playable ? { scale: PRESS_SCALE.CONTROL } : undefined}
                          role={playable ? "button" : undefined}
                          tabIndex={playable ? 0 : undefined}
                          aria-disabled={playable ? undefined : true}
                          aria-label={playable ? `Play ${ep.title}` : undefined}
                          onClick={playEpisode}
                          onKeyDown={playEpKeyboard}
                          className="group flex flex-col gap-3 shrink-0 cursor-pointer transition-transform duration-200"
                          style={{
                            opacity: (!isAired) ? 0.45 : 1,
                            scrollSnapAlign: isCarouselLayout ? 'start' : undefined,
                            ...(isCarouselLayout ? { flex: '0 0 clamp(220px, 62vw, 300px)' } : {}),
                          }}
                        >
                          {/* Thumb */}
                          <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black/20 shrink-0 border border-white/5 transition-all duration-300 group-hover:scale-105 group-hover:ring-1 group-hover:ring-white/50">
                            {epThumb ? (
                              <img
                                src={epThumb}
                                alt={ep.title}
                                loading={thumbLoading}
                                fetchPriority={thumbLoadPriority}
                                decoding="async"
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:brightness-110"
                                style={{ filter: !isAired ? 'grayscale(0.85) brightness(0.55)' : undefined }}
                              />
                            ) : (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '5px', background: 'linear-gradient(135deg, #18181b 0%, rgba(149,255,80,0.12) 55%, #211519 100%)' }}>
                                <span style={{ fontSize: '1.7rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', lineHeight: 1 }}>{String(ep.episodeNumber).padStart(2, '0')}</span>
                                <Film size={18} strokeWidth={1.5} color="rgba(255,255,255,0.28)" />
                              </div>
                            )}
                            {/* E badge */}
                            <span className="absolute top-2 left-2 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-[11px] font-semibold text-white">
                              {episodeNumberLabel(ep.episodeNumber)}
                            </span>
                            {/* Watched toggle */}
                            <button
                              role="button"
                              tabIndex={0}
                              aria-pressed={isWatched}
                              aria-label={isWatched ? `Mark ${ep.title} as not watched` : `Mark ${ep.title} as watched`}
                              onClick={(e) => { e.stopPropagation(); toggleEpisodeWatched(ep); }}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  toggleEpisodeWatched(ep);
                                }
                              }}
                              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-white hover:bg-black/65 flex items-center justify-center"
                            >
                              {isWatched ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                            {/* Center status */}
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                              {!isAired ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#3c8217', color: '#fff', padding: '4px 12px', borderRadius: '7px 7px 0 0', fontSize: '11px', fontWeight: 500, lineHeight: 1.45, backdropFilter: 'blur(6px)', boxShadow: '0 6px 20px rgba(0,0,0,0.35)' }}>
                                  <Calendar size={12} strokeWidth={2} aria-hidden="true" />
                                  <span>Airs</span>
                                  {formatAirsDate(ep.airDate)}
                                </div>
                              ) : isAired ? (
                                <div style={{ background: 'rgba(0,0,0,0.85)', color: '#a1a1aa', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.12)' }}>
                                  Playable
                                </div>
                              ) : null}
                            </div>
                            {isEpPlaying && (
                              <div
                                className="absolute top-2 right-12 px-2 py-0.5 rounded-md text-[10px] font-extrabold tracking-widest uppercase z-10 pointer-events-none"
                                style={{ background: 'var(--accent-gradient, linear-gradient(90deg, #95ff50, #5ce21c))', color: 'var(--on-accent, #fff)' }}
                              >
                                Playing
                              </div>
                            )}
                            {/* Duration chip */}
                            {ep.duration && (
                              <span className="absolute bottom-2 right-2 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-[11px] font-medium text-white">
                                {ep.duration}
                              </span>
                            )}
                          </div>
                          {/* Meta */}
                          <div className="space-y-1 px-1">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-base font-bold text-white group-hover:text-white/90 line-clamp-1">
                                {ep.title}
                              </h3>
                            </div>
                            <p className={`text-xs ${spoilerFreeMode ? 'text-white/40 italic' : 'text-white/60'} line-clamp-2 leading-relaxed`}>
                              {spoilerFreeMode ? "Episode details hidden (Spoiler-Free Mode)" : ep.description}
                            </p>
                            {isWatched && (
                              <div style={{ marginTop: '0.45rem' }}>
                                <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pctWatched}%`, background: 'var(--accent-gradient, linear-gradient(90deg, #95ff50, #5ce21c))', borderRadius: '2px' }} />
                                </div>
                                <span style={{ fontSize: '0.65rem', color: '#71717a', marginTop: '3px', display: 'block' }}>
                                  {watchedTs > 0 ? `${formatTime(watchedTs)} watched` : 'Watched'}
                                </span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    }

                                        // List row
                    return (
                      <motion.div
                        key={ep.id || idx}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.25), ease: EASE_OUT }}
                        whileHover={{ background: 'rgba(255,255,255,0.04)' }}
                        whileTap={playable ? { scale: PRESS_SCALE.ROW } : undefined}
                        role={playable ? "button" : undefined}
                        tabIndex={playable ? 0 : undefined}
                        aria-disabled={playable ? undefined : true}
                        aria-label={playable ? `Play ${ep.title}` : undefined}
                        onClick={playEpisode}
                        onKeyDown={playEpKeyboard}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '1rem',
                          padding: '0.75rem 1rem', borderRadius: '12px',
                          background: isEpPlaying ? 'rgba(var(--accent-primary-rgb), 0.08)' : 'transparent',
                          border: isEpPlaying ? '1px solid rgba(var(--accent-primary-rgb), 0.2)' : '1px solid transparent',
                          cursor: playable ? 'pointer' : 'default', opacity: (!isAired) ? 0.35 : 1,
                          transition: 'background 0.2s, border 0.2s',
                        }}
                      >
                        {/* Thumbnail */}
                        <div style={{ position: 'relative', width: 'clamp(96px, 26vw, 140px)', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', aspectRatio: '16/9', background: '#18181b' }}>
                          {epThumb ? (
                            <img src={CdnImageAdapter.getUrl(epThumb, 'w500')} alt={ep.title} loading={thumbLoading} fetchPriority={thumbLoadPriority} decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: !isAired ? 'grayscale(0.85) brightness(0.55)' : undefined }} />
                          ) : (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'linear-gradient(135deg, #18181b 0%, rgba(149,255,80,0.12) 55%, #211519 100%)' }}>
                              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', lineHeight: 1 }}>{String(ep.episodeNumber).padStart(2, '0')}</span>
                              <Film size={13} strokeWidth={1.5} color="rgba(255,255,255,0.28)" />
                            </div>
                          )}
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isAired ? (
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Play size={14} fill="#fff" stroke="none" style={{ marginLeft: '2px' }} />
                                </div>
                              ) : (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#3c8217', color: '#fff', padding: '4px 12px', borderRadius: '7px 7px 0 0', fontSize: '11px', fontWeight: 500, lineHeight: 1.45, backdropFilter: 'blur(6px)', boxShadow: '0 4px 14px rgba(0,0,0,0.35)' }}>
                                <Calendar size={11} strokeWidth={2} aria-hidden="true" />
                                {formatAirsDate(ep.airDate)}
                              </div>
                            )}
                          </div>
                          {isEpPlaying && <div style={{ position: 'absolute', top: '4px', right: '4px', background: 'var(--accent-primary, #95ff50)', color: 'var(--on-accent, white)', padding: '1px 5px', borderRadius: '4px', fontSize: '0.5rem', fontWeight: 800, textTransform: 'uppercase' }}>Playing</div>}
                          <div style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', padding: '1px 5px', borderRadius: '4px', fontSize: '0.55rem', fontWeight: 700 }}>{ep.duration}</div>
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isEpPlaying ? 'var(--accent-primary, #95ff50)' : '#71717a', fontFamily: 'monospace', flexShrink: 0 }}>E{String(ep.episodeNumber).padStart(2, '0')}</span>
                              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, color: isEpPlaying ? '#fff' : '#e4e4e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.title}</h3>
                            </div>
                          </div>
                          {/* Spoiler-free copy is distinguished by italics, not by
                              dimming: #52525b (--text-faint) read as a ghost at
                              2.9:1 against the card. */}
                          <p style={{ fontSize: '0.78rem', color: '#71717a', fontStyle: spoilerFreeMode ? 'italic' : 'normal', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {spoilerFreeMode ? "Episode details hidden (Spoiler-Free Mode)" : ep.description}
                          </p>
                          {isWatched && (
                            <div style={{ marginTop: '0.4rem' }}>
                              <div style={{ height: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', maxWidth: '120px' }}>
                                <div style={{ height: '100%', width: `${pctWatched}%`, background: 'var(--accent-gradient, linear-gradient(90deg, #95ff50, #5ce21c))', borderRadius: '2px' }} />
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                  {hasMore && (
                    <motion.div
                      key="see-more"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      style={{
                        gridColumn: episodeLayout === 'grid' ? '1 / -1' : undefined,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        paddingTop: '1rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <motion.button
                        whileHover={{ scale: 1.03, background: 'rgba(255,255,255,0.1)' }}
                        whileTap={{ scale: PRESS_SCALE.CONTROL }}
                        onClick={() => setVisibleEpisodeCount((prev) => Math.min(episodes.length, prev + EPISODES_CHUNK_SIZE))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                          color: '#fff', padding: '8px 20px', borderRadius: 'var(--radius-full)',
                          fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                          letterSpacing: '0.02em', transition: 'all 0.2s',
                        }}
                      >
                        {`Load more (${episodes.length - visibleEpisodeCount} remaining)`}
                        <ChevronDownIcon size={14} />
                      </motion.button>
                      {episodes.length - visibleEpisodeCount > EPISODES_CHUNK_SIZE && (
                        <button
                          type="button"
                          onClick={() => setVisibleEpisodeCount(episodes.length)}
                          style={{
                            background: 'transparent', border: 'none',
                            color: '#a1a1aa', padding: '8px 12px',
                            fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer',
                            textDecoration: 'underline',
                          }}
                        >
                          Show all ({episodes.length})
                        </button>
                      )}
                    </motion.div>
                  )}
                  {!hasMore && isExpanded && (
                    <motion.div
                      key="show-less"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      style={{
                        gridColumn: episodeLayout === 'grid' ? '1 / -1' : undefined,
                        display: 'flex', justifyContent: 'center', paddingTop: '1rem',
                      }}
                    >
                      <motion.button
                        whileHover={{ scale: 1.03, background: 'rgba(255,255,255,0.1)' }}
                        whileTap={{ scale: PRESS_SCALE.CONTROL }}
                        onClick={() => setVisibleEpisodeCount(EPISODES_CHUNK_SIZE)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#a1a1aa', padding: '8px 20px', borderRadius: 'var(--radius-full)',
                          fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                          letterSpacing: '0.02em', transition: 'all 0.2s',
                        }}
                      >
                        Show less
                        <motion.span animate={{ rotate: 180 }} style={{ display: 'flex' }}>
                          <ChevronDownIcon size={14} />
                        </motion.span>
                      </motion.button>
                    </motion.div>
                  )}
                  </>
                );
              })()
            }
          </motion.div>
          </AnimatePresence>

          {/* Carousel rail overlay arrows — canonical ghost chevron */}
          {episodeLayout === 'carousel' && episodes.length > 0 && (
            <>
              {epCanLeft && (
                <RailArrow dir="left" onClick={() => scrollEpRail('left')} revealOnHover hoverClass="group-hover/episodes:opacity-100" label="Episodes" />
              )}
              {epCanRight && (
                <RailArrow dir="right" onClick={() => scrollEpRail('right')} revealOnHover hoverClass="group-hover/episodes:opacity-100" label="Episodes" />
              )}
            </>
          )}
          </div>
        </motion.section>
      )}

      {/* ── Cast ─────────────────────────────────────────────────────────────── */}
      {movie.cast && movie.cast.length > 0 && (
        <motion.section
          style={{ position: "relative", zIndex: 1, maxWidth: "100%", marginLeft: "auto", marginRight: "auto" }}
          {...L.Reveal}
        >
          <div style={{ minWidth: 0 }}>
            <ErrorBoundary>
              <CastRail cast={movie.cast} />
            </ErrorBoundary>
          </div>
        </motion.section>
      )}

      {/* ── Trailers ──────────────────────────────────────────────────────────── */}
      {movie.videos && movie.videos.length > 0 && (
        <motion.section
          style={{ position: "relative", zIndex: 1, marginTop: "2rem", maxWidth: "100%", marginLeft: "auto", marginRight: "auto" }}
          {...L.Reveal}
        >
          <motion.h2
            className="text-xl lg:text-2xl font-bold text-white/90 px-2"
            {...L.Reveal}
          >
            Trailers
          </motion.h2>
          <div className="flex gap-5 overflow-x-auto p-4 px-6 hide-scrollbar">
            {movie.videos.map((vid) => {
              const rankLabel = classifyTrailer(vid);
              const kindLabel = rankLabel ? rankLabel[0].toUpperCase() + rankLabel.slice(1) : "Trailer";
              return (
              <div
                key={vid.key}
                className="flex-none w-64 md:w-80 aspect-video group cursor-pointer transition-transform duration-200 active:scale-95"
                onClick={() => { setIsPlaying(true); setPlayMode('trailer'); setPlayingTrailerKey(vid.key); setPlayingEpisode(null); }}
              >
                <div className="relative w-full h-full rounded-xl overflow-hidden bg-black/20 border border-white/5 transition-all duration-300 group-hover:scale-105 group-hover:ring-1 group-hover:ring-white/50 shadow-lg group-hover:shadow-2xl">
                  <img src={`https://img.youtube.com/vi/${vid.key}/mqdefault.jpg`} alt={vid.name} className="w-full h-full object-cover transition-all duration-300 group-hover:brightness-110" loading="lazy" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors duration-300" />
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 to-transparent">
                    <h4 className="text-sm font-bold text-white line-clamp-1">{vid.name}</h4>
                    <span className="text-xs text-white/70">{kindLabel}</span>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </motion.section>
      )}


      {/* ── More Like This ────────────────────────────────────────────────────── */}
      {(loading || (similar && similar.length > 0)) && (
        <motion.section
          style={{ position: "relative", zIndex: 1, marginTop: "2rem", maxWidth: "100%", marginLeft: "auto", marginRight: "auto" }}
          {...L.Reveal}
        >
          <motion.h2
            className="text-xl lg:text-2xl font-bold text-white/90 px-2"
            {...L.Reveal}
          >
            You Might Also Like
          </motion.h2>
          {loading ? (
            <div className="movie-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <MovieCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <ErrorBoundary>
            <motion.div
              className="flex gap-4 overflow-x-auto overflow-y-clip pb-10 pt-4 details-gutter hide-scrollbar items-start isolate min-h-[310px] lg:min-h-[356px]"
              style={{
                maskImage: "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)",
              }}
              viewport={{ once: true, margin: "-100px" }}
            >
              {similar.slice(0, visibleCount).map((sim, idx) => (
                <motion.div
                  key={`${sim.id}-${idx}`}
                  className="flex-none w-[140px] lg:w-[200px]"
                  {...L.RevealAt((idx % 12) * 0.05)}
                >
                  <MovieCard
                    movie={sim}
                  />
                </motion.div>
              ))}
            </motion.div>
            </ErrorBoundary>
          )}
        </motion.section>
      )}

      {/* ── More from Director ──────────────────────────────────────────────── */}
      {movie.director && similar.some(s => s.director && s.director === movie.director) && (
        <motion.section
          style={{ position: "relative", zIndex: 1, marginTop: "2rem", maxWidth: "100%", marginLeft: "auto", marginRight: "auto" }}
          {...L.Reveal}
        >
          <motion.h2
            className="text-xl lg:text-2xl font-bold text-white/90 px-2"
            {...L.Reveal}
            style={{ marginBottom: '1rem' }}
          >
            More from {movie.director}
          </motion.h2>
            <div
              style={{
                position: "relative",
                display: "flex",
                gap: "1.5rem",
                overflowX: "auto",
                padding: "1rem",
                scrollbarWidth: "none",
              }}
              ref={directorRailRef}
            >
              {canScrollLeft && <RailArrow dir="left" onClick={() => scrollDirector("left")} label={movie.director ? `More from ${movie.director}` : "More titles"} />}
              {canScrollRight && <RailArrow dir="right" onClick={() => scrollDirector("right")} label={movie.director ? `More from ${movie.director}` : "More titles"} />}
              <ErrorBoundary>
              {similar.slice(0, 8).filter(s => s.director && s.director === movie.director).slice(0, 5).map((sim, idx) => (
              <motion.div
                key={`dir-${sim.id}-${idx}`}
                {...L.RevealAt(idx * 0.08)}
                style={{ flexShrink: 0, width: '180px' }}
              >
                <MovieCard movie={{ ...sim, source: sim.source || resolvedPlatform }} />
              </motion.div>
            ))}
              </ErrorBoundary>
          </div>
        </motion.section>
      )}

      {/* ── Social Proof Bar ─────────────────────────────────────────────────── */}
      <motion.div
        {...L.Reveal}
        style={{
          position: 'relative', zIndex: 1, marginTop: '2rem',
          padding: '1rem 1rem',
          maxWidth: '100%', marginLeft: 'auto', marginRight: 'auto',
          display: 'flex', flexWrap: 'wrap', gap: '1.5rem',
          justifyContent: 'center', alignItems: 'center',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {movie.imdbRating > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Star size={16} fill="#fbbf24" color="#fbbf24" />
            <span style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
              <strong style={{ color: '#fbbf24' }}>{movie.imdbRating}</strong> TMDB Score
            </span>
          </div>
        )}
        {movie.matchScore && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ThumbsUp size={16} color="#4ade80" />
            <span style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
              <strong style={{ color: '#4ade80' }}>{movie.matchScore}%</strong> match
            </span>
          </div>
        )}
        {isTvContent && normalizedSeasonCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Tv size={16} color="#60a5fa" />
            <span style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>
              <strong style={{ color: '#60a5fa' }}>{normalizedSeasonCount}</strong> season{normalizedSeasonCount > 1 ? 's' : ''}
            </span>
          </div>
        )}

      </motion.div>

      {/* ── Video Player Overlay (portal to body for z-index above navbar) ── */}
      </div>
{createPortal(
      <AnimatePresence>
        {isPlaying && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: "var(--z-overlay)",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              background: playMode === "trailer" ? "rgba(5,5,5,0.92)" : "#050505",
              backdropFilter: playMode === "trailer" ? "blur(24px)" : "none",
            }}
          >
            {playMode === "trailer" && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.12 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: EASE_OUT }}
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url(${movie.backdropUrl || movie.posterUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  zIndex: -1,
                }}
              />
            )}

            {/* Player header — TRAILER ONLY. Native playback is full-bleed with
                its own in-player chrome (back, title, prev/next episode in the
                bottom rail), matching the Netflix web player. */}
            {playMode === "trailer" && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4, ease: EASE_OUT }}
                className="video-modal-header"
                style={{
                  position: "relative",
                  padding: "calc(clamp(0.65rem, 1.2vh, 1.25rem) + env(safe-area-inset-top, 0px)) clamp(1rem, 2vw, 2rem) clamp(0.65rem, 1.2vh, 1.25rem)",
                  display: "flex",
                  justifyContent: "space-between",
                  background: "rgba(0,0,0,0.4)",
                  alignItems: "center",
                  zIndex: 1000,
                  backdropFilter: "blur(12px)",
                  gap: "0.5rem",
                }}
              >
                <div
                  className="video-modal-header__identity"
                  style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1, minWidth: 0, overflow: "hidden" }}
                >
                  <motion.button
                    onClick={() => setIsPlaying(false)}
                    className="video-modal-back-button"
                    aria-label="Back to browse"
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "6px",
                      borderRadius: "4px",
                      flexShrink: 0,
                    }}
                    whileHover={{ background: "rgba(255,255,255,0.1)" }}
                    whileTap={{ opacity: 0.6 }}
                  >
                    <ChevronLeft size={22} strokeWidth={2.2} />
                  </motion.button>
                  <h3
                    className="video-modal-title"
                    style={{
                      margin: 0,
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    {movie.title}{" "}
                    <span style={{ color: "#71717a", fontWeight: 400 }}>
                      — Official Trailer
                    </span>
                  </h3>
                </div>
                <div
                  className="video-modal-header__actions"
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "center",
                  }}
                >
                  <motion.button
                    onClick={() => setIsPlaying(false)}
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "white",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      cursor: "pointer",
                      marginLeft: "0.25rem",
                    }}
                    whileHover={{
                      background: "rgba(255,255,255,0.18)",
                      scale: 1.1,
                    }}
                    whileTap={{ scale: PRESS_SCALE.ICON }}
                    title="Close Trailer"
                  >
                    <X size={18} />
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Player: trailer iframe, or the native HLS player for streams */}
            <motion.div
              className="video-modal-player"
              style={{
                position: "relative",
                flex: 1,
                width: "100%",
                height: "100%",
                background: "#050505",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                overflow: "hidden",
              }}
            >
              {playMode === "trailer" ? (
                <>
                  {iframeLoading && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Loader variant="inline" size="40px" />
                    </div>
                  )}
                  <iframe
                    key={playingTrailerKey || movie.trailerUrl || movie.trailer}
                    src={`https://www.youtube.com/embed/${playingTrailerKey || movie.trailerUrl || movie.trailer}?autoplay=${trailers ? 1 : 0}&rel=0&modestbranding=1&mute=${muteTrailers ? 1 : 0}`}
                    onLoad={() => setIframeLoading(false)}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{
                      width: "100%",
                      height: "min(calc(100vw * 9/16), calc(100vh - 120px))",
                      maxWidth: "min(1400px, calc((100vh - 120px) * 16/9))",
                      border: "none",
                      borderRadius: "20px",
                      boxShadow: "0 32px 64px -12px rgba(0,0,0,0.9)",
                      opacity: iframeLoading ? 0 : 1,
                      transition: "opacity 0.4s ease",
                    }}
                  />
                </>
              ) : (
                <ErrorBoundary>
                  <Suspense
                    fallback={
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          background: "#000",
                        }}
                      />
                    }
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {PROVIDER_EMBED_PLAYBACK || zxcNative === false ? (
                        <ProviderEmbedPlayer
                          type={isTvContent ? "tv" : "movie"}
                          id={numericId}
                          season={selectedSeason}
                          episode={isTvContent ? playingEpisode : 1}
                          title={movie?.title || movie?.name || "Title"}
                          subtitle={
                            isTvContent
                              ? `S${selectedSeason}:E${playingEpisode}`
                              : releaseYear(movie)
                          }
                          onClose={() => setIsPlaying(false)}
                        />
                      ) : zxcNative === true ? (
                        <NativePlayerView
                          type={isTvContent ? "tv" : "movie"}
                          id={numericId}
                          season={selectedSeason}
                          episode={isTvContent ? playingEpisode : 1}
                          originalLanguage={movie?.originalLanguage}
                          title={movie?.title || movie?.name || "Title"}
                          subtitle={
                            isTvContent
                              ? `S${selectedSeason}:E${playingEpisode}` +
                                (() => {
                                  const ep = (episodes || []).find(
                                    (e) => e.episodeNumber === playingEpisode,
                                  );
                                  return ep?.title ? ` "${ep.title}"` : "";
                                })()
                              : releaseYear(movie)
                          }
                          episodes={
                            isTvContent
                              ? (episodes || []).map((e) => ({
                                  number: e.episodeNumber,
                                  title: e.title,
                                  thumbnailUrl: e.thumbnailUrl,
                                  durationMins: e.durationMins,
                                  description: e.description,
                                  airDate: e.airDate,
                                }))
                              : []
                          }
                          onSelectEpisode={(n) => setPlayingEpisode(n)}
                          canGoPrev={canGoPrev}
                          canGoNext={canGoNext}
                          onGoPrev={goToPrevEpisode}
                          onGoNext={goToNextEpisode}
                          onClose={() => setIsPlaying(false)}
                          imdbId={movie?.imdbId || ""}
                          backdropUrl={movie?.backdropUrl || ""}
                          posterUrl={titleLogoUrl || ""}
                          watchedEntry={watchEntry}
                          onProgressChange={(t) => {
                            if (t > 10) {
                              updateProgress(
                                { ...movie, source: resolvedPlatform, sourceName },
                                selectedSeason,
                                playingEpisode,
                                Math.floor(t),
                              );
                            }
                          }}
                        />
                      ) : (
                        <div style={{ width: "100%", height: "100%", background: "#000" }} />
                      )}
                    </div>
                  </Suspense>
                </ErrorBoundary>
              )}
            </motion.div>
          </motion.div>
        )}
        {unreleasedModalOpen && createPortal(
          <MotionFade
            key="unreleased"
            className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md px-6"
            style={{ zIndex: "var(--z-modal)" }}
            onClick={() => setUnreleasedModalOpen(false)}
          >
            <motion.div
              initial={L.Modal.panel.initial}
              animate={L.Modal.panel.animate}
              exit={L.Modal.panelExit}
              transition={L.Modal.panel.transition}
              ref={unreleasedPanelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="unreleased-title"
              tabIndex={-1}
              className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0c0c0e]/95 p-6 text-center shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
                <Clock className="h-6 w-6 text-white/60" aria-hidden="true" />
              </div>
              <h3 id="unreleased-title" className="text-lg font-bold text-white">
                This Hasn&apos;t Released Yet
              </h3>
              <p className="mt-1.5 text-sm text-white/60">
                Releases on {formatTMDBDate(movie.releaseDate, { month: "long", day: "numeric", year: "numeric" }, undefined, releasePlatform)}
              </p>
              <button
                type="button"
                onClick={() => setUnreleasedModalOpen(false)}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.12]"
              >
                <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" /> Back
              </button>
            </motion.div>
          </MotionFade>,
          document.body
        )}

        {ratingsOpen && movie && (
          <RatingsTable
            movie={movie}
            seasons={availableSeasons}
            initialSeason={selectedSeason}
            onClose={() => setRatingsOpen(false)}
          />
        )}
      </AnimatePresence>,
      document.body
      )}

      <CollectionPickerDialog
        open={collectionPickerOpen}
        movie={movie}
        collections={collections || []}
        onToggle={toggleInCollection}
        onCreateWithItems={(name, movieIds, visibility) =>
          handlePickerCreateFromDetails(name, movieIds, visibility)
        }
        onClose={() => setCollectionPickerOpen(false)}
      />
    </div>
  );
}
