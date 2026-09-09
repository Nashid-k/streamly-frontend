import SEO from "../components/SEO";
import MovieDetailsSkeleton from "../components/MovieDetailsSkeleton";
import CastRail from "../components/CastRail";
import RailArrow from "../components/RailArrow";
import useRailArrows from "../hooks/useRailArrows";
import { useQuery } from "@tanstack/react-query";
import { movieService, classifyTrailer } from "../api/movieService";
import Loader from "../components/Loader";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { createPortal } from "react-dom";
import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Play,
  ArrowLeft,
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
  Popcorn,
  Calendar,
  ChevronDown as ChevronDownIcon,
} from "lucide-react";
import {
  motion,
  AnimatePresence,
} from "framer-motion";
import { useAppAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast.jsx";
import MovieCard from "../components/MovieCard";
import RatingsCluster from "../components/RatingsCluster";

import { buildMovieAddedNotification } from "../utils/notificationEngine";
import { formatTMDBDate, getTMDBWeekday } from "../utils/timezone";
import { getPlatformName } from "../utils/platforms";
import CustomVideoPlayer from "../components/CustomVideoPlayer";
import ErrorBoundary from "../components/ErrorBoundary";
import { usePreferences } from "../context/preferences";
const EMPTY_ARRAY = [];

import { VideoSourceAdapter } from "../api/videoSourceAdapter";

const SERVERS = VideoSourceAdapter.getServers();

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

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
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
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "#fff",
          padding: "0.6rem 1.1rem",
          borderRadius: "12px",
          fontSize: "0.95rem",
          fontWeight: 700,
          cursor: "pointer",
          minWidth: "150px",
          justifyContent: "space-between",
          backdropFilter: "blur(8px)",
          transition: "border-color 0.2s",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span
            style={{
              width: "8px",
              height: "8px",
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
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "#ef4444",
                boxShadow: "0 0 0 3px rgba(239,68,68,0.18)",
              }}
            />
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
                        ? "rgba(244,63,94,0.1)"
                        : "transparent",
                      border: "none",
                      color: isSelected ? "#f43f5e" : "#e4e4e7",
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
                      <span style={{ color: "#fca5a5", fontSize: "0.68rem", fontWeight: 700 }}>
                        AIRING
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
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", zIndex: 25 }}>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ borderColor: "rgba(255,255,255,0.35)" }}
        whileTap={{ scale: 0.97 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "#fff",
          padding: "0.4rem 0.9rem",
          borderRadius: "8px",
          fontSize: "0.85rem",
          fontWeight: 600,
          cursor: "pointer",
          minWidth: "130px",
          justifyContent: "space-between",
          backdropFilter: "blur(8px)",
          transition: "border-color 0.2s",
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
              background: "rgba(18,18,22,0.97)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: "12px",
              backdropFilter: "blur(24px)",
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
                  whileHover={{ background: "rgba(255,255,255,0.08)" }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "0.6rem 1rem",
                    background: isSelected
                      ? "rgba(244,63,94,0.1)"
                      : "transparent",
                    border: "none",
                    color: isSelected ? "#f43f5e" : "#e4e4e7",
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
                        background: "var(--accent-gradient)",
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

// ─── Component ────────────────────────────────────────────────────────────────

export default function TitleDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { muteTrailers } = usePreferences();
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [playingEpisode, setPlayingEpisode] = useState(1);
  const { isInList, toggleMyList, continueWatching, updateProgress, addNotification } = useAppAuth();
  const { toast } = useToast();
  const cwRef = useRef(continueWatching);
  useEffect(() => {
    cwRef.current = continueWatching;
  }, [continueWatching]);

  // Wrap toggleMyList to show toast feedback
  const handleToggleMyList = async (movieObj) => {
    const wasInList = isInList(movieObj.id);
    try {
      await toggleMyList(movieObj);
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
            year: movieObj.releaseYear,
            duration: movieObj.duration,
            imageUrl: movieObj.backdropUrl || movieObj.posterUrl,
            movieId: movieObj.id,
            isSeries: Boolean(movieObj.isSeries || movieObj.type === 'tv' || String(movieObj.id || '').startsWith('tmdb-tv-')),
          });
          addNotification(notif);
        }
      }
    } catch {
      toast({
        title: "Error",
        message: `Failed to update list for "${movieObj.title}".`,
        type: "error",
        duration: 3000,
      });
    }
  };


  const [isPlaying, setIsPlaying] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [episodeLayout, setEpisodeLayout] = useState("grid"); // 'grid' | 'list'
  const [showAllEpisodes, setShowAllEpisodes] = useState(false);
  const EPISODES_INITIAL_COUNT = 8;

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

  const { data: rawMovie, isLoading: loading } = useQuery({
    queryKey: ["movie", id],
    queryFn: () => movieService.getMovieDetails(id),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
  });

  const movie = rawMovie;
  const movieId = movie?.id;

  // Resolve the actual platform — now guaranteed to be a canonical key or null
  const effectivePlatform = movie?.source || undefined;
  const serverManuallySetRef = useRef(false);

  const { data: similarData } = useQuery({
    queryKey: ["similar", id],
    queryFn: () => movieService.getSimilarMovies(id),
    enabled: !!movie,
  });
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

  const { data: episodesData, isLoading: episodesLoading } = useQuery({
    queryKey: ["episodes", id, selectedSeason, effectivePlatform],
    queryFn: () => movieService.getSeasonEpisodes(id, selectedSeason, effectivePlatform),
    enabled: isTvContent && !!movie,
    retry: 3,
    retryDelay: 1000,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: true,
  });
  // Backend returns { episodes, totalEpisodes, releasedEpisodes, isAiring } for running series
  // But also handle plain array format for backward compatibility
  const episodes = Array.isArray(episodesData)
    ? episodesData
    : Array.isArray(episodesData?.episodes)
      ? episodesData.episodes
      : [];

  const totalEpisodes = episodesData?.totalEpisodes || episodes.length;
  const releasedEpisodes = episodesData?.releasedEpisodes || episodes.length;
  const isAiring = episodesData?.isAiring
    || (selectedSeason === airingSeasonNumber && !!movie?.nextEpisode?.releaseDate);
  const hasSeriesEpisodes = isTvContent;

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
    const preferredSeason = seasonNumbers.includes(savedSeason)
      ? savedSeason
      : airingSeasonNumber || seasonNumbers[0] || 1;

    setSelectedSeason(preferredSeason);
    setPlayingEpisode(saved?.savedEpisode || 1);
  }, [movieId, isTvContent, airingSeasonNumber, availableSeasonKey]);

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
            <ArrowLeft size={16} /> Go Back
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
  const savedEpisodeForSelectedSeason = continueWatching?.find(
    (item) => String(item.id) === String(movie.id)
      && Number(item.savedSeason) === Number(selectedSeason)
      && Number(item.savedEpisode) > 0,
  );
  const latestAiredEpisode = episodes
    .filter((ep) => !ep.airDate || new Date(ep.airDate) <= new Date())
    .at(-1)?.episodeNumber
    || (movie.lastEpisode?.seasonNumber === selectedSeason
      ? movie.lastEpisode.episodeNumber
      : null);
  const episodeToPlay = savedEpisodeForSelectedSeason?.savedEpisode
    || latestAiredEpisode
    || 1;

  // ── Season-aware episode navigation ─────────────────────────────────────
  // Same philosophy as the hero Play button: step within the *aired* episodes
  // of the selected season, and roll across season boundaries to the previous
  // season's last / next season's first episode instead of landing on an
  // episode number that doesn't exist.
  const airedEpisodeNumbers = episodes
    .filter((ep) => !ep.airDate || new Date(ep.airDate) <= new Date())
    .sort((a, b) => (a.episodeNumber || 0) - (b.episodeNumber || 0))
    .map((ep) => ep.episodeNumber);
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
  const progressItem = continueWatching?.find((m) => m.id === movie?.id);
  const savedTimestamp = progressItem?.timestamp || 0;
  // Track which episode the saved timestamp belongs to — only apply it once
  const effectiveSavedTimestamp = (
    initialEpisodeRef.current !== null && playingEpisode === initialEpisodeRef.current
      ? savedTimestamp : 0
  );
  const backdropSrc = movie?.backdropUrl || movie?.posterUrl;
  const backdropOptimized = backdropSrc ? CdnImageAdapter.getBackdropUrl(backdropSrc) : null;



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
          {/* Same gradient stack as the hero banner overlay — bottom fade + soft side vignettes */}
          <div className="absolute inset-0 z-0 pointer-events-none watch-hero-gradient" />
        </div>
      </div>

      {/* ── Topbar: Back + Actions ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5, ease: "easeOut" }}
        className="fixed top-[56px] md:top-[72px] left-0 right-0 z-50 flex items-center justify-between px-6 lg:px-12 py-4 lg:py-6 pointer-events-none"
      >
        <div className="flex items-center gap-4 pointer-events-auto">
          <button
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate("/");
              }
            }}
            className="btn btn-glass"
            style={{ padding: "10px 18px", borderRadius: "100px", fontSize: "0.9rem" }}
            aria-label="Go back"
          >
            <ArrowLeft size={18} /> Back
          </button>
        </div>
      </motion.div>

      <div className="relative w-full">
        {/* Hero Image Mask */}
        <div
          className="relative w-full h-[65vh] lg:h-[75vh] overflow-hidden"
          style={{ maskImage: "linear-gradient(to bottom, black 40%, transparent 98%)", WebkitMaskImage: "linear-gradient(to bottom, black 40%, transparent 98%)" }}
        >
