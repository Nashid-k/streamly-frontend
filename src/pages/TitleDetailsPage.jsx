import SEO from "../components/SEO";
import { DURATION, EASE_OUT, PRESS_SCALE } from "../constants/motion";
import AmbientBackground from "../components/AmbientBackground";
import MovieDetailsSkeleton from "../components/MovieDetailsSkeleton";
import EmptyState from "../components/EmptyState";
import CastRail from "../components/CastRail";
import RailArrow from "../components/RailArrow";
import RatingsTable from "../components/RatingsTable";
import RatingsCluster from "../components/RatingsCluster";
import useRailArrows from "../hooks/useRailArrows";
import useDialogA11y from "../hooks/useDialogA11y";
import { useTitleLogo } from "../hooks/useTitleLogo";
import useFeedSentinel from "../hooks/useFeedSentinel";
import { warmResolve } from "../api/warmResolve";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { createPortal } from "react-dom";
import { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback, lazy, Suspense } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import {
  Play,
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
  useReducedMotion,
} from "framer-motion";
import { MotionFade, MotionLeaf } from "../components/MotionLeaf";
import { useAppAuth } from "../context/auth";
import { useOptionalNotifications } from "../context/notifications";
import { useDetailBack } from "../hooks/useDetailView";
import { pickImageWidth, sceneHues } from "../utils/artwork";
import { hasLoadedMediaUrl, markMediaUrlLoaded } from "../utils/posterCache";
import { useToast } from "../components/Toast.jsx";
import MovieCard from "../components/MovieCard";
import CollectionPickerDialog from "../components/CollectionPickerDialog";
import SeasonDropdown from "../components/detail/SeasonDropdown";
import ProductionCompaniesBlock from "../components/detail/ProductionCompaniesBlock";
import DetailTitleRail from "../components/detail/DetailTitleRail";

