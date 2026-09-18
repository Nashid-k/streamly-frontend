import SEO from "../components/SEO";
import MovieDetailsSkeleton from "../components/MovieDetailsSkeleton";
import CastRail from "../components/CastRail";
import RailArrow from "../components/RailArrow";
import DownloadModal from "../components/DownloadModal";
import RatingsTable from "../components/RatingsTable";
import useRailArrows from "../hooks/useRailArrows";
import { useQuery } from "@tanstack/react-query";
import { movieService, classifyTrailer } from "../api/movieService";
import Loader from "../components/Loader";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { createPortal } from "react-dom";
import { useState, useEffect, useRef, useMemo, useLayoutEffect, lazy, Suspense } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Play,
  Star,
  Plus,
  Check,
  X,
  MonitorPlay,
  ChevronDown,
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
  Download,
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
import { useAppAuth } from "../context/auth";
import { useToast } from "../components/Toast.jsx";
import MovieCard from "../components/MovieCard";
import CollectionPickerDialog from "../components/CollectionPickerDialog";

import { buildMovieAddedNotification } from "../utils/notificationEngine";
import { formatTMDBDate, getTMDBWeekday } from "../utils/timezone";
import { formatRuntimeLabel, isUnreleased, voteSplitPct } from "../utils/titleDetails";
import { buildEpisodeOrder, episodeNumberLabel, isEpAired } from "../utils/titleDetails";
import { getPlatformName } from "../utils/platforms";
import { logEmptyData, logError, reportQueryError } from "../utils/debugLogger";
// The 5.5k-line player used to ship inside TitleDetailsPage (the app's largest
// chunk at ~223 KB). Split it so only the /watch route loads it, and so it can
// be cached independently after first visit.
const CustomVideoPlayer = lazy(() => import("../components/CustomVideoPlayer"));
import ErrorBoundary from "../components/ErrorBoundary";

import { progressPct } from "../utils/resumeProgress";
import { usePreferences } from "../context/preferences";
const EMPTY_ARRAY = [];

import { VideoSourceAdapter } from "../api/videoSourceAdapter";

