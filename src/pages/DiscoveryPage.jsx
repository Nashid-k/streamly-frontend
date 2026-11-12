import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { useReducedMotion } from "framer-motion";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  Dices,
  RotateCw,
} from "lucide-react";
import { movieService } from "../api/movieService";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import MovieCard from "../components/MovieCard";
import MovieCardSkeleton from "../components/MovieCardSkeleton";
import AmbientBackground from "../components/AmbientBackground";
import ErrorBoundary from "../components/ErrorBoundary";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import SEO from "../components/SEO";
import RailArrow from "../components/RailArrow";
import FilterPill from "../components/browse/FilterPill";
import MenuItem from "../components/browse/MenuItem";
import BrowseBanner from "../components/browse/BrowseBanner";
import useDetailView from "../hooks/useDetailView";
import { useOptionalPreferences } from "../context/preferences";
import { pickImageWidth } from "../utils/artwork";
import useRailArrows from "../hooks/useRailArrows";
import { buildUpcoming, buildAiringRail } from "../utils/releaseCalendar";
import { logEmptyData, reportQueryError } from "../utils/debugLogger";
import { StreamlyLoader } from "../components/StreamlyLoader";

/* Back-navigation memory for the grid. Filters already live in the URL; the
   scroll offset lives here, keyed by `mode + query`, so returning to a filtered
   Browse lands where the viewer left it. A module map avoids storage APIs (no
   quota/privacy exceptions) and resets with the tab. */
const browseScrollMemory = new Map();

/* ── Cinejoy-mirrored Movies / Series discovery pages ───────────────────
   One parameterized layout drives /movies and /series: glass header, filter
   pills (Random, Genre, Year, Sort, Provider, Country), a landscape editorial
   rail ("Upcoming" / "New Seasons Airing") and a 2/4/5/6-column poster grid.
   Every pill combination talks straight to TMDB /discover. */

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

// TMDB /discover returns 20 titles per page; the grid appends the next one when
// the sentinel scrolls into view, and a short page proves nothing is left.
const DISCOVER_PAGE_SIZE = 20;

// ── Random pill — expands on hover like Cinejoy's ────────────────────────
function RandomPill({ ariaLabel, onClick, busy, disabled }) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={onClick}
      className={`random-btn ${busy ? "cursor-wait" : ""}`}
      style={busy ? { maxWidth: "160px" } : undefined}
    >
      {busy ? (
        <StreamlyLoader size={16} label="" />
      ) : (
        <Dices size={16} className="icon" />
      )}
      <span className="label">Random</span>
    </button>
  );
}

// ── Upcoming card (rail) — Cinejoy parity ─────────────────────────────
function UpcomingCard({ item, badgeLabel = "Coming Soon", onOpen }) {
  const preferences = useOptionalPreferences();
  const imgUrl = CdnImageAdapter.getUrl(
    item.backdropUrl || item.posterUrl,
    pickImageWidth("rail", preferences),
  );
  const dateLabel =
    item.relLabel || item.formattedRelease || item.releaseDay || item.releaseDate || "";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`View details for ${item.title}`}
      className="upcoming-card text-left"
    >
      <div className="upcoming-card__poster">
        {imgUrl ? (
          <img
            src={imgUrl}
            alt={item.title}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5 text-white/25 text-2xl font-extrabold">
            {(item.title || "?").trim().charAt(0).toUpperCase()}
          </div>
        )}
        <span className="upcoming-card__badge">{badgeLabel}</span>
        <div className="upcoming-card__date-overlay">
          <CalendarDays size={18} className="icon text-white" />
          <span className="date">{dateLabel}</span>
        </div>
      </div>
      <div className="upcoming-card__caption">
        <h3>{item.title}</h3>
        <p className="date-sub">
          <CalendarDays size={11} className="icon shrink-0" /> {dateLabel}
        </p>
      </div>
    </button>
  );
}