import { buildMovieAddedNotification, fireListMilestone } from "../utils/notificationEngine";
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
    hdThumbs = true,
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
    myList,
    // "Mark as watched" is a deliberate data action, but it arrives at
    // updateProgress() looking identical to a progress tick from the player. The
    // gate cannot tell them apart, so these three handlers ask for an account
    // themselves instead of relying on the wrapped mutators.
    requireAuth,
  } = useAppAuth();
  const { addNotification } = useOptionalNotifications() || {};
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
          fireListMilestone((myList?.length || 0) + 1, addNotification);
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
  const autoPlayConsumedRef = useRef(null);
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
  const [playerMode, setPlayerMode] = useState("streamly");
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
  const hasExplicitEpisodeStyle = (() => {
    try {
      const saved = localStorage.getItem("setting-episodeViewStyle");
      return saved === '"grid"' || saved === '"carousel"' || saved === '"list"';
    } catch {
      return false;
    }
  })();
  const [episodeLayout, setEpisodeLayout] = useState(() => (
    hasExplicitEpisodeStyle && (episodeViewStyle === "grid" || episodeViewStyle === "list" || episodeViewStyle === "carousel")
      ? episodeViewStyle
      : "list"
  ));
  const prevEpisodeStyleRef = useRef(episodeViewStyle);
  useEffect(() => {
    if (prevEpisodeStyleRef.current === episodeViewStyle) return;
    prevEpisodeStyleRef.current = episodeViewStyle;
    if (episodeViewStyle === "grid" || episodeViewStyle === "list" || episodeViewStyle === "carousel") {
      setEpisodeLayout(episodeViewStyle);
    }
  }, [episodeViewStyle]);

  const EP_LIMIT = 8;
  const EPISODES_CHUNK_SIZE = 24;
  const [episodesExpanded, setEpisodesExpanded] = useState(false);
  const [visibleEpisodeCount, setVisibleEpisodeCount] = useState(EPISODES_CHUNK_SIZE);
  useEffect(() => {
    setVisibleEpisodeCount(EPISODES_CHUNK_SIZE);
    setEpisodesExpanded(false);
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
  const reduceMotion = useReducedMotion();
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

  const location = useLocation();
  const stateMovie = location.state?.movie;
  const passedMovie = useMemo(() => {
    if (!stateMovie) return undefined;
    const match =
      String(stateMovie.id) === String(id) ||
      String(stateMovie.id).replace(/^(movie-|tv-)/, "") === String(id).replace(/^(movie-|tv-)/, "");
    if (!match) return undefined;
    return {
      ...stateMovie,
      genres: Array.isArray(stateMovie.genres) ? stateMovie.genres : EMPTY_ARRAY,
      cast: Array.isArray(stateMovie.cast) ? stateMovie.cast : EMPTY_ARRAY,
      runtime: stateMovie.runtime || null,
      durationMins: stateMovie.durationMins || stateMovie.runtime || null,
    };
  }, [stateMovie, id]);

  const {
    data: rawMovie,
    isLoading,
    isPlaceholderData,
    error: movieError,
  } = useQuery({
    queryKey: ["movie", id],
    queryFn: () => movieService.getMovieDetails(id),
    // Details are immutable per day (mirrors the proxy's s-maxage=86400 split,
    // PLAN.md P1.2): repeat visits must paint from cache, never re-fetch.
    staleTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
    placeholderData: passedMovie ? () => passedMovie : undefined,
  });

  const loading = isLoading || isPlaceholderData;

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
  const { logoUrl: titleLogoUrl, onLogoError: onTitleLogoError } =
    useTitleLogo(movie, "TitleDetails", id);

  // Preload the logo image into browser cache the instant its URL is known
  useEffect(() => {
    if (titleLogoUrl) {
      const link = document.createElement("link");
      link.rel = "preload";
      link.as = "image";
      link.href = titleLogoUrl;
      link.fetchPriority = "high";
      document.head.appendChild(link);
      return () => {
        if (link.parentNode) link.parentNode.removeChild(link);
      };
    }
  }, [titleLogoUrl]);

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
  const similarEndRef = useRef(null);
  const growSimilar = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + 12, similar ? similar.length : 0));
  }, [similar]);
  useFeedSentinel({
    endRef: similarEndRef,
    hasMore: visibleCount < (similar ? similar.length : 0),
    grow: growSimilar,
  });

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

  /* ── Franchise membership ("Part of <collection>") ──────────────────────
     TMDB ships `belongs_to_collection` on the details payload; the parts
     themselves are a second request keyed by that collection id. This is the
     row the reference site (cinejoy.pk) renders directly after Trailers, and
     it is only worth a row when the franchise has more than this one title.
     Either request failing leaves the page exactly as it was (no empty row,
     no banner) — a missing franchise is not a broken page. */
  const collectionId = movie?.collection?.id || null;
  const {
    data: collectionData,
    error: collectionError,
  } = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: () => movieService.getCollection(collectionId),
    enabled: Boolean(collectionId),
    retry: false,
    refetchOnWindowFocus: false,
    // A franchise's membership is as immutable as the details themselves.
    staleTime: 1000 * 60 * 60 * 24,
  });
  useEffect(() => {
    if (collectionError) {
      reportQueryError("TitleDetails", ["collection", collectionId], collectionError, { collectionId });
    }
  }, [collectionError, collectionId]);

  const collectionParts = useMemo(() => {
    const parts = Array.isArray(collectionData?.parts) ? collectionData.parts : EMPTY_ARRAY;
    return parts.length > 1 ? parts : EMPTY_ARRAY;
  }, [collectionData]);
  const collectionName = collectionData?.name || movie?.collection?.name || "Collection";

  /* ── "More from <studio>" ───────────────────────────────────────────────
     The same studio-wide row the reference site's provider pages imply, built
     from the primary production company (its own id, discovered through
     /discover with_companies — movies and series both work). A company with
     two titles is not a row, so the rail only exists once the sweep returns a
     real catalogue with the current title removed. */
  const company = useMemo(() => {
    const list = Array.isArray(movie?.productionCompanies) ? movie.productionCompanies : EMPTY_ARRAY;
    // A logo makes the heading read as a studio banner; fall back to any row
    // with an id rather than dropping the feature for a logo-less company.
    return list.find((c) => c && c.id && c.logoUrl) || list.find((c) => c && c.id) || null;
  }, [movie]);

  const {
    data: companyTitles,
    error: companyTitlesError,
  } = useQuery({
    queryKey: ["company-titles", company?.id, isTvContent ? "tv" : "movie"],
    queryFn: () =>
      movieService.getDiscover({
        mediaType: isTvContent ? "tv" : "movie",
        companyId: company.id,
        sortBy: "popular",
      }),
    enabled: Boolean(company?.id),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 60 * 6,
  });
  useEffect(() => {
    if (companyTitlesError) {
      reportQueryError("TitleDetails", ["company-titles", company?.id], companyTitlesError, {
        companyId: company?.id ?? null,
      });
    }
  }, [companyTitlesError, company?.id]);

  const studioTitles = useMemo(() => {
    const list = Array.isArray(companyTitles) ? companyTitles : EMPTY_ARRAY;
    const others = list.filter((t) => String(t.id) !== String(movie?.id));
    return others.length >= 4 ? others.slice(0, 18) : EMPTY_ARRAY;
  }, [companyTitles, movie?.id]);
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
  const infoRows = useMemo(() => {
    const rows = [];
    const dateOpts = { year: "numeric", month: "short", day: "numeric" };
    const spokenList = Array.isArray(movie?.spokenLanguages)
      ? movie.spokenLanguages
      : Array.isArray(movie?.spoken_languages)
        ? movie.spoken_languages
        : [];
    const langs = spokenList
      .map((lang) => {
        if (!lang) return null;
        if (lang.iso_639_1) return String(lang.iso_639_1).toUpperCase();
        if (lang.code) return String(lang.code).toUpperCase();
        return null;
      })
      .filter(Boolean);
    if (langs.length > 0) {
      rows.push({ label: "Languages", value: langs.join(", "), uppercase: true });
    } else if (movie?.originalLanguage) {
      rows.push({ label: "Language", value: String(movie.originalLanguage).toUpperCase(), uppercase: true });
    }
    if (isTvContent) {
      if (movie?.status) rows.push({ label: "Status", value: movie.status });
      if (movie?.releaseDate) rows.push({ label: "First Aired", value: formatTMDBDate(movie.releaseDate, dateOpts, undefined, releasePlatform) });
      if (movie?.lastAiredDate) rows.push({ label: "Last Aired", value: formatTMDBDate(movie.lastAiredDate, dateOpts, undefined, releasePlatform) });
      if (movie?.seasonsCount) rows.push({ label: "Seasons", value: String(movie.seasonsCount) });
      if (movie?.episodesCount) rows.push({ label: "Episodes", value: String(movie.episodesCount) });
    } else {
      if (runtimeLabel) rows.push({ label: "Runtime", value: runtimeLabel, extra: endsAt ? `\u2022 Ends ${endsAt}` : null });
      if (movie?.releaseDate) rows.push({ label: "Release Date", value: formatTMDBDate(movie.releaseDate, dateOpts, undefined, releasePlatform) });
      // The franchise this film belongs to, named in the info table the way the
      // reference site does — the rail below shows the parts, this row keeps the
      // name where the other facts already are.
      if (movie?.collection?.name) rows.push({ label: "Collection", value: movie.collection.name });
    }
    return rows;
  }, [isTvContent, runtimeLabel, endsAt, movie, releasePlatform]);

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

  // Direct play entry from Hero / Banner Play button (`state: { autoPlay: true }`):
  // waits once for resolved metadata & unreleased check, then opens the player
  // immediately without requiring a second Play click on Details.
  useEffect(() => {
    if (!location.state?.autoPlay || loading || !movie) return;
    const visitKey = `${location.key || "default"}:${id}`;
    if (autoPlayConsumedRef.current === visitKey) return;
    autoPlayConsumedRef.current = visitKey;
    if (isUnreleased(movie.releaseDate)) {
      setUnreleasedModalOpen(true);
      return;
    }
    setPlayMode("movie");
    setIsPlaying(true);
  }, [location.state?.autoPlay, location.key, id, loading, movie]);

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
      // RIVO's Server 1 lists one master per language and does NOT put the
      // film's original first (Premalu: Hindi first, Malayalam second), so a
      // warm token minted without this would pre-load the Hindi entry — and the
      // player consumes warm tokens by title, so it would play that entry.
      originalLanguage: movie?.originalLanguage || undefined,
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



  const backdropPreloadUrl = movie?.backdropUrl || movie?.posterUrl || "";
  const backdropPreloadOptimized = backdropPreloadUrl
    ? CdnImageAdapter.getBackdropUrl(backdropPreloadUrl)
    : "";
  const [backdropReady, setBackdropReady] = useState(() =>
    hasLoadedMediaUrl(backdropPreloadOptimized),
  );
  const [posterError, setPosterError] = useState(false);
  const posterImgRef = useRef(null);

  useLayoutEffect(() => {
    if (!backdropPreloadOptimized) {
      setBackdropReady(false);
      return undefined;
    }
    if (hasLoadedMediaUrl(backdropPreloadOptimized)) {
      setBackdropReady(true);
    } else {
      setBackdropReady(false);
    }
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      markMediaUrlLoaded(backdropPreloadOptimized);
      if (!cancelled) setBackdropReady(true);
    };
    img.src = backdropPreloadOptimized;
    if (img.complete && img.naturalWidth > 0) {
      markMediaUrlLoaded(backdropPreloadOptimized);
      setBackdropReady(true);
    }
    return () => {
      cancelled = true;
    };
  }, [backdropPreloadOptimized]);

  const detailBack = useDetailBack();
  const [hueA, hueB] = useMemo(() => sceneHues(movie?.id || id), [movie?.id, id]);
  const resolvedPosterPath =
    movie?.posterUrl || movie?.backdropUrl || movie?.poster || movie?.backdrop || "";
  const posterOptimized = useMemo(
    () =>
      resolvedPosterPath
        ? CdnImageAdapter.getUrl(resolvedPosterPath, pickImageWidth("card", { hdThumbs }))
        : null,
    [resolvedPosterPath, hdThumbs],
  );
  const [posterLoaded, setPosterLoaded] = useState(() =>
    hasLoadedMediaUrl(posterOptimized),
  );
  const posterSrcSet = useMemo(
    () =>
      resolvedPosterPath && hdThumbs !== false
        ? CdnImageAdapter.getSrcSet(resolvedPosterPath, "card")
        : undefined,
    [resolvedPosterPath, hdThumbs],
  );

  useLayoutEffect(() => {
    setPosterError(false);
    const img = posterImgRef.current;
    if (posterOptimized && (hasLoadedMediaUrl(posterOptimized) || (img?.complete && img?.naturalWidth > 0))) {
      markMediaUrlLoaded(posterOptimized);
      setPosterLoaded(true);
    } else {
      setPosterLoaded(false);
    }
  }, [posterOptimized, movie?.id]);

  if (loading) {
    return (
      <MovieDetailsSkeleton
        titleId={id}
        isTv={passedMovie ? Boolean(passedMovie.isSeries || passedMovie.type === "tv") : undefined}
        hasBackdrop={Boolean(passedMovie?.backdropUrl || passedMovie?.posterUrl)}
        posterUrl={passedMovie?.posterUrl || passedMovie?.poster || null}
        backdropUrl={passedMovie?.backdropUrl || null}
        title={passedMovie?.title || ""}
      />
    );
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
                  color: "var(--white)",
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
                  color: "var(--btn-ink, var(--black))",
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
  const primaryTrailerKey = movie.trailerUrl || movie.trailer || movie.videos?.[0]?.key || null;
  const movieOverview = movie.description || movie.longDescription || movie.overview || "";

  return (
    <div ref={pageRef} className="min-h-screen bg-[#050505] text-white page-fade-bottom">
      <SEO
        title={movie.title}
        description={movie.description}
        image={movie.backdropUrl || movie.posterUrl}
        type="video.movie"
      />

      <AmbientBackground src={movie.backdropUrl || movie.posterUrl} alt="" />

      <article className="dp" style={{ "--a": hueA, "--b": hueB }}>
        <div
          className="bdp"
          data-art-ready={backdropReady && backdropOptimized ? "true" : undefined}
          style={{ "--a": hueA, "--b": hueB }}
          aria-hidden="true"
        >
          {backdropOptimized && (
            <div
              className="bdp-art"
              style={{ backgroundImage: `url(${backdropOptimized})` }}
            />
          )}
        </div>

        <motion.button
          type="button"
          className="lk"
          whileTap={{ scale: PRESS_SCALE.CONTROL }}
          onClick={detailBack}
          aria-label="Go back"
        >
          <ChevronLeft size={16} strokeWidth={2.2} aria-hidden="true" />
          <span>Back</span>
        </motion.button>

        {/* ── 2.0 Detail Header (.dh: 2:3 poster + .dtx meta & actions) ───── */}
        <header className="dh">
          <div
            className="po"
            data-detail-source={movie.id}
            data-initial={(movie.title || "?").trim().charAt(0).toUpperCase()}
            data-loaded={posterLoaded && !posterError ? "true" : undefined}
            data-failed={!posterOptimized || posterError ? "true" : undefined}
            style={{ "--a": hueA, "--b": hueB }}
          >
            {posterOptimized && !posterError ? (
              <img
                ref={posterImgRef}
                className="po-img"
                src={posterOptimized}
                srcSet={posterSrcSet}
                sizes="(max-width: 720px) 50vw, 250px"
                alt={movie.title}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                onLoad={() => {
                  markMediaUrlLoaded(posterOptimized);
                  setPosterLoaded(true);
                }}
                onError={() => {
                  setPosterError(true);
                  setPosterLoaded(false);
                }}
              />
            ) : null}
            <em aria-hidden="true">{isTvContent ? "Series" : "Movie"}</em>
            <b data-title={movie.title} aria-hidden="true" />
          </div>

          <div className="dtx">
            <div className="chips">
              {movie.releaseDate && (
                <span className="chip">{releaseYear(movie)}</span>
              )}
              {movie.genres?.slice(0, 3).map((genre) => (
                <span key={genre} className="chip">{genre}</span>
              ))}
              {movie.certification && (
                <span className="chip">{movie.certification}</span>
              )}
              {runtimeLabel && (
                <span className="chip">{runtimeLabel}</span>
              )}
              {seriesIsAiring && (
                <span
                  className="chip chip--accent"
                  aria-label={
                    airingSeasonNumber > 1
                      ? `Season ${airingSeasonNumber} Airing`
                      : "Airing"
                  }
                >
                  {airingSeasonNumber > 1
                    ? `Season ${airingSeasonNumber} Airing`
                    : "Airing"}
                </span>
              )}
              {seriesIsAiring && movie?.nextEpisode?.releaseDate && (
                <span className="chip">
                  New episode {getTMDBWeekday(movie.nextEpisode.releaseDate, undefined, releasePlatform)} ·{" "}
                  {formatTMDBDate(movie.nextEpisode.releaseDate, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  }, undefined, releasePlatform)}
                </span>
              )}
              {voteSplit && (
                <span
                  className="chip"
                  aria-label={`${voteSplit.up}% up ${voteSplit.down}% down split`}
                >
                  <ArrowUp size={13} className="text-emerald-400" aria-hidden="true" />
                  <span className="tabular-nums text-emerald-400">{voteSplit.up}%</span>
                  <ArrowDown size={13} className="text-red-400/90" aria-hidden="true" />
                  <span className="tabular-nums text-red-400/90">{voteSplit.down}%</span>
                </span>
              )}
            </div>

            <h1 className="dt">
              {titleLogoUrl ? (
                <img
                  className="dt-logo"
                  src={titleLogoUrl}
                  alt={movie.title}
                  loading="eager"
                  fetchPriority="high"
                  decoding="async"
                  onError={onTitleLogoError}
                />
              ) : (
                movie.title
              )}
            </h1>

            {movie.tagline && <p className="tag">{movie.tagline}</p>}

            {hasResume && resumePct > 0 && (
              <div className="detail-resume-bar">
                <div className="detail-resume-bar__track">
                  <div className="detail-resume-bar__fill" style={{ width: `${resumePct}%` }} />
                </div>
                <span className="detail-resume-bar__label">{resumePct}% Watched</span>
              </div>
            )}

            <div className="btns details-hero__actions">
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
                    startPlaybackTimestamp(continueEntryForMovie, {
                      isTv: isTvContent,
                      season: selectedSeason,
                      episode: episodeToPlay,
                    }),
                  );
                }}
                className={`btn p details-hero__play${unreleased ? " opacity-45 cursor-not-allowed" : ""}`}
              >
                <Play size={18} fill="currentColor" stroke="none" aria-hidden="true" />
                <span>{hasResume ? "Resume" : "Play"}</span>
              </button>

              <div className="details-hero__quick-actions">
                <div style={{ position: "relative" }} className="inline-flex">
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
                    className={`btn g${isInList(movie.id) ? " is-active" : ""}`}
                    aria-label={isInList(movie.id) ? "Remove from My List" : "Add to My List"}
                    title={isInList(movie.id) ? "Remove from My List" : "Add to My List"}
                  >
                    {isInList(movie.id) ? <Check size={18} /> : <Plus size={18} />}
                    <span>{isInList(movie.id) ? "In My List" : "My List"}</span>
                  </button>
                </div>

                {primaryTrailerKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setPlayMode("trailer");
                      setPlayingTrailerKey(primaryTrailerKey);
                      setPlayingEpisode(null);
                      setIsPlaying(true);
                    }}
                    className="btn g"
                  >
                    <Film size={17} aria-hidden="true" />
                    <span>Trailer</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleMarkWatched(movie)}
                  className={`btn g btn--icon${isMarkedWatched(movie.id) ? " is-active" : ""}`}
                  aria-label={isMarkedWatched(movie.id) ? "Mark as not watched" : "Mark as watched"}
                  title={isMarkedWatched(movie.id) ? "Mark as not watched" : "Mark as watched"}
                >
                  {isMarkedWatched(movie.id) ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              <div className="details-hero__ratings">
                <RatingsCluster movie={movie} size="md" itemClassName="title-rating-badge" />
              </div>
            </div>

            {unreleased && (
              <button
                type="button"
                onClick={() => setUnreleasedModalOpen(true)}
                aria-haspopup="dialog"
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] backdrop-blur-md px-3.5 py-1.5 transition-colors hover:bg-white/[0.11] cursor-pointer"
              >
                <Clock className="w-3.5 h-3.5 text-white/45" aria-hidden="true" />
                <span className="text-[13px] font-semibold text-white">Not released yet</span>
                <span className="text-white/25">·</span>
                <span className="text-[13px] text-white/55">
                  Available {formatTMDBDate(movie.releaseDate, { month: "short", day: "numeric", year: "numeric" }, undefined, releasePlatform)}
                </span>
              </button>
            )}

            <ProductionCompaniesBlock variant="brands" companies={movie.productionCompanies} />
          </div>
        </header>

        {/* ── 2.0 Body Grid (.dg: Overview + Cast | Facts Glass + Trailers) ─ */}
        <div className="dg">
          <div className="dg-main">
            {movieOverview && (
              <section aria-label="Overview">
                <h2>Overview</h2>
                <p className={`ov-text${spoilerFreeMode ? " italic opacity-60" : ""}${showFullDescription ? "" : " line-clamp-4"}`}>
                  {spoilerFreeMode ? "Synopsis hidden (Spoiler-Free Mode)" : movieOverview}
                </p>
                {movieOverview.length > 220 && (
                  <button
                    type="button"
                    onClick={() => setShowFullDescription((v) => !v)}
                    className="ov-more"
                  >
                    {showFullDescription ? "Show less" : "Show more"}
                  </button>
                )}
              </section>
            )}

            {movie.cast && movie.cast.length > 0 && (
              <div className="cast">
                <ErrorBoundary>
                  <CastRail cast={movie.cast} />
                </ErrorBoundary>
              </div>
            )}
          </div>

          {(infoRows.length > 0 || movie.director) && (
            <aside className="dg-side">
              <dl className="facts glass" aria-label="Details">
                {infoRows.map((row) => (
                  <div key={row.label} className="fact-row">
                    <dt>{row.label}</dt>
                    <dd className={row.uppercase ? "is-uppercase" : undefined}>
                      {row.value}
                      {row.extra && <span className="fact-extra">{row.extra}</span>}
                    </dd>
                  </div>
                ))}
                {movie.director && (
                  <div className="fact-row">
                    <dt>Director</dt>
                    <dd>
                      {movie.directorId ? (
                        <Link
                          to={`/person/${movie.directorId}`}
                          className="text-white/90 hover:text-white underline decoration-white/30 underline-offset-4"
                        >
                          {movie.director}
                        </Link>
                      ) : (
                        movie.director
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </aside>
          )}
        </div>

        {/* ── Episodes ─────────────────────────────────────────────────────── */}
        {isTvContent && hasSeriesEpisodes && (
          <section className="eps-s" aria-label="Episodes">
            <div className="eh">
              <div className="eh-head">
                <h2>Episodes</h2>
                {isAiring && releasedEpisodes < totalEpisodes ? (
                  <span className="eh-count">
                    ({releasedEpisodes} of {totalEpisodes} released)
                  </span>
                ) : episodes.length > 0 ? (
                  <span className="eh-count">({episodes.length})</span>
                ) : null}
              </div>

              <div className="eh-actions">
                <button
                  type="button"
                  onClick={() => setRatingsOpen(true)}
                  aria-label="View episode ratings"
                  title="Ratings"
                  className="ep-ctl-btn"
                >
                  <Grid3x3 size={15} />
                  <span>Ratings</span>
                </button>

                <div className="relative" ref={sortRef}>
                  <button
                    type="button"
                    onClick={() => setSortOpen((o) => !o)}
                    aria-haspopup="menu"
                    aria-expanded={sortOpen}
                    className="ep-ctl-btn"
                  >
                    <ArrowUpDown size={15} />
                    <span>{sortNewest ? "Newest" : "Oldest"}</span>
                  </button>
                  {sortOpen && (
                    <div
                      role="menu"
                      aria-label="Sort episodes"
                      className="absolute right-0 mt-2 z-50 w-44 rounded-2xl border border-white/15 bg-[#121216]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
                    >
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={!sortNewest}
                        onClick={() => { setSortNewest(false); setSortOpen(false); }}
                        className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 flex items-center justify-between"
                      >
                        Oldest {!sortNewest && <Check size={14} />}
                      </button>
                      <button
                        type="button"
                        role="menuitemradio"
                        aria-checked={sortNewest}
                        onClick={() => { setSortNewest(true); setSortOpen(false); }}
                        className="w-full px-4 py-3 text-left text-sm text-white hover:bg-white/10 flex items-center justify-between"
                      >
                        Newest {sortNewest && <Check size={14} />}
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={markSeasonWatched}
                  className="ep-ctl-btn"
                >
                  <Eye size={15} />
                  <span>Mark watched</span>
                </button>

                {normalizedSeasonCount > 8 && (
                  <SeasonDropdown
                    seasons={availableSeasons}
                    selectedSeason={selectedSeason}
                    airingSeasonNumber={airingSeasonNumber}
                    onSelect={(s) => { setSelectedSeason(s); }}
                  />
                )}

                <div
                  className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] border border-white/15 p-0.5"
                  role="radiogroup"
                  aria-label="Episode layout"
                >
                  <motion.button
                    type="button"
                    whileTap={{ scale: PRESS_SCALE.ICON }}
                    onClick={() => setEpisodeLayout("list")}
                    aria-pressed={episodeLayout === "list"}
                    className={`h-7 w-7 inline-flex items-center justify-center rounded-full transition-colors ${episodeLayout === "list" ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}
                    title="List view"
                  >
                    <List size={14} />
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: PRESS_SCALE.ICON }}
                    onClick={() => setEpisodeLayout("carousel")}
                    aria-pressed={episodeLayout === "carousel"}
                    className={`h-7 w-7 inline-flex items-center justify-center rounded-full transition-colors ${episodeLayout === "carousel" ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}
                    title="Carousel view"
                  >
                    <GalleryHorizontal size={14} />
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: PRESS_SCALE.ICON }}
                    onClick={() => setEpisodeLayout("grid")}
                    aria-pressed={episodeLayout === "grid"}
                    className={`h-7 w-7 inline-flex items-center justify-center rounded-full transition-colors ${episodeLayout === "grid" ? "bg-white/20 text-white" : "text-white/60 hover:text-white"}`}
                    title="Grid view"
                  >
                    <LayoutGrid size={14} />
                  </motion.button>
                </div>
              </div>
            </div>

            {normalizedSeasonCount > 0 && (
              <div className="stabs" role="tablist" aria-label="Seasons">
                {availableSeasons.map((season) => {
                  const seasonNumber = season.seasonNumber;
                  const active = seasonNumber === selectedSeason;
                  return (
                    <button
                      key={seasonNumber}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      className={active ? "is-active" : undefined}
                      onClick={() => setSelectedSeason(seasonNumber)}
                    >
                      <span>Season {seasonNumber}</span>
                      {seasonNumber === airingSeasonNumber && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: active ? "#16a34a" : "var(--accent-primary, #95ff50)",
                            display: "inline-block",
                          }}
                          aria-label="Currently airing"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

          <div className="relative group/episodes">
          <AnimatePresence mode="wait">
          <motion.div
            ref={episodeLayout === "carousel" ? epRailRef : undefined}
            key={`season-${selectedSeason}-${episodesFetching}-${episodeLayout}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: DURATION.MED, ease: EASE_OUT }}
            style={
              episodeLayout === "carousel"
                ? {
                    display: "flex",
                    flexDirection: "row",
                    gap: "1.25rem",
                    overflowX: "auto",
                    scrollSnapType: "x mandatory",
                    padding: "0.75rem 0.25rem 2rem",
                  }
                : episodeLayout === "grid"
                  ? {
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))",
                      gap: "1rem",
                    }
                  : undefined
            }
            className={
              episodeLayout === "carousel"
                ? "episodes-rail-mask scrollbar-hide"
                : episodeLayout === "grid"
                  ? "episode-grid hide-scrollbar"
                  : "eps"
            }
          >
            {episodesFailed ? (
              <div style={{ gridColumn: episodeLayout === "grid" ? "1/-1" : undefined }}>
                <EmptyState
                  icon="error"
                  title="Couldn't load episodes"
                  description="The episode list failed to load. This may be a temporary problem."
                  actions={
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: PRESS_SCALE.CONTROL }}
                      onClick={() => refetchEpisodes()}
                      className="btn g"
                    >
                      <RotateCcw size={14} /> Try Again
                    </motion.button>
                  }
                />
              </div>
            ) : episodesFetching ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="ep">
                  <div className="sk et" />
                  <div className="eb">
                    <div className="sk h-4 w-48 mb-2" />
                    <div className="sk h-3 w-full mb-1.5" />
                    <div className="sk h-3 w-2/3" />
                  </div>
                </div>
              ))
            ) : episodes.length === 0 ? (
              <div style={{ gridColumn: episodeLayout === "grid" ? "1/-1" : undefined }}>
                <EmptyState
                  icon="tv"
                  title={`No episodes found for Season ${selectedSeason}.`}
                  description={
                    normalizedSeasonCount > 1
                      ? `This show has ${normalizedSeasonCount} season${normalizedSeasonCount > 1 ? "s" : ""}. Try selecting a different season.`
                      : "Episode data may not be available yet."
                  }
                  actions={
                    normalizedSeasonCount > 1 && (
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: PRESS_SCALE.CONTROL }}
                        onClick={() => {
                          const currentIndex = availableSeasonNumbers.indexOf(selectedSeason);
                          const nextIndex = currentIndex >= 0
                            ? (currentIndex + 1) % availableSeasonNumbers.length
                            : 0;
                          setSelectedSeason(availableSeasonNumbers[nextIndex]);
                        }}
                        className="btn g"
                      >
                        <RotateCcw size={14} /> Try Another Season
                      </motion.button>
                    )
                  }
                />
              </div>
            ) : (() => {
              const isCarouselLayout = episodeLayout === "carousel";
              const isListLayout = episodeLayout === "list";
              const limit = isListLayout
                ? (episodesExpanded ? episodesForLayout.length : EP_LIMIT)
                : isCarouselLayout
                  ? episodesForLayout.length
                  : visibleEpisodeCount;
              const visibleEps = episodesForLayout.slice(0, limit);
              const hasMoreList = isListLayout && episodesForLayout.length > EP_LIMIT;
              const hasMoreGrid = !isListLayout && !isCarouselLayout && episodesForLayout.length > visibleEpisodeCount;
              const isExpandedGrid = !isListLayout && !isCarouselLayout && visibleEpisodeCount > EPISODES_CHUNK_SIZE;

              return (
                <>
                  {visibleEps.map((ep, idx) => {
                    const isEpPlaying = isPlaying && playingEpisode === ep.episodeNumber && playMode !== "trailer";
                    const isCard = !isListLayout;
                    const isWatched = isEpisodeWatched(ep);
                    const isLiveWatched = Number(continueEntryForMovie?.savedSeason) === Number(selectedSeason)
                      && continueEntryForMovie?.savedEpisode === ep.episodeNumber
                      && (continueEntryForMovie?.timestamp || 0) > 0;
                    const watchedTs = isLiveWatched ? (continueEntryForMovie?.timestamp || 0) : 0;
                    const isAired = isEpAired(ep);
                    const playable = isAired;
                    const epThumb = ep.thumbnailUrl || ep.posterUrl || ep.backdropUrl || movie.backdropUrl || movie.posterUrl || movie.backdrop || movie.poster || movie.thumbnailUrl || null;
                    const thumbLoadPriority = idx < 6 ? "high" : undefined;
                    const thumbLoading = idx < 6 ? "eager" : "lazy";
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
                      return (
                        <motion.div
                          key={ep.id || idx}
                          initial={{ opacity: 0, scale: 0.96, y: 12 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96, y: -8 }}
                          transition={{ duration: DURATION.MED, delay: Math.min(idx * 0.035, 0.25), ease: EASE_OUT }}
                          whileHover={{ y: -3 }}
                          whileTap={playable ? { scale: PRESS_SCALE.CONTROL } : undefined}
                          role={playable ? "button" : undefined}
                          tabIndex={playable ? 0 : undefined}
                          aria-disabled={playable ? undefined : true}
                          aria-label={playable ? `Play ${ep.title}` : undefined}
                          onClick={playEpisode}
                          onKeyDown={playEpKeyboard}
                          className="group flex flex-col gap-3 shrink-0 cursor-pointer"
                          style={{
                            opacity: !isAired ? 0.45 : 1,
                            scrollSnapAlign: isCarouselLayout ? "start" : undefined,
                            ...(isCarouselLayout ? { flex: "0 0 clamp(220px, 62vw, 300px)" } : {}),
                          }}
                        >
                          <div className="relative aspect-video w-full rounded-xl overflow-hidden bg-black/30 shrink-0 border border-white/10 transition-[transform,border-color] duration-300 group-hover:border-white/35">
                            {epThumb ? (
                              <img
                                src={epThumb}
                                alt={ep.title}
                                loading={thumbLoading}
                                fetchPriority={thumbLoadPriority}
                                decoding="async"
                                className="w-full h-full object-cover"
                                style={{ filter: !isAired ? "grayscale(0.85) brightness(0.55)" : undefined }}
                              />
                            ) : (
                              <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-white/45 font-mono text-xl font-bold">
                                {episodeNumberLabel(ep.episodeNumber)}
                              </div>
                            )}
                            <span className="en">{episodeNumberLabel(ep.episodeNumber)}</span>
                            {isAired && (
                              <span className="epl" aria-hidden="true">
                                <Play size={16} fill="currentColor" stroke="none" />
                              </span>
                            )}
                            <button
                              type="button"
                              aria-pressed={isWatched}
                              aria-label={isWatched ? `Mark ${ep.title} as not watched` : `Mark ${ep.title} as watched`}
                              onClick={(e) => { e.stopPropagation(); toggleEpisodeWatched(ep); }}
                              className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-white hover:bg-black/75 flex items-center justify-center"
                            >
                              {isWatched ? <Check size={14} /> : <Eye size={14} />}
                            </button>
                            {isWatched && (
                              <div className="et-progress">
                                <div className="et-progress__fill" style={{ width: `${pctWatched}%` }} />
                              </div>
                            )}
                          </div>
                          <div className="px-0.5">
                            <h3 className="eb-title line-clamp-1">{ep.title}</h3>
                            <p className="eb-desc">{spoilerFreeMode ? "Episode details hidden (Spoiler-Free Mode)" : ep.description}</p>
                          </div>
                        </motion.div>
                      );
                    }

                    return (
                      <div
                        key={ep.id || idx}
                        className={`ep${isEpPlaying ? " is-playing" : ""}${episodesExpanded && idx >= EP_LIMIT ? " ep--entering" : ""}`}
                        style={{ "--ep-i": Math.max(0, idx - EP_LIMIT), opacity: !isAired ? 0.48 : 1 }}
                        role={playable ? "button" : undefined}
                        tabIndex={playable ? 0 : undefined}
                        aria-disabled={playable ? undefined : true}
                        aria-label={playable ? `Play ${ep.title}` : undefined}
                        onClick={playEpisode}
                        onKeyDown={playEpKeyboard}
                      >
                        <div className="et">
                          {epThumb ? (
                            <img
                              src={CdnImageAdapter.getUrl(epThumb, pickImageWidth("episode", { hdThumbs }))}
                              alt={ep.title}
                              loading={thumbLoading}
                              fetchPriority={thumbLoadPriority}
                              decoding="async"
                              style={{ filter: !isAired ? "grayscale(0.85) brightness(0.55)" : undefined }}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/50 font-mono font-bold text-lg">
                              {episodeNumberLabel(ep.episodeNumber)}
                            </div>
                          )}
                          <span className="en">{episodeNumberLabel(ep.episodeNumber)}</span>
                          {isAired ? (
                            <span className="epl" aria-hidden="true">
                              <Play size={16} fill="currentColor" stroke="none" />
                            </span>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700/90 px-2.5 py-0.5 text-[11px] font-medium text-white">
                                <Calendar size={11} aria-hidden="true" />
                                {formatAirsDate(ep.airDate)}
                              </span>
                            </div>
                          )}
                          {isWatched && (
                            <div className="et-progress">
                              <div className="et-progress__fill" style={{ width: `${pctWatched}%` }} />
                            </div>
                          )}
                        </div>

                        <div className="eb">
                          <div className="eb-head">
                            <h3 className="eb-title">{ep.title}</h3>
                            {isEpPlaying && (
                              <span className="chip chip--accent" style={{ padding: "2px 8px", fontSize: 11 }}>
                                Playing
                              </span>
                            )}
                          </div>
                          <div className="eb-meta">
                            {ep.duration && <span>{ep.duration}</span>}
                            {ep.airDate && (
                              <span>
                                {formatTMDBDate(ep.airDate, { month: "short", day: "numeric", year: "numeric" }, undefined, releasePlatform)}
                              </span>
                            )}
                            {isWatched && (
                              <span>{watchedTs > 0 ? `${formatTime(watchedTs)} watched` : "Watched"}</span>
                            )}
                          </div>
                          <p className={`eb-desc${spoilerFreeMode ? " italic opacity-60" : ""}`}>
                            {spoilerFreeMode ? "Episode details hidden (Spoiler-Free Mode)" : ep.description}
                          </p>
                        </div>

                        <div className="ed">
                          <button
                            type="button"
                            className={`ep-watch-btn${isWatched ? " is-watched" : ""}`}
                            aria-pressed={isWatched}
                            aria-label={isWatched ? `Mark ${ep.title} as not watched` : `Mark ${ep.title} as watched`}
                            title={isWatched ? "Mark as not watched" : "Mark as watched"}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleEpisodeWatched(ep);
                            }}
                          >
                            {isWatched ? <Check size={15} strokeWidth={2.4} /> : <Eye size={15} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {hasMoreList && (
                    <div>
                      <motion.button
                        type="button"
                        whileTap={{ scale: PRESS_SCALE.CONTROL }}
                        className="eps-more"
                        onClick={() => setEpisodesExpanded((v) => !v)}
                      >
                        <span>
                          {episodesExpanded
                            ? "Show less"
                            : `Show ${episodesForLayout.length - EP_LIMIT} more`}
                        </span>
                        <ChevronDownIcon
                          size={15}
                          style={{
                            transform: episodesExpanded ? "rotate(180deg)" : "none",
                            transition: "transform var(--dur-tap) var(--ease)",
                          }}
                        />
                      </motion.button>
                    </div>
                  )}

                  {hasMoreGrid && (
                    <div className="col-span-full flex items-center justify-center gap-3 pt-4 flex-wrap">
                      <motion.button
                        type="button"
                        whileTap={{ scale: PRESS_SCALE.CONTROL }}
                        onClick={() => setVisibleEpisodeCount((prev) => Math.min(episodesForLayout.length, prev + EPISODES_CHUNK_SIZE))}
                        className="eps-more"
                      >
                        {`Load more (${episodesForLayout.length - visibleEpisodeCount} remaining)`}
                        <ChevronDownIcon size={14} />
                      </motion.button>
                    </div>
                  )}

                  {!hasMoreGrid && isExpandedGrid && (
                    <div className="col-span-full flex justify-center pt-4">
                      <motion.button
                        type="button"
                        whileTap={{ scale: PRESS_SCALE.CONTROL }}
                        onClick={() => setVisibleEpisodeCount(EPISODES_CHUNK_SIZE)}
                        className="eps-more"
                      >
                        Show less
                      </motion.button>
                    </div>
                  )}
                </>
              );
            })()}
          </motion.div>
          </AnimatePresence>

          {episodeLayout === "carousel" && episodes.length > 0 && (
            <>
              {epCanLeft && (
                <RailArrow dir="left" onClick={() => scrollEpRail("left")} revealOnHover hoverClass="group-hover/episodes:opacity-100" label="Episodes" />
              )}
              {epCanRight && (
                <RailArrow dir="right" onClick={() => scrollEpRail("right")} revealOnHover hoverClass="group-hover/episodes:opacity-100" label="Episodes" />
              )}
            </>
          )}
          </div>
          </section>
        )}

        {/* ── 2.0 Below-fold Rails (.dp-shelves) ───────────────────────────── */}
        <div className="dp-shelves">
          {collectionParts.length > 1 && (
            <section className="dp-shelf" aria-label={`Part of ${collectionName}`}>
              <div className="dp-shelf__head">
                <h2>Part of {collectionName}</h2>
                <span className="eh-count">
                  {collectionParts.length} titles · release order
                </span>
              </div>
              <ErrorBoundary>
                <DetailTitleRail
                  titles={collectionParts}
                  currentId={movie.id}
                  badgeLabel="You’re here"
                  ariaLabel={`Titles in ${collectionName}`}
                  railKey="collection"
                />
              </ErrorBoundary>
            </section>
          )}

          {studioTitles.length > 0 && company && (
            <section className="dp-shelf" aria-label={`More from ${company.name}`}>
              <div className="dp-shelf__head">
                {company.logoUrl ? (
                  <img
                    className="detail-rail__brand"
                    src={company.logoUrl}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    decoding="async"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : null}
                <h2>More from {company.name}</h2>
              </div>
              <ErrorBoundary>
                <DetailTitleRail
                  titles={studioTitles}
                  currentId={movie.id}
                  badgeLabel="You’re here"
                  ariaLabel={`More from ${company.name}`}
                  railKey="studio"
                />
              </ErrorBoundary>
            </section>
          )}

          {similar && similar.length > 0 && (
            <section className="dp-shelf" aria-label="You Might Also Like">
              <div className="dp-shelf__head">
                <h2>You Might Also Like</h2>
              </div>
              <ErrorBoundary>
                <div className="detail-rail">
                  {similar.slice(0, visibleCount).map((sim, idx) => (
                    <div key={`${sim.id}-${idx}`} className="detail-rail__item">
                      <MovieCard
                        movie={sim}
                        detailToken={`similar:${idx}:${sim.id}`}
                      />
                    </div>
                  ))}
                </div>
                <div ref={similarEndRef} className="h-px" aria-hidden="true" />
              </ErrorBoundary>
            </section>
          )}

          {movie.director && similar.some((s) => s.director && s.director === movie.director) && (
            <section className="dp-shelf relative" aria-label={`More from ${movie.director}`}>
              <div className="dp-shelf__head">
                <h2>More from {movie.director}</h2>
              </div>
              <div className="relative">
                {canScrollLeft && (
                  <RailArrow
                    dir="left"
                    onClick={() => scrollDirector("left")}
                    label={movie.director ? `More from ${movie.director}` : "More titles"}
                  />
                )}
                {canScrollRight && (
                  <RailArrow
                    dir="right"
                    onClick={() => scrollDirector("right")}
                    label={movie.director ? `More from ${movie.director}` : "More titles"}
                  />
                )}
                <ErrorBoundary>
                  <div className="detail-rail" ref={directorRailRef}>
                    {similar
                      .slice(0, 8)
                      .filter((s) => s.director && s.director === movie.director)
                      .slice(0, 5)
                      .map((sim, idx) => (
                        <div key={`dir-${sim.id}-${idx}`} className="detail-rail__item">
                          <MovieCard
                            movie={{ ...sim, source: sim.source || resolvedPlatform }}
                            detailToken={`director:${idx}:${sim.id}`}
                          />
                        </div>
                      ))}
                  </div>
                </ErrorBoundary>
              </div>
            </section>
          )}
        </div>

        {(movie.matchScore || (isTvContent && normalizedSeasonCount > 0)) && (
          <div className="mt-10 pt-5 border-t border-white/[0.08] flex flex-wrap items-center justify-center gap-6">
            {movie.matchScore && (
              <div className="flex items-center gap-2 text-sm text-white/65">
                <ThumbsUp size={15} className="text-emerald-400" />
                <span>
                  <strong className="text-emerald-400">{movie.matchScore}%</strong> match
                </span>
              </div>
            )}
            {isTvContent && normalizedSeasonCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-white/65">
                <Tv size={15} className="text-sky-400" />
                <span>
                  <strong className="text-sky-400">{normalizedSeasonCount}</strong> season{normalizedSeasonCount > 1 ? "s" : ""}
                </span>
              </div>
            )}
          </div>
        )}
      </article>
{createPortal(
      <AnimatePresence>
        {isPlaying && (
          <motion.div
            key="player-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: DURATION.MED, ease: EASE_OUT }}
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
                transition={{ duration: DURATION.SLOW, ease: EASE_OUT }}
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
                bottom rail), matching the Streamly web player. */}
            {playMode === "trailer" && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: DURATION.MED, ease: EASE_OUT }}
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
                      color: "var(--white)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "6px",
                      borderRadius: "4px",
                      flexShrink: 0,
                    }}
                    whileHover={reduceMotion ? undefined : { background: "rgba(255,255,255,0.1)" }}
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
                      color: "var(--white)",
                    }}
                  >
                    {movie.title}{" "}
                    <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
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
                    whileHover={reduceMotion ? undefined : {
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
                      className="sk"
                      aria-hidden="true"
                      style={{
                        position: "absolute",
                        inset: 0,
                        margin: "auto",
                        width: "100%",
                        height: "min(calc(100vw * 9/16), calc(100vh - 120px))",
                        maxWidth: "min(1400px, calc((100vh - 120px) * 16/9))",
                        borderRadius: "20px",
                      }}
                    />
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
                      transition: "opacity var(--duration-fast) var(--ease-out)",
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
                          background: "var(--black)",
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
                          /* v4 episodes pane: season picker + per-episode
                             watch state come from the title's continue-watching
                             entry (the watched set and the one saved resume
                             point the details page already reads). */
                          seasonsAvailable={availableSeasonNumbers}
                          onSelectSeason={(n) => setSelectedSeason(n)}
                          watchedEpisodes={continueEntryForMovie?.watchedEpisodes || null}
                          resumePoint={
                            continueEntryForMovie &&
                            continueEntryForMovie.savedSeason != null &&
                            continueEntryForMovie.savedEpisode != null
                              ? {
                                  season: continueEntryForMovie.savedSeason,
                                  episode: continueEntryForMovie.savedEpisode,
                                  timestamp: Number(continueEntryForMovie.timestamp) || 0,
                                }
                              : null
                          }
                          canGoPrev={canGoPrev}
                          canGoNext={canGoNext}
                          onGoPrev={goToPrevEpisode}
                          onGoNext={goToNextEpisode}
                          onClose={() => setIsPlaying(false)}
                          playerMode={playerMode}
                          onToggleMode={setPlayerMode}
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
                        <div style={{ width: "100%", height: "100%", background: "var(--black)" }} />
                      )}
                    </div>
                  </Suspense>
                </ErrorBoundary>
              )}
            </motion.div>
          </motion.div>
        )}
        {unreleasedModalOpen && (
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
          </MotionFade>
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
