import SEO from "../components/SEO";
import slugify from "slugify";
import ErrorBoundary from "../components/ErrorBoundary";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { Play, ChevronLeft, ChevronRight, Check, Plus } from "lucide-react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
} from "framer-motion";
import { useAppAuth } from "../context/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import MovieCard from "../components/MovieCard";
import PlatformIcon from "../components/PlatformIcon";
import RailArrow from "../components/RailArrow";
import { PLATFORMS, normalizePlatformKey, normalizeMovieSource } from "../api/platformAdapter";
import LeavingSoonBanner from "../components/LeavingSoonBanner";
import { detectLeavingSoon, buildUpcoming } from "../utils/releaseCalendar";

const GENRE_OPTIONS = [
  "All",
  "Malayalam",
  "Tamil",
  "Hindi",
  "Action",
  "Drama",
  "Comedy",
  "Thriller",
  "Horror",
  "Sci-Fi",
  "Romance",
  "Animation",
  "Crime",
  "Mystery",
  "Adventure",
  "Fantasy",
];

// ... (skipping MovieRail and Top10Rail for brevity, they remain unchanged)
const FadeInSection = ({ children, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0, y: 30 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, margin: "-50px" }}
    transition={{ duration: 0.6, delay, ease: "easeOut" }}
  >
    {children}
  </motion.div>
);

