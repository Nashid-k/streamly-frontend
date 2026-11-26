import SEO from "../components/SEO";
import { DURATION_2, EASE_2 } from "../constants/motion";
import slugify from "slugify";
import ErrorBoundary from "../components/ErrorBoundary";
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Check, Plus, Info } from "lucide-react";
import {
  motion,
  AnimatePresence,
  useReducedMotion,
} from "framer-motion";
import { useAppAuth } from "../context/auth";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import { progressPct } from "../utils/resumeProgress";
import AmbientBackground from "../components/AmbientBackground";
import HeroTitleLogo, { HeroTokenContext } from "../components/HeroTitleLogo";
import useDetailView, {
  getSavedDetailHeroIndex,
  isDetailRestoring,
} from "../hooks/useDetailView";
import { useNearViewport } from "../hooks/useNearViewport";

import { asArray, EMPTY_ARRAY } from "../utils";
import { setBannerMemory } from "../utils/bannerMemory";
import { useI18n } from "../i18n/index.jsx";
import { logEmptyData, logError, reportQueryError } from "../utils/debugLogger";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { hasLoadedMediaUrl, markMediaUrlLoaded } from "../utils/posterCache";
import HomeRails from "../components/rails/HomeRails";

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

// Regional rail language name → TMDB original-language code. normalizeResult
// emits `originalLanguage` (it never populates audioLanguages/languages), so a
// name-only match left every regional rail empty.
/* Banner dwell. The 2.0 target rotates every 9s (`--hero-rotate-duration` in
   tokens.css); `.dot-filler` (search.css) and `dotlive` (hero.css) paint the
   same countdown. DURATION_2.REVEAL owns the slide-swap fade. */
const HERO_DWELL_MS = 9000;
const HERO_LIMIT = 5;

const REGIONAL_LANGUAGE_CODES = {
  malayalam: "ml",
  tamil: "ta",
  hindi: "hi",
  telugu: "te",
};