// Compact "Airs Thu, Sep 9"-style date for upcoming episode chips.
const formatAirsDate = (dateStr) => {
  if (!dateStr) return "Upcoming";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

// ─── SeasonDropdown — custom styled dropdown (no native <select>) ─────────────

function SeasonDropdown({ seasons, selectedSeason, airingSeasonNumber, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const seasonOptions = seasons.length > 0
    ? seasons
    : [{ seasonNumber: selectedSeason, name: `Season ${selectedSeason}` }];

  // Close on outside click / tap
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", zIndex: 20 }}>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ borderColor: "rgba(255,255,255,0.35)" }}
        whileTap={{ scale: 0.97 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#fff",
          padding: "0 16px",
          height: "40px",
          borderRadius: "9999px",
          fontSize: "0.875rem",
          fontWeight: 600,
          cursor: "pointer",
          backdropFilter: "blur(12px)",
          transition: "background 0.2s, border-color 0.2s",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "var(--accent-gradient)",
              flexShrink: 0,
            }}
          />
          Season {selectedSeason}
          {airingSeasonNumber === selectedSeason && (
            <span
              aria-label="Currently airing"
              title="Currently airing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 10px",
                borderRadius: "7px 7px 0 0",
                background: "#3c8217",
                color: "#fff",
                fontSize: "11px",
                fontWeight: 500,
                lineHeight: 1.45,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Airing
            </span>
          )}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          style={{ display: "flex", color: "#a1a1aa" }}
        >
          <ChevronDown size={16} />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: "160px",
              maxHeight: "260px",
              overflowY: "auto",
              background: "rgba(18,18,22,0.97)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "14px",
              backdropFilter: "blur(24px)",
              boxShadow: "0 20px 48px rgba(0,0,0,0.75)",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.15) transparent",
            }}
          >
            {seasonOptions.map((season, index) => {
                const seasonNumber = season.seasonNumber;
                const isSelected = seasonNumber === selectedSeason;
                const isAiringSeason = seasonNumber === airingSeasonNumber;
                return (
                  <motion.button
                    key={seasonNumber}
                    onClick={() => {
                      onSelect(seasonNumber);
                      setOpen(false);
                    }}
                    whileHover={{ background: "rgba(255,255,255,0.08)" }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "0.65rem 1rem",
                      background: isSelected
                        ? "rgba(var(--accent-primary-rgb), 0.1)"
                        : "transparent",
                      border: "none",
                      color: isSelected ? "var(--accent-primary, #95ff50)" : "#e4e4e7",
                      fontSize: "0.9rem",
                      fontWeight: isSelected ? 700 : 500,
                      cursor: "pointer",
                      textAlign: "left",
                      borderRadius:
                        index === 0
                          ? "14px 14px 0 0"
                          : index === seasonOptions.length - 1
                            ? "0 0 14px 14px"
                            : "0",
                      transition: "background 0.1s",
                    }}
                  >
                    {isSelected && (
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background:
                            "var(--accent-gradient)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    {!isSelected && <span style={{ width: "6px" }} />}
                    <span style={{ flex: 1 }}>Season {seasonNumber}</span>
{isAiringSeason && (
                      <span
                        aria-label="Currently airing"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "2px 10px",
                          borderRadius: "7px 7px 0 0",
                          background: "#3c8217",
                          color: "#fff",
                          fontSize: "11px",
                          fontWeight: 500,
                          lineHeight: 1.45,
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Airing
                      </span>
                    )}
                  </motion.button>
                );
              })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── ServerDropdown — custom styled dropdown for selecting servers ─────────────

function ServerDropdown({ servers, selectedIndex, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", zIndex: 25 }}>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ background: "rgba(255,255,255,0.12)" }}
        whileTap={{ scale: 0.97 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(255,255,255,0.07)",
          border: "none",
          color: "#fff",
          padding: "0.45rem 0.85rem",
          borderRadius: "4px",
          fontSize: "0.83rem",
          fontWeight: 600,
          cursor: "pointer",
          minWidth: "120px",
          justifyContent: "space-between",
          transition: "background 0.2s",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <MonitorPlay size={14} color="#a1a1aa" />
          {servers[selectedIndex]?.name || "Select Server"}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          style={{ display: "flex", color: "#a1a1aa" }}
        >
          <ChevronDown size={14} />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: "180px",
              maxHeight: "260px",
              overflowY: "auto",
              background: "rgba(18,18,20,0.97)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "4px",
              boxShadow: "0 20px 48px rgba(0,0,0,0.75)",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.15) transparent",
              zIndex: 9999,
            }}
          >
            {servers.map((server, i) => {
              const isSelected = i === selectedIndex;
              return (
                <motion.button
                  key={i}
                  onClick={() => {
                    onSelect(i);
                    setOpen(false);
                  }}
                  whileHover={{ background: "rgba(255,255,255,0.06)" }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "0.6rem 1rem",
                    background: isSelected
                      ? "rgba(229,9,20,0.16)"
                      : "transparent",
                    border: "none",
                    color: isSelected ? "#fff" : "#e4e4e7",
                    fontSize: "0.85rem",
                    fontWeight: isSelected ? 700 : 500,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.1s",
                  }}
                >
                  {isSelected && (
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#E50914",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {!isSelected && <span style={{ width: "6px" }} />}
                  {server.name}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProductionCompaniesBlock({ companies }) {
  if (!companies || companies.length === 0) return null;

  const normalized = companies
    .map((c, i) => {
      if (!c) return null;
      if (typeof c === "string") return null;
      const logoPath = c.logoUrl || c.logo_path;
      const fullLogoUrl = logoPath
        ? (logoPath.startsWith("http")
            ? logoPath
            : `https://image.tmdb.org/t/p/w300${logoPath.startsWith("/") ? logoPath : `/${logoPath}`}`)
        : null;
      if (!fullLogoUrl) return null;
      return {
        id: c.id || `pc-${i}`,
        name: c.name || "Production",
        logoUrl: fullLogoUrl,
      };
    })
    .filter(Boolean);

  if (normalized.length === 0) return null;

  // Display up to 6 authentic company logos
  const displayCompanies = normalized.slice(0, 6);

  return (
    <div className="mt-4 grid gap-2 grid-cols-2">
      {displayCompanies.map((company) => (
        <div
          key={company.id}
          title={company.name}
          className="flex items-center justify-center h-10 px-2"
        >
          <img
            loading="lazy"
            src={company.logoUrl}
            alt={company.name}
            className="w-auto max-h-7 max-w-full object-contain brightness-0 invert opacity-50"
          />
        </div>
      ))}
    </div>
  );
}

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

export default function TitleDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    muteTrailers,
    useImageLogos = true,
    episodeViewStyle = "carousel",
    spoilerFreeMode = false,
    trailers = true,
    serverOrder,
  } = usePreferences();

  // Compute ordered server list from user preferences — re-computed reactively
  // when serverOrder changes (e.g. after settings page edit).
  const SERVERS = useMemo(
    () => VideoSourceAdapter.getOrderedServers(serverOrder),
    [serverOrder],
  );

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
  } = useAppAuth();
  const { toast } = useToast();
  const cwRef = useRef(continueWatching);
  useEffect(() => {
    cwRef.current = continueWatching;
  }, [continueWatching]);

  // Wrap toggleMyList to show toast feedback
  const handleToggleMyList = async (movieObj) => {
    const wasInList = isInList(movieObj.id);
    try {
      await toggleMyList(movieObj);      if (wasInList) {
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

  // Browser-only offline download: resolve the server's HLS ladder and save
  // the chosen quality to disk through the /api/downloadify function.
  const [downloadOpen, setDownloadOpen] = useState(false);
  const handleDownloadOpen = () => setDownloadOpen(true);
  const [collectionPickerOpen, setCollectionPickerOpen] = useState(false);

  // Mark watched / unwatched — records a full run in watch history (or
  // removes it), mirroring Cinejoy's "Mark As Watched" circular action.
  const handleMarkWatched = (movieObj) => {
    if (!movieObj) return;
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
  const [iframeLoading, setIframeLoading] = useState(false);
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
  const [playingServerIndex, setPlayingServerIndex] = useState(0);
  // Trigger loading state when iframe src/key is about to change
  useEffect(() => {
    if (isPlaying) setIframeLoading(true);
  }, [isPlaying, playMode, playingServerIndex, playingEpisode, selectedSeason]);

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
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
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

  // Member of at least one collection → tiny folder badge on the List button.
  const inAnyCollection = useMemo(
    () => (collections || []).some((c) => (c.itemIds || []).includes(movie?.id)),
    [collections, movie],
  );

  // Pickers' inline "create + add" target.
  const handlePickerCreateFromDetails = (name) => {
    if (!movie) return;
    const created = createCollectionWithItems(name, [movie.id]);
    if (created) {
      toast({
        title: "Collection Created",
        message: `"${name}" created with 1 title.`,
        type: "success",
        duration: 2500,
      });
    }
  };

  // Resolve the actual platform — now guaranteed to be a canonical key or null
  const effectivePlatform = movie?.source || undefined;
  const serverManuallySetRef = useRef(false);
  const playerRef = useRef(null);

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

  // Reset season/episode when navigating to a different movie (#8 fix)
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
  // Cinejoy-style series info table — Status / Language / First Aired /
  // Last Aired / Seasons / Episodes. Movies keep Runtime / Language / Release
  // Date. Rendered identically in the mobile and desktop info blocks. Lives
  // above the loading early-return so hook order stays unconditional.
  const infoRows = useMemo(() => {
    const rows = [];
    const dateOpts = { year: "numeric", month: "short", day: "numeric" };
    if (isTvContent) {
      if (movie?.status) rows.push({ label: "Status", value: movie.status });
      if (movie?.originalLanguage) rows.push({ label: "Language", value: movie.originalLanguage, uppercase: true });
      if (movie?.releaseDate) rows.push({ label: "First Aired", value: formatTMDBDate(movie.releaseDate, dateOpts) });
      if (movie?.lastAiredDate) rows.push({ label: "Last Aired", value: formatTMDBDate(movie.lastAiredDate, dateOpts) });
      if (movie?.seasonsCount) rows.push({ label: "Seasons", value: String(movie.seasonsCount) });
      if (movie?.episodesCount) rows.push({ label: "Episodes", value: String(movie.episodesCount) });
    } else {
      if (runtimeLabel) rows.push({ label: "Runtime", value: runtimeLabel, extra: endsAt ? `\u2022 Ends ${endsAt}` : null });
      if (movie?.originalLanguage) rows.push({ label: "Language", value: movie.originalLanguage, uppercase: true });
      if (movie?.releaseDate) rows.push({ label: "Release Date", value: formatTMDBDate(movie.releaseDate, dateOpts) });
    }
    return rows;
  }, [isTvContent, runtimeLabel, endsAt, movie]);

  const { data: episodesData, isLoading: episodesLoading, error: episodesError } = useQuery({
    // No `platform` in the key: getSeasonEpisodes ignores it, so keying on it
    // only created duplicate cache rows for identical data per platform switch.
    queryKey: ["episodes", id, selectedSeason],
    queryFn: () => movieService.getSeasonEpisodes(id, selectedSeason),
    enabled: isTvContent && !!movie,
    retry: 3,
    retryDelay: 1000,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (episodesError) {
      reportQueryError("TitleDetails", ["episodes", id, selectedSeason], episodesError, { id, selectedSeason });
    }
  }, [episodesError, id, selectedSeason]);

  useEffect(() => {
    if (isTvContent && !!movie && !episodesLoading && !episodesError) {
      const count = Array.isArray(episodesData) ? episodesData.length : (episodesData?.episodes?.length || 0);
      if (count === 0) {
        logEmptyData("TitleDetails", `No episodes for ${id} season ${selectedSeason}. Check TMDB season numbering (specials excluded).`, { id, selectedSeason });
      }
    }
  }, [isTvContent, movie, episodesLoading, episodesError, episodesData, id, selectedSeason]);
  // Refresh arrow availability at layout time so carousel arrows are correct
  // before paint (no flicker) whenever the rail remounts (season/layout/load).
  useLayoutEffect(() => {
    if (episodeLayout !== "carousel") return;
    refreshEpArrows();
  }, [episodeLayout, selectedSeason, episodesLoading, refreshEpArrows]);
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

  // ── Episode header controls (Cinejoy parity) ─────────────────────────────
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
    const item = continueEntryForMovie;
    if (!item) return false;
    if (item.savedEpisode === ep.episodeNumber && (item.timestamp || 0) > 0) return true;
    return (item.watchedEpisodes?.[selectedSeason] || []).includes(ep.episodeNumber);
  };

  const setEpisodeWatched = (ep, watched) => {
    if (!movie) return;
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
  };

  const toggleEpisodeWatched = (ep) => {
    const watched = isEpisodeWatched(ep);
    setEpisodeWatched(ep, !watched);
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

  // Close player on Escape key
  useEffect(() => {
    if (!isPlaying) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setIsPlaying(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isPlaying]);

  // Close the unreleased-notice modal on Escape key
  useEffect(() => {
    if (!unreleasedModalOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") setUnreleasedModalOpen(false);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [unreleasedModalOpen]);

  // Track which episode the saved timestamp belongs to — only apply it once
  const initialEpisodeRef = useRef(null);
  useEffect(() => {
    if (isPlaying && initialEpisodeRef.current === null) {
      initialEpisodeRef.current = playingEpisode;
    }
    if (!isPlaying) {
      initialEpisodeRef.current = null;
    }
  }, [isPlaying, playingEpisode]);

  if (loading) {
    return <MovieDetailsSkeleton />;
  }

  if (!movie) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "80vh",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.05)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1.5rem",
          }}
        >
          <Film size={36} color="#52525b" />
        </div>
        <h2 style={{ color: "#fff", marginBottom: "0.5rem" }}>
          Title not found
        </h2>
        <p style={{ color: "#a1a1aa", marginBottom: "2rem", maxWidth: "400px", lineHeight: 1.6 }}>
          This title might have been removed or is unavailable in your region. Try searching for something else.
        </p>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
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
            whileTap={{ scale: 0.95 }}
            onClick={() => navigate("/")}
            style={{
              background: "var(--accent-gradient)",
              border: "none",
              color: "#fff",
              padding: "10px 24px",
              borderRadius: "10px",
              fontSize: "0.9rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Browse Home
          </motion.button>
        </div>
      </div>
    );
  }

  const resolvedPlatform = effectivePlatform;
  const sourceName = movie?.sourceName || getPlatformName(resolvedPlatform) || "Streaming";
  const airedEpisodeNumbers = episodes
    .filter((ep) => !ep.airDate || new Date(ep.airDate) <= new Date())
    .sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0))
    .map((ep) => ep.episodeNumber);

  const savedEpisodeForSelectedSeason = continueWatching?.find(
    (item) => String(item.id) === String(movie.id)
      && Number(item.savedSeason) === Number(selectedSeason)
      && Number(item.savedEpisode) > 0,
  );
  const episodeToPlay = savedEpisodeForSelectedSeason?.savedEpisode
    || (airedEpisodeNumbers.length > 0 ? airedEpisodeNumbers[0] : 1);

  // ── Season-aware episode navigation ─────────────────────────────────────
  // Same philosophy as the hero Play button: step within the *aired* episodes
  // of the selected season, and roll across season boundaries to the previous
  // season's last / next season's first episode instead of landing on an
  // episode number that doesn't exist.
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
    const prevSeason = availableSeasonNumbers[currentSeasonIndex - 1];
    setSelectedSeason(prevSeason);
    setPlayingEpisode(
      movie?.lastEpisode?.seasonNumber === prevSeason
        ? movie.lastEpisode.episodeNumber
        : 1,
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
    const nextSeason = availableSeasonNumbers[currentSeasonIndex + 1];
    setSelectedSeason(nextSeason);
    setPlayingEpisode(
      movie?.lastEpisode?.seasonNumber === nextSeason
        ? movie.lastEpisode.episodeNumber
        : 1,
    );
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
  const savedTimestamp = progressItem?.timestamp || 0;
  const hasResume = Boolean(progressItem && progressItem.timestamp > 0);
  const resumePct = hasResume ? Math.round(progressPct(progressItem)) : 0;
  // Track which episode the saved timestamp belongs to — only apply it once
  const effectiveSavedTimestamp = (
    initialEpisodeRef.current !== null && playingEpisode === initialEpisodeRef.current
      ? savedTimestamp : 0
  );
  const backdropSrc = movie?.backdropUrl || movie?.posterUrl;
  const backdropOptimized = backdropSrc ? CdnImageAdapter.getBackdropUrl(backdropSrc) : null;
  const voteSplit = voteSplitPct(movie.imdbRating);
  const unreleased = isUnreleased(movie.releaseDate);

  return (
    <div ref={pageRef} className="relative min-h-screen font-sans overflow-x-hidden pb-24 bg-[#050505] w-[100vw] ml-[calc(50%-50vw)] max-md:-mt-[56px]">
      <SEO
        title={movie.title}
        description={movie.description}
        image={movie.backdropUrl || movie.posterUrl}
        type="video.movie"
      />

      {/* ── Ambient Background ─────────────────────────────────────────────── */}
      <div className="fixed inset-0 w-full h-full z-0 pointer-events-none bg-[#050505]" style={{ contain: "strict", willChange: "transform" }}>
        <div className="absolute inset-0 w-full h-full">
          <img
            className="w-full h-full object-cover scale-[1.2] blur-[80px] saturate-100 opacity-50"
            alt=""
            src={backdropOptimized || movie.posterUrl}
          />
          <div className="absolute top-0 left-0 w-full h-[40vh] mix-blend-screen opacity-20 hidden lg:block">
            <img
              className="w-full h-full object-cover scale-[1.2] blur-[50px] saturate-100"
              alt=""
              loading="lazy"
              decoding="async"
              style={{ maskImage: "linear-gradient(to bottom, black 0%, transparent 100%)", WebkitMaskImage: "linear-gradient(to bottom, black 0%, transparent 100%)" }}
              src={backdropOptimized || movie.posterUrl}
            />
          </div>
        </div>
      </div>

      {/* Back is handled globally by the header .back-btn beside the logo */}

      <div className="relative w-full">
        {/* Hero Image Mask */}
        <div
          className="relative w-full h-[65vh] lg:h-[75vh] overflow-hidden"
          style={{
            maskImage: "linear-gradient(to bottom, black 40%, transparent 98%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 40%, transparent 98%)"
          }}
        >
          <img
              className="h-full w-full object-cover object-top"
              src={backdropOptimized || movie.posterUrl}
              alt={movie.title}
              fetchPriority="high"
              loading="eager"
              decoding="async"
            />
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-transparent pointer-events-none"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-transparent pointer-events-none hidden lg:block"></div>
        </div>

        {/* Content Overlap */}
        <div className="relative z-20 -mt-44 lg:-mt-[22rem] lg:flex lg:items-start lg:justify-between lg:gap-10 px-6 lg:px-16">
          {/* Left Column */}
          <div className="w-full max-w-[700px] lg:max-w-[650px] lg:min-w-0 flex flex-col items-center lg:items-start">
            {useImageLogos && movie.logoUrl ? (
              <img
                className="max-h-20 lg:max-h-36 max-w-[75%] lg:max-w-[500px] w-auto object-contain drop-shadow-2xl"
                src={movie.logoUrl}
                alt={movie.title}
              />
            ) : (
              <h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold text-white drop-shadow-2xl text-center lg:text-left">
                {movie.title}
              </h1>
            )}

            {movie.genres?.length > 0 && (
              <div className="mt-3 lg:mt-4 flex flex-wrap items-center gap-2 text-sm lg:text-lg text-white/90 font-medium">
                {movie.genres.map((genre, idx) => (
                  <span key={genre} className="flex items-center gap-2">
                    <span>{genre}</span>
                    {idx < movie.genres.length - 1 && <span className="text-white/40">•</span>}
                  </span>
                ))}
              </div>
            )}

            {seriesIsAiring && (
              <div className="mt-4 lg:mt-5 flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-2">
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
                    {getTMDBWeekday(movie.nextEpisode.releaseDate, undefined, effectivePlatform)}
                    <span className="text-white/40 mx-1">·</span>
                    {formatTMDBDate(movie.nextEpisode.releaseDate, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>
            )}

            {/* Banner-style resume progress for continue-watching entries */}
            {hasResume && resumePct > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
                <div style={{ width: "min(200px, 30vw)", height: 4, borderRadius: 999, background: "rgba(255,255,255,0.22)", overflow: "hidden" }}>
                  <div style={{ width: `${resumePct}%`, height: "100%", background: "#E50914" }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "0.3px" }}>
                  {resumePct}% Watched
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="mt-5 lg:mt-6 flex items-center gap-3 flex-wrap justify-center lg:justify-start">
              <button
                onClick={() => {
                  if (unreleased) { setUnreleasedModalOpen(true); return; }
                  setPlayMode("movie");
                  setIsPlaying(true);
                  if (isTvContent) {
                    setPlayingEpisode(episodeToPlay);
                  }
                  updateProgress(movie, isTvContent ? selectedSeason : null, isTvContent ? episodeToPlay : null, 0);
                }}
                className="relative rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 font-bold tracking-wide h-[44px] px-6 py-3 text-base min-w-[120px] border-none hover:scale-105 shadow-xl shadow-black/10"
                style={{ background: "var(--accent-gradient)", color: "var(--on-accent, #fff)", boxShadow: "0 8px 24px var(--accent-glow, rgba(149,255,80,0.5))" }}
              >
                <Play className="w-5 h-5 mr-1.5 fill-current" /> {hasResume ? "Resume" : "Play"}
              </button>

              {/* Cinejoy-style circular actions: Add to List | Download | Mark watched */}
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
                      <Check size={20} color="#95ff50" />
                    ) : (
                      <Plus size={20} />
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadOpen}
                  className="hero-circle-btn"
                  aria-label="Download"
                  title="Download to your device"
                >
                  <Download size={20} />
                </button>

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
              <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] backdrop-blur-md px-3.5 py-1.5">
                <Clock className="w-3.5 h-3.5 text-white/45" aria-hidden="true" />
                <span className="text-[13px] font-semibold text-white">Not released yet</span>
                <span className="text-white/25">·</span>
                <span className="text-[13px] text-white/55">
                  Available {formatTMDBDate(movie.releaseDate, { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
            )}

            {/* Meta: Year · Runtime · Certification · Votes */}
            <div className="mt-5 lg:mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm lg:text-base text-white/80 font-medium">
              {movie.releaseDate && <span>{new Date(movie.releaseDate).getFullYear()}</span>}
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
              <div className="mt-1.5 text-sm lg:text-base text-white/60">
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
              <div className="mt-4 lg:mt-5">
                <p className={`text-sm lg:text-base text-white/70 leading-relaxed ${showFullDescription ? "" : "line-clamp-3"}`}>
                  {movie.description || movie.longDescription || movie.overview}
                </p>
                {(movie.description || movie.longDescription || movie.overview).length > 220 && (
                  <button
                    type="button"
                    onClick={() => setShowFullDescription((v) => !v)}
                    className="mt-1.5 text-sm font-semibold text-white/80 hover:text-white transition-colors"
                  >
                    {showFullDescription ? "Show less" : "Show more"}
                  </button>
                )}
              </div>
            )}

            {/* Mobile details block */}
            <div className="mt-6 w-full lg:hidden">
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
          <div className="hidden lg:block w-[280px] shrink-0 mt-40">
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
      <div id="title-details-more" className="relative z-20 mt-10 lg:mt-14 px-6 lg:px-16 space-y-10 lg:space-y-14 pb-20">
      {/* ── Episodes ─────────────────────────────────────────────────────────── */}
      {isTvContent && hasSeriesEpisodes && (
        <motion.section
          style={{ position: "relative", zIndex: 1, marginTop: "1.5rem", maxWidth: "100%", marginLeft: "auto", marginRight: "auto" }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3 px-2">
            <motion.h2
              className="text-xl lg:text-2xl font-bold text-white/90 shrink-0"
              style={{ margin: 0 }}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              Episodes {isAiring && totalEpisodes > episodes.length
                ? <span style={{ fontSize: '0.7em', color: '#52525b', fontWeight: 400 }}>({releasedEpisodes} of {totalEpisodes} released)</span>
                : episodes.length > 0 && <span style={{ fontSize: '0.7em', color: '#52525b', fontWeight: 400 }}>({episodes.length})</span>}
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
                onSelect={(s) => { setSelectedSeason(s); setShowAllEpisodes(false); }}
              />

              {/* Layout toggle — three icon pills */}
              <div className="inline-flex items-center gap-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 p-1" role="radiogroup" aria-label="Episode layout">
                <motion.button
                  whileTap={{ scale: 0.92 }}
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
                  whileTap={{ scale: 0.92 }}
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
                  whileTap={{ scale: 0.92 }}
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
            key={`season-${selectedSeason}-${episodesLoading}-${episodeLayout}`}
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
            {episodesLoading ? (
              // Skeleton placeholders while episodes load
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
              <div
                style={{
                  gridColumn: episodeLayout === 'grid' ? '1/-1' : undefined,
                  textAlign: "center",
                  padding: "3rem 1rem",
                }}
              >
                <Tv size={32} color="#52525b" style={{ marginBottom: "1rem" }} />
                <p style={{ color: "#71717a", fontSize: "1rem", marginBottom: "0.5rem" }}>
                  No episodes found for Season {selectedSeason}.
                </p>

                <p style={{ color: "#52525b", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
                  {normalizedSeasonCount > 1
                    ? `This show has ${normalizedSeasonCount} season${normalizedSeasonCount > 1 ? 's' : ''}. Try selecting a different season.`
                    : "Episode data may not be available yet."}
                </p>
                {normalizedSeasonCount > 1 && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      const currentIndex = availableSeasonNumbers.indexOf(selectedSeason);
                      const nextIndex = currentIndex >= 0
                        ? (currentIndex + 1) % availableSeasonNumbers.length
                        : 0;
                      setSelectedSeason(availableSeasonNumbers[nextIndex]);
                    }}
                    style={{
                      background: "rgba(149,255,80,0.08)",
                      border: "1px solid rgba(149,255,80,0.2)",
                      color: "#95ff50",
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
                )}
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
                    const isLiveWatched = continueEntryForMovie?.savedEpisode === ep.episodeNumber && (continueEntryForMovie?.timestamp || 0) > 0;
                    const watchedTs = isLiveWatched ? (continueEntryForMovie?.timestamp || 0) : 0;
                    const isAired = isEpAired(ep);
                    const playable = SERVERS.length > 0 && isAired;
                    // Upcoming episodes have no TMDB still — fall back to the
                    // series artwork so every card shows an image (grayed out).
                    // Catalog objects sometimes store art in the non-Url fields.
                    const epThumb = ep.thumbnailUrl || ep.posterUrl || ep.backdropUrl || movie.backdropUrl || movie.posterUrl || movie.backdrop || movie.poster || movie.thumbnailUrl || null;
                    const pctWatched = isWatched && watchedTs <= 0
                      ? 100
                      : Math.min(100, (watchedTs / (ep.durationMins ? ep.durationMins * 60 : 3600)) * 100);
                    const playEpisode = () => {
                      if (!playable) return;
                      setIsPlaying(true);
                      setPlayingEpisode(ep.episodeNumber);
                      updateProgress({ ...movie, source: resolvedPlatform, sourceName }, selectedSeason, ep.episodeNumber);
                    };
                    const playEpKeyboard = (e) => {
                      if (e.target !== e.currentTarget || !playable) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        playEpisode();
                      }
                    };

                    if (isCard) {
                      // ── GRID / CAROUSEL CARD ──
                      return (
                        <motion.div
                          key={ep.id || idx}
                          initial={{ opacity: 0, scale: 0.95, y: 16 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -8 }}
                          transition={{ duration: 0.35, delay: Math.min(idx * 0.04, 0.3), ease: [0.16, 1, 0.3, 1] }}
                          whileHover={{ y: -4 }}
                          whileTap={playable ? { scale: 0.97 } : undefined}
                          role={playable ? "button" : undefined}
                          tabIndex={playable ? 0 : undefined}
                          aria-disabled={playable ? undefined : true}
                          aria-label={playable ? `Play ${ep.title}` : undefined}
                          onClick={playEpisode}
                          onKeyDown={playEpKeyboard}
                          className="group flex flex-col gap-3 shrink-0 cursor-pointer transition-transform duration-200"
                          style={{
                            opacity: (!isAired) ? 0.45 : (SERVERS.length > 0 ? 1 : 0.6),
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
                                loading="lazy"
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
                              ) : SERVERS.length === 0 ? (
                                <div style={{ background: 'rgba(0,0,0,0.85)', color: '#a1a1aa', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.12)' }}>
                                  No stream available
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

                    // ── LIST ROW ──
                    return (
                      <motion.div
                        key={ep.id || idx}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 12 }}
                        transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.25) }}
                        whileHover={{ background: 'rgba(255,255,255,0.04)' }}
                        whileTap={playable ? { scale: 0.98 } : undefined}
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
                          cursor: playable ? 'pointer' : 'default', opacity: (!isAired) ? 0.35 : (SERVERS.length > 0 ? 1 : 0.6),
                          transition: 'background 0.2s, border 0.2s',
                        }}
                      >
                        {/* Thumbnail */}
                        <div style={{ position: 'relative', width: 'clamp(96px, 26vw, 140px)', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', aspectRatio: '16/9', background: '#18181b' }}>
                          {epThumb ? (
                            <img src={CdnImageAdapter.getUrl(epThumb, 'w500')} alt={ep.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: !isAired ? 'grayscale(0.85) brightness(0.55)' : undefined }} />
                          ) : (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '4px', background: 'linear-gradient(135deg, #18181b 0%, rgba(149,255,80,0.12) 55%, #211519 100%)' }}>
                              <span style={{ fontSize: '1.05rem', fontWeight: 800, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace', lineHeight: 1 }}>{String(ep.episodeNumber).padStart(2, '0')}</span>
                              <Film size={13} strokeWidth={1.5} color="rgba(255,255,255,0.28)" />
                            </div>
                          )}
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            {isAired ? (
                              SERVERS.length > 0 ? (
                                <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Play size={14} fill="#fff" stroke="none" style={{ marginLeft: '2px' }} />
                                </div>
                              ) : (
                                <div style={{ background: 'rgba(0,0,0,0.85)', color: '#a1a1aa', padding: '2px 5px', borderRadius: '4px', fontSize: '0.6rem', fontWeight: 600, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.12)' }}>
                                  No stream available
                                </div>
                              )
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
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isEpPlaying ? 'var(--accent-primary, #95ff50)' : '#52525b', fontFamily: 'monospace', flexShrink: 0 }}>E{String(ep.episodeNumber).padStart(2, '0')}</span>
                              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, color: isEpPlaying ? '#fff' : '#e4e4e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.title}</h3>
                            </div>
                          </div>
                          <p style={{ fontSize: '0.78rem', color: spoilerFreeMode ? '#52525b' : '#71717a', fontStyle: spoilerFreeMode ? 'italic' : 'normal', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setVisibleEpisodeCount((prev) => Math.min(episodes.length, prev + EPISODES_CHUNK_SIZE))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                          color: '#fff', padding: '8px 20px', borderRadius: '100px',
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
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setVisibleEpisodeCount(EPISODES_CHUNK_SIZE)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#a1a1aa', padding: '8px 20px', borderRadius: '100px',
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
                <RailArrow dir="left" onClick={() => scrollEpRail('left')} revealOnHover hoverClass="group-hover/episodes:opacity-100" />
              )}
              {epCanRight && (
                <RailArrow dir="right" onClick={() => scrollEpRail('right')} revealOnHover hoverClass="group-hover/episodes:opacity-100" />
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
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
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
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
        >
          <motion.h2
            className="text-xl lg:text-2xl font-bold text-white/90 px-2"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: "easeOut" }}
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
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
        >
          <motion.h2
            className="text-xl lg:text-2xl font-bold text-white/90 px-2"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            You Might Also Like
          </motion.h2>
          {loading ? (
            <div className="movie-grid">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i}>
                  <div
                    className="skeleton"
                    style={{
                      width: "100%",
                      aspectRatio: "2/3",
                      borderRadius: "12px",
                      marginBottom: "0.5rem",
                    }}
                  ></div>
                  <div
                    className="skeleton"
                    style={{
                      height: "1rem",
                      width: "70%",
                      borderRadius: "4px",
                      marginBottom: "0.4rem",
                    }}
                  ></div>
                  <div
                    className="skeleton"
                    style={{
                      height: "0.8rem",
                      width: "40%",
                      borderRadius: "4px",
                    }}
                  ></div>
                </div>
              ))}
            </div>
          ) : (
            <ErrorBoundary>
            <motion.div
              className="flex gap-4 overflow-x-auto overflow-y-clip pb-10 pt-4 px-6 lg:px-16 hide-scrollbar items-start isolate min-h-[310px] lg:min-h-[356px]"
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
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.4,
                    delay: (idx % 12) * 0.05,
                    ease: "easeOut",
                  }}
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
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
        >
          <motion.h2
            className="text-xl lg:text-2xl font-bold text-white/90 px-2"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: "easeOut" }}
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
              {canScrollLeft && <RailArrow dir="left" onClick={() => scrollDirector("left")} />}
              {canScrollRight && <RailArrow dir="right" onClick={() => scrollDirector("right")} />}
              <ErrorBoundary>
              {similar.slice(0, 8).filter(s => s.director && s.director === movie.director).slice(0, 5).map((sim, idx) => (
              <motion.div
                key={`dir-${sim.id}-${idx}`}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.08, duration: 0.4 }}
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
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
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
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99999,
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
                transition={{ duration: 0.9 }}
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

            {/* Player header */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.4, ease: "easeOut" }}
              className={`video-modal-header${playMode === "trailer" ? "" : " hidden md:flex"}`}
              style={{
                position: "relative",
                padding: "calc(clamp(0.65rem, 1.2vh, 1.25rem) + env(safe-area-inset-top, 0px)) clamp(1rem, 2vw, 2rem) clamp(0.65rem, 1.2vh, 1.25rem)",
                display: "flex",
                justifyContent: "space-between",
                background:
                  playMode === "trailer" ? "rgba(0,0,0,0.4)" : "#0b0b0d",
                alignItems: "center",
                zIndex: 1000,
                backdropFilter: playMode === "trailer" ? "blur(12px)" : "none",
                gap: "0.5rem",
              }}
            >
              {playMode === "trailer" ? (
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
                    {playMode === "trailer" ? (
                      <span style={{ color: "#71717a", fontWeight: 400 }}>
                        — Official Trailer
                      </span>
                    ) : isTvContent ? (
                      `— S${selectedSeason} E${playingEpisode}${episodes.find((e) => e.episodeNumber === playingEpisode)?.title ? `: ${episodes.find((e) => e.episodeNumber === playingEpisode).title}` : ""}`
                    ) : (
                      ""
                    )}
                  </h3>
                </div>
              ) : (
                <div style={{ flex: 1 }} />
              )}
              <div
                className="video-modal-header__actions"
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "center",
                }}
              >
                {isTvContent && playMode !== "trailer" && (
                  <div
                    className="video-modal-episode-nav"
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginRight: "0.75rem",
                    }}
                  >
                    <motion.button
                      onClick={goToPrevEpisode}
                      disabled={!canGoPrev}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(255,255,255,0.15)",
                        color: "white",
                        padding: "0.45rem 1rem",
                        borderRadius: "4px",
                        cursor: canGoPrev ? "pointer" : "not-allowed",
                        opacity: canGoPrev ? 1 : 0.4,
                        fontSize: "0.85rem",
                        fontWeight: 600,
                      }}
                      whileHover={canGoPrev ? { scale: 1.04, background: "rgba(255,255,255,0.06)", borderColor: "rgba(255,255,255,0.3)" } : {}}
                      whileTap={canGoPrev ? { scale: 0.95 } : {}}
                    >
                      Prev Ep
                    </motion.button>
                    <motion.button
                      onClick={goToNextEpisode}
                      disabled={!canGoNext}
                      style={{
                        background: "#E50914",
                        border: "none",
                        color: "white",
                        padding: "0.45rem 1.1rem",
                        borderRadius: "4px",
                        cursor: canGoNext ? "pointer" : "not-allowed",
                        fontWeight: 700,
                        opacity: canGoNext ? 1 : 0.4,
                        fontSize: "0.85rem",
                      }}
                      whileHover={
                        canGoNext
                          ? { scale: 1.05, background: "#ff0a16" }
                          : {}
                      }
                      whileTap={
                        canGoNext ? { scale: 0.95 } : {}
                      }
                    >
                      Next Ep
                    </motion.button>
                  </div>
                )}
                {playMode !== "trailer" && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <ServerDropdown
                      servers={SERVERS}
                      selectedIndex={playingServerIndex}
                      onSelect={(i) => { serverManuallySetRef.current = true; setPlayingServerIndex(i); }}
                    />
                  </div>
                )}
                {playMode === "trailer" && (
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
                    whileTap={{ scale: 0.9 }}
                    title="Close Trailer"
                  >
                    <X size={18} />
                  </motion.button>
                )}
              </div>
            </motion.div>

            {/* Player: iframe for trailer, CustomVideoPlayer for streams */}
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
                          aspectRatio: "16 / 9",
                          background: "#000",
                        }}
                      />
                    }
                  >
                    <CustomVideoPlayer
                    ref={playerRef}
                    movie={movie}
                    season={isTvContent ? selectedSeason : undefined}
                    episode={isTvContent ? playingEpisode : undefined}
                    servers={SERVERS}
                    preferredServerIndex={playingServerIndex}
                    onServerChange={(i) => { serverManuallySetRef.current = true; setPlayingServerIndex(i); }}
                    onClose={() => setIsPlaying(false)}
                    thumbnailUrl={movie.backdropUrl || movie.posterUrl}
                    startTime={effectiveSavedTimestamp}
                    hasNextEpisode={
                      isTvContent && canGoNext
                    }
                    onNextEpisode={goToNextEpisode}
                    onProgressUpdate={(currentTime) => {
                      if (currentTime > 10) {
                        updateProgress(
                          { ...movie, source: resolvedPlatform, sourceName },
                          selectedSeason,
                          playingEpisode,
                          currentTime,
                        );
                      }
                    }}
                  />
                  </Suspense>
                </ErrorBoundary>
              )}
            </motion.div>
          </motion.div>
        )}
        {unreleasedModalOpen && (
          <motion.div
            key="unreleased"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 backdrop-blur-md px-6"
            onClick={() => setUnreleasedModalOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-labelledby="unreleased-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
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
                Releases on {formatTMDBDate(movie.releaseDate, { month: "long", day: "numeric", year: "numeric" })}
              </p>
              <button
                type="button"
                onClick={() => setUnreleasedModalOpen(false)}
                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/[0.12]"
              >
                <ChevronLeft size={16} strokeWidth={1.5} aria-hidden="true" /> Back
              </button>
            </motion.div>
          </motion.div>
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

      {downloadOpen && movie && (
        <DownloadModal
          movie={movie}
          servers={SERVERS}
          isTvContent={isTvContent}
          initialSeason={selectedSeason}
          initialEpisode={isTvContent ? (episodeToPlay ?? playingEpisode ?? 1) : 1}
          playerRef={playerRef}
          onClose={() => setDownloadOpen(false)}
        />
      )}

      <CollectionPickerDialog
        open={collectionPickerOpen}
        movie={movie}
        collections={collections || []}
        onToggle={toggleInCollection}
        onCreateWithItems={(name) => handlePickerCreateFromDetails(name)}
        onClose={() => setCollectionPickerOpen(false)}
      />
    </div>
  );
}