// ── Filter bar — header copy + docked copy ────────────────────────────
function DiscoveryFilters({
  inert,
  random,
  setParam,
  hasSortParam,
  genreParam,
  yearParam,
  sortParam,
  providerParam,
  countryParam,
  genreLabel,
  yearLabel,
  sortLabel,
  providerLabel,
  countryLabel,
  genreOptions,
  providerOptions,
  countryOptions,
  yearOptions,
}) {
  return (
    <div
      className="discover-filters filter-bar"
      inert={inert}
    >
      <RandomPill
        ariaLabel={random.ariaLabel}
        onClick={random.onClick}
        busy={random.busy}
        disabled={random.disabled}
      />
      <FilterPill label={genreLabel} active={Boolean(genreParam)}>
        {({ close }) => (
          <>
            <MenuItem
              key="__all"
              label="All Genres"
              selected={!genreParam}
              onSelect={() => {
                setParam("genre", "");
                close();
              }}
            />
            {genreOptions.map((g) => (
              <MenuItem
                key={g.id}
                label={g.name}
                selected={String(g.id) === genreParam}
                onSelect={() => {
                  setParam("genre", String(g.id));
                  close();
                }}
              />
            ))}
          </>
        )}
      </FilterPill>
      <FilterPill label={yearLabel} active={Boolean(yearParam)}>
        {({ close }) => (
          <>
            <MenuItem
              key="__all"
              label="Any Year"
              selected={!yearParam}
              onSelect={() => {
                setParam("year", "");
                close();
              }}
            />
            {yearOptions.map((y) => (
              <MenuItem
                key={y}
                label={y}
                selected={y === yearParam}
                onSelect={() => {
                  setParam("year", y);
                  close();
                }}
              />
            ))}
          </>
        )}
      </FilterPill>
      <FilterPill label={sortLabel} active={hasSortParam}>
        {({ close }) => (
          <>
            <MenuItem
              key="__default"
              label="Default"
              selected={!hasSortParam}
              onSelect={() => {
                setParam("sort", "");
                close();
              }}
            />
            {SORT_OPTIONS.map((o) => (
              <MenuItem
                key={o.value}
                label={o.label}
                selected={o.value === sortParam}
                onSelect={() => {
                  setParam("sort", o.value);
                  close();
                }}
              />
            ))}
          </>
        )}
      </FilterPill>
      <FilterPill label={providerLabel} active={Boolean(providerParam)}>
        {({ close }) => (
          <>
            <MenuItem
              key="__any"
              label="Any Provider"
              selected={!providerParam}
              onSelect={() => {
                setParam("provider", "");
                close();
              }}
            />
            {providerOptions.map((p) => (
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
            ))}
          </>
        )}
      </FilterPill>
      <FilterPill label={countryLabel} active={Boolean(countryParam)}>
        {({ close }) => (
          <>
            <MenuItem
              key="__any"
              label="Any Country"
              selected={!countryParam}
              onSelect={() => {
                setParam("country", "");
                close();
              }}
            />
            {countryOptions.map((r) => (
              <MenuItem
                key={r.code}
                label={r.name}
                selected={String(r.code) === countryParam}
                onSelect={() => {
                  setParam("country", String(r.code));
                  close();
                }}
              />
            ))}
          </>
        )}
      </FilterPill>
    </div>
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

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [mode]);

  /* ── Pinned filters (Cinejoy .pinned-filters) ──────────────────────────
     Once the header's filter row scrolls above the viewport, the filter row
     docks to the bottom-centre of the screen as a glass capsule (the
     `streamly-update/` mock's `.pinned-filters`).

     The header keeps its row in place — only the docked copy is fixed — so
     docking never collapses the header or shifts the page. While the dock is
     up the header copy is `inert`, so there is exactly one reachable set of
     pills at any time.
     Desktop only — the CSS dock applies from 1024px up (the mobile bottom nav
     owns the bottom edge below that), so `desktop.matches` gates the state. */
  const filterSlotRef = useRef(null);
  const [filtersDock, setFiltersDock] = useState(false);

  useEffect(() => {
    const slot = filterSlotRef.current;
    if (!slot || typeof IntersectionObserver === "undefined") return undefined;
    const desktop =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(min-width: 1024px)")
        : null;
    // "Scrolled past", not merely "not intersecting": a row below the fold is
    // also not intersecting, but nothing has been scrolled past yet.
    let scrolledPast = false;
    const apply = () => {
      const stuck = scrolledPast && (!desktop || desktop.matches);
      setFiltersDock((prev) => (prev === stuck ? prev : stuck));
    };
    const observer = new IntersectionObserver(([entry]) => {
      scrolledPast =
        !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
      apply();
    });
    observer.observe(slot);
    desktop?.addEventListener?.("change", apply);
    return () => {
      observer.disconnect();
      desktop?.removeEventListener?.("change", apply);
    };
  }, []);

  const genreParam = searchParams.get("genre") || null;
  const yearParam = searchParams.get("year") || null;
  const sortParam = searchParams.get("sort") || "popular";
  const providerParam = searchParams.get("provider") || null;
  const countryParam = searchParams.get("country") || null;
  const languageParam = searchParams.get("language") || null;

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

    // ── The browse grid — refetches whenever any pill changes, and is paginated
    // so it grows with the scroll instead of fetching the whole catalogue. ────
  const gridQuery = useInfiniteQuery({
    queryKey: [
      "discover",
      cfg.mediaType,
      genreParam,
      yearParam,
      sortParam,
      providerParam,
        languageParam,
      countryParam,
    ],
    queryFn: ({ pageParam = 1 }) =>
      movieService.getDiscover({
        mediaType: cfg.mediaType,
        genreId: genreParam,
        year: yearParam,
        sortBy: sortParam,
        providerId: providerParam,
        languageParam,
        languageId: languageParam,
        // "Country" means production country (getDiscover → with_origin_country),
        // the conventional meaning of a Country filter. getRegions supplies the
        // option codes; the same value also becomes watch_region inside
        // getDiscover when a Provider is chosen, so it scopes that provider's
        // availability. Passing it as `region` instead would leave the pill inert
        // whenever no provider is selected (TMDB ignores watch_region alone).
        country: countryParam,
        page: pageParam,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      (lastPage?.length || 0) >= DISCOVER_PAGE_SIZE ? allPages.length + 1 : undefined,
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
    // Changing a filter pill re-keys the whole grid. Without this the results
    // were thrown away for a full-page skeleton on every tap; now the previous
    // page stays up until the new filter's first response arrives.
    placeholderData: (previous) => previous,
  });

    // ── Top editorial rail — movies: upcoming; series: new seasons airing ───
    // Movies merge TMDB /movie/upcoming (paginated) with a /discover sweep of the
    // next year AND the regional future slate, so the rail is dense and regional
    // premieres are not skipped.
  const loadUpcomingFilmSlate = async () => {
    const settled = await Promise.allSettled([
      movieService.getUpcomingMovies(),
      movieService.getFutureMovies(),
      movieService.getRegionalUpcoming(365),
    ]);
    // Every source failed → surface it so the query enters its error state
    // (and reportQueryError fires) instead of caching a 10-minute empty
    // "success" with no rails. Partial failures still resolve with what landed.
    if (settled.every((r) => r.status === "rejected")) throw settled[0].reason;
    return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  };

  const railQuery = useQuery({
    queryKey: ["discover-rail", cfg.mediaType],
    queryFn: () =>
      isSeries
        ? Promise.allSettled([
            movieService.getAiringRail(30),
            movieService.getRegionalAiring(20),
          ]).then((settled) => {
            // Both sources failed → error state, not a silent empty rail.
            if (settled.every((r) => r.status === "rejected")) throw settled[0].reason;
            return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
          })
        : loadUpcomingFilmSlate(),
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const railItems = useMemo(() => {
    const data = railQuery.data || [];
    // Series rail: keep now-airing titles that have no announced next episode
    // (buildAiringRail) instead of dropping them (buildUpcoming), so a series
    // that is genuinely on the air shows up even when TMDB has no next-episode
    // date for it yet.
    return isSeries ? buildAiringRail(data, 120) : buildUpcoming(data, 365);
  }, [railQuery.data, isSeries]);

  const gridItems = useMemo(
    () => (gridQuery.data?.pages || []).flat(),
    [gridQuery.data],
  );

  // ── Banner pool — the page's own first results, so the hero always shows a
  // title the grid actually browses ("corresponding banners"). Titles without
  // backdrop art are skipped; the compact BrowseBanner rotates the first six.
  // Placeholder pages during a filter swap keep the previous banner up — the
  // new pool resets the slide to 0 when it lands.
  const bannerPool = useMemo(
    () => gridItems.filter((m) => m && m.backdropUrl).slice(0, 6),
    [gridItems],
  );

  // ── Random draws only from the CURRENT filter's results ─────────────────
  // While a new filter's first page is in flight react-query keeps the previous
  // filter's rows mounted as placeholderData; those are stale, so exclude them
  // (and the pill stays disabled until real results for this filter land).
  const randomPool = gridQuery.isPlaceholderData ? [] : gridItems;

    // ── Scroll-triggered pagination ─────────────────────────────────────────
    // A generous bottom rootMargin starts the next page before the user hits the
    // floor, so the grid appears to grow with the scroll.
  const loadMoreRef = useRef(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = gridQuery;

  /* ── Grid scroll memory (brief P3-6) ───────────────────────────────────
     Restore once, from the key the page mounted with, AFTER the first page of
     cards exists (restoring before the grid has height would clamp to 0). Save
     while scrolling and again on unmount. */
  const mountScrollKeyRef = useRef(`${mode}:${searchParams.toString()}`);
  const restoredScrollRef = useRef(false);

  useEffect(() => {
    if (restoredScrollRef.current || gridItems.length === 0) return;
    restoredScrollRef.current = true;
    const y = browseScrollMemory.get(mountScrollKeyRef.current) || 0;
    if (y > 40) requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "auto" }));
  }, [gridItems.length]);

  useEffect(() => {
    const key = mountScrollKeyRef.current;
    let ticking = false;
    const save = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          browseScrollMemory.set(key, window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      browseScrollMemory.set(key, window.scrollY);
      window.removeEventListener("scroll", save);
    };
  }, []);
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
        languageParam,
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
      logEmptyData("DiscoveryPage", `Discovery grid returned 0 titles: mode=${mode}, genre=${genreParam}, year=${yearParam}, sort=${sortParam}, provider=${providerParam}, country=${countryParam}, language=${languageParam}.`, {
        mode,
        genreParam,
        yearParam,
        sortParam,
        providerParam,
        languageParam,
        countryParam,
      });
    }
  }, [gridQuery.isLoading, gridQuery.error, gridItems.length, mode, genreParam, yearParam, sortParam, providerParam,
        languageParam, countryParam]);

  // ── Option lookups for pill labels & menu rendering ─────────────────────
  
  const LANGUAGE_OPTIONS = useMemo(() => [
    { id: "en", name: "English" },
    { id: "hi", name: "Hindi" },
    { id: "ta", name: "Tamil" },
    { id: "ml", name: "Malayalam" },
    { id: "te", name: "Telugu" },
    { id: "kn", name: "Kannada" },
    { id: "ko", name: "Korean" },
    { id: "ja", name: "Japanese" }
  ], []);

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
  const languageLabel = languageParam ? (LANGUAGE_OPTIONS.find(l => l.id === languageParam)?.name || "Language") : "Language";

  /* ── Active-filter chips (brief P3-3) ──────────────────────────────────
     One chip per *non-default* param. `sort=popular` is the default and gets no
     chip; changing sort still writes to the URL and shows as a chip. Labels come
     from the same option maps the pills use, so chip text and pill text agree. */
  const activeChips = useMemo(() => {
    const chips = [];
    if (genreParam) chips.push({ key: "genre", label: genreLabel });
    if (yearParam) chips.push({ key: "year", label: yearLabel });
    if (providerParam) chips.push({ key: "provider", label: providerLabel });
    if (countryParam) chips.push({ key: "country", label: countryLabel });
    if (languageParam) chips.push({ key: "language", label: languageLabel });
    if (sortParam && sortParam !== "popular") {
      chips.push({ key: "sort", label: sortLabel });
    }
    return chips;
  }, [genreParam, yearParam, providerParam, countryParam, languageParam, sortParam,
      genreLabel, yearLabel, providerLabel, countryLabel, languageLabel, sortLabel]);

  const clearAllFilters = () => {
    setSearchParams(new URLSearchParams());
  };

    // ── Random: open a random title from the current grid ───────────────────
    // Forces the instant info modal (never the page route) so the click gives
    // immediate content with no route-load skeleton. The reveal is deferred ~0.6s
    // so the pill visibly "rolls" before snapping to the random pick.
  const [randomPicking, setRandomPicking] = useState(false);
  const randomTimerRef = useRef(null);
  useEffect(() => () => clearTimeout(randomTimerRef.current), []);

  const handleRandom = () => {
    if (randomPicking || randomPool.length === 0) return;
    setRandomPicking(true);
    randomTimerRef.current = setTimeout(() => {
      const pick = randomPool[Math.floor(Math.random() * randomPool.length)];
      setRandomPicking(false);
      openDetails(pick, { forceModal: true });
    }, 620);
  };

  // ── Rail scrolling (fade-in arrows) ─────────────────────────────────────
  const { canScrollLeft: canLeft, canScrollRight: canRight } = useRailArrows(railRef, { threshold: 4 });

  const scrollRail = (dir) => {
    railRef.current?.scrollBy({ left: dir * 420, behavior: reduceMotion ? "auto" : "smooth" });
  };

  const gridLoading = gridQuery.isLoading;
  // Whether the grid's CURRENT key has finished loading — no in-flight page and
  // no stale placeholderData from the previous filter. The end-of-list copy may
  // only appear once this is true and hasNextPage is genuinely exhausted.
  const gridSettled = !gridQuery.isFetching && !gridQuery.isPlaceholderData;
  // An outage is not "your filters are wrong" — the error copy must not blame
  // the user's filter choices, and the state gets an in-page retry.
  const gridError = gridQuery.error
    ? "Streamly couldn't reach the catalog right now. Try again, or come back in a moment."
    : null;
  const railEmpty = !railQuery.isLoading && !railQuery.error && railItems.length === 0;

  const ambientSrc = gridItems[0]?.backdropUrl || gridItems[0]?.posterUrl || railItems[0]?.backdropUrl || null;

  /* One bundle feeds both mounts of the filter row (header + dock), so the two
     can never drift apart. */
  const filterBarProps = {
    setParam,
    hasSortParam: Boolean(searchParams.get("sort")),
    genreParam,
    yearParam,
    sortParam,
    providerParam,
    countryParam,
    languageParam,
    genreLabel,
    yearLabel,
    sortLabel,
    providerLabel,
    countryLabel,
    languageLabel,
    genreOptions: genresQuery.data || [],
    providerOptions: providersQuery.data || [],
    countryOptions: regionsQuery.data || [],
    yearOptions,
    languageOptions: LANGUAGE_OPTIONS,
    random: {
      ariaLabel: cfg.randomAria,
      onClick: handleRandom,
      busy: randomPicking,
      disabled: randomPool.length === 0,
    },
  };

  return (
    <div style={{ position: "relative" }}>
      <SEO
        title={cfg.title}
        description={`Browse and filter ${cfg.title.toLowerCase()} by genre, year, provider and language on Streamly.`}
      />
      {/* Ambient liquid backdrop from the first result */}
      {ambientSrc && <AmbientBackground src={ambientSrc} />}

      <div className="discovery-page relative z-10">
        {/* ── Hero banner — compact home-style hero fed by this page's own
            results (movies → movies, series → series). Sits flush at the top
            behind the floating navbar, exactly like the home hero. */}
        <ErrorBoundary>
          <BrowseBanner pool={bannerPool} loading={gridLoading} mediaType={cfg.mediaType} />
        </ErrorBoundary>

        {/* ── Discover section (Cinejoy layout parity) ───────────────── */}
        <section className="discover" data-discover>
          <div className="discover-head">
            <h1 className="discover-title">{cfg.title}</h1>
            <div ref={filterSlotRef} className="discover-filter-slot">
              <DiscoveryFilters {...filterBarProps} inert={filtersDock || undefined} />
            </div>
          </div>
        </section>

        {/* ── Editorial rail (Upcoming for movies / New Seasons Airing for series) ── */}
        {(railQuery.isLoading || railItems.length > 0) && (
          <section className="row-section relative z-10" style={{ paddingTop: "8px" }}>
            <div className="row-head" style={{ marginBottom: "6px" }}>
              <h2>{cfg.railLabel}</h2>
            </div>
            <div className="track-wrap relative group/row">
              {canLeft && (
                <RailArrow dir="left" onClick={() => scrollRail(-1)} revealOnHover hoverClass="group-hover/row:opacity-100" />
              )}
              <div
                ref={railRef}
                className="track scroll-x flex overflow-x-auto overflow-y-hidden"
                style={{
                  gap: "14px",
                  paddingLeft: "var(--gutter, 24px)",
                  paddingRight: "var(--gutter, 24px)",
                }}
              >
                {railQuery.isLoading
                  ? [...Array(6)].map((_, i) => (
                      <div key={i} className="sk-upcoming upcoming-card" aria-hidden="true">
                        <div className="upcoming-card__poster skeleton" style={{ aspectRatio: "16/9" }} />
                        <div className="upcoming-card__caption">
                          <div className="skeleton" style={{ height: "13px", width: "70%", borderRadius: "3px" }} />
                          <div className="skeleton" style={{ height: "11px", width: "40%", borderRadius: "3px", marginTop: "5px" }} />
                        </div>
                      </div>
                    ))
                  : railItems.slice(0, 20).map((item) => (
                      <UpcomingCard
                        key={item.id}
                        item={item}
                        badgeLabel={cfg.railBadge(item)}
                        onOpen={() => openDetails(item)}
                      />
                    ))}
              </div>
              {canRight && (
                <RailArrow dir="right" onClick={() => scrollRail(1)} revealOnHover hoverClass="group-hover/row:opacity-100" />
              )}
            </div>
          </section>
        )}

        {/* ── Poster grid (Popular / Top Rated / Newest) ─────────────── */}
        <section className="row-section relative z-10" style={{ padding: "0 0 60px" }}>
          <div className="row-head">
            <h2>{sortParam === "top_rated" ? "Top Rated" : sortParam === "newest" ? "Newest" : "Popular"}</h2>
          </div>
          <ErrorBoundary>
            {gridLoading ? (
              <div className="movies-grid">
                {[...Array(12)].map((_, i) => (
                  <MovieCardSkeleton key={i} />
                ))}
              </div>
            ) : gridError ? (
              <EmptyState
                icon="error"
                title="Couldn't load titles"
                description={gridError}
                actions={
                  <Button
                    variant="secondary"
                    pill
                    icon={RotateCw}
                    onClick={() => gridQuery.refetch()}
                  >
                    Try Again
                  </Button>
                }
              />
            ) : gridItems.length === 0 ? (
              <EmptyState
                icon="film"
                title="No titles found"
                description={
                  activeChips.length > 0
                    ? "No title matches every filter at once. Remove one to widen the search."
                    : "Nothing in this corner of the catalog yet — try a genre below."
                }
                actions={
                  <div className="browse-empty-actions">
                    {activeChips.length > 0 && (
                      <Button
                        variant="secondary"
                        pill
                        icon={RotateCw}
                        onClick={clearAllFilters}
                      >
                        Clear all filters
                      </Button>
                    )}
                    {(genresQuery.data || []).slice(0, 6).length > 0 && (
                      <div className="browse-suggestions">
                        <span className="browse-suggestions__label">Try a genre</span>
                        {(genresQuery.data || []).slice(0, 6).map((g) => (
                          <button
                            key={g.id}
                            type="button"
                            className="browse-chip"
                            onClick={() => setParam("genre", g.id)}
                          >
                            {g.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                }
              />
            ) : (
              <>
                <div className="movies-grid">
                  {gridItems.map((movie) => (
                    <MovieCard key={movie.id} movie={movie} />
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
                  ) : hasNextPage || !gridSettled ? null : (
                    <span className="discover-loadmore__end">You have reached the end</span>
                  )}
                </div>
              </>
            )}
          </ErrorBoundary>
          {railEmpty && !gridLoading && !gridError && gridItems.length > 0 && (
            <EmptyState
              icon={isSeries ? "tv" : "film"}
              title={isSeries ? "No new seasons airing right now." : "No upcoming releases right now."}
              compact
            />
          )}
        </section>

        {/* Docked filter bar (Cinejoy .pinned-filters). Portaled to <body>
            because the route wrapper carries a transform — `position: fixed`
            inside it would anchor to the page instead of the viewport. */}
        {filtersDock &&
          createPortal(
            <div className="pinned-filters discover-filters-dock is-stuck" role="group" aria-label="Filters">
              <DiscoveryFilters {...filterBarProps} />
            </div>,
            document.body,
          )}

        {/* Netlix-style info modal host (one shared instance per page) */}
        {modalHost}
      </div>
    </div>
  );
}