// `title` is the route's document title (SEO) — the feed's section heading is
// gone, so it no longer doubles as one.
export default function Home({ filter = "all", title }) {
  const { t } = useI18n();
  const [restoredFromDetail] = useState(() => isDetailRestoring());
  const [featuredIndex, setFeaturedIndex] = useState(() => getSavedDetailHeroIndex() ?? 0);
  const prevFilterRef = useRef(filter);
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [activeGenre, setActiveGenre] = useState("All");
  const { continueWatching, isInList, toggleMyList } = useAppAuth();

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


  // Regional (Tamil/Hindi/Malayalam/Telugu) feeds, merged into the hero banner
  // pool and the Airing rail so those keep their global breadth. Each is a /discover sweep,
  // cached 10 min like the other rails.
  //
  // These three are ~38 catalogue requests between them (4 languages x pages,
  // plus 10 detail calls), and everything they build renders BELOW the hero.
  // They wait for the rail section to come within 600px of the viewport, so a
  // cold load no longer pays for them before the viewer has scrolled anywhere.
  const [railsSentinelRef, railsNear] = useNearViewport("600px 0px");
  const { data: regionalUpcomingData, error: regionalUpcomingError } = useQuery({
    queryKey: ["upcoming-regional"],
    queryFn: () => movieService.getRegionalUpcoming(90),
    enabled: railsNear,
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: regionalAiringData, error: regionalAiringError } = useQuery({
    queryKey: ["airing-regional"],
    queryFn: () => movieService.getRegionalAiring(10),
    enabled: railsNear,
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // Fresh Hindi/English/Malayalam/Tamil releases (newest first) for the banner's
  // "newly released" lineup.
  const { data: newReleasesData, error: newReleasesError } = useQuery({
    queryKey: ["new-releases"],
    queryFn: () => movieService.getNewReleases(90),
    enabled: railsNear,
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
    if (regionalUpcomingError) reportQueryError("HomePage", ["upcoming-regional"], regionalUpcomingError, { filter });
    if (regionalAiringError) reportQueryError("HomePage", ["airing-regional"], regionalAiringError, { filter });
    if (newReleasesError) reportQueryError("HomePage", ["new-releases"], newReleasesError, { filter });
  }, [featuredQueryError, categoriesQueryError, regionalUpcomingError, regionalAiringError, newReleasesError, filter]);

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

  // The home feed shows a fixed three category rails (below), so there is no
  // lazy end-of-feed sentinel to grow any more — the page terminates at the
  // "Explore all" link instead of scrolling forever.

  const isHeroHoveredRef = useRef(false);
  /* The banner's Info button always opens the in-place info modal, whatever the
     Detail View Type is — that setting governs card clicks, not this button. */

  useEffect(() => {
    if (prevFilterRef.current === filter) return;
    prevFilterRef.current = filter;
    // Reset the genre tab and featured index only when the filter actually changes
    // (never on a Back remount where useDetailView restores scroll + hero index).
    setActiveGenre("All");
    if (!isDetailRestoring()) {
      setFeaturedIndex(0);
      window.scrollTo({ top: 0, behavior: "auto" });
    }
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
      const code = REGIONAL_LANGUAGE_CODES[lang.toLowerCase()];
      return allMovies
        .filter(
          (m) =>
            (code && m.originalLanguage === code) ||
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
    if (activeGenre === "All") {
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
  }, [rawCategories, filter, activeGenre]);

  const isSeriesMovie = isSeriesLike;

  const applyPageFilter = (list) => {
    if (filter === "series" || filter === "tv shows")
      return (list || []).filter(isSeriesMovie);
    if (filter === "movies") return (list || []).filter((m) => !isSeriesMovie(m));
    return Array.isArray(list) ? list : [];
  };

  // The home feed opens with the two trending rows. They come from the two
  // `/trending/{movie,tv}/week` feeds `getCategories` already returns (the same
  // payload the hero pool reads), so the first two rails cost no extra request.
  // Matched by name with an index fallback: the service owns those names today,
  // but a rename there must not silently blank the top of the page.
  const trendingMovies = useMemo(() => {
    const cat =
      rawCategories.find((c) => /movie/i.test(c?.name || "")) || rawCategories[0];
    return applyPageFilter(asArray(cat?.movies)).slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCategories, filter]);

  const trendingSeries = useMemo(() => {
    const cat =
      rawCategories.find((c) => /tv|series|show/i.test(c?.name || "")) ||
      rawCategories[1];
    return applyPageFilter(asArray(cat?.movies)).slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCategories, filter]);

  const lastWatched =
    continueWatching && continueWatching.length > 0
      ? continueWatching[0]
      : null;

  // Because-you-watched anchor: the rail is computed for ONE title. Default
  // anchor = the most recently watched; the rail head's dropdown lets the
  // viewer re-base the rail on any other title in the watch history (cinejoy's
  // "Because you watched X ▾"). A picked title wins until it leaves the watch
  // list, then the rail falls back to the newest entry.
  const [pickedAnchorId, setPickedAnchorId] = useState(null);
  const becauseAnchor = useMemo(() => {
    if (pickedAnchorId) {
      const picked = continueWatching?.find((m) => m.id === pickedAnchorId);
      if (picked) return picked;
    }
    return lastWatched;
  }, [pickedAnchorId, continueWatching, lastWatched]);

  const {
    data: rawRecommendations,
    isLoading: recommendationsLoading,
    error: recommendationsError,
  } = useQuery({
    queryKey: ["recommendations", becauseAnchor?.id],
    queryFn: () => movieService.getRecommendations(becauseAnchor.id),
    enabled: Boolean(becauseAnchor && becauseAnchor.id),
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
    // While the new anchor's fetch is in flight the previous rail stays up, so
    // the swap reads as an instant re-base instead of a blank rail.
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (recommendationsError) {
      reportQueryError("HomePage", ["recommendations", becauseAnchor?.id], recommendationsError, { anchorId: becauseAnchor?.id });
    }
  }, [recommendationsError, becauseAnchor?.id]);
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

    // Banner slots prefer a TITLE IMAGE: the hero renders the show logo
    // (HeroTitleLogo) and draws the styled text title until that lookup
    // resolves. `featured` items are the curated hero set and no longer carry a
    // pre-fetched logoUrl — the trending list alone is enough to paint — so
    // they are not filtered here. The other feeds still need an image so an old
    // regional or a logo-less card cannot displace the featured rotation.
    const bannerReady = (m) =>
      m.logoUrl || m.titleImage || m.logoUrl?.trim() || m.titleLogo || m.logo;
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
      pool.length < HERO_LIMIT &&
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

    // 5. Always find better: If the pool didn't reach the five-slide target,
    // backfill from any featured movie that is banner-ready.
    //
    // The tab filter has to be re-applied here. `globalPool` was filtered at the
    // top of this memo, but both backfills below reach into the RAW
    // `featuredMovies` list — so on the Movies tab a series that never qualified
    // for `globalPool` (and vice versa) was pushed back in purely because the
    // hero wanted a full rotation. That is how a TV show ended up headlining the
    // Movies banner.
    const matchesTab = (m) => {
      if (!m) return false;
      if (filter === "series" || filter === "tv shows") return Boolean(m.isSeries);
      if (filter === "movies") return !m.isSeries;
      return true;
    };
    if (pool.length < HERO_LIMIT && featuredMovies.length > 0) {
      for (const fm of featuredMovies) {
        if (pool.length >= HERO_LIMIT) break;
        if (matchesTab(fm) && bannerReady(fm)) {
          pushToPool(fm);
        }
      }
    }

    // 6. Last resort: if we still didn't hit the five-slide target, pull from
    // ANY source movie with an image so the hero always has a full rotation.
    if (pool.length < HERO_LIMIT) {
      const allCandidates = [...tabFilteredMovies, ...featuredMovies];
      for (const m of allCandidates) {
        if (pool.length >= HERO_LIMIT) break;
        if (matchesTab(m) && (m.backdropUrl || m.posterUrl || m.poster)) {
          pushToPool(m);
        }
      }
    }

    // Canonical 2.0: heroIds().slice(0,5) — the rotation is a showcase, not a
    // carousel of the whole catalogue, and every extra slide dilutes dwell time.
    return pool.slice(0, HERO_LIMIT);
    } catch (e) {
      logError("HomePage", "hero-pool memo failed — hero falls back to empty.", e, { filter });
      return [];
    }
  }, [featuredMovies, categories, filter, lastWatched, continueWatching, regionalUpcomingData, regionalAiringData, newReleasesData]);

  const totalFeatured = finalPool.length;
  const activeFeaturedMovie =
    totalFeatured > 0 ? finalPool[featuredIndex % totalFeatured] : null;
  const hasInitialLoadError = !activeFeaturedMovie && (featuredError || categoriesError);

  /* The ambient backdrop follows the banner that is actually on screen. The
     wash is a w92 image with the blur baked in by the CDN, so a slide change is
     a few kilobytes and a tiny decode — no full-viewport filter re-raster (the
     reason this used to stay pinned to the pool's first title). */
  const ambientSrc = useMemo(() => {
    if (!activeFeaturedMovie) return null;
    return (
      activeFeaturedMovie.backdropUrl ||
      activeFeaturedMovie.posterUrl ||
      activeFeaturedMovie.poster ||
      null
    );
  }, [activeFeaturedMovie]);

  /* Cross-route banner record (cinejoy parity): publish the on-screen featured
     slide so the browse pages can keep this exact banner when their media kind
     matches instead of skeleton-swapping it on navigation. */
  useEffect(() => {
    if (!activeFeaturedMovie) return;
    const backdropUrl = activeFeaturedMovie.backdropUrl || null;
    const posterUrl = activeFeaturedMovie.posterUrl || activeFeaturedMovie.poster || null;
    if (!backdropUrl && !posterUrl) return;
    setBannerMemory({
      ...activeFeaturedMovie,
      mediaType: activeFeaturedMovie.mediaType || (activeFeaturedMovie.isSeries ? "tv" : "movie"),
    });
  }, [activeFeaturedMovie]);

  const cwResumeEntry =
    Array.isArray(continueWatching) && activeFeaturedMovie
      ? continueWatching.find(
          (m) => String(m?.id) === String(activeFeaturedMovie.id),
        )
      : null;
  const resumePct = cwResumeEntry ? Math.round(progressPct(cwResumeEntry)) : 0;

  // Auto-rotation: a re-armable 9s timeout (not a fixed interval), so an auto
  // tick, a dot click or a swipe each give the selected slide its full dwell.
  // `totalFeatured` is read through a ref so streaming data cannot restart the
  // clock mid-dwell; the dot's progress fill restarts with the active tick.
  const totalFeaturedRef = useRef(totalFeatured);
  useEffect(() => {
    totalFeaturedRef.current = totalFeatured;
  });

  const heroTimerRef = useRef(null);
  const armHeroRotation = useCallback(() => {
    if (heroTimerRef.current) clearTimeout(heroTimerRef.current);
    heroTimerRef.current = null;
    if (reduceMotion || totalFeaturedRef.current <= 1) return;
    heroTimerRef.current = setTimeout(() => {
      heroTimerRef.current = null;
      // Pause on hover, keyboard focus, hidden tab, active route transition, or
      // once scrolled past the hero banner. Re-arm afterwards so the viewer gets
      // a full dwell on return instead of inheriting the interrupted remainder.
      if (
        isHeroHoveredRef.current ||
        document.hidden ||
        window.scrollY > window.innerHeight ||
        window.__streamlyRouteAnimating ||
        Boolean(document.documentElement.dataset.detailTransition)
      ) {
        armHeroRotation();
        return;
      }
      const tf = totalFeaturedRef.current;
      if (tf <= 1) return;
      setFeaturedIndex((prev) => (prev + 1) % tf);
    }, HERO_DWELL_MS);
  }, [reduceMotion]);

  const goToSlide = useCallback(
    (next) => {
      const tf = totalFeaturedRef.current;
      if (tf <= 1) return;
      setFeaturedIndex(((next % tf) + tf) % tf);
      armHeroRotation();
    },
    [armHeroRotation],
  );

  // Live mirror of featuredIndex for the swipe handler, which closes over a
  // stale `featuredIndex` because its effect deps are stable.
  const featuredIndexRef = useRef(featuredIndex);
  useEffect(() => {
    featuredIndexRef.current = featuredIndex;
  }, [featuredIndex]);
  const nextSlide = useCallback(() => featuredIndexRef.current + 1, []);

  useEffect(() => {
    armHeroRotation();
    return () => {
      if (heroTimerRef.current) clearTimeout(heroTimerRef.current);
      heroTimerRef.current = null;
    };
  }, [armHeroRotation, featuredIndex, totalFeatured]);

  // Keep the active slide and its successor ready for an instant 9s rotation,
  // but defer the rest of the five-title pool to idle. A cold Home load no
  // longer puts four full-width backdrops in the first paint's network budget.
  const preloadedArtRef = useRef(new Set());
  useEffect(() => {
    const slides = finalPool.slice(0, HERO_LIMIT);
    if (slides.length === 0) return undefined;

    const loadArt = (movie) => {
      const src = movie?.backdropUrl || movie?.posterUrl || movie?.poster;
      if (!src || preloadedArtRef.current.has(src)) return;
      preloadedArtRef.current.add(src);
      const url = CdnImageAdapter.getBackdropUrl(src);
      const img = new window.Image();
      img.fetchPriority = "low";
      img.onload = () => markMediaUrlLoaded(url);
      img.src = url;
      if (img.complete && img.naturalWidth > 0) markMediaUrlLoaded(url);
    };

    const active = featuredIndex % slides.length;
    const next = (active + 1) % slides.length;
    loadArt(slides[active]);
    loadArt(slides[next]);

    const rest = slides.filter((_, i) => i !== active && i !== next);
    if (rest.length === 0) return undefined;

    let cancelled = false;
    let idleId = 0;
    let timerId = 0;
    const loadRest = () => {
      if (!cancelled) rest.forEach(loadArt);
    };
    if (typeof window.requestIdleCallback === "function") {
      idleId = window.requestIdleCallback(loadRest);
    } else {
      timerId = window.setTimeout(loadRest, 800);
    }
    return () => {
      cancelled = true;
      if (idleId && typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleId);
      }
      if (timerId) window.clearTimeout(timerId);
    };
  }, [finalPool, featuredIndex]);

  const heroTouchStartRef = useRef({ x: 0, y: 0 });
  const heroTouchPauseTimeoutRef = useRef(null);

  /* Banner art quality — the hero art box is 100vw at every breakpoint, so the
     browser picks from the same ladder the watch hero uses instead of taking one
     fixed frame (see CdnImageAdapter.getSrcSet "backdrop"). */
  const heroArtSrc =
    activeFeaturedMovie?.backdropUrl ||
    activeFeaturedMovie?.posterUrl ||
    activeFeaturedMovie?.poster ||
    null;
  const heroArtUrl = heroArtSrc ? CdnImageAdapter.getBackdropUrl(heroArtSrc) : null;

  const description =
    activeFeaturedMovie?.description ||
    activeFeaturedMovie?.longDescription ||
    activeFeaturedMovie?.overview ||
    null;

  /* Canonical 2.0 hero token. The backdrop carries it; the wordmark waits for
     nav idle before swapping, and only while this exact token is still mounted
     — a late lookup for a slide the viewer left cannot repaint that slide. */
  const heroScope = filter === "all" ? "home" : filter;
  const heroIndex = totalFeatured > 0 ? featuredIndex % totalFeatured : 0;
  const heroToken = activeFeaturedMovie
    ? `hero:${heroScope}:${heroIndex}:${activeFeaturedMovie.id}`
    : null;

  const heroMeta = useMemo(() => {
    if (!activeFeaturedMovie) return "";
    const parts = [];
    const rating = Number(activeFeaturedMovie.imdbRating);
    if (rating > 0) parts.push(`${rating.toFixed(1)} ★`);
    const year = String(activeFeaturedMovie.releaseYear || activeFeaturedMovie.year || "").substring(0, 4);
    if (year) parts.push(year);
    const duration = activeFeaturedMovie.duration;
    if (duration && !/^\d{4}-\d{2}-\d{2}$/.test(duration)) parts.push(duration);
    if (activeFeaturedMovie.genres?.[0]) parts.push(activeFeaturedMovie.genres[0]);
    else if (activeFeaturedMovie.maturityRating) parts.push(activeFeaturedMovie.maturityRating);
    return parts.join("  ·  ");
  }, [activeFeaturedMovie]);

  const descWrapRef = useRef(null);
  const descRef = useRef(null);
  const [descOverflow, setDescOverflow] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    setDescExpanded(false);
  }, [activeFeaturedMovie?.id]);

  useEffect(() => {
    const wrap = descWrapRef.current;
    const el = descRef.current;
    if (!wrap || !el) {
      setDescOverflow(false);
      return undefined;
    }
    const measure = () => {
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 27;
      const full = el.scrollHeight;
      wrap.style.setProperty("--hdmax", `${full}px`);
      setDescOverflow(full > lineHeight * 3 + 2);
    };
    const raf = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(raf);
  }, [description, activeFeaturedMovie?.id]);

  /* One-frame .sw pulse on slide change: CSS fades .hbd/.hx out and back in
     over --dur-reveal while the content's own Framer fade stays opacity-only. */
  const [swapping, setSwapping] = useState(false);
  const [heroArtReady, setHeroArtReady] = useState(() => hasLoadedMediaUrl(heroArtUrl));
  const heroBgImgRef = useRef(null);
  const firstSlideRef = useRef(true);
  const heroHxRef = useRef(null);
  const heroHbdRef = useRef(null);
  const heroSectionRef = useRef(null);

  useLayoutEffect(() => {
    const img = heroBgImgRef.current;
    if (heroArtUrl && (hasLoadedMediaUrl(heroArtUrl) || (img?.complete && img?.naturalWidth > 0))) {
      markMediaUrlLoaded(heroArtUrl);
      setHeroArtReady(true);
    } else {
      setHeroArtReady(false);
    }
  }, [heroArtUrl]);

  /* Scroll-driven hero parallax & fade (streamly_2.0.html:761-762).
     Runs synchronously via useLayoutEffect on mount (so B->A return lands with
     exact scroll-matched parallax) and locks during forward transitions so
     B->C's scrollTo(0) never snaps .hx back to full opacity while leaving. */
  useLayoutEffect(() => {
    const resetHero = () => {
      const hx = heroHxRef.current;
      const hbd = heroHbdRef.current;
      const heroEl = heroSectionRef.current;
      if (hx) {
        hx.style.transform = "";
        hx.style.removeProperty("--o");
      }
      if (hbd) {
        hbd.style.backgroundPosition = "";
      }
      if (heroEl) {
        heroEl.classList.remove("hero--offscreen", "hx-swap");
      }
    };
    if (reduceMotion) {
      resetHero();
      return undefined;
    }
    const applyScroll = () => {
      if (document.documentElement.dataset.detailDirection === "forward") {
        return;
      }
      const y = window.scrollY;
      const hx = heroHxRef.current;
      const hbd = heroHbdRef.current;
      const heroEl = heroSectionRef.current;
      const isOffscreen = y > window.innerHeight * 0.85;
      if (heroEl) {
        heroEl.classList.toggle("hero--offscreen", isOffscreen);
        if (y > 4) {
          heroEl.classList.remove("hx-swap");
        }
      }
      if (!isOffscreen) {
        if (hx) {
          hx.style.transform = `translateY(${y * 0.08}px)`;
          hx.style.setProperty("--o", String(Math.max(0, 1 - y / 340)));
        }
        if (hbd) {
          hbd.style.backgroundPosition = `center ${Math.min(92, 50 + y * 0.02)}%`;
        }
      }
    };
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        applyScroll();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    applyScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, [reduceMotion]);

  useEffect(() => {
    if (reduceMotion || firstSlideRef.current) {
      firstSlideRef.current = false;
      return undefined;
    }
    if (window.__streamlyRouteAnimating || document.documentElement.dataset.detailTransition) {
      return undefined;
    }
    const heroEl = heroSectionRef.current;
    heroEl?.classList.add("hx-swap");
    setSwapping(true);
    let swapDoneTimer;
    const raf = window.requestAnimationFrame(() => {
      setSwapping(false);
      swapDoneTimer = window.setTimeout(() => {
        heroEl?.classList.remove("hx-swap");
      }, 460);
    });
    return () => {
      window.cancelAnimationFrame(raf);
      if (swapDoneTimer) clearTimeout(swapDoneTimer);
      heroEl?.classList.remove("hx-swap");
    };
  }, [featuredIndex, reduceMotion]);

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
      // Route swipes through goToSlide so they re-arm the dwell timer too. Swipe with
      // a stale index would advance the wrong slide, so goToSlide reads
      // `featuredIndex` live (it is stable across the effect deps now).
      goToSlide(nextSlide());
    }
  }, [featuredIndex, goToSlide]);

  return (
    <div
      className={`home-page main-content main-content--has-hero main${restoredFromDetail ? " home-page--restored" : ""}`}
      style={{ paddingBottom: "120px" }}
    >
      <AmbientBackground src={ambientSrc} fallback />
      <SEO title={title || "Discover Movies & TV Shows"} />
      <AnimatePresence mode="popLayout" initial={!restoredFromDetail}>
        {loading && !activeFeaturedMovie ? (
          <motion.section
            key="skeleton-hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={restoredFromDetail ? { duration: 0 } : { duration: DURATION_2.REVEAL, ease: EASE_2.UI }}
            className="hero sk-hero skeleton-hero"
            data-sk-scene="home"
            role="region"
            aria-label="Featured title"
          >
            <div className="hbd sk sk-hbd" aria-hidden="true" />
            <div className="hx" aria-hidden="true">
              <div className="hh"><span className="sk sk-ht" /></div>
              <p className="hm"><span className="sk sk-hm" /></p>
              <div className="hdw">
                <p className="hd sk-hd">
                  <span className="sk sk-line" />
                  <span className="sk sk-line" />
                  <span className="sk sk-line short" />
                </p>
              </div>
              <div className="btns">
                <span className="btn p sk sk-btn" />
                <span className="btn g sk sk-btn sm" />
                <span className="btn g sk sk-btn lg" />
              </div>
            </div>
            <div className="dots glass sk-dots" aria-hidden="true">
              {Array.from({ length: HERO_LIMIT }, (_, index) => (
                <button key={index} type="button" tabIndex={-1} disabled>
                  <span className={`sk sk-dot${index ? " dot-idle" : ""}`} />
                </button>
              ))}
            </div>
          </motion.section>
        ) : activeFeaturedMovie ? (
          <ErrorBoundary>
            <motion.section
              ref={heroSectionRef}
              key="hero"
              className={`hero${swapping ? " sw" : ""}`}
              data-hero-token={heroToken || undefined}
              data-hero-index={heroIndex}
              role="region"
              aria-label={`Featured ${activeFeaturedMovie.title}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={restoredFromDetail ? { duration: 0 } : { duration: DURATION_2.REVEAL, ease: EASE_2.UI }}
              onTouchStart={handleHeroTouchStart}
              onTouchEnd={handleHeroTouchEnd}
              onMouseEnter={() => {
                isHeroHoveredRef.current = true;
              }}
              onMouseLeave={() => {
                isHeroHoveredRef.current = false;
              }}
              onFocus={() => {
                isHeroHoveredRef.current = true;
              }}
              onBlur={(event) => {
                if (event.currentTarget.contains(event.relatedTarget)) return;
                isHeroHoveredRef.current = false;
              }}
            >
              <div
                ref={heroHbdRef}
                className="hbd"
                data-art-ready={heroArtReady ? "true" : undefined}
                data-vt={heroToken || undefined}
                style={{
                  "--a": 212,
                  "--b": 265,
                  "--hero-art": heroArtUrl ? `url("${heroArtUrl}")` : "none",
                }}
                aria-hidden="true"
              >
                {heroArtUrl ? (
                  <span
                    className="hbd-art"
                    style={{ backgroundImage: `url("${heroArtUrl}")` }}
                  />
                ) : null}
              </div>

              {/* Frozen shared-detail target stays mounted but never paints on Home. */}
              <img
                ref={heroBgImgRef}
                src={heroArtUrl}
                srcSet={CdnImageAdapter.getSrcSet(heroArtSrc, "backdrop")}
                sizes={CdnImageAdapter.getSizes("backdrop")}
                alt={activeFeaturedMovie.title}
                className="hero-bg"
                fetchPriority={featuredIndex === 0 ? "high" : "auto"}
                loading="eager"
                decoding="async"
                onLoad={() => {
                  markMediaUrlLoaded(heroArtUrl);
                  setHeroArtReady(true);
                }}
              />

              <div ref={heroHxRef} className="hx">
                <HeroTokenContext.Provider value={heroToken}>
                  <div className="hh">
                    <HeroTitleLogo
                      movie={activeFeaturedMovie}
                      fetchPriority={featuredIndex === 0 ? "high" : "auto"}
                    />
                  </div>

                  {heroMeta && <p className="hm">{heroMeta}</p>}

                  {description && (
                    <div ref={descWrapRef} className={`hdw${descExpanded ? " exp" : ""}`}>
                      <p ref={descRef} id="hero-desc" className="hd">
                        {description}
                      </p>
                      <button
                        type="button"
                        className="rm"
                        aria-expanded={descExpanded}
                        aria-controls="hero-desc"
                        hidden={!descOverflow}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDescExpanded((previous) => !previous);
                        }}
                      >
                        {descExpanded ? "Read less" : "Read more"}
                      </button>
                    </div>
                  )}

                  {cwResumeEntry && (
                    <div className="hero-resume">
                      <span style={{ "--resume-pct": `${resumePct}%` }} />
                      <span>{t("home.hero.watched", { pct: resumePct })}</span>
                    </div>
                  )}

                  <div className="btns">
                    <button
                      type="button"
                      className="btn p"
                      onClick={(event) => {
                        event.stopPropagation();
                        navigate(
                          `/watch/${activeFeaturedMovie.id}/${slugify(activeFeaturedMovie.title, {
                            lower: true,
                            strict: true,
                          })}`,
                          { state: { movie: activeFeaturedMovie, autoPlay: true } },
                        );
                      }}
                    >
                      <Play size={20} fill="currentColor" stroke="none" aria-hidden="true" />
                      {cwResumeEntry ? t("home.hero.resume") : t("home.hero.play")}
                    </button>
                    <button
                      type="button"
                      className="btn g"
                      data-focus={heroToken || undefined}
                      onClick={(event) => {
                        event.stopPropagation();
                        openDetails(activeFeaturedMovie, {
                          sourceElement: heroHbdRef.current,
                          detailToken: heroToken,
                          heroIndex,
                        });
                      }}
                    >
                      {t("home.hero.details", "Details")}
                    </button>
                    <button
                      type="button"
                      className="btn g"
                      aria-pressed={isInList(activeFeaturedMovie?.id)}
                      aria-label={
                        isInList(activeFeaturedMovie?.id)
                          ? t("home.hero.removeMyList")
                          : t("home.hero.addMyList")
                      }
                      title={
                        isInList(activeFeaturedMovie?.id)
                          ? t("home.hero.removeMyList")
                          : t("home.hero.addMyList")
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleMyList(activeFeaturedMovie);
                      }}
                    >
                      {isInList(activeFeaturedMovie?.id) ? (
                        <>
                          <Check size={18} aria-hidden="true" />
                          <span>{t("home.hero.inMyList", "In My list")}</span>
                        </>
                      ) : (
                        <>
                          <Plus size={18} aria-hidden="true" />
                          <span>{t("home.hero.addMyList", "Add to My list")}</span>
                        </>
                      )}
                    </button>
                  </div>
                </HeroTokenContext.Provider>
              </div>

              {totalFeatured > 1 && (
                <>
                  <div className="dots glass hero-dots" role="group" aria-label="Featured titles">
                    {Array.from({ length: totalFeatured }).map((_, index) => {
                      const isActive = index === featuredIndex % totalFeatured;
                      const slideTitle = finalPool[index]?.title || `featured title ${index + 1}`;
                      return (
                        <button
                          type="button"
                          key={index}
                          aria-current={isActive ? "true" : undefined}
                          aria-label={`Show ${slideTitle}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            goToSlide(index);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
                          }}
                        />
                      );
                    })}
                  </div>
                  <p className="hero-live" aria-live="polite" aria-atomic="true">
                    {`${activeFeaturedMovie.title}, featured title ${(featuredIndex % totalFeatured) + 1} of ${totalFeatured}`}
                  </p>
                </>
              )}
            </motion.section>
          </ErrorBoundary>
        ) : (
          <motion.section
            key="empty-hero"
            className="hero hero--empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            role="region"
            aria-label="Featured title"
          >
            <div className="hero-empty-copy">
              <h2>{hasInitialLoadError ? t("home.loadError") : t("home.welcome")}</h2>
              <p>{hasInitialLoadError ? t("home.heroError") : t("home.heroEmpty")}</p>
              {hasInitialLoadError && (
                <button
                  type="button"
                  className="btn g"
                  onClick={() => {
                    refetchFeatured();
                    refetchCategories();
                  }}
                >
                  {t("home.tryAgain")}
                </button>
              )}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <HomeRails
        loading={loading}
        filter={filter}
        railsSentinelRef={railsSentinelRef}
        trendingMovies={trendingMovies}
        trendingSeries={trendingSeries}
        becauseAnchor={becauseAnchor}
        onBecauseAnchorChange={setPickedAnchorId}
        recommendations={recommendations}
        recommendationsLoading={recommendationsLoading}
      />

      {modalHost}
    </div>
  );
}
