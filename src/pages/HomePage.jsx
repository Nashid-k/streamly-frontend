import SEO from "../components/SEO";
import slugify from "slugify";
import ErrorBoundary from "../components/ErrorBoundary";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Check, Plus, Info, Calendar, Heart } from "lucide-react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from "framer-motion";
import { useAppAuth } from "../context/auth";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import ContinueWatchingRail from "../components/ContinueWatchingRail";
import { progressPct } from "../utils/resumeProgress";
import AmbientBackground from "../components/AmbientBackground";
import HeroTitleLogo from "../components/HeroTitleLogo";
import useDetailView from "../hooks/useDetailView";
import useIsTouch from "../hooks/useIsTouch";
import RatingsCluster from "../components/RatingsCluster";

import RailArrow from "../components/RailArrow";
import LeavingSoonBanner from "../components/LeavingSoonBanner";
import GenreShowcase from "../components/GenreShowcase";
import { detectLeavingSoon, buildUpcoming } from "../utils/releaseCalendar";
import { asArray, EMPTY_ARRAY } from "../utils";
import { useI18n } from "../i18n/index.jsx";
import { logEmptyData, logError, reportQueryError } from "../utils/debugLogger";
import FadeInSection from "../components/rails/FadeInSection";
import MovieRail from "../components/rails/MovieRail";
import Top10Rail from "../components/rails/Top10Rail";
import EditorialRails from "../components/rails/EditorialRails";

// Shared content-type predicates: anime folds into Movies/TV Shows by whether
// the title is a movie or a series, so both stay discoverable without a
// dedicated tab.
const isSeriesLike = (m) =>
  Boolean(
    m.isSeries ||
      String(m.id || "").startsWith("tmdb-tv-") ||
      m.type === "tv" ||
      (m.seasonsCount && m.seasonsCount > 0),
  );
const isAnime = (m) =>
  Boolean(
    m.genres?.includes("Animation") ||
      (m.tags && m.tags.some((t) => t.toLowerCase().includes("anime"))),
  );

