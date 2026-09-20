import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Dices,
} from "lucide-react";
import { movieService } from "../api/movieService";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import MovieCard from "../components/MovieCard";
import AmbientBackground from "../components/AmbientBackground";
import ErrorBoundary from "../components/ErrorBoundary";
import RailArrow from "../components/RailArrow";
import FilterPill from "../components/browse/FilterPill";
import MenuItem from "../components/browse/MenuItem";
import useDetailView from "../hooks/useDetailView";
import { buildUpcoming } from "../utils/releaseCalendar";
import { logEmptyData, reportQueryError } from "../utils/debugLogger";

/* ── Cinejoy-mirrored Movies / Series discovery pages ───────────────────
   One parameterized layout drives both /movies and /series, matching the
   cinejoy.to browse pages: a big glass header, filter pills (Random, Genre,
   Year, Sort, Provider, Country), a landscape editorial rail ("Upcoming" /
   "New Seasons Airing"), and a 2/4/5/6-column poster grid. Filtering talks
   straight to TMDB /discover so every pill combination is genuinely live. */

const MODE_CONFIG = {
  movies: {
    title: "Movies",
    subtitle: "Discover new movies to watch",
    railLabel: "Upcoming",
    railBadge: () => "Coming Soon",
    randomAria: "Play Random Movie",
    mediaType: "movie",
  },
  series: {
    title: "TV Series",
    subtitle: "Discover new TV series to watch",
    railLabel: "New Seasons Airing",
    railBadge: (item) =>
      item?.airingSeasonNumber ? `Season ${item.airingSeasonNumber}` : "Airing",
    randomAria: "Play Random Show",
    mediaType: "tv",
  },
};

const SORT_OPTIONS = [
  { value: "popular", label: "Popular" },
  { value: "top_rated", label: "Top Rated" },
  { value: "newest", label: "Newest" },
];

const YEAR_START = 1975;

// TMDB's /discover returns 20 titles per page. The grid appends the next page
// when the sentinel below the last row scrolls into view (Cinejoy behavior),
// so we stop when a short page proves there is nothing left to fetch.
const DISCOVER_PAGE_SIZE = 20;

// ── Random pill — expands on hover like Cinejoy's ────────────────────────
function RandomPill({ ariaLabel, onClick, busy }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      onClick={onClick}
      className={`shrink-0 flex items-center h-[38px] overflow-hidden bg-white/5 hover:bg-white/10 border border-white/10 rounded-full transition-all duration-300 ease-out backdrop-blur-md group ${
        busy ? "max-w-[130px] cursor-wait" : "max-w-[38px] hover:max-w-[130px]"
      }`}
    >
      <span className="flex items-center justify-center w-9 h-9 shrink-0">
        {busy ? (
          <span className="btn-spinner" aria-hidden="true" />
        ) : (
          <Dices
            size={16}
            className="text-white/50 group-hover:text-white transition-colors duration-300"
          />
        )}
      </span>
      <span className="pr-3.5 text-sm font-medium whitespace-nowrap text-white/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75">
        Random
      </span>
    </button>
  );
}