const MovieRail = React.memo(
  function MovieRail({ category, railIndex: _railIndex = 0 }) {
    const railRef = useRef(null);
    const containerRef = useRef(null);
    // Windowing: render the rail's cards only while it is near the viewport.
    // Rails scrolled far away unmount (releasing their DOM + decoded images),
    // keeping total Home memory bounded no matter how long the page is.
    const [inView, setInView] = useState(false);
    const scrollPosRef = useRef(0);
    const isDynamicRail =
      category.name === "Continue Watching" ||
      category.name === "My List" ||
      category.name === "Upcoming" ||
      category.name === "Upcoming Movies" ||
      category.name === "Upcoming TV Shows" ||
      category.name === "Upcoming Anime" ||
      category.name === "Releases This Month" ||
      category.name === "Coming This Month" ||
      category.name.startsWith("Because you watched");

    useEffect(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          const visible = entry.isIntersecting;
          // Keep the horizontal scroll position across unmount/remount cycles
          if (!visible && railRef.current) {
            scrollPosRef.current = railRef.current.scrollLeft;
          }
          setInView(visible);
        },
        // Generous band (±2200px) so remounting happens well before the rail
        // is actually on screen — no visible pop-in while scrolling.
        { rootMargin: "2200px 0px 2200px 0px" },
      );
      if (containerRef.current) {
        observer.observe(containerRef.current);
      }
      return () => observer.disconnect();
    }, []);

    // Restore horizontal position after the rail is windowed back in
    useEffect(() => {
      if (inView && railRef.current && scrollPosRef.current > 0) {
        railRef.current.scrollLeft = scrollPosRef.current;
      }
    }, [inView]);

    const [visibleCount, setVisibleCount] = useState(15);
    const inThrottle = useRef(false);
    const throttleTimeoutRef = useRef(null);

    useEffect(() => {
      setVisibleCount(15);
      if (railRef.current) {
        railRef.current.scrollLeft = 0;
      }
    }, [category.name]);

    const handleScroll = (e) => {
      if (inThrottle.current) return;
      const { scrollLeft, clientWidth, scrollWidth } = e.target;
      if (scrollLeft + clientWidth >= scrollWidth - 400) {
        setVisibleCount((prev) =>
          prev >= category.movies.length
            ? prev
            : Math.min(prev + 10, category.movies.length),
        );
      }
      inThrottle.current = true;
      if (throttleTimeoutRef.current) clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = setTimeout(() => (inThrottle.current = false), 150);
    };

    const scroll = (dir) => {
      if (railRef.current) {
        const clientWidth = railRef.current.clientWidth;
        const scrollAmount =
          clientWidth > 800 ? clientWidth * 0.8 : clientWidth * 0.9;
        railRef.current.scrollBy({
          left: dir === "left" ? -scrollAmount : scrollAmount,
          behavior: "smooth",
        });
      }
    };

    if (!category?.movies || category.movies.length === 0) return null;

    return (
      <div
        ref={containerRef}
        className="movie-rail-wrapper"
        style={{ position: "relative" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "0.25rem",
            paddingLeft: "0.25rem",
          }}
        >
          <h3
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              margin: 0,
              letterSpacing: "-0.02em",
              color: "rgba(255,255,255,0.9)",
            }}
          >
            {category.name}
          </h3>
          {!isDynamicRail && (
            <Link
              to={`/category/${encodeURIComponent(category.name)}`}
              state={{ movies: category.movies, name: category.name }}
              style={{
                fontSize: "0.72rem",
                color: "rgba(255,255,255,0.35)",
                textDecoration: "none",
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: "4px",
                border: "none",
                transition: "color 0.2s",
                background: "transparent",
              }}
            >
              Show all ›
            </Link>
          )}
        </div>

        {inView && (
          <>
            <RailArrow dir="left" onClick={() => scroll("left")} />
            <RailArrow dir="right" onClick={() => scroll("right")} />

            <div
              ref={railRef}
              className="movie-rail"
              onScroll={handleScroll}
              style={{
                display: "flex",
                gap: "0.5rem",
                WebkitOverflowScrolling: "touch",
                overscrollBehaviorX: "contain",
                overflowX: "auto",
                scrollbarWidth: "none",
                padding: "0.25rem 1.4rem",
              }}
            >
              {(Array.isArray(category.movies) ? category.movies : []).slice(0, visibleCount).map((movie, i) => (
                <motion.div
                  key={`${movie.id}-${i}`}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10px" }}
                  transition={{
                    duration: 0.35,
                    delay: Math.min((i % 10) * 0.03, 0.15),
                    ease: "easeOut",
                  }}
                  style={{ flexShrink: 0 }}
                >
                  <div className="movie-rail-item">
                    <MovieCard movie={movie} />
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.category.name === next.category.name &&
    prev.category.movies === next.category.movies,
);

const Top10Rail = React.memo(
  function Top10Rail({ movies, filter, railIndex = 0 }) {
    const railRef = useRef(null);
    const containerRef = useRef(null);
    // Windowing identical to MovieRail — unmount when far offscreen
    const [inView, setInView] = useState(false);
    const scrollPosRef = useRef(0);
    const top10 = movies.slice(0, 10);

    useEffect(() => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          const visible = entry.isIntersecting;
          if (!visible && railRef.current) {
            scrollPosRef.current = railRef.current.scrollLeft;
          }
          setInView(visible);
        },
        { rootMargin: "2200px 0px 2200px 0px" },
      );
      if (containerRef.current) {
        observer.observe(containerRef.current);
      }
      return () => observer.disconnect();
    }, []);

    // Restore horizontal position after the rail is windowed back in
    useEffect(() => {
      if (inView && railRef.current && scrollPosRef.current > 0) {
        railRef.current.scrollLeft = scrollPosRef.current;
      }
    }, [inView]);

    useEffect(() => {
      if (railRef.current) {
        railRef.current.scrollLeft = 0;
      }
    }, [filter]);

    const scroll = (dir) => {
      if (railRef.current) {
        const clientWidth = railRef.current.clientWidth;
        const scrollAmount =
          clientWidth > 800 ? clientWidth * 0.8 : clientWidth * 0.9;
        railRef.current.scrollBy({
          left: dir === "left" ? -scrollAmount : scrollAmount,
          behavior: "smooth",
        });
      }
    };

    if (top10.length === 0) return null;

    return (
      <div
        ref={containerRef}
        className="movie-rail-wrapper"
        style={{ position: "relative" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "0.25rem",
            paddingLeft: "0.25rem",
          }}
        >
        <h3
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          <span style={{ background: "var(--accent-gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginRight: "6px" }}>Top 10</span>
          {filter === "series" || filter === "tv shows"
            ? "TV Shows"
            : filter === "movies"
              ? "Movies"
              : "Today"}
        </h3>
        </div>

        {inView && (
          <>
            <RailArrow dir="left" onClick={() => scroll("left")} />
            <RailArrow dir="right" onClick={() => scroll("right")} />

            <div
              ref={railRef}
              className="movie-rail"
              style={{
                display: "flex",
                gap: "1rem",
                WebkitOverflowScrolling: "touch",
                overscrollBehaviorX: "contain",
                overflowX: "auto",
                scrollbarWidth: "none",
                padding: "0.25rem 1.4rem",
              }}
            >
              {top10.map((movie, i) => (
                <motion.div
                  key={`top10-${movie.id}`}
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-10px" }}
                  transition={{
                    duration: 0.5,
                    delay: (railIndex % 4) * 0.15 + i * 0.05,
                    ease: "easeOut",
                  }}
                  style={{ flexShrink: 0 }}
                >
                  <div
                    style={{
                      position: "relative",
                      display: "flex",
                      alignItems: "flex-end",
                      width: "180px",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="top10-number"
                      style={{
                        position: "absolute",
                        bottom: "-8px",
                        left: "-18px",
                        fontSize: "clamp(4.5rem, 8vw, 7rem)",
                        fontWeight: 900,
                        lineHeight: 1,
                        zIndex: 2,
                        pointerEvents: "none",
                        userSelect: "none",
                        color:
                          i === 0
                            ? "rgba(251,191,36,0.12)"
                            : i === 1
                              ? "rgba(148,163,184,0.12)"
                              : i === 2
                                ? "rgba(201,124,74,0.12)"
                                : "rgba(255,255,255,0.04)",
                        WebkitTextStroke:
                          "2px " +
                          (i === 0
                            ? "#fbbf24"
                            : i === 1
                              ? "#94a3b8"
                              : i === 2
                                ? "#c97c4a"
                                : "rgba(255,255,255,0.25)"),
                        textShadow: "0 0 15px rgba(0,0,0,0.6)",
                      }}
                    >
                      {i + 1}
                    </span>
                    <div
                      style={{
                        width: "140px",
                        flexShrink: 0,
                        marginLeft: "35px",
                      }}
                    >
                      <MovieCard movie={movie} compact />
                    </div>
                  </div>
                </motion.div>
              ))}            </div>
          </>
        )}
      </div>
    );
  },
  (prev, next) => prev.movies === next.movies && prev.filter === next.filter,
);

const EMPTY_ARRAY = [];

/* Backend endpoints can briefly return non-array payloads (cold-start error
   bodies, an object envelope, a 503 stub). Route everything through this so
   a single truthy-but-not-array value can never crash Home's renders. */
const asArray = (x) => (Array.isArray(x) ? x : EMPTY_ARRAY);

export default function Home({
  filter = "all",
  title = "Trending Across Platforms",
}) {
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [visibleCatCount, setVisibleCatCount] = useState(4);
  const [activeGenre, setActiveGenre] = useState("All");
  const [activePlatform, setActivePlatform] = useState("all");
  const { continueWatching, myList, isInList, toggleMyList } = useAppAuth();

  const { scrollY } = useScroll();
  const heroParallax = useTransform(scrollY, [0, 600], [0, 120]);

  const { data: featuredData, isLoading: featuredLoading } = useQuery({
    queryKey: ["featuredMovies"],
    queryFn: movieService.getFeaturedMovies,
  });

  const { data: categoriesData, isLoading: catsLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => movieService.getCategories("all"),
  });

  const { data: airingData } = useQuery({
    queryKey: ["airingThisWeek"],
    queryFn: () => movieService.getAiringThisWeek("all"),
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: trendingData } = useQuery({
    queryKey: ["trendingThisWeek"],
    queryFn: () => movieService.getTrendingThisWeek("all"),
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: top10Data } = useQuery({
    queryKey: ["top10"],
    queryFn: () => movieService.getTop10("all"),
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const rawCategories = asArray(categoriesData);
  const featuredMovies = useMemo(
    () => {
      try {
        return featuredData
          ? asArray(featuredData).filter(Boolean).map(normalizeMovieSource)
          : EMPTY_ARRAY;
      } catch (e) {
        console.error('featuredMovies useMemo error:', e);
        return EMPTY_ARRAY;
      }
    },
    [featuredData],
  );
  const loading = featuredLoading || catsLoading;

  useEffect(() => {
    let inThrottle;
    const handleScroll = () => {
      if (!inThrottle) {
        if (
          window.innerHeight + window.scrollY >=
          document.body.offsetHeight - 800
        ) {
          setVisibleCatCount((prev) => {
            // Don't load more than what we have (#27 fix)
            const maxCategories = (rawCategories?.length || 0) + 4; // +4 for dynamic rails
            return Math.min(prev + 3, maxCategories);
          });
        }
        inThrottle = true;
        setTimeout(() => (inThrottle = false), 200);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [rawCategories?.length]);

  const [isHeroHovered, setIsHeroHovered] = useState(false);
  const isHeroHoveredRef = useRef(false);
  const [heroVisible, setHeroVisible] = useState(true);

  // Pause kenBurns animation when the hero scrolls off-screen to save GPU.
  // Callback ref (React 19 cleans up on unmount) so it re-observes whenever
  // AnimatePresence re-mounts the hero element — without a ref in the dep array.
  const heroRef = useCallback((node) => {
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Interval logic moved below totalFeatured

  useEffect(() => {
    // Reset visible count and featured index when filter changes (#7 fix)
    setVisibleCatCount(4);
    setActiveGenre("All");
    setActivePlatform("all");
    setFeaturedIndex(0);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [filter]);

  const categories = useMemo(() => {
    try {
    // 1. Collect all unique movies for dynamic rails
    const allUniqueMovies = new Map();
    for (const cat of asArray(rawCategories)) {
      for (const m of (Array.isArray(cat.movies) ? cat.movies : [])) {
        if (m && m.id && !allUniqueMovies.has(m.id)) allUniqueMovies.set(m.id, m);
      }
    }
    let allMovies = Array.from(allUniqueMovies.values());

    // Apply base tab filter to allMovies
    if (filter === "series" || filter === "tv shows")
      allMovies = allMovies.filter((m) => m.isSeries);
    else if (filter === "movies")
      allMovies = allMovies.filter((m) => !m.isSeries);
    else if (filter === "anime")
      allMovies = allMovies.filter(
        (m) =>
          m.genres?.includes("Animation") ||
          (m.tags && m.tags.some((t) => t.toLowerCase().includes("anime"))),
      );

    const getMoviesByLanguage = (lang) => {
      const regex = new RegExp(lang, "i");
      return allMovies
        .filter(
          (m) =>
            (m.audioLanguages &&
              m.audioLanguages.some((l) => l.match(regex))) ||
            (m.languages && m.languages.some((l) => l.match(regex))) ||
            (m.title && m.title.match(regex)),
        )
        .sort((a, b) => (b.imdbRating || 0) - (a.imdbRating || 0));
    };

    // 2. Generate dynamic regional rails (Authentic Netflix/Prime pattern)
    let dynamicRegionalRails = [];
    if (activeGenre === "All" && filter !== "new") {
      const malayalam = getMoviesByLanguage("Malayalam");
      const tamil = getMoviesByLanguage("Tamil");
      const hindi = getMoviesByLanguage("Hindi");
      const telugu = getMoviesByLanguage("Telugu");

      const isTV = filter === "series" || filter === "tv shows";

      if (malayalam.length >= 4)
        dynamicRegionalRails.push({
          name: isTV
            ? "Malayalam TV Shows"
            : "Critically Acclaimed Malayalam Movies",
          movies: malayalam,
        });
      if (tamil.length >= 4)
        dynamicRegionalRails.push({
          name: isTV ? "Tamil TV Shows" : "Blockbuster Tamil Movies",
          movies: tamil,
        });
      if (hindi.length >= 4)
        dynamicRegionalRails.push({
          name: isTV ? "Hindi TV Shows" : "Trending in Hindi",
          movies: hindi,
        });
      if (telugu.length >= 4)
        dynamicRegionalRails.push({
          name: isTV ? "Telugu TV Shows" : "Popular Telugu Movies",
          movies: telugu,
        });
    }

    const standardCategories = [];
    for (const cat of rawCategories) {
      // Normalize every movie's source/sourceName from availablePlatforms
      let filtered = (Array.isArray(cat.movies) ? cat.movies : []).filter(Boolean).map(normalizeMovieSource);
      let dynamicName = cat.name;

      if (filter === "series" || filter === "tv shows") {
        filtered = filtered.filter((m) =>
          Boolean(m.isSeries || String(m.id).startsWith("tmdb-tv-") || m.type === "tv" || (m.seasonsCount && m.seasonsCount > 0))
        );
        if (
          !dynamicName.toLowerCase().includes("series") &&
          !dynamicName.toLowerCase().includes("tv")
        )
          dynamicName = `${dynamicName} TV Shows`;
      } else if (filter === "movies") {
        filtered = filtered.filter((m) =>
          !(m.isSeries || String(m.id).startsWith("tmdb-tv-") || m.type === "tv" || (m.seasonsCount && m.seasonsCount > 0))
        );
        if (!dynamicName.toLowerCase().includes("movie"))
          dynamicName = `${dynamicName} Movies`;
      } else if (filter === "anime") {
        filtered = filtered.filter(
          (m) =>
            m.genres?.includes("Animation") ||
            (m.tags && m.tags.some((t) => t.toLowerCase().includes("anime"))),
        );
        if (!dynamicName.toLowerCase().includes("anime"))
          dynamicName = `${dynamicName} Anime`;
      } else if (filter === "new") {
        filtered = filtered
          .sort((a, b) => b.releaseYear - a.releaseYear)
          .slice(0, 30);
      }

      if (activeGenre !== "All") {
        const isRegional = ["Malayalam", "Tamil", "Hindi", "Telugu"].includes(
          activeGenre,
        );
        filtered = filtered.filter((m) => {
          if (isRegional) {
            const regex = new RegExp(activeGenre, "i");
            return (
              (m.audioLanguages &&
                m.audioLanguages.some((l) => l.match(regex))) ||
              (m.languages && m.languages.some((l) => l.match(regex))) ||
              (m.title && m.title.match(regex)) ||
              (m.genres &&
                m.genres.some((g) =>
                  g.toLowerCase().includes(activeGenre.toLowerCase()),
                ))
            );
          }
          return (m.genres || []).some((g) =>
            g.toLowerCase().includes(activeGenre.toLowerCase()),
          );
        });
      }

      // Platform filter: match against source, availablePlatforms, or sourceName
      if (activePlatform !== "all") {
        const platformObj = PLATFORMS[activePlatform];
        if (platformObj) {
          const platformNameLC = platformObj.name.toLowerCase();
          const shortNameLC = platformObj.shortName.toLowerCase();
          filtered = filtered.filter((m) => {
            if (m.source === activePlatform) return true;
            if (m.sourceName && (m.sourceName.toLowerCase() === platformNameLC || m.sourceName.toLowerCase() === shortNameLC)) return true;
            if (m.availablePlatforms && m.availablePlatforms.length > 0) {
              return m.availablePlatforms.some((p) => {
                const key = normalizePlatformKey(p);
                return key === activePlatform;
              });
            }
            return false;
          });
        }
      }

      if (
        filter === "all" ||
        filter === "series" ||
        filter === "tv shows" ||
        filter === "movies" ||
        filter === "anime"
      ) {
        // Sort by rating descending for quality-first ordering
        filtered = filtered.sort(
          (a, b) => (b.imdbRating || 0) - (a.imdbRating || 0),
        );
      }

      if (filtered.length > 0) {
        standardCategories.push({ name: dynamicName, movies: filtered });
      }
    }

    // 3. Interleave dynamic regional rails with standard backend rails
    const finalCategories = [];
    let dynamicIdx = 0;

    for (let i = 0; i < standardCategories.length; i++) {
      finalCategories.push(standardCategories[i]);
      // Insert a dynamic regional rail every 2 standard rails to distribute them beautifully
      if ((i + 1) % 2 === 0 && dynamicIdx < dynamicRegionalRails.length) {
        finalCategories.push(dynamicRegionalRails[dynamicIdx]);
        dynamicIdx++;
      }
    }

    // Append any remaining dynamic rails at the end
    while (dynamicIdx < dynamicRegionalRails.length) {
      finalCategories.push(dynamicRegionalRails[dynamicIdx]);
      dynamicIdx++;
    }

    return finalCategories;
    } catch (e) {
      console.error('categories useMemo error:', e);
      return [];
    }
  }, [rawCategories, filter, activeGenre, activePlatform]);

  // Shared predicates for the Top 10 / Trending / Airing rails
  const isSeriesMovie = (m) =>
    Boolean(
      m.isSeries ||
        String(m.id || "").startsWith("tmdb-tv-") ||
        m.type === "tv" ||
        (m.seasonsCount && m.seasonsCount > 0),
    );
  const isAnimeMovie = (m) =>
    m.genres?.includes("Animation") ||
    (m.tags && m.tags.some((t) => t.toLowerCase().includes("anime")));

  const applyPageFilter = (list) => {
    if (filter === "series" || filter === "tv shows")
      return (list || []).filter(isSeriesMovie);
    if (filter === "movies") return (list || []).filter((m) => !isSeriesMovie(m));
    if (filter === "anime") return (list || []).filter(isAnimeMovie);
    return Array.isArray(list) ? list : [];
  };

  // Platform lookup map: categories have pre-resolved source data, trending/recommendations don't.
  // Build a map from movie id → source, so we can enrich rails that lack platform data.
  const platformLookup = useMemo(() => {
    const map = new Map();
    for (const cat of asArray(rawCategories)) {
      for (const m of (Array.isArray(cat.movies) ? cat.movies : []).filter(Boolean)) {
        if (m.id && m.source && !map.has(m.id)) {
          map.set(m.id, m.source);
        }
      }
    }
    return map;
  }, [rawCategories]);

  // Enrich a movie array: for movies with source=null, look up platform from categories
  const enrichWithPlatforms = useCallback((movies) => {
    return (Array.isArray(movies) ? movies : []).map(m => {
      if (!m || m.source) return m;
      const lookupSource = platformLookup.get(m.id);
      if (lookupSource) return { ...m, source: lookupSource };
      return m;
    });
  }, [platformLookup]);

  // Real cross-platform Top 10 from the backend (ranked, not a client-side shuffle).

  const trendingThisWeek = useMemo(
    () => enrichWithPlatforms(applyPageFilter(asArray(trendingData)).slice(0, 20)).map(normalizeMovieSource),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trendingData, filter, enrichWithPlatforms],
  );

  const airingThisWeek = useMemo(
    () => enrichWithPlatforms(applyPageFilter(asArray(airingData)).slice(0, 20)).map(normalizeMovieSource),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [airingData, filter, enrichWithPlatforms],
  );

  // "Upcoming" — only PREMIERES: movies with a future release date plus series
  // the backend explicitly flags isUpcoming (first-air date in the future).
  // Ongoing shows whose *next episode* is in the future are excluded — those
  // airings already live in the Airing rail. Mirrors how Netflix/JustWatch
  // split "Coming Soon" (premieres) from ongoing new episodes. Rail rows are
  // anchored to the current date (TODAY/TOMORROW/weekday/month-day chips),
  // sorted soonest-first, given a 365-day window. The rail is NEVER padded
  // with trending/airing titles: released films are not "coming soon", so if
  // fewer premieres exist the rail simply shows what's genuinely upcoming.
  const upcomingReleases = useMemo(() => {
    const pool = [
      ...asArray(airingData),
      ...asArray(trendingData),
      ...asArray(top10Data),
      ...asArray(featuredData),
      ...asArray(rawCategories).flatMap((c) => (Array.isArray(c.movies) ? c.movies : [])),
    ];
    const hasArtwork = (m) => m && (m.posterUrl || m.backdropUrl);
    return applyPageFilter(buildUpcoming(pool, 365))
      .filter((m) => !isSeriesMovie(m) || m.isUpcoming === true)
      .map(normalizeMovieSource)
      .map(enrichWithPlatforms)
      .filter(hasArtwork)
      .slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airingData, trendingData, top10Data, featuredData, rawCategories, filter, enrichWithPlatforms]);

  // Proximity-aware heading: surface when the next premiere drops instead of
  // always saying a flat "Upcoming".
  const upcomingTitle = (() => {
    const scope =
      filter === "series" || filter === "tv shows"
        ? "TV Shows"
        : filter === "movies"
          ? "Movies"
          : filter === "anime"
            ? "Anime"
            : "";
    const nearest = upcomingReleases[0];
    if (nearest && nearest.daysUntil <= 7)
      return scope ? `Coming This Week — ${scope}` : "Coming This Week";
    if (nearest && nearest.daysUntil <= 30)
      return scope ? `Coming This Month — ${scope}` : "Coming This Month";
    return scope ? `Upcoming ${scope}` : "Upcoming";
  })();

  // Top 10 — backend rank first, padded to a full 10 per tab. The backend
  // list is filtered per page type, which can leave fewer than 10 (e.g. only a
  // handful of movies on the "Movies" tab). Pad the rest with tab-filtered
  // trending/airing/upcoming entries, deduped by id so the real backend
  // ranking keeps leading and the rank badges always count 1–10.
  const top10Movies = useMemo(() => {
    const ranked = enrichWithPlatforms(applyPageFilter(asArray(top10Data)))
      .map(normalizeMovieSource)
      .slice(0, 10);
    if (ranked.length >= 10) return ranked;

    const seen = new Set(ranked.map((m) => m.id));
    const padded = [...ranked];
    for (const m of [...trendingThisWeek, ...airingThisWeek, ...upcomingReleases]) {
      if (m && m.id && !seen.has(m.id)) {
        seen.add(m.id);
        padded.push(m);
        if (padded.length >= 10) break;
      }
    }
    return padded;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top10Data, filter, trendingThisWeek, airingThisWeek, upcomingReleases, enrichWithPlatforms]);

  const lastWatched =
    continueWatching && continueWatching.length > 0
      ? continueWatching[0]
      : null;

  // Real "Because you watched X" recommendations from the backend
  const { data: rawRecommendations } = useQuery({
    queryKey: ["recommendations", lastWatched?.id],
    queryFn: () => movieService.getRecommendations(lastWatched.id),
    enabled: Boolean(lastWatched && lastWatched.id),
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const recommendations = useMemo(
    () => Array.isArray(rawRecommendations) ? enrichWithPlatforms(rawRecommendations).map(normalizeMovieSource) : [],
    [rawRecommendations, enrichWithPlatforms],
  );

  const finalPool = useMemo(() => {
    try {
    let globalPool = [];
    let regionalPool = [];
    let recommendedPool = [];

    // 1. Gather Global Featured
    if (featuredMovies.length > 0) {
      featuredMovies.forEach((fm) => {
        if ((filter === "series" || filter === "tv shows") && fm.isSeries)
          globalPool.push(fm);
        else if (filter === "movies" && !fm.isSeries) globalPool.push(fm);
        else if (filter === "anime" && fm.genres?.includes("Animation"))
          globalPool.push(fm);
        else if (filter === "all" || filter === "new" || filter === "mylist")
          globalPool.push(fm);
      });
    }

    // 2. Gather Regional & Recommended from Categories
    if (categories.length > 0) {
      const allCategoryMovies = [];
      categories.forEach((c) => {
        (Array.isArray(c.movies) ? c.movies : []).filter(Boolean).forEach((m) => {
          if (m.backdropUrl && !allCategoryMovies.find((p) => p.id === m.id)) {
            allCategoryMovies.push(m);
          }
        });
      });

      // Filter for the current tab (Movies vs Series vs Anime)
      let tabFilteredMovies = allCategoryMovies;
      if (filter === "series" || filter === "tv shows")
        tabFilteredMovies = tabFilteredMovies.filter((m) => m.isSeries);
      if (filter === "movies")
        tabFilteredMovies = tabFilteredMovies.filter((m) => !m.isSeries);
      if (filter === "anime")
        tabFilteredMovies = tabFilteredMovies.filter((m) =>
          m.genres?.includes("Animation"),
        );

      // Extract Regional Content (Tamil, Malayalam, Hindi, Telugu, etc.)
      regionalPool = tabFilteredMovies.filter(
        (m) =>
          m.audioLanguages?.some((l) =>
            l.match(/Tamil|Malayalam|Hindi|Telugu/i),
          ) ||
          m.languages?.some((l) => l.match(/Tamil|Malayalam|Hindi|Telugu/i)) ||
          m.title.match(/Tamil|Malayalam|Hindi|Telugu/i),
      );

      // Extract Recommended Content based on User History
      const lastWatchedGenres = lastWatched?.genres || [];
      recommendedPool = tabFilteredMovies.filter(
        (m) =>
          m.genres?.some((g) => lastWatchedGenres.includes(g)) &&
          m.imdbRating >= 7.5,
      );

      // Fallback for empty regional
      if (regionalPool.length === 0) {
        regionalPool = tabFilteredMovies.filter(
          (m) => m.genres?.includes("Drama") && m.imdbRating >= 8.0,
        );
      }
    }

    // 3. Filter strictly for items with a title image (logoUrl)
    globalPool = globalPool.filter((m) => m.logoUrl);
    regionalPool = regionalPool.filter((m) => m.logoUrl);
    recommendedPool = recommendedPool.filter((m) => m.logoUrl);

    // 4. The "Surpass Authentic" Mixing Algorithm
    const pool = [];
    const usedIds = new Set();

    const pushToPool = (movie) => {
      if (movie && !usedIds.has(movie.id)) {
        pool.push(movie);
        usedIds.add(movie.id);
      }
    };

    let gIdx = 0,
      rIdx = 0,
      recIdx = 0;
    while (
      pool.length < 10 &&
      (gIdx < globalPool.length ||
        rIdx < regionalPool.length ||
        recIdx < recommendedPool.length)
    ) {
      pushToPool(globalPool[gIdx++]);
      pushToPool(regionalPool[rIdx++]);
      pushToPool(recommendedPool[recIdx++]);
    }

    // 5. Always find better: If the active filter yielded no movies with logoUrls,
    // fallback to ANY featured movie that has a logoUrl so the banner doesn't break
    if (pool.length === 0 && featuredMovies.length > 0) {
      for (const fm of featuredMovies) {
        if (fm.logoUrl) {
          pushToPool(fm);
          if (pool.length >= 5) break;
        }
      }
    }

    return pool;
    } catch (e) {
      console.error('finalPool useMemo error:', e);
      return [];
    }
  }, [featuredMovies, categories, filter, lastWatched]);

  const totalFeatured = finalPool.length;
  const activeFeaturedMovie =
    totalFeatured > 0 ? finalPool[featuredIndex % totalFeatured] : null;

  // Auto-rotation: use ref for hover state to avoid stale closures and unnecessary interval restarts
  useEffect(() => {
    if (totalFeatured <= 1) return;
    const timer = setInterval(() => {
      if (!isHeroHoveredRef.current) {
        setFeaturedIndex((prev) => prev + 1);
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [totalFeatured]);

  // Preload next hero image to eliminate flash on slide change
  useEffect(() => {
    if (totalFeatured <= 1) return;
    const nextMovie = finalPool[(featuredIndex + 1) % totalFeatured];
    if (!nextMovie) return;
    const preloadUrl =
      nextMovie.backdropUrl || nextMovie.posterUrl || nextMovie.poster;
    if (preloadUrl) {
      const img = new window.Image();
      img.src = preloadUrl;
    }
  }, [featuredIndex, totalFeatured, finalPool]);

  return (
    <div className="main-content" style={{ paddingBottom: "2rem" }}>
      <SEO title={title || "Discover Movies & TV Shows"} />
      <AnimatePresence mode="wait">
        {loading && !activeFeaturedMovie ? (
          <motion.div
            key="skeleton-hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="skeleton skeleton-hero"
            style={{ overflow: "hidden" }}
          >
            <div className="hero-content" style={{ zIndex: 2 }}>
              <div
                className="skeleton"
                style={{
                  width: "min(420px, 70%)",
                  height: "clamp(2.2rem, 4vw, 3.4rem)",
                  borderRadius: "8px",
                  marginBottom: "1.2rem",
                }}
              />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  flexWrap: "wrap",
                  marginBottom: "1.1rem",
                }}
              >
                {[70, 95, 60, 85].map((w, i) => (
                  <div
                    key={i}
                    className="skeleton"
                    style={{ width: `${w}px`, height: "22px", borderRadius: "6px" }}
                  />
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.45rem",
                  marginBottom: "1.5rem",
                  maxWidth: "560px",
                }}
              >
                <div className="skeleton" style={{ width: "100%", height: "12px", borderRadius: "4px" }} />
                <div className="skeleton" style={{ width: "86%", height: "12px", borderRadius: "4px" }} />
                <div className="skeleton" style={{ width: "62%", height: "12px", borderRadius: "4px" }} />
              </div>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <div className="skeleton" style={{ width: "150px", height: "48px", borderRadius: "100px" }} />
                <div className="skeleton" style={{ width: "120px", height: "48px", borderRadius: "100px" }} />
              </div>
            </div>
          </motion.div>
        ) : activeFeaturedMovie ? (
          <ErrorBoundary>
          <motion.div
            key={activeFeaturedMovie.id}
            ref={heroRef}
            className="hero-container"
            initial={{ opacity: 0, filter: "blur(12px)", scale: 1.02 }}
            animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
            exit={{ opacity: 0, filter: "blur(8px)", scale: 1.02 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{ willChange: "opacity, transform" }}
            onMouseEnter={() => { isHeroHoveredRef.current = true; setIsHeroHovered(true); }}
            onMouseLeave={() => { isHeroHoveredRef.current = false; setIsHeroHovered(false); }}
          >
            <motion.img
              src={
                activeFeaturedMovie.backdropUrl ||
                activeFeaturedMovie.posterUrl ||
                activeFeaturedMovie.poster
              }
              alt={activeFeaturedMovie.title}
              className={`hero-bg desktop-bg${!heroVisible ? ' paused' : ''}`}
              initial={{ scale: 1 }}
              animate={{ scale: 1.03 }}
              transition={{ duration: 8, ease: "linear" }}
              fetchpriority="high"
              loading="eager"
              decoding="async"
              y={heroParallax}
              style={{ willChange: "transform" }}
            />
            <motion.img
              src={
                activeFeaturedMovie.posterUrl ||
                activeFeaturedMovie.poster ||
                activeFeaturedMovie.backdropUrl
              }
              alt={activeFeaturedMovie.title}
              className={`hero-bg mobile-bg${!heroVisible ? ' paused' : ''}`}
              initial={{ scale: 1 }}
              animate={{ scale: 1.03 }}
              transition={{ duration: 8, ease: "linear" }}
              fetchpriority="high"
              loading="eager"
              decoding="async"
              y={heroParallax}
              style={{ willChange: "transform" }}
            />
            <div className="hero-overlay" />

            {/* Left/Right Navigation Arrows */}
            <AnimatePresence>
              {isHeroHovered && totalFeatured > 1 && (
                <>
                  <motion.button
                    initial={{ opacity: 0, x: -20, y: "-50%" }}
                    animate={{ opacity: 1, x: 0, y: "-50%" }}
                    exit={{ opacity: 0, x: -20, y: "-50%" }}
                    whileHover={{
                      scale: 1.1,
                      backgroundColor: "rgba(0,0,0,0.8)",
                    }}
                    whileTap={{ scale: 0.95 }}
                    className="hero-nav-arrow left"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFeaturedIndex(
                        (featuredIndex - 1 + totalFeatured) % totalFeatured,
                      );
                    }}
                  >
                    <ChevronLeft size={32} />
                  </motion.button>
                  <motion.button
                    initial={{ opacity: 0, x: 20, y: "-50%" }}
                    animate={{ opacity: 1, x: 0, y: "-50%" }}
                    exit={{ opacity: 0, x: 20, y: "-50%" }}
                    whileHover={{
                      scale: 1.1,
                      backgroundColor: "rgba(0,0,0,0.8)",
                    }}
                    whileTap={{ scale: 0.95 }}
                    className="hero-nav-arrow right"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFeaturedIndex((featuredIndex + 1) % totalFeatured);
                    }}
                  >
                    <ChevronRight size={32} />
                  </motion.button>
                </>
              )}
            </AnimatePresence>

            <div className="hero-content">
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  paddingBottom: "1rem",
                  willChange: "transform, opacity",
                }}
              >
                {activeFeaturedMovie.logoUrl ? (
                  <motion.img
                    src={activeFeaturedMovie.logoUrl}
                    alt={activeFeaturedMovie.title}
                    style={{
                      maxHeight: "120px",
                      maxWidth: "100%",
                      marginBottom: "1.5rem",
                      filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.8))",
                      willChange: "transform",
                    }}
                  />
                ) : (
                  <h1 className="hero-title">{activeFeaturedMovie.title}</h1>
                )}
                <div className="hero-meta">
                  <span>
                    {(
                      activeFeaturedMovie.releaseYear ||
                      activeFeaturedMovie.year
                    )
                      ?.toString()
                      .substring(0, 4)}
                  </span>
                  {activeFeaturedMovie.imdbRating > 0 && (
                    <span style={{ color: "#fbbf24" }}>
                      ⭐ {activeFeaturedMovie.imdbRating}
                    </span>
                  )}
                  <span className="maturity-badge">
                    {activeFeaturedMovie.maturityRating || "TV-MA"}
                  </span>
                  {activeFeaturedMovie.duration &&
                    !activeFeaturedMovie.duration.match(
                      /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/,
                    ) && <span>{activeFeaturedMovie.duration}</span>}
                  <div style={{ display: "inline-flex", marginLeft: "0.5rem" }}>
                    <PlatformIcon platform={activeFeaturedMovie.source} />
                  </div>
                </div>
                {/* Description — always visible, truncated to 3 lines */}
                {(activeFeaturedMovie.description ||
                  activeFeaturedMovie.longDescription) && (
                  <p
                    className="hero-desc"
                    style={{
                      marginBottom: "1.5rem",
                      marginTop: "0.5rem",
                      cursor: "pointer",
                      lineHeight: 1.5,
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      display: "-webkit-box",
                      overflow: "hidden",
                    }}
                  >
                    {activeFeaturedMovie.description ||
                      activeFeaturedMovie.longDescription ||
                      "Start watching this amazing title right now."}
                  </p>
                )}

                <motion.div
                  className="hero-actions"
                  style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.5, duration: 0.5 }}
                >
                  <Link
                    to={`/watch/${activeFeaturedMovie.id}/${slugify(activeFeaturedMovie.title, { lower: true, strict: true })}`}
                  >
                    <motion.button
                      className="btn btn-primary"
                      style={{
                        padding: "0.8rem 2rem",
                        fontSize: "1.1rem",
                        fontWeight: 700,
                      }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Play size={24} fill="currentColor" stroke="none" />
                      Play
                    </motion.button>
                  </Link>
                  <motion.button
                    className="btn btn-glass"
                    style={{
                      padding: "0.8rem 2rem",
                      fontSize: "1.1rem",
                      fontWeight: 700,
                      border: "1px solid rgba(255,255,255,0.3)",
                    }}
                    whileHover={{
                      scale: 1.03,
                      background: "rgba(255,255,255,0.15)",
                    }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      toggleMyList(activeFeaturedMovie);
                    }}
                  >
                    {isInList(activeFeaturedMovie?.id) ? (
                      <Check size={24} />
                    ) : (
                      <Plus size={24} />
                    )}
                    {isInList(activeFeaturedMovie?.id)
                      ? "In My List"
                      : "My List"}
                  </motion.button>
                </motion.div>
              </motion.div>
            </div>

            {/* Navigation Dots — improved with larger touch targets */}
            {totalFeatured > 1 && (
              <div className="hero-dots">
                {Array.from({ length: totalFeatured }).map((_, i) => {
                  const isActive = i === featuredIndex % totalFeatured;
                  return (
                    <motion.button
                      key={i}
                      onClick={() => setFeaturedIndex(i)}
                      aria-label={`Go to slide ${i + 1}`}
                      style={{
                        width: isActive ? "32px" : "8px",
                        height: "6px",
                        borderRadius: "100px",
                        background: isActive
                          ? "rgba(255,255,255,0.1)"
                          : "rgba(255,255,255,0.3)",
                        position: "relative",
                        overflow: "hidden",
                        border: "none",
                        cursor: "pointer",
                        transition:
                          "all 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)",
                        padding: "0",
                        // Invisible padding for larger touch target
                        margin: "10px 2px",
                      }}
                    >
                      {isActive && (
                        <div className="dot-filler" style={{ animationPlayState: isHeroHovered ? 'paused' : 'running' }} />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
          </ErrorBoundary>
        ) : (
          <motion.div
            key="empty-hero"
            className="hero-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "min(82vh, 900px)",
              background:
                "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(244,63,94,0.08) 0%, transparent 70%), #050505",
            }}
          >
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <div className="logo-icon" style={{ margin: "0 auto 1rem", width: "56px", height: "56px" }}>
                <Play size={28} fill="currentColor" stroke="none" />
              </div>
              <h2 style={{ color: "#fff", marginBottom: "0.5rem" }}>
                Welcome to Streamly
              </h2>
              <p style={{ color: "#a1a1aa", maxWidth: "420px", margin: "0 auto" }}>
                Discover movies and TV shows across all your favorite streaming platforms.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Platform Filter Row */}
      {!loading && categories.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.4rem",
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorX: "contain",
            overflowX: "auto",
            scrollbarWidth: "none",
            padding: "0.4rem 0 0.5rem",
          }}
        >
          <motion.button
            layout
            onClick={() => setActivePlatform("all")}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.95 }}
            className={`chip ${activePlatform === "all" ? "chip--active" : ""}`}
            style={{
              fontSize: "0.8rem",
              flexShrink: 0,
            }}
          >
            All Platforms
          </motion.button>
          {Object.entries(PLATFORMS).filter(([, p]) => p.category !== "aggregator").map(([key, p]) => (
            <motion.button
              layout
              key={key}
              onClick={() => setActivePlatform(key)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              className="chip"
              style={{
                background: activePlatform === key ? (p.gradient || p.color) : undefined,
                borderColor: activePlatform === key ? "transparent" : undefined,
                color: "#fff",
                fontSize: "0.75rem",
                flexShrink: 0,
              }}
            >
              <PlatformIcon platform={key} xs />
            </motion.button>
          ))}
        </div>
      )}

      {/* Genre Filter Chips */}
      {!loading && categories.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            WebkitOverflowScrolling: "touch",
            overscrollBehaviorX: "contain",
            overflowX: "auto",
            scrollbarWidth: "none",
            padding: "0.4rem 0 0.75rem",
            marginBottom: "0.25rem",
          }}
        >
          {GENRE_OPTIONS.map((genre) => (
            <motion.button
              layout
              key={genre}
              onClick={() => setActiveGenre(genre)}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.95 }}
              className={`chip ${activeGenre === genre ? "chip--active" : ""}`}
              style={{
                fontSize: "0.85rem",
                flexShrink: 0,
              }}
            >
              {genre}
            </motion.button>
          ))}
        </div>
      )}

      {/* Leaving Soon — home page only */}
      {!loading && filter === 'all' && activeGenre === 'All' && (
<LeavingSoonBanner items={detectLeavingSoon(
            categories.flatMap(c => (Array.isArray(c.movies) ? c.movies : [])), 14
          )} />
      )}

      {/* Upcoming — standard rail UI on every tab; tab-filtered (all on Home,
          movies/series/anime on their pages) and padded so the rail always fills. */}
      {!loading && filter !== "new" && activeGenre === "All" && upcomingReleases.length > 0 && (
        <FadeInSection>
          <ErrorBoundary>
            <MovieRail
              railIndex={0}
              category={{ name: upcomingTitle, movies: upcomingReleases }}
            />
          </ErrorBoundary>
        </FadeInSection>
      )}

      {/* Categories Section */}
      <section
        style={{ display: "flex", flexDirection: "column", gap: "2rem" }}
      >
        <div className="section-header" style={{ marginBottom: 0 }}>
          <h2 className="section-title">{title}</h2>
        </div>

        {loading ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "2rem" }}
          >
            {[1, 2, 3, 4].map((rail) => (
              <div key={rail}>
                <div className="skeleton skeleton-title"></div>
                <div className="skeleton-rail">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((card) => (
                    <div key={card} className="skeleton-moviecard">
                      <div className="skeleton sk-poster"></div>
                      <div className="skeleton sk-line sk-line--w70"></div>
                      <div className="skeleton sk-line sk-line--sub"></div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : categories.length === 0 ? (
          <h3 style={{ textAlign: "center", color: "#a1a1aa" }}>
            No titles found
          </h3>
        ) : (
          <>
            {/* 1. Continue Watching — resume-first (highest intent, Netflix surfaces near top) */}
            {continueWatching &&
              continueWatching.length > 0 &&
              filter === "all" && (
                <FadeInSection>
                  <ErrorBoundary>
                    <MovieRail
                      railIndex={0}
                      category={{
                        name: "Continue Watching",
                        movies: continueWatching,
                      }}
                    />
                  </ErrorBoundary>
                </FadeInSection>
              )}
            {/* 2. Because you watched — personalized discovery ranker */}
            {filter === "all" && lastWatched && recommendations?.length > 0 && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={1}
                    category={{
                      name: `Because you watched ${lastWatched.title}`,
                      movies: recommendations,
                    }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}
            {/* 3. Top 10 — social proof & fresh discovery */}
            {(filter === "all" ||
              filter === "series" ||
              filter === "tv shows" ||
              filter === "movies" ||
              filter === "anime") &&
              top10Movies.length > 0 &&
              activeGenre === "All" && (
                <FadeInSection>
                  <Top10Rail
                    railIndex={2}
                    movies={top10Movies}
                    filter={filter}
                  />
                </FadeInSection>
              )}
            {/* 4. Trending This Week */}
            {trendingThisWeek.length > 0 && activeGenre === "All" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={3}
                    category={{ name: "Trending This Week", movies: trendingThisWeek }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}
            {/* 5. My List */}
            {myList && myList.length > 0 && filter === "all" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={5}
                    category={{ name: "My List", movies: myList }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}
            {/* 7. Category rails */}
            {categories.slice(0, visibleCatCount).map((category, catIdx) => (
              <FadeInSection key={catIdx} delay={0.1}>
                <ErrorBoundary key={category.id || catIdx}>
                  <MovieRail railIndex={catIdx + 6} category={category} />
                </ErrorBoundary>
              </FadeInSection>
            ))}
          </>
        )}
      </section>
    </div>
  );
}