<img
              className="h-full w-full object-cover object-top"
              src={backdropOptimized || movie.posterUrl}
              alt={movie.title}
              fetchPriority="high"
              loading="eager"
              decoding="async"
            />
          <div className="absolute inset-0 watch-hero-gradient pointer-events-none"></div>
          <div className="absolute inset-0 left-vignette pointer-events-none hidden lg:block"></div>
        </div>

        {/* Content Overlap */}
        <div className="relative z-20 -mt-44 lg:-mt-[22rem] lg:flex lg:items-start lg:justify-between lg:gap-10 px-6 lg:px-16 max-w-[1800px] mx-auto">
          {/* Left Column */}
          <div className="w-full max-w-[700px] lg:max-w-[650px] lg:min-w-0 flex flex-col items-center lg:items-start">
            {movie.logoUrl ? (
              <img className="max-h-20 lg:max-h-36 max-w-[75%] lg:max-w-[500px] object-contain drop-shadow-2xl" src={movie.logoUrl} alt={movie.title} />
            ) : (
              <h1 className="text-3xl lg:text-5xl font-bold text-white drop-shadow-2xl text-center lg:text-left">{movie.title}</h1>
            )}

            {seriesIsAiring && (
              <div className="mt-4 lg:mt-5 flex flex-wrap items-center justify-center lg:justify-start gap-x-4 gap-y-2">
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "6px 14px",
                    borderRadius: "100px",
                    background:
                      "linear-gradient(135deg, rgba(239,68,68,0.18), rgba(220,38,38,0.08))",
                    border: "1px solid rgba(239,68,68,0.45)",
                    color: "#fecaca",
                    fontSize: "0.8rem",
                    fontWeight: 700,
                    letterSpacing: "0.03em",
                    boxShadow: "0 4px 20px rgba(220,38,38,0.25)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: "#ef4444",
                      boxShadow: "0 0 0 0 rgba(239,68,68,0.7)",
                      animation: "pulse 2s ease-in-out infinite",
                      flexShrink: 0,
                    }}
                  />
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

            <div className="mt-3 lg:mt-4 flex items-center gap-2 text-sm lg:text-lg text-white/90 font-medium flex-wrap justify-center lg:justify-start">
              {movie.genres?.map((genre, idx) => (
                <span key={genre} className="flex items-center gap-2">
                  <span>{genre}</span>
                  {idx < movie.genres.length - 1 && <span className="text-white/40">•</span>}
                </span>
              ))}
            </div>

            {/* Actions */}
            <div className="mt-5 lg:mt-6 flex items-center gap-3 flex-wrap justify-center lg:justify-start">
              <button
                onClick={() => {
                  setPlayMode("movie");
                  setIsPlaying(true);
                  if (isTvContent) {
                    setPlayingEpisode(episodeToPlay);
                  }
                  updateProgress(movie, isTvContent ? selectedSeason : null, isTvContent ? episodeToPlay : null, 0);
                }}
                className="relative rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 font-semibold tracking-wide h-[44px] lg:h-[52px] px-6 lg:px-8 py-3 text-sm lg:text-base min-w-[120px] text-white border-none"
                style={{ background: "var(--accent-gradient)", boxShadow: "0 8px 24px rgba(244,63,94,0.5)" }}
              >
                <Play size={20} className="mr-1.5 fill-current" /> Play
              </button>

              <button
                onClick={() => handleToggleMyList(movie)}
                className="relative rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 h-[44px] w-[44px] lg:h-[52px] lg:w-[52px] bg-white/10 backdrop-blur-md border border-white/10 hover:border-white/20 hover:bg-white/20 text-white shadow-lg"
                title="My List"
              >
                {isInList(movie.id) ? <Check size={20} color="#95ff50" /> : <Plus size={20} />}
              </button>
            </div>

            {/* Meta */}
            <div className="mt-5 lg:mt-6 w-full flex flex-wrap items-center gap-x-4 gap-y-2 text-sm lg:text-base text-white/80 font-medium justify-center lg:justify-start">
              <span>{new Date(movie.releaseDate).getFullYear()}</span>
              {movie.durationMins && <span>{movie.durationMins}m</span>}
              
              {movie.imdbRating > 0 && (
                <div className="flex items-center gap-3 lg:gap-4 border-l border-white/20 pl-4 ml-1">
                  <RatingsCluster movie={movie} size="md" />
                </div>
              )}
            </div>

            {movie.director && (
              <div className="mt-1.5 w-full text-sm lg:text-base text-white/60 text-center lg:text-left">
                <span className="text-white/40">Director:</span> <span className="text-white/80">{movie.director}</span>
              </div>
            )}

            <div className="mt-4 lg:mt-5 w-full text-center lg:text-left">
              <p className="text-sm lg:text-base text-white/70 leading-relaxed max-w-[650px]">{movie.description || movie.longDescription || movie.overview || ''}</p>
            </div>

            {/* Mobile details block */}
            <div className="mt-6 w-full lg:hidden">
              <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden backdrop-blur-sm">
                <div className="divide-y divide-white/[0.06]">
                  {movie.durationMins && (
                    <div className="flex items-center justify-between px-3.5 py-2.5">
                      <span className="text-xs text-white/40">Runtime</span>
                      <span className="text-xs text-white/80">{movie.durationMins}m</span>
                    </div>
                  )}
                  {movie.originalLanguage && (
                    <div className="flex items-center justify-between px-3.5 py-2.5">
                      <span className="text-xs text-white/40">Language</span>
                      <span className="text-xs text-white/80 uppercase">{movie.originalLanguage}</span>
                    </div>
                  )}
                  {movie.releaseDate && (
                    <div className="flex items-center justify-between px-3.5 py-2.5">
                      <span className="text-xs text-white/40">Release Date</span>
                      <span className="text-xs text-white/80">{formatTMDBDate(movie.releaseDate, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                    </div>
                  )}
                  {movie.budget > 0 && (
                    <div className="flex items-center justify-between px-3.5 py-2.5">
                      <span className="text-xs text-white/40">Budget</span>
                      <span className="text-xs text-white/80">{movie.budget.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</span>
                    </div>
                  )}
                  {movie.revenue > 0 && (
                    <div className="flex items-center justify-between px-3.5 py-2.5">
                      <span className="text-xs text-white/40">Revenue</span>
                      <span className="text-xs text-white/80">{movie.revenue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</span>
                    </div>
                  )}
                  {movie.productionCompanies && movie.productionCompanies.length > 0 && (
                    <div className="flex items-center justify-between px-3.5 py-2.5">
                      <span className="text-xs text-white/40 shrink-0">Production</span>
                      <span className="text-xs text-white/80 text-right">{movie.productionCompanies.slice(0, 3).map(c => c.name).join(", ")}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (Desktop) */}
          <div className="hidden lg:block w-[280px] shrink-0 mt-40">
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] overflow-hidden backdrop-blur-sm">
              <div className="divide-y divide-white/[0.06]">
                {movie.durationMins && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-white/40">Runtime</span>
                    <span className="text-xs text-white/80">{movie.durationMins}m</span>
                  </div>
                )}
                {movie.originalLanguage && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-white/40">Language</span>
                    <span className="text-xs text-white/80 uppercase">{movie.originalLanguage}</span>
                  </div>
                )}
                {movie.releaseDate && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-white/40">Release Date</span>
                    <span className="text-xs text-white/80">{formatTMDBDate(movie.releaseDate, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
                  </div>
                )}
                {movie.budget > 0 && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-white/40">Budget</span>
                    <span className="text-xs text-white/80">{movie.budget.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</span>
                  </div>
                )}
                {movie.revenue > 0 && (
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-white/40">Revenue</span>
                    <span className="text-xs text-white/80">{movie.revenue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}</span>
                  </div>
                )}
              </div>
            </div>
            {movie.productionCompanies && movie.productionCompanies.length > 0 && (
              <div className="mt-4 grid gap-2 grid-cols-2">
                {movie.productionCompanies.slice(0, 4).map(company => company.logo_path && (
                  <div key={company.id} className="flex items-center justify-center h-10 px-2">
                    <img loading="lazy" src={`https://image.tmdb.org/t/p/w200${company.logo_path}`} alt={company.name} title={company.name} className="w-auto max-h-7 object-contain brightness-0 invert opacity-50 max-w-full" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Cast & Rest ─────────────────────────────────────────────────────────────── */}
      <div className="relative z-20 mt-10 lg:mt-14 px-6 lg:px-16 max-w-[1800px] mx-auto space-y-10 lg:space-y-14 pb-20">
{/* ── Cast ─────────────────────────────────────────────────────────────── */}
      {movie.cast && movie.cast.length > 0 && (
        <motion.section
          style={{ position: "relative", zIndex: 1, maxWidth: "100%", marginLeft: "auto", marginRight: "auto", marginBottom: "2rem" }}
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

      {/* ── Episodes ─────────────────────────────────────────────────────────── */}
      {isTvContent && hasSeriesEpisodes && (
        <motion.section
          style={{ position: "relative", zIndex: 1, marginTop: "1.5rem", maxWidth: "100%", marginLeft: "auto", marginRight: "auto" }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <motion.h2
              className="section-title"
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

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {/* Layout toggle */}
              <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setEpisodeLayout('grid')}
                  style={{
                    padding: '8px 12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: episodeLayout === 'grid' ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: episodeLayout === 'grid' ? '#fff' : '#71717a',
                    transition: 'all 0.2s',
                  }}
                  title="Grid view"
                >
                  <LayoutGrid size={16} />
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setEpisodeLayout('list')}
                  style={{
                    padding: '8px 12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: episodeLayout === 'list' ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: episodeLayout === 'list' ? '#fff' : '#71717a',
                    transition: 'all 0.2s',
                  }}
                  title="List view"
                >
                  <List size={16} />
                </motion.button>
              </div>

              {/* Season dropdown */}
            <SeasonDropdown
              seasons={availableSeasons}
              selectedSeason={selectedSeason}
              airingSeasonNumber={airingSeasonNumber}
              onSelect={(s) => { setSelectedSeason(s); setShowAllEpisodes(false); }}
            />
            </div>
          </div>

          {/* Episode Grid/List */}
          <AnimatePresence mode="wait">
          <motion.div
            key={`season-${selectedSeason}-${episodesLoading}-${episodeLayout}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{
              display: episodeLayout === 'grid' ? 'grid' : 'flex',
              flexDirection: episodeLayout === 'list' ? 'column' : undefined,
              gridTemplateColumns: episodeLayout === 'grid' ? 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))' : undefined,
              gap: episodeLayout === 'grid' ? '0.8rem' : '0.5rem',
            }}
            className="episode-grid"
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
                      background: "rgba(244,63,94,0.08)",
                      border: "1px solid rgba(244,63,94,0.2)",
                      color: "#f43f5e",
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
                const visibleEps = showAllEpisodes ? episodes : episodes.slice(0, EPISODES_INITIAL_COUNT);
                const hasMore = episodes.length > EPISODES_INITIAL_COUNT;
                return (
                  <>
                  {visibleEps.map((ep, idx) => {
                    const isEpPlaying = isPlaying && playingEpisode === ep.episodeNumber && playMode !== 'trailer';
                    const isGrid = episodeLayout === 'grid';
                    const isWatched = continueWatching?.some(m => String(m.id) === String(movie.id) && m.savedEpisode === ep.episodeNumber && m.timestamp > 0);
                    const watchedTs = continueWatching?.find(m => String(m.id) === String(movie.id) && m.savedEpisode === ep.episodeNumber)?.timestamp || 0;
                    const isAired = !ep.airDate || new Date(ep.airDate) <= new Date();
                    const playable = SERVERS.length > 0 && isAired;
                    // Upcoming episodes have no TMDB still — fall back to the
                    // series artwork so every card shows an image (grayed out).
                    const epThumb = ep.thumbnailUrl || movie.backdropUrl || movie.posterUrl;
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

                    if (isGrid) {
                      // ── GRID CARD ──
                      return (
                        <motion.div
                          key={ep.id || idx}
                          initial={{ opacity: 0, scale: 0.95, y: 16 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -8 }}
                          transition={{ duration: 0.35, delay: Math.min(idx * 0.04, 0.3), ease: [0.16, 1, 0.3, 1] }}
                          whileHover={{ y: -4, boxShadow: '0 16px 40px -10px rgba(0,0,0,0.7)' }}
                          role={playable ? "button" : undefined}
                          tabIndex={playable ? 0 : undefined}
                          aria-disabled={playable ? undefined : true}
                          aria-label={playable ? `Play ${ep.title}` : undefined}
                          onClick={playEpisode}
                          onKeyDown={playEpKeyboard}
                          style={{
                            background: isEpPlaying ? 'linear-gradient(180deg, rgba(244,63,94,0.1) 0%, #050505 100%)' : '#0a0a0c',
                            borderRadius: '16px', overflow: 'hidden',
                            border: isEpPlaying ? '1px solid rgba(244,63,94,0.4)' : '1px solid rgba(255,255,255,0.05)',
                            cursor: playable ? 'pointer' : 'default', opacity: (!isAired) ? 0.35 : (SERVERS.length > 0 ? 1 : 0.6),
                            position: 'relative',
                            boxShadow: isEpPlaying ? '0 10px 30px -10px rgba(244,63,94,0.15)' : '0 10px 30px -10px rgba(0,0,0,0.5)',
                            transition: 'border 0.3s ease, background 0.3s ease',
                          }}
                        >
                          <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', overflow: 'hidden', background: '#18181b' }}>
                            {epThumb ? (
                              <motion.img
                                src={CdnImageAdapter.getUrl(epThumb, 'w500')}
                                alt={ep.title}
                                whileHover={playable ? { scale: 1.06 } : undefined}
                                transition={{ duration: 0.5 }}
                                loading="lazy"
                                decoding="async"
                                style={{ width: '100%', height: '100%', objectFit: 'cover', filter: !isAired ? 'grayscale(0.85) brightness(0.55)' : undefined }}
                              />
                            ) : (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3f3f46' }}>
                                <Film size={28} strokeWidth={1.5} />
                              </div>
                            )}
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isAired ? (
                                SERVERS.length > 0 ? (
                                  <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                                    <Play size={18} fill="#fff" stroke="none" style={{ marginLeft: '2px' }} />
                                  </div>
                                ) : (
                                  <div style={{ background: 'rgba(0,0,0,0.85)', color: '#a1a1aa', padding: '4px 8px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600, backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.12)' }}>
                                    No stream available
                                  </div>
                                )
                              ) : (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, rgba(251,191,36,0.95), rgba(244,63,94,0.9))', color: '#fff', padding: '6px 12px', borderRadius: '999px', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.02em', backdropFilter: 'blur(6px)', boxShadow: '0 6px 20px rgba(244,63,94,0.4)' }}>
                                  <Calendar size={13} strokeWidth={2.5} aria-hidden="true" />
                                  <span style={{ opacity: 0.9, fontWeight: 700 }}>Airs</span>
                                  {formatAirsDate(ep.airDate)}
                                </div>
                              )}
                            </div>
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 50%)', pointerEvents: 'none' }} />
                            {playable && (
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }} className="ep-play-overlay">
                                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 8px 24px rgba(244,63,94,0.5)' }}>
                                  <Play size={22} fill="currentColor" stroke="none" style={{ marginLeft: '3px' }} />
                                </div>
                              </div>
                            )}
                            {isEpPlaying && <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'var(--accent-gradient)', color: 'white', padding: '3px 8px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', zIndex: 10 }}>Playing</div>}
                            <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', padding: '2px 7px', borderRadius: '5px', fontSize: '0.65rem', fontWeight: 700, border: '1px solid rgba(255,255,255,0.08)' }}>{ep.duration}</div>
                          </div>
                          <div style={{ padding: '0.7rem 0.9rem', position: 'relative', zIndex: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: isEpPlaying ? '#f43f5e' : '#3f3f46', lineHeight: 1, fontFamily: 'monospace' }}>{String(ep.episodeNumber).padStart(2, '0')}</span>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', margin: '0 0 0.35rem' }}>
                                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: isEpPlaying ? '#fff' : '#e4e4e7' }}>{ep.title}</h3>
                                  {ep.voteAverage > 0 && (
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e4e4e7', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                      <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }} title="TMDB Community Score">
                                        <Popcorn size={11} fill="currentColor" stroke="none" aria-hidden="true" />
                                        {ep.voteAverage.toFixed(1)}
                                      </span>
                                    </span>
                                  )}
                                </div>
                                <p style={{ fontSize: '0.8rem', color: '#a1a1aa', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>{ep.description}</p>
                              </div>
                            </div>
                            {isWatched && (
                              <div style={{ marginTop: '0.6rem' }}>
                                <div style={{ height: '3px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${Math.min(100, (watchedTs / (ep.durationMins ? ep.durationMins * 60 : 3600)) * 100)}%`, background: 'linear-gradient(90deg, #f43f5e, #fb923c)', borderRadius: '2px' }} />
                                </div>
                                <span style={{ fontSize: '0.65rem', color: '#71717a', marginTop: '3px', display: 'block' }}>{formatTime(watchedTs)} watched</span>
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
                        role={playable ? "button" : undefined}
                        tabIndex={playable ? 0 : undefined}
                        aria-disabled={playable ? undefined : true}
                        aria-label={playable ? `Play ${ep.title}` : undefined}
                        onClick={playEpisode}
                        onKeyDown={playEpKeyboard}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '1rem',
                          padding: '0.75rem 1rem', borderRadius: '12px',
                          background: isEpPlaying ? 'rgba(244,63,94,0.08)' : 'transparent',
                          border: isEpPlaying ? '1px solid rgba(244,63,94,0.2)' : '1px solid transparent',
                          cursor: playable ? 'pointer' : 'default', opacity: (!isAired) ? 0.35 : (SERVERS.length > 0 ? 1 : 0.6),
                          transition: 'background 0.2s, border 0.2s',
                        }}
                      >
                        {/* Thumbnail */}
                        <div style={{ position: 'relative', width: '140px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', aspectRatio: '16/9', background: '#18181b' }}>
                          {epThumb ? (
                            <img src={CdnImageAdapter.getUrl(epThumb, 'w500')} alt={ep.title} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: !isAired ? 'grayscale(0.85) brightness(0.55)' : undefined }} />
                          ) : (
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3f3f46' }}>
                              <Film size={22} strokeWidth={1.5} />
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
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'linear-gradient(135deg, rgba(251,191,36,0.9), rgba(244,63,94,0.9))', color: '#fff', padding: '3px 9px', borderRadius: '999px', fontSize: '0.64rem', fontWeight: 800, backdropFilter: 'blur(6px)', boxShadow: '0 4px 14px rgba(244,63,94,0.35)' }}>
                                <Calendar size={11} strokeWidth={2.5} aria-hidden="true" />
                                {formatAirsDate(ep.airDate)}
                              </div>
                            )}
                          </div>
                          {isEpPlaying && <div style={{ position: 'absolute', top: '4px', right: '4px', background: '#f43f5e', color: 'white', padding: '1px 5px', borderRadius: '4px', fontSize: '0.5rem', fontWeight: 800, textTransform: 'uppercase' }}>Playing</div>}
                          <div style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', padding: '1px 5px', borderRadius: '4px', fontSize: '0.55rem', fontWeight: 700 }}>{ep.duration}</div>
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isEpPlaying ? '#f43f5e' : '#52525b', fontFamily: 'monospace', flexShrink: 0 }}>E{String(ep.episodeNumber).padStart(2, '0')}</span>
                              <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, color: isEpPlaying ? '#fff' : '#e4e4e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.title}</h3>
                            </div>
                            {ep.voteAverage > 0 && (
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#e4e4e7', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }} title="TMDB Community Score">
                                  <Popcorn size={11} fill="currentColor" stroke="none" aria-hidden="true" />
                                  {ep.voteAverage.toFixed(1)}
                                </span>
                              </span>
                            )}
                          </div>
                          <p style={{ fontSize: '0.78rem', color: '#71717a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.description}</p>
                          {isWatched && (
                            <div style={{ marginTop: '0.4rem' }}>
                              <div style={{ height: '2px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', overflow: 'hidden', maxWidth: '120px' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, (watchedTs / (ep.durationMins ? ep.durationMins * 60 : 3600)) * 100)}%`, background: 'linear-gradient(90deg, #f43f5e, #fb923c)', borderRadius: '2px' }} />
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
                        display: 'flex', justifyContent: 'center', paddingTop: '1rem',
                      }}
                    >
                      <motion.button
                        whileHover={{ scale: 1.03, background: 'rgba(255,255,255,0.1)' }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => setShowAllEpisodes(!showAllEpisodes)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#a1a1aa', padding: '8px 20px', borderRadius: '100px',
                          fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                          letterSpacing: '0.02em', transition: 'all 0.2s',
                        }}
                      >
                        {showAllEpisodes ? 'Show less' : `Show all ${episodes.length} episodes`}
                        <motion.span animate={{ rotate: showAllEpisodes ? 180 : 0 }} transition={{ duration: 0.25 }} style={{ display: 'flex' }}>
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
            className="section-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            Official Trailers
          </motion.h2>
          <div style={{ display: 'flex', gap: '1rem', overflowX: 'auto', paddingBottom: '1rem', scrollbarWidth: 'none' }} className="hide-scrollbar">
            {movie.videos.map((vid) => {
              const rankLabel = classifyTrailer(vid);
              const viewLabel = rankLabel ? rankLabel[0].toUpperCase() + rankLabel.slice(1) : null;
              return (
              <motion.div
                key={vid.key}
                whileHover={{ scale: 1.02 }}
                style={{ flexShrink: 0, width: '280px', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer', background: '#18181b', position: 'relative' }}
                onClick={() => { setIsPlaying(true); setPlayMode('trailer'); setPlayingTrailerKey(vid.key); setPlayingEpisode(null); }}
              >
                <div style={{ position: 'relative', aspectRatio: '16/9' }}>
                  <img src={`https://img.youtube.com/vi/${vid.key}/mqdefault.jpg`} alt={vid.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'rgba(244,63,94,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                      <Play size={18} fill="#fff" stroke="none" style={{ marginLeft: '2px' }} />
                    </div>
                  </div>
                  {viewLabel && (
                    <span style={{ position: 'absolute', top: '8px', left: '8px', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.15)', color: '#fda4af', padding: '3px 8px', borderRadius: '999px' }}>
                      {viewLabel}
                    </span>
                  )}
                </div>
                <div style={{ padding: '0.75rem' }}>
                  <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#e4e4e7', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>{vid.name}</h4>
                </div>
              </motion.div>
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
            className="section-title"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            More Like This
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
              className="movie-grid"

              viewport={{ once: true, margin: "-100px" }}
            >
              {similar.slice(0, visibleCount).map((sim, idx) => (
                <motion.div
                  key={`${sim.id}-${idx}`}
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
          style={{ position: "relative", zIndex: 1, marginTop: "2rem", maxWidth: "1600px", marginLeft: "auto", marginRight: "auto" }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.4 }}
        >
          <motion.h2
            className="section-title"
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
          maxWidth: '1600px', marginLeft: 'auto', marginRight: 'auto',
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
              className="video-modal-header"
              style={{
                position: "relative",
                padding: "1.25rem 2rem",
                display: "flex",
                justifyContent: "space-between",
                background:
                  playMode === "trailer" ? "rgba(0,0,0,0.4)" : "#0a0a0c",
                alignItems: "center",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
                zIndex: 1000,
                backdropFilter: playMode === "trailer" ? "blur(12px)" : "none",
              }}
            >
              <div
                className="video-modal-header__identity"
                style={{ display: "flex", alignItems: "center", gap: "1rem" }}
              >
                <motion.button
                  onClick={() => setIsPlaying(false)}
                  className="video-modal-back-button"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    color: "white",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    padding: "0.5rem 1rem",
                    borderRadius: "100px",
                  }}
                  whileHover={{
                    background: "rgba(255,255,255,0.16)",
                    scale: 1.03,
                  }}
                  whileTap={{ scale: 0.96 }}
                >
                  <ArrowLeft size={18} /> <span className="video-modal-back-label">Back</span>
                </motion.button>
                <h3
                  className="video-modal-title"
                  style={{
                    margin: 0,
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "#e4e4e7",
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
                        background: "rgba(255,255,255,0.1)",
                        border: "none",
                        color: "white",
                        padding: "0.5rem 1rem",
                        borderRadius: "8px",
                        cursor: canGoPrev ? "pointer" : "not-allowed",
                        opacity: canGoPrev ? 1 : 0.4,
                      }}
                      whileHover={canGoPrev ? { scale: 1.04 } : {}}
                      whileTap={canGoPrev ? { scale: 0.95 } : {}}
                    >
                      Prev Ep
                    </motion.button>
                    <motion.button
                      onClick={goToNextEpisode}
                      disabled={!canGoNext}
                      style={{
                        background: "var(--accent-gradient)",
                        border: "none",
                        color: "white",
                        padding: "0.5rem 1.1rem",
                        borderRadius: "8px",
                        cursor: canGoNext ? "pointer" : "not-allowed",
                        fontWeight: 700,
                        opacity: canGoNext ? 1 : 0.4,
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
                background: "#050505",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
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
                    src={`https://www.youtube.com/embed/${playingTrailerKey || movie.trailerUrl || movie.trailer}?autoplay=1&rel=0&modestbranding=1&mute=${muteTrailers ? 1 : 0}`}
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
                  <CustomVideoPlayer
                    movie={movie}
                    season={isTvContent ? selectedSeason : undefined}
                    episode={isTvContent ? playingEpisode : undefined}
                    preferredServerIndex={playingServerIndex}
                    onServerChange={(i) => { serverManuallySetRef.current = true; setPlayingServerIndex(i); }}
                    onClose={() => setIsPlaying(false)}
                    thumbnailUrl={movie.backdropUrl || movie.posterUrl}
                    startTime={effectiveSavedTimestamp}
                    hasNextEpisode={
                      isTvContent && canGoNext
                    }
                    onNextEpisode={goToNextEpisode}
                    onProgressUpdate={(currentTime, duration) => {
                      if (duration > 0 && currentTime > 10) {
                        updateProgress(
                          { ...movie, source: resolvedPlatform, sourceName },
                          selectedSeason,
                          playingEpisode,
                          currentTime,
                        );
                      }
                    }}
                  />
                </ErrorBoundary>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body
      )}
    </div>
  );
}