// ── Landscape editorial card (rail) ───────────────────────────────────────
// w-[70vw] mobile → 264px → 316px desktop, aspect-video, with the spotlight
// badge, hover veil, encoded overlay (title + "Ep X · Mon DD") and a
// below-card meta block for non-hover devices.
function LandscapeCard({ item, badgeLabel, onOpen }) {
  const imgUrl = CdnImageAdapter.getUrl(item.backdropUrl || item.posterUrl, "w780");
  const nextEpisode = item.nextEpisode || {};
  const episodeLabel =
    nextEpisode.episode != null ? `Ep ${nextEpisode.episode}` : null;
  const dateLabel =
    item.relLabel || item.formattedRelease || item.releaseDay || "";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View details for ${item.title}`}
      className="relative flex-none snap-start w-[70vw] max-w-[280px] sm:w-[264px] sm:max-w-none lg:w-[316px] group/card cursor-pointer origin-center transition-transform duration-500 ease-out hover:scale-105 hover:z-50 text-left"
    >
      <div className="relative isolate aspect-video overflow-hidden rounded-xl bg-white/5 shadow-xl shadow-black/40">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt=""
            loading="lazy"
            decoding="async"
            className="block w-full h-full object-cover transition-all duration-300 lg:group-hover/card:brightness-50"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-white/[0.04] to-white/[0.08] text-white/25 text-2xl font-extrabold">
            {(item.title || "?").trim().charAt(0).toUpperCase()}
          </div>
        )}
        {/* Cinejoy spotlight veil + badge */}
        <div className="card-hover-veil" aria-hidden="true" />
        <span className="spotlight-badge" aria-hidden="true">
          {badgeLabel}
        </span>
        {/* Desktop-only encoded overlay */}
        <div className="hidden lg:flex absolute inset-0 flex-col items-center justify-center px-4 pointer-events-none transition-all duration-300 transform opacity-0 translate-y-4 group-hover/card:opacity-100 group-hover/card:translate-y-0">
          <h3 className="font-bold text-white text-sm leading-tight line-clamp-2 drop-shadow-md text-center">
            {item.title}
          </h3>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-white/80 font-medium">
            <CalendarDays size={12} className="text-white/70" />
            {episodeLabel && <span>{episodeLabel}</span>}
            <span>{dateLabel}</span>
          </p>
        </div>
      </div>
      {/* Below-card meta — no hover on touch devices */}
      <div className="lg:hidden mt-2 pb-1 space-y-0.5">
        <h3 className="font-medium text-white text-xs leading-tight line-clamp-1">
          {item.title}
        </h3>
        <p className="flex items-center gap-1 text-[10px] text-white/60">
          <CalendarDays size={10} className="text-white/40" />
          {episodeLabel && <span>{episodeLabel}</span>}
          <span>{dateLabel}</span>
        </p>
      </div>
    </button>
  );
}

// ── Month-grouped "Upcoming" rail ─────────────────────────────────────────
// Cinejoy's movies page surfaces the full theatrical slate, not one sparse
// row. Groups railItems (already date-sorted soonest-first) into per-month
// rails with a count pill and self-contained fade-in arrows. Series mode
// keeps its single consolidated "New Seasons Airing" rail instead.
function UpcomingMonthRail({ heading, itemCount, items, onOpen }) {
  const reduceMotion = useReducedMotion();
  const railRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  useEffect(() => {
    const el = railRef.current;
    const update = () => {
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      setCanLeft(el.scrollLeft > 4);
      setCanRight(max > 0 && el.scrollLeft < max - 4);
    };
    if (!el) return undefined;
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (observer) observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      if (observer) observer.disconnect();
    };
  }, [itemCount]);

  const scrollRail = (dir) => {
    railRef.current?.scrollBy({ left: dir * 420, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <section className="relative z-10 mt-2">
      <div className="flex items-center gap-3 px-4 md:px-8">
        <h2 className="text-lg sm:text-xl font-semibold text-white/90 drop-shadow-md">
          {heading}
        </h2>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-0.5 text-[0.7rem] font-medium text-white/60">
          <CalendarDays size={11} className="text-white/45" />
          {itemCount}
        </span>
      </div>
      <div className="relative group/row mt-6">
        {canLeft && (
          <RailArrow dir="left" onClick={() => scrollRail(-1)} revealOnHover hoverClass="group-hover/row:opacity-100" />
        )}
        <div
          ref={railRef}
          className="discovery-rail-mask flex gap-3 sm:gap-4 overflow-x-auto overflow-y-clip pt-4 pb-12 px-4 md:px-8 scroll-pl-4 md:scroll-pl-8 snap-x snap-mandatory sm:snap-none scrollbar-hide items-start isolate"
        >
          {items.map((item) => (
            <LandscapeCard
              key={item.id}
              item={item}
              badgeLabel="Coming Soon"
              onOpen={() => onOpen(item)}
            />
          ))}
        </div>
        {canRight && (
          <RailArrow dir="right" onClick={() => scrollRail(1)} revealOnHover hoverClass="group-hover/row:opacity-100" />
        )}
      </div>
    </section>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────
export default function DiscoveryPage({ mode = "movies" }) {
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.movies;
  const isSeries = cfg.mediaType === "tv";
  const reduceMotion = useReducedMotion();
  const [searchParams, setSearchParams] = useSearchParams();
  const { openDetails, modalHost } = useDetailView();
  const railRef = useRef(null);

  const genreParam = searchParams.get("genre") || null;
  const yearParam = searchParams.get("year") || null;
  const sortParam = searchParams.get("sort") || "popular";
  const providerParam = searchParams.get("provider") || null;
  const countryParam = searchParams.get("country") || null;

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value == null || value === "") next.delete(key);
    else next.set(key, String(value));
    setSearchParams(next);
  };

  // ── Pull-down option lists (genres / providers / countries) ─────────────
  const genresQuery = useQuery({
    queryKey: ["discover-genres", cfg.mediaType],
    queryFn: () => movieService.getGenres(cfg.mediaType),
    staleTime: 1000 * 60 * 60,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const providersQuery = useQuery({
    queryKey: ["discover-providers", cfg.mediaType],
    queryFn: () => movieService.getWatchProviders(cfg.mediaType),
    staleTime: 1000 * 60 * 60,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const regionsQuery = useQuery({
    queryKey: ["discover-regions"],
    queryFn: () => movieService.getRegions(),
    staleTime: 1000 * 60 * 60 * 24,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // ── The browse grid — refetches whenever any pill changes. Paginated so it
  // loads progressively as the user scrolls (Cinejoy behavior) instead of
  // fetching the whole catalogue at once. ─────────────────────────────────
  const gridQuery = useInfiniteQuery({
    queryKey: [
      "discover",
      cfg.mediaType,
      genreParam,
      yearParam,
      sortParam,
      providerParam,
      countryParam,
    ],
    queryFn: ({ pageParam = 1 }) =>
      movieService.getDiscover({
        mediaType: cfg.mediaType,
        genreId: genreParam,
        year: yearParam,
        sortBy: sortParam,
        providerId: providerParam,
        country: countryParam,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      (lastPage?.length || 0) >= DISCOVER_PAGE_SIZE ? allPages.length + 1 : undefined,
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
  });

  // ── Top editorial rail — movies: upcoming; series: new seasons airing ───
  // Movies merge TMDB /movie/upcoming (paginated) with a /discover sweep of
  // the next year AND the regional (Tamil/Hindi/Malayalam/Telugu) future
  // slate so the rail is dense instead of a single sparse page and regional
  // premieres are not skipped.
  const loadUpcomingFilmSlate = async () => {
    const [upcoming, future, regional] = await Promise.allSettled([
      movieService.getUpcomingMovies(),
      movieService.getFutureMovies(),
      movieService.getRegionalUpcoming(365),
    ]);
    return [
      ...(upcoming.status === "fulfilled" ? upcoming.value : []),
      ...(future.status === "fulfilled" ? future.value : []),
      ...(regional.status === "fulfilled" ? regional.value : []),
    ];
  };

  const railQuery = useQuery({
    queryKey: ["discover-rail", cfg.mediaType],
    queryFn: () =>
      isSeries
        ? Promise.allSettled([
            movieService.getAiringRail(10),
            movieService.getRegionalAiring(10),
          ]).then(([airing, regional]) => [
            ...(airing.status === "fulfilled" ? airing.value : []),
            ...(regional.status === "fulfilled" ? regional.value : []),
          ])
        : loadUpcomingFilmSlate(),
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const railItems = useMemo(
    () => buildUpcoming(railQuery.data || [], 365),
    [railQuery.data],
  );

  // Movies: split the date-sorted slate into per-month sections so the page
  // reads like a full release calendar, not one sparse row.
  const monthSections = useMemo(() => {
    if (isSeries) return [];
    const map = new Map();
    for (const item of railItems) {
      const key = String(item.releaseDate || "").slice(0, 7);
      if (key.length !== 7) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    const now = new Date();
    const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return [...map.entries()].map(([key, items]) => {
      const [y, m] = key.split("-").map((s) => Number(s));
      const heading =
        key === curKey
          ? "Coming This Month"
          : `${new Date(y, m - 1, 1).toLocaleString("en-US", { month: "long" })} ${y}`;
      return { key, heading, itemCount: items.length, items };
    });
  }, [railItems, isSeries]);

  const gridItems = useMemo(
    () => (gridQuery.data?.pages || []).flat(),
    [gridQuery.data],
  );

  // ── Scroll-triggered pagination ─────────────────────────────────────────
  // A sentinel below the last grid row; a generous bottom rootMargin starts
  // the next page before the user hits the floor, so the grid appears to grow
  // with the scroll rather than loading everything up front.
  const loadMoreRef = useRef(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = gridQuery;
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "900px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, gridItems.length]);

  // ── Diagnostics — no silent failures (debugLogger protocol) ─────────────
  const gridKey = [
    "discover",
    cfg.mediaType,
    genreParam,
    yearParam,
    sortParam,
    providerParam,
    countryParam,
  ];
  useEffect(() => {
    if (gridQuery.error) reportQueryError("DiscoveryPage", gridKey, gridQuery.error, { mode });
    if (railQuery.error) reportQueryError("DiscoveryPage", ["discover-rail", cfg.mediaType], railQuery.error, { mode });
    if (genresQuery.error) reportQueryError("DiscoveryPage", ["discover-genres", cfg.mediaType], genresQuery.error, { mode });
    if (providersQuery.error) reportQueryError("DiscoveryPage", ["discover-providers", cfg.mediaType], providersQuery.error, { mode });
    if (regionsQuery.error) reportQueryError("DiscoveryPage", ["discover-regions"], regionsQuery.error, { mode });
  }, [gridQuery.error, railQuery.error, genresQuery.error, providersQuery.error, regionsQuery.error, mode, cfg.mediaType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (gridQuery.isLoading || gridQuery.error) return;
    if (gridItems.length === 0) {
      logEmptyData("DiscoveryPage", `Discovery grid returned 0 titles: mode=${mode}, genre=${genreParam}, year=${yearParam}, sort=${sortParam}, provider=${providerParam}, country=${countryParam}.`, {
        mode,
        genreParam,
        yearParam,
        sortParam,
        providerParam,
        countryParam,
      });
    }
  }, [gridQuery.isLoading, gridQuery.error, gridItems.length, mode, genreParam, yearParam, sortParam, providerParam, countryParam]);

  // ── Option lookups for pill labels & menu rendering ─────────────────────
  const yearOptions = useMemo(() => {
    const thisYear = new Date().getFullYear();
    const list = [];
    for (let y = thisYear; y >= YEAR_START; y--) list.push(String(y));
    return list;
  }, []);

  const genreById = useMemo(
    () => new Map((genresQuery.data || []).map((g) => [String(g.id), g.name])),
    [genresQuery.data],
  );
  const providerById = useMemo(
    () => new Map((providersQuery.data || []).map((p) => [String(p.id), p.name])),
    [providersQuery.data],
  );
  const countryByCode = useMemo(
    () => new Map((regionsQuery.data || []).map((r) => [String(r.code), r.name])),
    [regionsQuery.data],
  );

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortParam)?.label || "Popular";

  const genreLabel = genreParam && genreById.get(genreParam) ? genreById.get(genreParam) : "Genre";
  const yearLabel = yearParam || "Year";
  const providerLabel = providerParam && providerById.get(providerParam) ? providerById.get(providerParam) : "Provider";
  const countryLabel = countryParam && countryByCode.get(countryParam) ? countryByCode.get(countryParam) : "Country";

  // ── Random: open a random title from the current grid ───────────────────
  // Force the instant info modal (never the page route) so the click gives
  // immediate content — no route-load spinner/skeleton, just the pill's
  // hover animation and a smooth pop-in.
  // Busy state drives the in-button spinner; the reveal is deferred ~0.6s so
  // the pill visibly "rolls" before snapping to the random pick (compositor
  // sleep: only the pill's icon/state change, nothing re-blurs).
  const [randomPicking, setRandomPicking] = useState(false);
  const randomTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(randomTimerRef.current), []);

  const handleRandom = () => {
    if (randomPicking || !gridItems.length) return;
    setRandomPicking(true);
    randomTimerRef.current = setTimeout(() => {
      const pick = gridItems[Math.floor(Math.random() * gridItems.length)];
      setRandomPicking(false);
      openDetails(pick, { forceModal: true });
    }, 620);
  };

  // ── Rail scrolling (fade-in arrows) ─────────────────────────────────────
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);
  useEffect(() => {
    const el = railRef.current;
    const update = () => {
      if (!el) return;
      const max = el.scrollWidth - el.clientWidth;
      setCanLeft(el.scrollLeft > 4);
      setCanRight(max > 0 && el.scrollLeft < max - 4);
    };
    if (!el) return undefined;
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (observer) observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      if (observer) observer.disconnect();
    };
  }, [railItems.length]);

  const scrollRail = (dir) => {
    railRef.current?.scrollBy({ left: dir * 420, behavior: reduceMotion ? "auto" : "smooth" });
  };

  const gridLoading = gridQuery.isLoading;
  const gridError = gridQuery.error ? "No titles found for these filters." : null;
  const railEmpty = !railQuery.isLoading && !railQuery.error && railItems.length === 0;

  const ambientSrc = gridItems[0]?.backdropUrl || gridItems[0]?.posterUrl || railItems[0]?.backdropUrl || null;

  return (
    <div style={{ position: "relative" }}>
      {/* Ambient liquid backdrop from the first result */}
      {ambientSrc && <AmbientBackground src={ambientSrc} />}

      <div className="discovery-page relative z-10">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="relative mx-auto max-w-[1600px] pt-24 pb-8 px-4 md:px-10 lg:px-14">
          <div className="relative pt-12 pb-8 px-6 md:px-8 space-y-8">
            <div className="flex flex-col xl:flex-row gap-10 xl:gap-8 items-start xl:items-end justify-between">
              <div className="max-w-xl">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white drop-shadow-lg">
                  {cfg.title}
                </h1>
                <p className="mt-3 text-lg text-white/70 font-medium leading-relaxed">
                  {cfg.subtitle}
                </p>
              </div>

              {/* Filter pills */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 w-full xl:w-auto">
                <div className="filter-row flex items-center sm:justify-start gap-2 sm:gap-3 flex-wrap">
                  <RandomPill ariaLabel={cfg.randomAria} onClick={handleRandom} busy={randomPicking} />
                  <FilterPill label={genreLabel}>
                    {({ close }) =>
                      (genresQuery.data || []).map((g) => (
                        <MenuItem
                          key={g.id}
                          label={g.name}
                          selected={String(g.id) === genreParam}
                          onSelect={() => {
                            setParam("genre", String(g.id));
                            close();
                          }}
                        />
                      ))
                    }
                  </FilterPill>
                  <FilterPill label={yearLabel}>
                    {({ close }) =>
                      yearOptions.map((y) => (
                        <MenuItem
                          key={y}
                          label={y}
                          selected={y === yearParam}
                          onSelect={() => {
                            setParam("year", y);
                            close();
                          }}
                        />
                      ))
                    }
                  </FilterPill>
                </div>
                <div className="filter-row flex items-center sm:justify-start gap-2 sm:gap-3 flex-wrap">
                  <FilterPill label={sortLabel}>
                    {({ close }) =>
                      SORT_OPTIONS.map((o) => (
                        <MenuItem
                          key={o.value}
                          label={o.label}
                          selected={o.value === sortParam}
                          onSelect={() => {
                            setParam("sort", o.value);
                            close();
                          }}
                        />
                      ))
                    }
                  </FilterPill>
                  <FilterPill label={providerLabel}>
                    {({ close }) =>
                      (providersQuery.data || []).map((p) => (
                        <MenuItem
                          key={p.id}
                          label={p.name}
                          selected={String(p.id) === providerParam}
                          icon={
                            p.logoUrl ? (
                              <img
                                src={p.logoUrl}
                                alt=""
                                className="w-4 h-4 rounded object-contain bg-white/10"
                                loading="lazy"
                              />
                            ) : null
                          }
                          onSelect={() => {
                            setParam("provider", String(p.id));
                            close();
                          }}
                        />
                      ))
                    }
                  </FilterPill>
                  <FilterPill label={countryLabel}>
                    {({ close }) =>
                      (regionsQuery.data || []).map((r) => (
                        <MenuItem
                          key={r.code}
                          label={r.name}
                          selected={String(r.code) === countryParam}
                          onSelect={() => {
                            setParam("country", String(r.code));
                            close();
                          }}
                        />
                      ))
                    }
                  </FilterPill>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ── Editorial rail ──────────────────────────────────────────── */}
        {!railQuery.isLoading &&
          !railQuery.error &&
          !isSeries &&
          monthSections.length > 0 && (
            <div className="space-y-10 mt-2">
              {monthSections.map((section) => (
                <UpcomingMonthRail
                  key={section.key}
                  heading={section.heading}
                  itemCount={section.itemCount}
                  items={section.items}
                  onOpen={openDetails}
                />
              ))}
            </div>
          )}

        {!railQuery.isLoading && !railQuery.error && isSeries && railItems.length > 0 && (
          <section className="relative z-10 mt-2">
            <div className="flex items-center justify-between px-4 md:px-8 mb-[-12px]">
              <h2 className="text-lg sm:text-xl font-semibold text-white/90 drop-shadow-md">
                {cfg.railLabel}
              </h2>
            </div>
            <div className="relative group/row mt-6">
              {/* Left arrow — only shows when content is hidden to the left */}
              {canLeft && (
                <RailArrow dir="left" onClick={() => scrollRail(-1)} revealOnHover hoverClass="group-hover/row:opacity-100" />
              )}
              <div
                ref={railRef}
                className="discovery-rail-mask flex gap-3 sm:gap-4 overflow-x-auto overflow-y-clip pt-4 pb-12 px-4 md:px-8 scroll-pl-4 md:scroll-pl-8 snap-x snap-mandatory sm:snap-none scrollbar-hide items-start isolate"
              >
                {railItems.map((item) => (
                  <LandscapeCard
                    key={item.id}
                    item={item}
                    badgeLabel={cfg.railBadge(item)}
                    onOpen={() => openDetails(item)}
                  />
                ))}
              </div>
              {/* Right arrow — reveals on hover over the row */}
              {canRight && (
                <RailArrow dir="right" onClick={() => scrollRail(1)} revealOnHover hoverClass="group-hover/row:opacity-100" />
              )}
            </div>
          </section>
        )}

        {/* ── Poster grid ─────────────────────────────────────────────── */}
        <section className="px-4 md:px-8 mt-4 relative z-10">
          <ErrorBoundary>
            {gridLoading ? (
              <div className="discovery-grid">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="skeleton-moviecard">
                    <div className="skeleton sk-poster"></div>
                    <div className="skeleton sk-line sk-line--w70"></div>
                    <div className="skeleton sk-line sk-line--sub"></div>
                  </div>
                ))}
              </div>
            ) : gridError ? (
              <div style={{ padding: "4rem 0", textAlign: "center", color: "#ef4444", fontSize: "1.1rem" }}>
                {gridError}
              </div>
            ) : gridItems.length === 0 ? (
              <div style={{ padding: "5rem 0", textAlign: "center", color: "#a1a1aa" }}>
                <h2 style={{ color: "#fff", marginBottom: "0.5rem", fontSize: "1.35rem" }}>
                  No titles found
                </h2>
                <p>Try clearing a filter or choosing another category.</p>
              </div>
            ) : (
              <>
                <div className="discovery-grid">
                  {gridItems.map((movie, idx) => (
                    <motion.div
                      key={movie.id}
                      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, delay: (idx % 12) * 0.04, ease: "easeOut" }}
                    >
                      <MovieCard movie={movie} />
                    </motion.div>
                  ))}
                </div>
                {/* Scroll sentinel — the next page loads as this nears the
                    viewport; the Cinejoy three-dot pulse shows while fetching. */}
                <div ref={loadMoreRef} className="discover-loadmore" aria-live="polite">
                  {isFetchingNextPage ? (
                    <span className="loading-dots" role="status" aria-label="Loading more titles">
                      <span />
                      <span />
                      <span />
                    </span>
                  ) : hasNextPage ? null : (
                    <span className="discover-loadmore__end">You have reached the end</span>
                  )}
                </div>
              </>
            )}
          </ErrorBoundary>
          {railEmpty && !gridLoading && (
            <div style={{ padding: "2rem 0", textAlign: "center", color: "#71717a" }}>
              {isSeries ? "No new seasons airing right now." : "No upcoming releases right now."}
            </div>
          )}
        </section>

        {/* Netlix-style info modal host (one shared instance per page) */}
        {modalHost}
      </div>
    </div>
  );
}