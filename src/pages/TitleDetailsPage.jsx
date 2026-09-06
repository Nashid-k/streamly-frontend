import SEO from "../components/SEO";
import MovieDetailsSkeleton from "../components/MovieDetailsSkeleton";
import CastRail from "../components/CastRail";
import RailArrow from "../components/RailArrow";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import Loader from "../components/Loader";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { createPortal } from "react-dom";
import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  Play,
  ArrowLeft,
  Star,
  Clock,
  Calendar,
  Plus,
  Check,
  X,
  MonitorPlay,
  ChevronDown,
  RotateCcw,
  Share2,
  ThumbsUp,
  ThumbsDown,
  Award,
  MapPin,
  Building2,
  DollarSign,
  Tv,
  Film,
  LayoutGrid,
  List,
  ChevronDown as ChevronDownIcon,
} from "lucide-react";
import {
  motion,
  AnimatePresence,
} from "framer-motion";
import { useAppAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast.jsx";
import MovieCard from "../components/MovieCard";
import PlatformIcon from "../components/PlatformIcon";
import { normalizePlatformKey, normalizeMovieSource } from "../api/platformAdapter";
import { buildMovieAddedNotification } from "../utils/notificationEngine";
import { formatTMDBDate, formatTMDBDateFull, getTMDBWeekday } from "../utils/timezone";
import { decodeUrl } from "../utils";
import CustomVideoPlayer from "../components/CustomVideoPlayer";
import ErrorBoundary from "../components/ErrorBoundary";
const EMPTY_ARRAY = [];

import { VideoSourceAdapter } from "../api/videoSourceAdapter";

const SERVERS = VideoSourceAdapter.getServers();

// ─── Animation Variants ───────────────────────────────────────────────────────

// Master page entrance — staggered children
const prefersReducedMotion =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
const pageVariants = prefersReducedMotion
  ? {}
  : {
      hidden: { opacity: 0 },
      show: {
        opacity: 1,
        transition: { staggerChildren: 0.08, delayChildren: 0.1 },
      },
    };

// Slide up from below
const slideUp = {
  hidden: { opacity: 0, y: 32 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 280, damping: 28, mass: 0.8 },
  },
};

// Slide up subtle (for smaller items)
const slideUpSm = {
  hidden: { opacity: 0, y: 18 },
  show: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 320, damping: 30 },
  },
};

// Fade in only
const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.5, ease: "easeOut" } },
};

// ─── SeasonDropdown — custom styled dropdown (no native <select>) ─────────────