export default function Home({
  filter = "all",
  title,
}) {
  const { t } = useI18n();
  const sectionTitle = title || t("home.rails.trending");
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [visibleCatCount, setVisibleCatCount] = useState(4);
  const [activeGenre, setActiveGenre] = useState("All");
  const [activePlatform, setActivePlatform] = useState("all");
  const { continueWatching, myList, isInList, toggleMyList } = useAppAuth();

  // Every details affordance routes through one gateway: Detail View Type "page"
  // → details page, "modal" → info modal. The hero Play button stays a direct
  // watch link (play ≠ details).
  const { openDetails, modalHost } = useDetailView();

  const {
    data: featuredData,
    isLoading: featuredLoading,
    isError: featuredError,
    error: featuredQueryError,
    refetch: refetchFeatured,
  } = useQuery({
    queryKey: ["featuredMovies"],
    queryFn: movieService.getFeaturedMovies,
  });

  const {
    data: categoriesData,
    isLoading: catsLoading,
    isError: categoriesError,
    error: categoriesQueryError,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ["categories"],
    queryFn: () => movieService.getCategories("all"),
  });

  const { data: airingData, error: airingError } = useQuery({
    queryKey: ["airing-this-week"],
    queryFn: () => movieService.getAiringThisWeek("all"),
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: trendingData, error: trendingError } = useQuery({
    queryKey: ["trending-this-week"],
    queryFn: () => movieService.getTrendingThisWeek("all"),
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: top10Data, error: top10Error } = useQuery({
    queryKey: ["top10"],
    queryFn: () => movieService.getTop10("all"),
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: popularData, error: popularError } = useQuery({
    queryKey: ["popular"],
    queryFn: () => movieService.getPopular(),
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: topRatedData, error: topRatedError } = useQuery({
    queryKey: ["topRated"],
    queryFn: () => movieService.getTopRated(),
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: nowPlayingData, error: nowPlayingError } = useQuery({
    queryKey: ["nowPlaying"],
    queryFn: () => movieService.getNowPlaying(),
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Regional (Tamil/Hindi/Malayalam/Telugu) feeds, merged into the Upcoming and
  // Airing rails so those keep their global breadth. Each is a /discover sweep,
  // cached 10 min like the other rails.
  const { data: regionalUpcomingData, error: regionalUpcomingError } = useQuery({
    queryKey: ["upcoming-regional"],
    queryFn: () => movieService.getRegionalUpcoming(90),
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: regionalAiringData, error: regionalAiringError } = useQuery({
    queryKey: ["airing-regional"],
    queryFn: () => movieService.getRegionalAiring(10),
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Fresh Hindi/English/Malayalam/Tamil releases (newest first) for the banner's
  // "newly released" lineup.
  const { data: newReleasesData, error: newReleasesError } = useQuery({
    queryKey: ["new-releases"],
    queryFn: () => movieService.getNewReleases(90),
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Log every failed query (key + HTTP status) and every query that succeeded with
  // nothing usable, so a silent empty rail is always traceable.
  // NOTE: `loading` must be declared before these effects — referencing it earlier
  // throws "Cannot access before initialization".
  const loading = featuredLoading || catsLoading;

  useEffect(() => {
    if (featuredQueryError) reportQueryError("HomePage", ["featuredMovies"], featuredQueryError, { filter });
    if (categoriesQueryError) reportQueryError("HomePage", ["categories"], categoriesQueryError, { filter });
    if (airingError) reportQueryError("HomePage", ["airing-this-week"], airingError, { filter });
    if (trendingError) reportQueryError("HomePage", ["trending-this-week"], trendingError, { filter });
    if (top10Error) reportQueryError("HomePage", ["top10"], top10Error, { filter });
    if (popularError) reportQueryError("HomePage", ["popular"], popularError, { filter });
    if (topRatedError) reportQueryError("HomePage", ["topRated"], topRatedError, { filter });
    if (nowPlayingError) reportQueryError("HomePage", ["nowPlaying"], nowPlayingError, { filter });
    if (regionalUpcomingError) reportQueryError("HomePage", ["upcoming-regional"], regionalUpcomingError, { filter });
    if (regionalAiringError) reportQueryError("HomePage", ["airing-regional"], regionalAiringError, { filter });
    if (newReleasesError) reportQueryError("HomePage", ["new-releases"], newReleasesError, { filter });
  }, [featuredQueryError, categoriesQueryError, airingError, trendingError, top10Error, popularError, topRatedError, nowPlayingError, regionalUpcomingError, regionalAiringError, newReleasesError, filter]);

  useEffect(() => {
    if (loading) return;
    if (!featuredData || asArray(featuredData).length === 0) {
      logEmptyData("HomePage", "featuredMovies is empty — hero shows fallback. Check /trending/all/week.", { filter });
    }
    if (!categoriesData || asArray(categoriesData).length === 0) {
      logEmptyData("HomePage", "categories is empty — rails show fallback. Check /trending/movie/week + /trending/tv/week.", { filter });
    }
  }, [loading, featuredData, categoriesData, filter]);

  const rawCategories = asArray(categoriesData);

  const featuredMovies = useMemo(
    () => {
      try {
        return featuredData
          ? asArray(featuredData).filter(Boolean)
          : EMPTY_ARRAY;
      } catch (e) {
        logError("HomePage", "featuredMovies memo failed — hero falls back to empty.", e);
        return EMPTY_ARRAY;
      }
    },
    [featuredData],
  );

  useEffect(() => {
    let inThrottle;
    const handleScroll = () => {
      if (!inThrottle) {
        if (
          window.innerHeight + window.scrollY >=
          document.body.offsetHeight - 800
        ) {
          setVisibleCatCount((prev) => {
            // Don't load more than we have
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
  const isCoarse = useIsTouch();
  /* The banner's Info button always opens the in-place info modal, whatever the
     Detail View Type is — that setting governs card clicks, not this button. */


  useEffect(() => {
    // Reset visible count and featured index when the filter changes
    setVisibleCatCount(4);
    setActiveGenre("All");
    setActivePlatform("all");
    setFeaturedIndex(0);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [filter]);

  const categories = useMemo(() => {
    try {
    // Collect all unique movies for the dynamic rails
    const allUniqueMovies = new Map();
    for (const cat of asArray(rawCategories)) {
      for (const m of (Array.isArray(cat.movies) ? cat.movies : [])) {
        if (m && m.id && !allUniqueMovies.has(m.id)) allUniqueMovies.set(m.id, m);
      }
    }
    let allMovies = Array.from(allUniqueMovies.values());

    if (filter === "series" || filter === "tv shows")
      allMovies = allMovies.filter((m) => m.isSeries);
    else if (filter === "movies") allMovies = allMovies.filter((m) => !m.isSeries);

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

    // Dynamic discovery rails: New & Popular plus anime split into Movies vs TV
    // Shows, interleaved with the regional rails below.
    let dynamicRails = [];
    if (activeGenre === "All" && activePlatform === "all") {
      if (filter === "all") {
        // New & Popular — newest releases first, highest-rated within a year.
        // normalizeResult emits `year` (string); `releaseYear` only appears on
        // legacy localStorage payloads, so match BOTH or this rail is empty.
        const fresh = allMovies
          .filter((m) => !!m.releaseYear || !!m.year)
          .sort(
            (a, b) =>
              (b.releaseYear || b.year) - (a.releaseYear || a.year) ||
              (b.imdbRating || 0) - (a.imdbRating || 0),
          )
          .slice(0, 30);
        if (fresh.length > 0)
          dynamicRails.push({ name: "New & Popular", movies: fresh });
      }

      const isTV = filter === "series" || filter === "tv shows";
      if (filter === "movies") {
        const animeMovies = allMovies.filter(
          (m) => isAnime(m) && !isSeriesLike(m),
        );
        if (animeMovies.length >= 4)
          dynamicRails.push({ name: "Anime Movies", movies: animeMovies });
      } else if (isTV) {
        const animeSeries = allMovies.filter(
          (m) => isAnime(m) && isSeriesLike(m),
        );
        if (animeSeries.length >= 4)
          dynamicRails.push({ name: "Anime Series", movies: animeSeries });
      }

      const malayalam = getMoviesByLanguage("Malayalam");
      const tamil = getMoviesByLanguage("Tamil");
      const hindi = getMoviesByLanguage("Hindi");
      const telugu = getMoviesByLanguage("Telugu");

      if (malayalam.length >= 4)
        dynamicRails.push({
          name: isTV
            ? "Malayalam TV Shows"
            : "Critically Acclaimed Malayalam Movies",
          movies: malayalam,
        });
      if (tamil.length >= 4)
        dynamicRails.push({
          name: isTV ? "Tamil TV Shows" : "Blockbuster Tamil Movies",
          movies: tamil,
        });
      if (hindi.length >= 4)
        dynamicRails.push({
          name: isTV ? "Hindi TV Shows" : "Trending in Hindi",
          movies: hindi,
        });
      if (telugu.length >= 4)
        dynamicRails.push({
          name: isTV ? "Telugu TV Shows" : "Popular Telugu Movies",
          movies: telugu,
        });
    }

    const standardCategories = [];
    for (const cat of rawCategories) {
      // Normalize every movie's source/sourceName from availablePlatforms
      let filtered = (Array.isArray(cat.movies) ? cat.movies : []).filter(Boolean);
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



      if (
        filter === "all" ||
        filter === "series" ||
        filter === "tv shows" ||
        filter === "movies"
      ) {
        filtered = filtered.sort(
          (a, b) => (b.imdbRating || 0) - (a.imdbRating || 0),
        );
      }

      if (filtered.length > 0) {
        standardCategories.push({ name: dynamicName, movies: filtered });
      }
    }

    // Interleave the dynamic rails (New & Popular / Anime / Regional) with the
    // standard backend rails
    const finalCategories = [];
    let dynamicIdx = 0;

    for (let i = 0; i < standardCategories.length; i++) {
      finalCategories.push(standardCategories[i]);
      if ((i + 1) % 2 === 0 && dynamicIdx < dynamicRails.length) {
        finalCategories.push(dynamicRails[dynamicIdx]);
        dynamicIdx++;
      }
    }

    while (dynamicIdx < dynamicRails.length) {
      finalCategories.push(dynamicRails[dynamicIdx]);
      dynamicIdx++;
    }

    return finalCategories;
    } catch (e) {
      logError("HomePage", "categories memo failed — rails fall back to empty.", e, { filter });
      return [];
    }
  }, [rawCategories, filter, activeGenre, activePlatform]);

  // Shared predicates for the Top 10 / Trending / Airing rails
  const isSeriesMovie = isSeriesLike;

  const applyPageFilter = (list) => {
    if (filter === "series" || filter === "tv shows")
      return (list || []).filter(isSeriesMovie);
    if (filter === "movies") return (list || []).filter((m) => !isSeriesMovie(m));
    return Array.isArray(list) ? list : [];
  };


  const trendingThisWeek = useMemo(
    () => applyPageFilter(asArray(trendingData)).slice(0, 20),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trendingData, filter],
  );

  const airingThisWeek = useMemo(() => {
    // Global /tv/on_the_air and regional on-the-air series interleaved, deduped by
    // id. Global is capped at 15 slots so a full 20-row feed cannot crowd the
    // regional series out of the rail.
    const regional = applyPageFilter(asArray(regionalAiringData));
    const merged = [
      ...applyPageFilter(asArray(airingData)).slice(0, 20 - Math.min(regional.length, 8)),
      ...regional,
    ];
    const seen = new Set();
    const deduped = [];
    for (const m of merged) {
      if (!m || !m.id || seen.has(m.id)) continue;
      seen.add(m.id);
      deduped.push(m);
    }
    return deduped.slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airingData, regionalAiringData, filter]);

  const popularNow = useMemo(
    () => applyPageFilter(asArray(popularData)).slice(0, 20),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [popularData, filter],
  );

  const topRated = useMemo(
    () => applyPageFilter(asArray(topRatedData)).slice(0, 20),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topRatedData, filter],
  );

  const nowPlaying = useMemo(
    () =>
      applyPageFilter(
        asArray(nowPlayingData).map((m) => ({ ...m, isSeries: false })),
      ).slice(0, 20),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nowPlayingData, filter],
  );

  // "Upcoming" — premieres only: movies with a future release date plus series the
  // backend flags isUpcoming. Ongoing shows whose NEXT EPISODE is in the future are
  // excluded (they live in the Airing rail). Rows are anchored to the current date
  // (TODAY/TOMORROW/weekday chips), sorted soonest-first, 365-day window, and NEVER
  // padded with trending/airing titles — released films are not "coming soon".
  const upcomingReleases = useMemo(() => {
    const pool = [
      ...asArray(airingData),
      ...asArray(trendingData),
      ...asArray(top10Data),
      ...asArray(featuredData),
      ...asArray(regionalUpcomingData),
      ...asArray(rawCategories).flatMap((c) => (Array.isArray(c.movies) ? c.movies : [])),
    ];
    const hasArtwork = (m) => m && (m.posterUrl || m.backdropUrl);
    const built = applyPageFilter(buildUpcoming(pool, 365))
      .filter((m) => !isSeriesMovie(m) || m.isUpcoming === true)
      .filter(hasArtwork);
    // Regional premieres get a guaranteed share: a pure date-sort + slice(0, 12)
    // lets nearer global dates crowd Tamil/Hindi/Malayalam/Telugu theatrical
    // releases out of the rail entirely.
    const regionalIds = new Set(asArray(regionalUpcomingData).map((m) => m.id));
    const regionalTitles = [];
    const globalTitles = [];
    for (const m of built) {
      (regionalIds.has(m.id) ? regionalTitles : globalTitles).push(m);
    }
    return [
      ...regionalTitles.slice(0, Math.min(4, regionalTitles.length)),
      ...globalTitles,
    ].slice(0, 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airingData, trendingData, top10Data, featuredData, regionalUpcomingData, rawCategories, filter]);

  // Proximity-aware heading: surface when the next premiere drops instead of
  // always saying a flat "Upcoming".
  const upcomingTitle = (() => {
    const translatedScope =
      filter === "series" || filter === "tv shows"
        ? t("home.scope.shows")
        : filter === "movies"
          ? t("home.scope.movies")
          : "";
    const nearest = upcomingReleases[0];
    if (nearest && nearest.daysUntil <= 7)
      return translatedScope
        ? t("home.upcomingWeekScope", { scope: translatedScope })
        : t("home.upcomingWeek");
    if (nearest && nearest.daysUntil <= 30)
      return translatedScope
        ? t("home.upcomingMonthScope", { scope: translatedScope })
        : t("home.upcomingMonth");
    return translatedScope
      ? t("home.rails.upcomingScope", { scope: translatedScope })
      : t("home.rails.upcoming");
  })();

  // Top 10 — backend rank first, padded to a full 10 per tab (the per-page-type
  // backend list can be short). Padding comes from tab-filtered
  // trending/airing/upcoming, deduped by id so real ranks keep leading and the
  // rank badges always count 1–10.
  const top10Movies = useMemo(() => {
    const ranked = applyPageFilter(asArray(top10Data)).slice(0, 10);
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
  }, [top10Data, filter, trendingThisWeek, airingThisWeek, upcomingReleases]);

  const lastWatched =
    continueWatching && continueWatching.length > 0
      ? continueWatching[0]
      : null;

  const { data: rawRecommendations, error: recommendationsError } = useQuery({
    queryKey: ["recommendations", lastWatched?.id],
    queryFn: () => movieService.getRecommendations(lastWatched.id),
    enabled: Boolean(lastWatched && lastWatched.id),
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (recommendationsError) {
      reportQueryError("HomePage", ["recommendations", lastWatched?.id], recommendationsError, { lastWatchedId: lastWatched?.id });
    }
  }, [recommendationsError, lastWatched?.id]);
  const recommendations = useMemo(() => asArray(rawRecommendations), [rawRecommendations]);

  const finalPool = useMemo(() => {
    try {
    let globalPool = [];
    let regionalPool = [];
    let recommendedPool = [];
    let tabFilteredMovies = [];

    if (featuredMovies.length > 0) {
      featuredMovies.forEach((fm) => {
        if ((filter === "series" || filter === "tv shows") && fm.isSeries)
          globalPool.push(fm);
        else if (filter === "movies" && !fm.isSeries) globalPool.push(fm);
        else if (filter === "all" || filter === "mylist")
          globalPool.push(fm);
      });
    }

    if (categories.length > 0) {
      const allCategoryMovies = [];
      categories.forEach((c) => {
        (Array.isArray(c.movies) ? c.movies : []).filter(Boolean).forEach((m) => {
          if (m.backdropUrl && !allCategoryMovies.find((p) => p.id === m.id)) {
            allCategoryMovies.push(m);
          }
        });
      });

      tabFilteredMovies = allCategoryMovies;
      if (filter === "series" || filter === "tv shows")
        tabFilteredMovies = tabFilteredMovies.filter((m) => m.isSeries);
      if (filter === "movies")
        tabFilteredMovies = tabFilteredMovies.filter((m) => !m.isSeries);

      // Regional pool: the dedicated /discover sweeps (getRegionalUpcoming /
      // getRegionalAiring) are primary so the banner surfaces real
      // Tamil/Hindi/Malayalam/Telugu titles instead of hoping trending category rows
      // carry a matching language string. Series tab → airing series, movies tab →
      // upcoming films, otherwise both.
      const regionalFeed = [
        ...asArray(regionalUpcomingData),
        ...asArray(regionalAiringData),
      ];
      for (const m of regionalFeed) {
        if (m.isSeries && (filter === "movies")) continue;
        if (!m.isSeries && (filter === "series" || filter === "tv shows")) continue;
        if (!regionalPool.some((p) => p.id === m.id)) regionalPool.push(m);
      }

      // Empty-regional fallback: category-derived language/title match ONLY — the
      // international Drama/rating rows are what used to mix generic titles into the
      // banner. Each fallback must also carry a title image, and entries with their
      // own logoUrl are preferred so an old regional never shows beside an
      // international item.
      if (regionalPool.length === 0) {
        regionalPool = tabFilteredMovies.filter(
          (m) =>
            m.audioLanguages?.some((l) =>
              l.match(/Tamil|Malayalam|Hindi|Telugu/i),
            ) ||
            m.languages?.some((l) => l.match(/Tamil|Malayalam|Hindi|Telugu/i)) ||
            (m.title && m.title.match(/Tamil|Malayalam|Hindi|Telugu/i)),
        );
        // Last resort — still regional-only language/title match, never the
        // generic international Drama+rating fallback that polluted the pool.
        if (regionalPool.length === 0) {
          regionalPool = tabFilteredMovies.filter(
            (m) =>
              m.audioLanguages?.some((l) =>
                l.match(/Tamil|Malayalam|Hindi|Telugu/i),
              ) ||
              m.languages?.some((l) =>
                l.match(/Tamil|Malayalam|Hindi|Telugu/i),
              ),
          );
        }
      }

      // Extract Recommended Content based on User History
      const lastWatchedGenres = lastWatched?.genres || [];
      recommendedPool = tabFilteredMovies.filter(
        (m) =>
          m.genres?.some((g) => lastWatchedGenres.includes(g)) &&
          m.imdbRating >= 7.5,
      );
    }

    // Banner slots need a TITLE IMAGE: the hero renders the show logo
    // (HeroTitleLogo), and a bare backdrop/poster falls back to the <h1> text the
    // user does not want on a banner. logoUrl is the TMDB English logo;
    // titleImage/titleLogo are the normalized aliases some feeds carry.
    const bannerReady = (m) =>
      m.logoUrl || m.titleImage || m.logoUrl?.trim() || m.titleLogo || m.logo;
    globalPool = globalPool.filter(bannerReady);
    regionalPool = regionalPool.filter(bannerReady);
    recommendedPool = recommendedPool.filter(bannerReady);

    // New-releases pool: the Hindi/English/Malayalam/Tamil sweep (newest first)
    // leads the hero mix right after Continue Watching, so freshly released titles
    // in those languages surface instead of trending rows.
    const newReleasesPool = [];
    for (const m of asArray(newReleasesData)) {
      if (!m || m.id === null || m.id === undefined) continue;
      if (m.isSeries && filter === "movies") continue;
      if (!m.isSeries && (filter === "series" || filter === "tv shows")) continue;
      if (!newReleasesPool.some((p) => String(p.id) === String(m.id))) newReleasesPool.push(m);
    }
    const newReleasesReady = newReleasesPool.filter(bannerReady);

    const pool = [];
    const usedIds = new Set();

    const pushToPool = (movie) => {
      if (movie && !usedIds.has(movie.id)) {
        pool.push(movie);
        usedIds.add(movie.id);
      }
    };

    // Continue Watching leads the banner (most recent resumed title)
    const cwSeeded = Array.isArray(continueWatching) ? continueWatching : [];
    for (const m of cwSeeded.slice(0, 3)) {
      if (bannerReady(m)) pushToPool(m);
    }

    let nrIdx = 0,
      gIdx = 0,
      rIdx = 0,
      recIdx = 0;
    while (
      pool.length < 7 &&
      (nrIdx < newReleasesReady.length ||
        gIdx < globalPool.length ||
        rIdx < regionalPool.length ||
        recIdx < recommendedPool.length)
    ) {
      pushToPool(newReleasesReady[nrIdx++]);
      pushToPool(globalPool[gIdx++]);
      pushToPool(regionalPool[rIdx++]);
      pushToPool(recommendedPool[recIdx++]);
    }

    // 5. Always find better: If the pool didn't reach 7 banner-ready items,
    // backfill from any featured movie that is banner-ready.
    if (pool.length < 7 && featuredMovies.length > 0) {
      for (const fm of featuredMovies) {
        if (pool.length >= 7) break;
        if (bannerReady(fm)) {
          pushToPool(fm);
        }
      }
    }

    // 6. Last resort: if we still didn't hit 7, pull from ANY source movie
    // with an image so the hero always has a full rotation.
    if (pool.length < 7) {
      const allCandidates = [...tabFilteredMovies, ...featuredMovies];
      for (const m of allCandidates) {
        if (pool.length >= 7) break;
        if (m && (m.backdropUrl || m.posterUrl || m.poster)) {
          pushToPool(m);
        }
      }
    }

    return pool;
    } catch (e) {
      logError("HomePage", "hero-pool memo failed — hero falls back to empty.", e, { filter });
      return [];
    }
  }, [featuredMovies, categories, filter, lastWatched, continueWatching, regionalUpcomingData, regionalAiringData, newReleasesData]);

  const totalFeatured = finalPool.length;
  const activeFeaturedMovie =
    totalFeatured > 0 ? finalPool[featuredIndex % totalFeatured] : null;
  const hasInitialLoadError = !activeFeaturedMovie && (featuredError || categoriesError);

  const cwResumeEntry =
    Array.isArray(continueWatching) && activeFeaturedMovie
      ? continueWatching.find(
          (m) => String(m?.id) === String(activeFeaturedMovie.id),
        )
      : null;
  const resumePct = cwResumeEntry ? Math.round(progressPct(cwResumeEntry)) : 0;

  // Auto-rotation: use ref for hover state to avoid stale closures and unnecessary interval restarts
  useEffect(() => {
    if (totalFeatured <= 1 || reduceMotion) return;
    const timer = setInterval(() => {
      if (!isHeroHoveredRef.current) {
        setFeaturedIndex((prev) => prev + 1);
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [totalFeatured, reduceMotion]);

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

  const heroTouchStartRef = useRef({ x: 0, y: 0 });
  const heroTouchPauseTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (heroTouchPauseTimeoutRef.current) clearTimeout(heroTouchPauseTimeoutRef.current);
    };
  }, []);

  const handleHeroTouchStart = useCallback((e) => {
    if (heroTouchPauseTimeoutRef.current) clearTimeout(heroTouchPauseTimeoutRef.current);
    isHeroHoveredRef.current = true;
    if (!e.touches || e.touches.length === 0) return;
    heroTouchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    };
  }, []);

  const handleHeroTouchEnd = useCallback((e) => {
    // Resume auto-rotation after 6 seconds of touch inactivity
    if (heroTouchPauseTimeoutRef.current) clearTimeout(heroTouchPauseTimeoutRef.current);
    heroTouchPauseTimeoutRef.current = setTimeout(() => {
      isHeroHoveredRef.current = false;
    }, 6000);

    if (totalFeatured <= 1) return;
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - heroTouchStartRef.current.x;
    const dy = touch.clientY - heroTouchStartRef.current.y;
    // Horizontal swipe threshold: > 45px and predominantly horizontal
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) {
        setFeaturedIndex((current) => (current + 1) % totalFeatured);
      } else {
        setFeaturedIndex((current) => (current - 1 + totalFeatured) % totalFeatured);
      }
    }
  }, [totalFeatured]);

  return (
    <div className="main-content main-content--has-hero" style={{ paddingBottom: "2rem" }}>
      <AmbientBackground
        src={
          activeFeaturedMovie
            ? activeFeaturedMovie.backdropUrl ||
              activeFeaturedMovie.posterUrl ||
              activeFeaturedMovie.poster
            : null
        }
      />
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
          {/* Persistent hero shell — key is static so slide changes crossfade
              the backdrop and content layers instead of remounting the whole
              hero (which blanked it for ~1.3s with mode="wait"). The shell
              mounts once on load and stays mounted while titles rotate. */}
          <motion.div
            key="hero"
            className="hero-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            style={{ willChange: "opacity" }}
            onTouchStart={handleHeroTouchStart}
            onTouchEnd={handleHeroTouchEnd}
            onClick={() => openDetails(activeFeaturedMovie)}
            onMouseEnter={() => { isHeroHoveredRef.current = true; setIsHeroHovered(true); }}
            onMouseLeave={() => { isHeroHoveredRef.current = false; setIsHeroHovered(false); }}
            onFocus={() => { isHeroHoveredRef.current = true; setIsHeroHovered(true); }}
            onBlur={(event) => {
              if (event.currentTarget.contains(event.relatedTarget)) return;
              isHeroHoveredRef.current = false;
              setIsHeroHovered(false);
            }}
            onKeyDown={(event) => {
              if (totalFeatured <= 1) return;
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setFeaturedIndex((current) => (current - 1 + totalFeatured) % totalFeatured);
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setFeaturedIndex((current) => (current + 1) % totalFeatured);
              }
            }}
          >
            {/* Backdrop — keyed crossfade. The next slide's frame is preloaded
                a slide ahead, and old/new frames stack (both absolutely
                positioned) so the outgoing one fades out beneath the incoming
                one. No hero remount, no blank gap. */}
            <AnimatePresence>
              <motion.img
                key={activeFeaturedMovie.id}
                src={activeFeaturedMovie.backdropUrl || activeFeaturedMovie.posterUrl || activeFeaturedMovie.poster}
                alt={activeFeaturedMovie.title}
                className="hero-bg"
                fetchpriority="high"
                loading="eager"
                decoding="async"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
            </AnimatePresence>

            {/* Apple-style gradient overlay — gradient from bottom and left, no hard black */}
            <div className="hero-overlay hero-overlay--apple" />

            {/* Prev / Next arrows — appear on hover */}
            <AnimatePresence>
              {(isHeroHovered || isCoarse) && totalFeatured > 1 && (
                <>
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                  >
                    <RailArrow
                      dir="left"
                      sideClass="left-4"
                      onClick={(e) => { e.stopPropagation(); setFeaturedIndex((featuredIndex - 1 + totalFeatured) % totalFeatured); }}
                    />
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                  >
                    <RailArrow
                      dir="right"
                      sideClass="right-4"
                      onClick={(e) => { e.stopPropagation(); setFeaturedIndex((featuredIndex + 1) % totalFeatured); }}
                    />
                  </motion.div>
                </>
              )}
            </AnimatePresence>

            {/* ── Apple Hero Content ─────────────────────────────────────── */}
            <AnimatePresence>
            <motion.div
              key={activeFeaturedMovie.id + "-content"}
              className="hero-content hero-content--apple"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}
              style={{ willChange: "transform, opacity" }}
            >
                {/* Title / Logo — real show wordmark, lazy-fetched on demand */}
                <HeroTitleLogo movie={activeFeaturedMovie} />

                {/* Eyebrow — genre tags, sits below the logo */}
                <div className="hero-eyebrow">
                  {activeFeaturedMovie.genres?.slice(0, 2).map((g) => (
                    <span key={g} className="hero-eyebrow-tag">{g}</span>
                  ))}
                </div>

                {/* Meta row — gold star rating · calendar year · genre · runtime */}
                <div className="hero-meta hero-meta--apple">
                  {activeFeaturedMovie.imdbRating > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', borderRight: '1px solid rgba(255,255,255,0.2)', paddingRight: '16px', marginRight: '4px' }}>
                      <RatingsCluster movie={activeFeaturedMovie} size="lg" itemClassName="hero-meta-item" />
                    </div>
                  )}
                  {(activeFeaturedMovie.releaseYear || activeFeaturedMovie.year) && (
                    <span className="hero-meta-item">
                      <Calendar size={14} />
                      {String(activeFeaturedMovie.releaseYear || activeFeaturedMovie.year).substring(0, 4)}
                    </span>
                  )}
                  {activeFeaturedMovie.genres?.[0] ? (
                    <span className="hero-meta-item">
                      <Heart size={14} fill="currentColor" />
                      {activeFeaturedMovie.genres[0]}
                    </span>
                  ) : (
                    <span className="maturity-badge">{activeFeaturedMovie.maturityRating || "TV-MA"}</span>
                  )}
                  {activeFeaturedMovie.duration && !activeFeaturedMovie.duration.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/) && (
                    <span className="hero-meta-item">{activeFeaturedMovie.duration}</span>
                  )}
                </div>

                {/* Description */}
                {(activeFeaturedMovie.description || activeFeaturedMovie.longDescription || activeFeaturedMovie.overview) && (
                  <p className="hero-desc hero-desc--apple">
                    {activeFeaturedMovie.description || activeFeaturedMovie.longDescription || activeFeaturedMovie.overview}
                  </p>
                )}

                {/* Resume progress for continue-watching banner titles */}
                {cwResumeEntry && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                    <div style={{ width: "min(200px, 30vw)", height: 4, borderRadius: 999, background: "rgba(255,255,255,0.22)", overflow: "hidden" }}>
                      <div style={{ width: `${resumePct}%`, height: "100%", background: "#E50914" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)", letterSpacing: "0.3px" }}>
                      {t("home.hero.watched", { pct: resumePct })}
                    </span>
                  </div>
                )}

                {/* CTA row — white Play pill · single pill with list toggle | info */}
                <div className="hero-ctas">
                  <motion.button
                    className="hero-cta-play"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={(e) => { e.stopPropagation(); navigate(`/watch/${activeFeaturedMovie.id}/${slugify(activeFeaturedMovie.title, { lower: true, strict: true })}`); }}
                  >
                    <Play size={20} strokeWidth={2.5} fill="currentColor" stroke="none" />
                    {cwResumeEntry ? t("home.hero.resume") : t("home.hero.play")}
                  </motion.button>

                  <div className="hero-action-pill inline-flex items-center shrink-0 rounded-full bg-white/10 backdrop-blur-[20px] backdrop-saturate-150 border border-white/10 shadow-lg shadow-black/5">
                    <motion.button
                      className="hero-cta-secondary-icon"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.92 }}
                      onClick={(e) => { e.stopPropagation(); toggleMyList(activeFeaturedMovie); }}
                      aria-label={isInList(activeFeaturedMovie?.id) ? t("home.hero.removeMyList") : t("home.hero.addMyList")}
                      title={isInList(activeFeaturedMovie?.id) ? t("home.hero.removeMyList") : t("home.hero.addMyList")}
                    >
                      {isInList(activeFeaturedMovie?.id) ? <Check size={18} strokeWidth={2.5} /> : <Plus size={18} strokeWidth={2.5} />}
                    </motion.button>
                    <span className="hero-cta-separator" aria-hidden="true">|</span>
                    <motion.button
                      className="hero-cta-secondary-icon"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.92 }}
                      aria-label={t("home.hero.moreInfo")}
                      title={t("home.hero.moreInfo")}
                      onClick={(e) => { e.stopPropagation(); openDetails(activeFeaturedMovie); }}
                    >
                      <Info size={18} strokeWidth={2.5} />
                    </motion.button>
                  </div>
                </div>
            </motion.div>
            </AnimatePresence>

            {/* Slim progress dots */}
            {totalFeatured > 1 && (
              <div className="hero-dots hero-dots--apple" aria-label="Featured titles">
                {Array.from({ length: totalFeatured }).map((_, i) => {
                  const isActive = i === featuredIndex % totalFeatured;
                  return (
                    <motion.button
                      key={i}
                      onClick={(e) => { e.stopPropagation(); setFeaturedIndex(i); }}
                      whileTap={{ scale: 0.88 }}
                      aria-label={`Show ${finalPool[i]?.title || `featured title ${i + 1}`}`}
                      aria-current={isActive ? "true" : undefined}
                      className={`hero-dot${isActive ? " hero-dot--active" : ""}`}
                    >
                      {isActive && (
                        <div className="dot-filler" />
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
                "radial-gradient(ellipse 60% 50% at 50% 40%, rgba(149,255,80,0.08) 0%, transparent 70%), #050505",
            }}
          >
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <div className="logo-icon" style={{ margin: "0 auto 1rem", width: "56px", height: "56px" }}>
                <Play size={28} fill="currentColor" stroke="none" />
              </div>
              <h2 style={{ color: "#fff", marginBottom: "0.5rem" }}>
                {hasInitialLoadError ? t("home.loadError") : t("home.welcome")}
              </h2>
              <p style={{ color: "#a1a1aa", maxWidth: "420px", margin: "0 auto" }}>
                {hasInitialLoadError
                  ? t("home.heroError")
                  : t("home.heroEmpty")}
              </p>
              {hasInitialLoadError && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: "1.25rem" }}
                  onClick={() => {
                    refetchFeatured();
                    refetchCategories();
                  }}
                >
                  {t("home.tryAgain")}
                  </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Leaving Soon — home page only */}
      {!loading && filter === 'all' && activeGenre === 'All' && (
<LeavingSoonBanner items={detectLeavingSoon(
            categories.flatMap(c => (Array.isArray(c.movies) ? c.movies : [])), 14
          )} />
      )}

      {/* Upcoming — standard rail UI on every tab; tab-filtered (all on Home,
          movies/series on their pages) and padded so the rail always fills. */}
      {!loading && activeGenre === "All" && upcomingReleases.length > 0 && (
        <FadeInSection style={{ marginTop: "clamp(1.75rem, 3.5vw, 2.75rem)" }}>
          <ErrorBoundary>
            <MovieRail
              railIndex={0}
              category={{ name: upcomingTitle, movies: upcomingReleases }}
            />
          </ErrorBoundary>
        </FadeInSection>
      )}

      {/* Continue Watching — resume-first; right below the hero, on every tab */}
      {!loading && continueWatching && continueWatching.length > 0 && (
        <FadeInSection style={{ marginTop: "clamp(1.75rem, 3.5vw, 2.75rem)" }}>
          <ErrorBoundary>
            <ContinueWatchingRail railIndex={0} items={continueWatching} />
          </ErrorBoundary>
        </FadeInSection>
      )}

      {/* Categories Section */}
      <section
        style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}
      >
        <div className="section-header" style={{ marginBottom: 0 }}>
          <h2 className="section-title">{sectionTitle}</h2>
        </div>

        {loading ? (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}
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
            {t("home.noTitles")}
          </h3>
        ) : (
          <>
            {/* Because you watched — personalized discovery ranker */}
            {filter === "all" && lastWatched && recommendations?.length > 0 && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={1}
                    category={{
                      name: t("home.rails.becauseWatched", { title: lastWatched.title }),
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
              filter === "movies") &&
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
                    category={{ name: t("home.rails.trendingThisWeek"), movies: trendingThisWeek }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}
            {/* 5. Airing This Week — currently-airing TV, the "On the Air" row */}
            {airingThisWeek.length > 0 && activeGenre === "All" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={4}
                    category={{ name: t("home.rails.airingThisWeek"), movies: airingThisWeek }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}
            {/* 6. Popular Now */}
            {popularNow.length > 0 && activeGenre === "All" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={5}
                    category={{ name: t("home.rails.popularNow"), movies: popularNow }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}
            {/* 7. Top Rated */}
            {topRated.length > 0 && activeGenre === "All" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={6}
                    category={{ name: t("home.rails.topRated"), movies: topRated }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}
            {/* 8. Now Playing / In Theaters */}
            {nowPlaying.length > 0 && activeGenre === "All" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={7}
                    category={{ name: t("home.rails.nowPlaying"), movies: nowPlaying }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}

            {/* 9. Cinejoy-style editorial curated rows */}
            <EditorialRails filter={filter} activeGenre={activeGenre} />

            {/* 10. My List */}
            {myList && myList.length > 0 && filter === "all" && (
              <FadeInSection>
                <ErrorBoundary>
                  <MovieRail
                    railIndex={8}
                    category={{ name: t("home.rails.myList"), movies: myList }}
                  />
                </ErrorBoundary>
              </FadeInSection>
            )}

            {/* 11. Genre showcase — Netflix/Prime-style rows (tab-aware) */}
            <ErrorBoundary>
              <GenreShowcase filter={filter} activeGenre={activeGenre} />
            </ErrorBoundary>

            {/* 12. Category rails */}
            {categories.slice(0, visibleCatCount).map((category, catIdx) => (
              <FadeInSection key={catIdx} delay={0.1}>
                <ErrorBoundary key={category.id || catIdx}>
                  <MovieRail railIndex={catIdx + 9} category={category} />
                </ErrorBoundary>
              </FadeInSection>
            ))}
          </>
        )}
      </section>

      {/* Netflix-style info modal — Detail View Type governs whether the
          hero (banner click / Info button) opens this or navigates. */}
      {modalHost}
    </div>
  );
}