function SeasonDropdown({ seasonsCount, selectedSeason, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
            {Array.from({ length: seasonsCount }, (_, i) => i + 1).map(
              (season) => {
                const isSelected = season === selectedSeason;
                return (
                  <motion.button
                    key={season}
                    onClick={() => {
                      onSelect(season);
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
                        season === 1
                          ? "14px 14px 0 0"
                          : season === seasonsCount
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
                    Season {season}
                  </motion.button>
                );
              },
            )}
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
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [playingEpisode, setPlayingEpisode] = useState(1);
  const { isInList, toggleMyList, continueWatching, updateProgress, addNotification } =
    useAppAuth();
  const { toast } = useToast();
  const cwRef = useRef(continueWatching);
  useEffect(() => {
    cwRef.current = continueWatching;
  }, [continueWatching]);

  // Wrap toggleMyList to show toast feedback
  // Fix C2: await adapter call before showing toast to avoid false confirmation on failure
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
            platform: resolvedPlatform ? PlatformAdapter.getName(resolvedPlatform) : (movieObj.availablePlatforms?.[0] || null),
            year: movieObj.releaseYear,
            duration: movieObj.duration,
            imageUrl: movieObj.backdropUrl || movieObj.posterUrl,
            movieId: movieObj.id,
            isSeries: isTvContent,
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
  const [userRating, setUserRating] = useState(() => {
    try { return localStorage.getItem(`rating-${id}`) || null; } catch { return null; }
  });
  useEffect(() => {
    try {
      if (userRating) localStorage.setItem(`rating-${id}`, userRating);
      else localStorage.removeItem(`rating-${id}`);
    } catch {}
  }, [userRating, id]);
  const [showShareToast, setShowShareToast] = useState(false);
  const shareToastTimeoutRef = useRef(null);
  const [episodeLayout, setEpisodeLayout] = useState("grid"); // 'grid' | 'list'
  const [showAllEpisodes, setShowAllEpisodes] = useState(false);
  const EPISODES_INITIAL_COUNT = 8;

  const [playMode, setPlayMode] = useState("movie");
  const [playingServerIndex, setPlayingServerIndex] = useState(0);
  // Trigger loading state when iframe src/key is about to change
  useEffect(() => {
    if (isPlaying) setIframeLoading(true);
  }, [isPlaying, playMode, playingServerIndex, playingEpisode, selectedSeason]);

  /* Pre-warm the Direct-stream backend cache so hitting Play is near-instant.
     Uses the same signature the player calls; a warm cache returns in <1s. */
  useEffect(() => {
    if (!id || isPlaying) return;
    const timer = setTimeout(() => {
      const isSeries = String(id).startsWith("tmdb-tv-");
      const rawId = String(id).replace(/^tmdb-(tv|movie)-/, "");
      const numeric = (rawId.match(/\d+/) || [])[0];
      if (!numeric) return;
      const base = import.meta.env.VITE_STREAM_SERVICE_URL;
      if (!base) return;
      const params = new URLSearchParams({ tmdbId: numeric, type: isSeries ? "tv" : "movie" });
      if (isSeries) {
        const s = selectedSeason ?? 1;
        const e = playingEpisode ?? 1;
        params.set("season", s);
        params.set("episode", e);
      }
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 45000);
      fetch(`${base}/api/stream?${params}`, { signal: ctrl.signal })
        .then(r => r.json())
        .then(() => {})
        .catch(() => {})
        .finally(() => clearTimeout(to));
    }, 1500);
    return () => clearTimeout(timer);
  }, [id, isPlaying, selectedSeason, playingEpisode]);

  const directorRailRef = useRef(null);
  const pageRef = useRef(null);

  const scrollDirector = (dir) => {
    if (directorRailRef.current) {
      directorRailRef.current.scrollBy({
        left: dir === "left" ? -500 : 500,
        behavior: "smooth",
      });
    }
  };

  const { data: rawMovie, isLoading: loading } = useQuery({
    queryKey: ["movie", id],
    queryFn: () => movieService.getMovieDetails(id),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: true,
  });

  // ── SINGLE SOURCE OF TRUTH: normalize platform data from ANY API response ──
  const movie = useMemo(() => rawMovie ? normalizeMovieSource(rawMovie) : rawMovie, [rawMovie]);

  // Resolve the actual platform — now guaranteed to be a canonical key or null
  const effectivePlatform = movie?.source || undefined;
  const serverManuallySetRef = useRef(false);

  // All unique platform keys available for this title (for logo row display)
  const availablePlatformKeys = useMemo(() => {
    const keys = [];
    const seen = new Set();
    // Use the resolved source first
    if (effectivePlatform && !seen.has(effectivePlatform)) {
      seen.add(effectivePlatform);
      keys.push(effectivePlatform);
    }
    // Then add any additional platforms from availablePlatforms
    if (movie?.availablePlatforms?.length) {
      for (const p of movie.availablePlatforms) {
        const key = normalizePlatformKey(p);
        if (key && !seen.has(key)) {
          seen.add(key);
          keys.push(key);
        }
      }
    }
    return keys;
  }, [effectivePlatform, movie?.availablePlatforms]);

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
  const normalizedSeasonCount = isTvContent
    ? Math.max(1, Number(movie?.seasonsCount) || 1)
    : 0;

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
  const isAiring = episodesData?.isAiring || !!movie?.nextEpisode?.releaseDate;
  const hasSeriesEpisodes = isTvContent;

  useEffect(() => {
    if (movie && isTvContent) {
      const saved = cwRef.current.find(
        (m) => String(m.id) === String(movie.id),
      );
      if (saved) {
        setSelectedSeason(saved.savedSeason || 1);
        setPlayingEpisode(saved.savedEpisode || 1);
      }
    }
  }, [movie, isTvContent]);

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
  const sourceName = movie?.sourceName || (resolvedPlatform ? PlatformAdapter.getName(resolvedPlatform) : 'Streaming');

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
  const hasProgress = continueWatching?.some((m) => m.id === movie?.id);
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
    <div
      ref={pageRef}
      style={{
        position: "relative",
        width: "100%",
        marginTop: "-56px",
        paddingTop: 0,
      }}
    >
      <SEO
        title={movie.title}
        description={movie.description}
        image={movie.backdropUrl || movie.posterUrl}
        type="video.movie"
      />

      {/* ── Backdrop ─────────────────────────────────────────────────────────── */}
      <div
        className="details-backdrop"
        style={{
          height: "min(85vh, 900px)",
          overflow: "hidden",
          top: 0,
          left: "50%",
          width: "100vw",
          marginLeft: "-50vw",
          marginTop: 0,
          backgroundImage: backdropSrc ? `url(${backdropOptimized || backdropSrc})` : "none",
          backgroundSize: "cover",
          backgroundPosition: "center top",
        }}
      >

        {/* Deep cinematic base darkening */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.15) 25%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.55) 75%, #050505 100%)",
            pointerEvents: "none",
          }}
        />
        {/* Side vignettes — deep dark edges */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.65) 15%, rgba(0,0,0,0.2) 35%, transparent 50%, rgba(0,0,0,0.2) 65%, rgba(0,0,0,0.65) 85%, rgba(0,0,0,0.97) 100%)",
            pointerEvents: "none",
          }}
        />
        {/* Top fade — navbar blend */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "180px",
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 35%, rgba(0,0,0,0.2) 70%, transparent 100%)",
            pointerEvents: "none",
          }}
        />
        {/* Bottom fade — solid #050505 seam into content */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "60%",
            background:
              "linear-gradient(to top, #050505 0%, #050505 8%, rgba(5,5,5,0.98) 20%, rgba(5,5,5,0.85) 40%, rgba(5,5,5,0.5) 65%, rgba(0,0,0,0.2) 85%, transparent 100%)",
            pointerEvents: "none",
          }}
        />
        {/* Radial vignette — focus center */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 70% 50% at 50% 35%, transparent 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0.7) 100%)",
            pointerEvents: "none",
          }}
        />
      </div>        {/* ── Topbar: Back + Actions ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5, ease: "easeOut" }}
        style={{
          position: "sticky",
          top: 56,
          zIndex: 10,
          paddingTop: "0.75rem",
          paddingBottom: "0.5rem",
          paddingLeft: "clamp(1rem, 2.5vw, 2.5rem)",
          paddingRight: "clamp(1rem, 2.5vw, 2.5rem)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "transparent",
          borderBottom: "none",
        }}
      >
        {/* Left: Breadcrumb + Back */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <button
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate("/");
              }
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: "#d4d4d8",
              fontWeight: 600,
              transition: "all 0.2s ease",
              textTransform: "uppercase",
              fontSize: "0.8rem",
              letterSpacing: "0.05em",
              background: "transparent",
              padding: "8px 14px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
            }}
            className="back-link"
          >
            <ArrowLeft size={18} /> Back
          </button>
          {movie.genres && movie.genres[0] && (
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.8rem", fontWeight: 500, letterSpacing: "0.03em" }}>
              {movie.genres[0]} / {isTvContent ? "Series" : "Movie"}
            </span>
          )}
        </div>
        {/* Right: Share + Like/Dislike */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <motion.button
            whileHover={{ scale: 1.1, background: "rgba(255,255,255,0.15)" }}
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: movie.title, url: window.location.href });
              } else {
                navigator.clipboard?.writeText(window.location.href);
                setShowShareToast(true);
                if (shareToastTimeoutRef.current) clearTimeout(shareToastTimeoutRef.current);
                shareToastTimeoutRef.current = setTimeout(() => setShowShareToast(false), 2000);
              }
            }}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255,255,255,0.5)",
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
            title="Share"
          >
            <Share2 size={16} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.85 }}
            onClick={() => setUserRating(userRating === 'like' ? null : 'like')}
            style={{
              background: userRating === 'like' ? 'rgba(74,222,128,0.12)' : 'transparent',
              border: 'none',
              color: userRating === 'like' ? '#4ade80' : 'rgba(255,255,255,0.5)',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            title="Like"
          >
            <ThumbsUp size={16} fill={userRating === 'like' ? '#4ade80' : 'none'} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.85 }}
            onClick={() => setUserRating(userRating === 'dislike' ? null : 'dislike')}
            style={{
              background: userRating === 'dislike' ? 'rgba(248,113,113,0.12)' : 'transparent',
              border: 'none',
              color: userRating === 'dislike' ? '#f87171' : 'rgba(255,255,255,0.5)',
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
              transition: 'all 0.2s',
            }}
            title="Dislike"
          >
            <ThumbsDown size={16} fill={userRating === 'dislike' ? '#f87171' : 'none'} />
          </motion.button>
        </div>
      </motion.div>
      {/* Share toast */}
      <AnimatePresence>
        {showShareToast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed', top: '80px', left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(5,5,5,0.95)', border: '1px solid rgba(255,255,255,0.15)',
              padding: '10px 24px', borderRadius: '100px', color: '#fff', fontSize: '0.85rem',
              fontWeight: 600, zIndex: 99999, backdropFilter: 'blur(16px)',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
            }}
          >
            Link copied to clipboard
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Main Content Block ────────────────────────────────────────────────── */}
      <motion.div
        className="details-content-wrapper"
        variants={pageVariants}
        initial="hidden"
        animate="show"
      >
        {/* Poster */}
        <motion.div
          key="poster"
          variants={slideUp}
          style={{ position: "relative", flexShrink: 0 }}
        >
          <div
            style={{
              position: "absolute",
              inset: "-15%",
              background: `url(${movie.posterUrl})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(60px) brightness(0.4) saturate(1.2)",
              zIndex: -1,
              borderRadius: "50%",
              opacity: 0.7,
            }}
          />
          <motion.img
            src={movie.posterUrl}
            alt={movie.title}
            className="details-poster-large"
            whileHover={{
              scale: 1.04,
              y: -8,
              boxShadow: "0 50px 100px -20px rgba(0,0,0,0.98)",
            }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            onError={(e) => {
              e.currentTarget.style.opacity = "0";
            }}
          />
        </motion.div>

        {/* Text content */}
        <motion.div
          className="details-text"
          layout
          style={{
            display: "flex",
            flexDirection: "column",
            width: "100%",
            alignItems: "stretch",
            gap: "0",
            paddingTop: 0,
            transition: "padding-top 0.7s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <motion.div
            layout
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
            }}
          >
            {/* Platform tag */}
            <motion.div
              variants={fadeIn}
              initial="hidden"
              animate="show"
            >
              {movie.nextEpisode && movie.nextEpisode.releaseDate && (
                <motion.div
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{
                    delay: 0.3,
                    duration: 0.4,
                    ease: "easeOut",
                  }}
                  style={{
                    marginBottom: "1.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <span
                    style={{
                      background: resolvedPlatform ? PlatformAdapter.getColor(resolvedPlatform) : 'var(--accent-gradient)',
                      color: "white",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "0.75rem",
                      fontWeight: 800,
                      letterSpacing: "0.05em",
                      animation: "pulse 2s infinite",
                    }}
                  >
                    LIVE SEASON
                  </span>
                  <span
                    style={{
                      color: "#d4d4d8",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                    }}
                  >
                    New Episode Airs on{" "}
                    {formatTMDBDate(movie.nextEpisode.releaseDate, { weekday: 'long', month: 'short', day: 'numeric' }, undefined, effectivePlatform)}
                  </span>
                </motion.div>
              )}
            </motion.div>

            {/* Logo / Title */}
            <motion.div
              layout
              style={{
                marginBottom: "1.5rem",
                minHeight: "80px",
                display: "flex",
                alignItems: "center",
              }}
              variants={slideUp}
            >
              {movie.logoUrl ? (
                <motion.img
                  src={movie.logoUrl}
                  alt={movie.title}
                  style={{
                    maxWidth: "400px",
                    maxHeight: "140px",
                    objectFit: "contain",
                    filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.7))",
                  }}
                  initial={{
                    opacity: 0,
                    y: 20,
                    filter: "drop-shadow(0 6px 16px rgba(0,0,0,0)) blur(4px)",
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.7)) blur(0px)",
                  }}
                  transition={{
                    delay: 0.25,
                    duration: 0.7,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                  style={{ position: 'relative', maxWidth: '500px' }}
                >
                  <h1
                    style={{
                      fontSize: 'clamp(2.2rem, 3.5vw, 3.8rem)',
                      fontWeight: 800,
                      letterSpacing: '-0.03em',
                      margin: 0,
                      lineHeight: 1.1,
                      background: 'linear-gradient(135deg, #fff 0%, #a1a1aa 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      textShadow: 'none',
                    }}
                  >
                    {movie.title}
                  </h1>
                  {movie.releaseYear && (
                    <span style={{
                      display: 'inline-block',
                      marginTop: '0.5rem',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: '#52525b',
                      padding: '3px 10px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>{movie.releaseYear} · {movie.isSeries ? 'Series' : 'Movie'}</span>
                  )}
                </motion.div>
              )}
            </motion.div>

            {/* Meta + genres + description */}
            <motion.div
              variants={slideUp}
              initial="hidden"
              animate="show"
            >
              {/* Platform + Quality badges */}
              <motion.div
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.18, duration: 0.4, ease: "easeOut" }}
                style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}
              >
                {movie.isInTheaters ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, rgba(251,191,36,0.12), rgba(251,191,36,0.04))', padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(251,191,36,0.2)' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24' }}>🎬 In Theaters</span>
                    </div>
                    {movie.expectedOttDate ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(96,165,250,0.08)', padding: '5px 12px', borderRadius: '8px', border: '1px solid rgba(96,165,250,0.15)' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#93c5fd' }}>Expected on OTT: {formatTMDBDateFull(movie.expectedOttDate, undefined, effectivePlatform)}</span>
                      </div>
                    ) : movie.availablePlatforms?.length > 0 ? (
                      <PlatformIcon platform={resolvedPlatform} pill />
                    ) : (
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#a1a1aa', padding: '5px 12px', borderRadius: '100px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.06)' }}>Not yet streaming</span>
                    )}
                  </>
                ) : (
                  <PlatformIcon platform={resolvedPlatform} pill />
                )}
              </motion.div>

              {/* IMDb prominent badge + Meta pills */}
              <motion.div
                className="details-meta"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "0.75rem",
                  marginBottom: "1.75rem",
                  fontSize: "0.92rem",
                  fontWeight: 600,
                  color: "#a1a1aa",
                }}
                variants={{
                  show: { transition: { staggerChildren: 0.06 } },
                }}
                initial="hidden"
                animate="show"
              >
                {/* IMDb prominent badge */}
                {movie.imdbRating > 0 && (
                  <motion.div
                    variants={slideUpSm}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      background: 'linear-gradient(135deg, rgba(251,191,36,0.15), rgba(251,191,36,0.05))',
                      padding: '6px 14px', borderRadius: '10px',
                      border: '1px solid rgba(251,191,36,0.2)',
                    }}
                  >
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#000', background: '#fbbf24', padding: '2px 6px', borderRadius: '4px', letterSpacing: '0.03em' }}>IMDb</span>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fbbf24' }}>{movie.imdbRating}</span>
                    <span style={{ fontSize: '0.7rem', color: '#a1a1aa' }}>/10</span>
                  </motion.div>
                )}
                {[
                  {
                    icon: <Calendar size={15} />,
                    label:
                      movie.isUpcoming && movie.releaseDate
                        ? formatTMDBDateFull(movie.releaseDate, undefined, effectivePlatform)
                        : movie.releaseYear,
                    bg: "rgba(255,255,255,0.06)",
                  },
                  {
                    icon: <Clock size={15} />,
                    label:
                      movie.duration ||
                      (isTvContent ? "Series" : "Movie"),
                    bg: "rgba(255,255,255,0.06)",
                  },
                  {
                    icon: <Star size={15} fill="#fbbf24" color="#fbbf24" />,
                    label: movie.maturityRating || "PG",
                    bg: "rgba(251,191,36,0.08)",
                    color: "#fbbf24",
                  },
                  ...(movie.matchScore
                    ? [
                        {
                          label: `${movie.matchScore}% Match`,
                          bg: "rgba(74,222,128,0.1)",
                          color: "#4ade80",
                        },
                      ]
                    : []),
                ].map((item, i) => (
                  <motion.span
                    key={i}
                    variants={slideUpSm}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      background: item.bg || "rgba(255,255,255,0.06)",
                      padding: "5px 11px",
                      borderRadius: "8px",
                      color: item.color || "#a1a1aa",
                      border: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    {item.icon} {item.label}
                  </motion.span>
                ))}
              </motion.div>

              {/* Genre tags */}
              <motion.div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginBottom: "1.75rem",
                }}
                variants={{
                  show: { transition: { staggerChildren: 0.05 } },
                }}
                initial="hidden"
                animate="show"
              >
                {(movie.genres || []).map((genre) => (
                  <motion.div
                    key={genre}
                    variants={slideUpSm}
                    whileHover={{ scale: 1.05 }}
                  >
                    <Link
                      to={`/genre/${encodeURIComponent(genre)}`}
                      style={{
                        background: "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        padding: "5px 14px",
                        borderRadius: "100px",
                        fontSize: "0.8rem",
                        color: "#d4d4d8",
                        letterSpacing: "0.03em",
                        cursor: "pointer",
                        transition: "all 0.2s",
                        textDecoration: "none",
                        display: "inline-block",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background =
                          "rgba(255,255,255,0.12)";
                        e.currentTarget.style.borderColor =
                          "rgba(255,255,255,0.3)";
                        e.currentTarget.style.color = "#fff";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background =
                          "rgba(255,255,255,0.06)";
                        e.currentTarget.style.borderColor =
                          "rgba(255,255,255,0.1)";
                        e.currentTarget.style.color = "#d4d4d8";
                      }}
                    >
                      {genre}
                    </Link>
                  </motion.div>
                ))}
              </motion.div>

              {/* Description */}
              <motion.p
                className="details-overview"
                style={{
                  fontSize: "1.05rem",
                  lineHeight: 1.85,
                  color: "#d4d4d8",
                  letterSpacing: "0.01em",
                  marginBottom: "1.5rem",
                  width: "100%",
                  paddingRight: "2rem",
                }}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.6, ease: "easeOut" }}
              >
                {movie.longDescription || movie.description}
              </motion.p>

              {(movie.tags?.length || movie.audioLanguages?.length || movie.subtitleLanguages?.length) && (
                <div className="detail-tag-list" style={{ marginBottom: '1.5rem' }}>
                  {[
                    ...(movie.tags || []).slice(0, 6),
                    ...(movie.audioLanguages || []).slice(0, 3),
                    ...(movie.subtitleLanguages || []).slice(0, 3),
                  ]
                    .filter(Boolean)
                    .slice(0, 12)
                    .map((tag) => (
                      <span key={tag} className="detail-tag">
                        {tag}
                      </span>
                    ))}
                </div>
              )}


              {/* Info grid: Director, Writers, Budget, Revenue, Locations, Studios */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.5 }}
                style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}
              >
                {movie.director && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 700 }}>Director</div>
                    <div style={{ fontSize: '0.85rem', color: '#e4e4e7', fontWeight: 500 }}>{movie.director}</div>
                  </div>
                )}
                {movie.writers && movie.writers.length > 0 && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 700 }}>Writers</div>
                    <div style={{ fontSize: '0.85rem', color: '#e4e4e7', fontWeight: 500 }}>{movie.writers.slice(0, 2).join(', ')}</div>
                  </div>
                )}
                {movie.budget && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 700 }}><DollarSign size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> Budget</div>
                    <div style={{ fontSize: '0.85rem', color: '#e4e4e7', fontWeight: 500 }}>${(movie.budget / 1_000_000).toFixed(0)}M</div>
                  </div>
                )}
                {movie.revenue && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 700 }}><DollarSign size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> Revenue</div>
                    <div style={{ fontSize: '0.85rem', color: '#4ade80', fontWeight: 500 }}>${(movie.revenue / 1_000_000).toFixed(0)}M</div>
                  </div>
                )}
                {movie.filmingLocations && movie.filmingLocations.length > 0 && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 700 }}><MapPin size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> Filmed in</div>
                    <div style={{ fontSize: '0.85rem', color: '#e4e4e7', fontWeight: 500 }}>{movie.filmingLocations[0]}</div>
                  </div>
                )}
                {movie.productionCompanies && movie.productionCompanies.length > 0 && (
                  <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '10px', padding: '12px 14px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 700 }}><Building2 size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> Studio</div>
                    <div style={{ fontSize: '0.85rem', color: '#e4e4e7', fontWeight: 500 }}>{movie.productionCompanies[0]}</div>
                  </div>
                )}
                {movie.awards && (
                  <div style={{ background: 'rgba(251,191,36,0.05)', borderRadius: '10px', padding: '12px 14px', border: '1px solid rgba(251,191,36,0.1)' }}>
                    <div style={{ fontSize: '0.65rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px', fontWeight: 700 }}><Award size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> Awards</div>
                    <div style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 500, lineHeight: 1.4 }}>{movie.awards}</div>
                  </div>
                )}
              </motion.div>


            </motion.div>

            {/* CTA Buttons */}
            <motion.div
              layout
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.85rem",
                marginTop: "0.75rem",
                marginBottom: "3.5rem",
                alignItems: "center",
              }}
              variants={{ show: { transition: { staggerChildren: 0.08 } } }}
              initial="hidden"
              animate="show"
            >
              {[
                ...(movie.isUpcoming || movie.isInTheaters || SERVERS.length === 0
                  ? []
                  : [
                      {
                        cls: `btn btn-primary${!hasProgress ? " btn-cta-pulse" : ""}`,
                        style: {
                          fontSize: "clamp(0.9rem, 1vw, 1.06rem)",
                          padding: "clamp(0.8rem, 1.4vw, 1.12rem) clamp(1.2rem, 2.8vw, 2.05rem)",
                        },
                        onClick: () => {
                          setPlayMode("movie");
                          setIsPlaying(true);
                          if (progressItem && progressItem.timestamp > 0) {
                            if (isTvContent) {
                              setSelectedSeason(progressItem.savedSeason || 1);
                              setPlayingEpisode(progressItem.savedEpisode || 1);
                            }
                          } else {
                            setPlayingEpisode(1);
                            if (isTvContent) setSelectedSeason(1);
                            updateProgress(
                              {
                                ...movie,
                                source: resolvedPlatform,
                                sourceName,
                              },
                              isTvContent ? 1 : null,
                              isTvContent ? 1 : null,
                               0,
                             );
                           }
                         },
                         children: (
                           <>
                             <Play size={20} fill="currentColor" stroke="none" />{" "}
                            {savedTimestamp > 0
                              ? `Continue (${formatTime(savedTimestamp)})`
                              : "Play Now"}
                          </>
                        ),
                      },
                      ...(savedTimestamp > 0
                        ? [
                            {
                              cls: "btn",
                              style: {
                                fontSize: "clamp(0.9rem, 1vw, 1.06rem)",
                                padding: "clamp(0.8rem, 1.4vw, 1.12rem) clamp(1.2rem, 2.8vw, 2.05rem)",
                                background: "rgba(255,255,255,0.1)",
                                color: "#fff",
                              },
                              onClick: () => {
                                setPlayMode("movie");
                                setIsPlaying(true);
                                setPlayingEpisode(1);
                                if (isTvContent) setSelectedSeason(1);
                                updateProgress(
                                  {
                                    ...movie,
                                    source: resolvedPlatform,
                                    sourceName,
                                  },
                                  isTvContent ? 1 : null,
                                   isTvContent ? 1 : null,
                                   0,
                                 );
                               },
                               children: (
                                 <>
                                   <RotateCcw size={20} /> Start Over
                                 </>
                               ),
                            },
                          ]
                        : []),
                    ]),
                ...((movie.isUpcoming || movie.isInTheaters) && movie.trailerUrl
                  ? [
                      {
                        cls: "btn btn-primary",
                        style: {
                          fontSize: "clamp(0.9rem, 1vw, 1.06rem)",
                          padding: "clamp(0.8rem, 1.4vw, 1.12rem) clamp(1.2rem, 2.8vw, 2.05rem)",
                        },
                        onClick: () => {
                          setPlayMode("trailer");
                          setIsPlaying(true);
                        },
                        children: (
                          <>
                            <Play size={20} fill="currentColor" stroke="none" />{" "}
                            Watch Trailer
                          </>
                        ),
                      },
                    ]
                  : []),
                {
                  cls: "btn btn-glass",
                  style: {
                    fontSize: "clamp(0.9rem, 1vw, 1.06rem)",
                    padding: "clamp(0.8rem, 1.4vw, 1.12rem) clamp(1.2rem, 2.8vw, 2.05rem)",
                  },
                  onClick: () => handleToggleMyList(movie),
                  children: (
                    <>
                      {isInList(movie.id) ? (
                        <Check size={20} color="#4ade80" />
                      ) : (
                        <Plus size={20} />
                      )}{" "}
                      {isInList(movie.id) ? "Added" : "My List"}
                    </>
                  ),
                },
                ...(!movie.isUpcoming && !movie.isInTheaters && movie.trailerUrl
                  ? [
                      {
                        cls: "btn btn-trailer",
                        style: {
                          fontSize: "clamp(0.9rem, 1vw, 1.06rem)",
                          padding: "clamp(0.8rem, 1.4vw, 1.12rem) clamp(1.2rem, 2.8vw, 2.05rem)",
                        },
                        onClick: () => {
                          setPlayMode("trailer");
                          setIsPlaying(true);
                        },
                        children: <>Watch Trailer</>,
                      },
                    ]
                  : []),
              ].map((btn, i) => (
                <motion.button
                  key={i}
                  variants={slideUpSm}
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ type: "spring", stiffness: 380, damping: 22 }}
                  className={`${btn.cls} btn-animate-in`}
                  style={btn.style}
                  onClick={btn.onClick}
                >
                  {btn.children}
                </motion.button>
              ))}
            </motion.div>
          </motion.div>

          {/* Cast */}
          <motion.div
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "2rem",
              borderTop: "1px solid rgba(255,255,255,0.07)",
              paddingTop: "2rem",
              width: "100%",
            }}
          >
            <motion.div variants={fadeIn}>
              {isTvContent && normalizedSeasonCount > 0 && (
                <motion.div variants={slideUpSm}>
                  <h3
                    style={{
                      fontSize: "0.8rem",
                      color: "#52525b",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      marginBottom: "0.6rem",
                    }}
                  >
                    Series Info
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      fontWeight: 500,
                      color: "#e4e4e7",
                      fontSize: "1rem",
                    }}
                  >
                  {normalizedSeasonCount} Season
                    {normalizedSeasonCount > 1 ? "s" : ""}
                  </p>
                </motion.div>
              )}
            </motion.div>
            {movie.cast && movie.cast.length > 0 && (
              <div style={{ minWidth: 0 }}>
                <CastRail cast={movie.cast} />
              </div>
            )}
          </motion.div>
        </motion.div>
      </motion.div>

      {/* ── Episodes ─────────────────────────────────────────────────────────── */}
      {isTvContent && hasSeriesEpisodes && (
        <motion.section
          style={{ position: "relative", zIndex: 1, marginTop: "1.5rem", paddingLeft: "1rem", paddingRight: "1rem", maxWidth: "1600px", marginLeft: "auto", marginRight: "auto" }}
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
              {isAiring && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '10px', fontSize: '0.65rem', fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #ef4444, #dc2626)', padding: '3px 12px', borderRadius: '100px', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff', animation: 'pulse 2s infinite' }} />
                  {movie?.nextEpisode?.releaseDate
                    ? `New episode ${getTMDBWeekday(movie.nextEpisode.releaseDate, undefined, effectivePlatform)}`
                    : 'Airing now'}
                </span>
              )}
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
              seasonsCount={normalizedSeasonCount}
              selectedSeason={selectedSeason}
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
                    onClick={() => setSelectedSeason(selectedSeason < normalizedSeasonCount ? selectedSeason + 1 : 1)}
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
                          onClick={() => { if (SERVERS.length > 0) { setIsPlaying(true); setPlayingEpisode(ep.episodeNumber); updateProgress({ ...movie, source: resolvedPlatform, sourceName }, selectedSeason, ep.episodeNumber); } }}
                          style={{
                            background: isEpPlaying ? 'linear-gradient(180deg, rgba(244,63,94,0.1) 0%, #050505 100%)' : '#0a0a0c',
                            borderRadius: '16px', overflow: 'hidden',
                            border: isEpPlaying ? '1px solid rgba(244,63,94,0.4)' : '1px solid rgba(255,255,255,0.05)',
                            cursor: SERVERS.length > 0 ? 'pointer' : 'default', opacity: SERVERS.length > 0 ? 1 : 0.6,
                            position: 'relative',
                            boxShadow: isEpPlaying ? '0 10px 30px -10px rgba(244,63,94,0.15)' : '0 10px 30px -10px rgba(0,0,0,0.5)',
                            transition: 'border 0.3s ease, background 0.3s ease',
                          }}
                        >
                          <div style={{ position: 'relative', aspectRatio: '16/9', background: '#18181b', overflow: 'hidden' }}>
                            {ep.thumbnailUrl && (
                              <motion.img src={ep.thumbnailUrl} alt={ep.title} whileHover={{ scale: 1.06 }} transition={{ duration: 0.5 }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />
                            )}
                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 50%)', pointerEvents: 'none' }} />
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }} className="ep-play-overlay">
                              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: '0 8px 24px rgba(244,63,94,0.5)' }}>
                                <Play size={22} fill="currentColor" stroke="none" style={{ marginLeft: '3px' }} />
                              </div>
                            </div>
                            {isEpPlaying && <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'var(--accent-gradient)', color: 'white', padding: '3px 8px', borderRadius: '6px', fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', zIndex: 10 }}>Playing</div>}
                            <div style={{ position: 'absolute', bottom: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', padding: '2px 7px', borderRadius: '5px', fontSize: '0.65rem', fontWeight: 700, border: '1px solid rgba(255,255,255,0.08)' }}>{ep.duration}</div>
                          </div>
                          <div style={{ padding: '0.7rem 0.9rem', position: 'relative', zIndex: 2 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                              <span style={{ fontSize: '1.2rem', fontWeight: 800, color: isEpPlaying ? '#f43f5e' : '#3f3f46', lineHeight: 1, fontFamily: 'monospace' }}>{String(ep.episodeNumber).padStart(2, '0')}</span>
                              <div style={{ flex: 1 }}>
                                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: '0 0 0.35rem', color: isEpPlaying ? '#fff' : '#e4e4e7' }}>{ep.title}</h3>
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
                        onClick={() => { if (SERVERS.length > 0) { setIsPlaying(true); setPlayingEpisode(ep.episodeNumber); updateProgress({ ...movie, source: resolvedPlatform, sourceName }, selectedSeason, ep.episodeNumber); } }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '1rem',
                          padding: '0.75rem 1rem', borderRadius: '12px',
                          background: isEpPlaying ? 'rgba(244,63,94,0.08)' : 'transparent',
                          border: isEpPlaying ? '1px solid rgba(244,63,94,0.2)' : '1px solid transparent',
                          cursor: SERVERS.length > 0 ? 'pointer' : 'default',
                          transition: 'background 0.2s, border 0.2s',
                        }}
                      >
                        {/* Thumbnail */}
                        <div style={{ position: 'relative', width: '140px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', aspectRatio: '16/9', background: '#18181b' }}>
                          {ep.thumbnailUrl && <img src={ep.thumbnailUrl} alt={ep.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} loading="lazy" decoding="async" />}
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Play size={14} fill="#fff" stroke="none" style={{ marginLeft: '2px' }} />
                            </div>
                          </div>
                          {isEpPlaying && <div style={{ position: 'absolute', top: '4px', right: '4px', background: '#f43f5e', color: 'white', padding: '1px 5px', borderRadius: '4px', fontSize: '0.5rem', fontWeight: 800, textTransform: 'uppercase' }}>Playing</div>}
                          <div style={{ position: 'absolute', bottom: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', padding: '1px 5px', borderRadius: '4px', fontSize: '0.55rem', fontWeight: 700 }}>{ep.duration}</div>
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.25rem' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: isEpPlaying ? '#f43f5e' : '#52525b', fontFamily: 'monospace' }}>E{String(ep.episodeNumber).padStart(2, '0')}</span>
                            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, margin: 0, color: isEpPlaying ? '#fff' : '#e4e4e7', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ep.title}</h3>
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

      {/* ── More Like This ────────────────────────────────────────────────────── */}
      {(loading || (similar && similar.length > 0)) && (
        <motion.section
          style={{ position: "relative", zIndex: 1, marginTop: "2rem", paddingLeft: "1rem", paddingRight: "1rem", maxWidth: "1600px", marginLeft: "auto", marginRight: "auto" }}
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
                    movie={normalizeMovieSource({ ...sim, source: sim.source || resolvedPlatform })}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </motion.section>
      )}

      {/* ── More from Director ──────────────────────────────────────────────── */}
      {movie.director && similar.some(s => s.director && s.director === movie.director) && (
        <motion.section
          style={{ position: "relative", zIndex: 1, marginTop: "2rem", paddingLeft: "1rem", paddingRight: "1rem", maxWidth: "1600px", marginLeft: "auto", marginRight: "auto" }}
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
                gap: "1rem",
                overflowX: "auto",
                padding: "1rem",
                scrollbarWidth: "none",
              }}
              ref={directorRailRef}
            >
              <RailArrow dir="left" onClick={() => scrollDirector("left")} />
              <RailArrow dir="right" onClick={() => scrollDirector("right")} />
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
              <strong style={{ color: '#fbbf24' }}>{movie.imdbRating}</strong> on IMDb
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
        {availablePlatformKeys.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>Available on</span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
              {availablePlatformKeys.map((key) => (
                <div
                  key={key}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '3px 6px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '6px',
                  }}
                >
                  <PlatformIcon platform={key} small />
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Video Player Overlay (portal to body for z-index above navbar) ── */}
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
                style={{ display: "flex", alignItems: "center", gap: "1rem" }}
              >
                <motion.button
                  onClick={() => setIsPlaying(false)}
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
                  <ArrowLeft size={18} /> Back
                </motion.button>
                <h3
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
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  alignItems: "center",
                }}
              >
                {isTvContent && playMode !== "trailer" && (
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginRight: "0.75rem",
                    }}
                  >
                    <motion.button
                      onClick={() => {
                        if (playingEpisode > 1) {
                          setPlayingEpisode((prev) => prev - 1);
                        }
                      }}
                      disabled={playingEpisode <= 1}
                      style={{
                        background: "rgba(255,255,255,0.1)",
                        border: "none",
                        color: "white",
                        padding: "0.5rem 1rem",
                        borderRadius: "8px",
                        cursor: playingEpisode <= 1 ? "not-allowed" : "pointer",
                        opacity: playingEpisode <= 1 ? 0.4 : 1,
                      }}
                      whileHover={playingEpisode > 1 ? { scale: 1.04 } : {}}
                      whileTap={playingEpisode > 1 ? { scale: 0.95 } : {}}
                    >
                      Prev Ep
                    </motion.button>
                    <motion.button
                      onClick={() => {
                        if (playingEpisode < episodes.length) {
                          setPlayingEpisode((prev) => prev + 1);
                        }
                      }}
                      disabled={playingEpisode >= episodes.length}
                      style={{
                        background: "var(--accent-gradient)",
                        border: "none",
                        color: "white",
                        padding: "0.5rem 1.1rem",
                        borderRadius: "8px",
                        cursor:
                          playingEpisode >= episodes.length
                            ? "not-allowed"
                            : "pointer",
                        fontWeight: 700,
                        opacity: playingEpisode >= episodes.length ? 0.4 : 1,
                      }}
                      whileHover={
                        playingEpisode < episodes.length
                          ? { scale: 1.05, background: "#ff0a16" }
                          : {}
                      }
                      whileTap={
                        playingEpisode < episodes.length ? { scale: 0.95 } : {}
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
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: -1,
                      }}
                    >
                      <Loader variant="inline" size="40px" />
                      <span
                        style={{
                          marginTop: "1rem",
                          color: "#a1a1aa",
                          fontSize: "0.9rem",
                          fontWeight: 500,
                        }}
                      >
                        Loading trailer...
                      </span>
                    </div>
                  )}
                  <iframe
                    src={decodeUrl(movie.trailerUrl)}
                    onLoad={() => setIframeLoading(false)}
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
                      isTvContent && playingEpisode < episodes.length
                    }
                    onNextEpisode={() => {
                      if (playingEpisode < episodes.length) {
                        setPlayingEpisode((prev) => prev + 1);
                      }
                    }}
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
