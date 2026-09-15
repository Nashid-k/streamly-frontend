import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import { rankSearchResults, getDidYouMean } from "../utils/searchRanking";
import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, Film, Tv, Flame, Sparkles, Star, Clock, X, RotateCw } from "lucide-react";
import { motion } from "framer-motion";
import MovieCard from "../components/MovieCard";
import SearchResultRow from "../components/SearchResultRow";
import useDetailView from "../hooks/useDetailView";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import Chip from "../components/Chip";
import AmbientBackground from "../components/AmbientBackground";
import ErrorBoundary from "../components/ErrorBoundary";
import ContentPageHeader from "../components/ContentPageHeader";
import { useAppAuth } from "../context/auth";
import { logEmptyData, reportQueryError } from "../utils/debugLogger";

const QUICK_STARTS = [
  { label: "Trending Now", query: "trending", icon: Flame },
  { label: "New Releases", query: "new", icon: Sparkles },
  { label: "Top Rated", query: "top rated", icon: Star },
  { label: "K-Drama", query: "korean drama", icon: Tv },
  { label: "Marvel", query: "marvel", icon: Film },
];

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const navigate = useNavigate();

  const [localQuery, setLocalQuery] = useState(query);
  const { searchHistory, addSearch, clearSearchHistory } = useAppAuth();
  const [isTouchDevice] = useState(() =>
    typeof window !== "undefined" && (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia("(pointer: coarse)").matches
    )
  );

  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  // Live / dynamic search — sync the input to the URL query (debounced)
  useEffect(() => {
    if (localQuery.trim() === query) return;
    const t = setTimeout(() => {
      setSearchParams(localQuery.trim() ? { q: localQuery.trim() } : {}, { replace: true });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localQuery]);

  const [filterType, setFilterType] = useState("All");
  const [sortBy, setSortBy] = useState("Relevance");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const { openDetails, modalHost } = useDetailView();

  useEffect(() => {
    if (!query.trim()) return;
    addSearch(query);
    setFilterType("All");
    setSortBy("Relevance");
  }, [query, addSearch]);

  const {
    data: rawResults,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ["search", query],
    queryFn: () => movieService.searchMovies(query),
    enabled: !!query.trim(),
  });

  useEffect(() => {
    if (queryError) {
      reportQueryError("SearchPage", ["search", query], queryError, { query });
    }
  }, [queryError, query]);

  useEffect(() => {
    if (!loading && query.trim() && !queryError && (!rawResults || (Array.isArray(rawResults) ? rawResults.length === 0 : (rawResults?.movies?.length || 0) === 0))) {
      logEmptyData("SearchPage", `Search for "${query}" returned 0 results. Check TMDB /search/multi response.`, { query });
    }
  }, [loading, query, queryError, rawResults]);

  // Suggestions from backend ("did you mean")
  const backendSuggestions = useMemo(() => rawResults?.suggestions || [], [rawResults]);

  const results = useMemo(() => {
    const list = Array.isArray(rawResults) ? rawResults : rawResults?.movies;
    if (!list) return [];

    const mapped = list.filter(Boolean);
    const seen = new Set();
    const unique = mapped.filter((m) => {
      const key = m.tmdbId || m.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Rank by relevance — exact title matches first
    return rankSearchResults(unique, query);
  }, [rawResults, query]);

  const error = queryError ? "Failed to load search results." : null;

  // "Did you mean" suggestions — combine backend suggestions + fuzzy match
  const didYouMean = useMemo(() => {
    if (!query) return [];
    const hasExactMatch = results?.some(m =>
      (m.title || '').toLowerCase().trim() === query.toLowerCase().trim()
    );
    if (hasExactMatch) return [];

    // Fuzzy-match from results
    const fuzzy = getDidYouMean(query, results || [], 0.35);
    const fuzzyTitles = fuzzy.map(s => s.title);

    // Merge: backend suggestions first, then fuzzy matches not already in backend
    const merged = [
      ...backendSuggestions.filter(s => !fuzzyTitles.includes(s)),
      ...fuzzyTitles,
    ].slice(0, 5);
    return merged;
  }, [query, results, backendSuggestions]);

  const filteredAndSortedList = useMemo(() => {
    let list = [...(results || [])];

    if (filterType === "Movies") list = list.filter((m) => !m.isSeries);
    else if (filterType === "TV Shows") list = list.filter((m) => m.isSeries);
    else if (filterType === "Anime")
      list = list.filter((m) => m.genres?.includes("Animation"));

    if (sortBy === "Rating")
      list.sort((a, b) => (b.imdbRating || 0) - (a.imdbRating || 0));
    else if (sortBy === "Year (Newest)")
      list.sort(
        (a, b) =>
          (b.releaseYear || b.year || 0) - (a.releaseYear || a.year || 0),
      );
    else if (sortBy === "Year (Oldest)")
      list.sort(
        (a, b) =>
          (a.releaseYear || a.year || 0) - (b.releaseYear || b.year || 0),
      );
    else if (sortBy === "Relevance")
      // Always re-rank to ensure correct order after filtering
      return rankSearchResults(list, query);

    return list;
  }, [results, filterType, sortBy, query]);

  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    setVisibleCount(20);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [query, filterType, sortBy]);

  useEffect(() => {
    let inThrottle;
    const handleScroll = () => {
      if (!inThrottle) {
        if (
          window.innerHeight + window.scrollY >=
          document.body.offsetHeight - 800
        ) {
          setVisibleCount((prev) =>
            Math.min(prev + 20, filteredAndSortedList.length),
          );
        }
        inThrottle = true;
        setTimeout(() => (inThrottle = false), 200);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [filteredAndSortedList.length]);

  const visibleResults = filteredAndSortedList.slice(0, visibleCount);

  // Landing rail — "Trending Today" grid, fetched only while browsing
  const trendingQuery = useQuery({
    queryKey: ["trending-this-week"],
    queryFn: () => movieService.getTrendingThisWeek("all"),
    enabled: !query,
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const trendingTitles = useMemo(
    () => (Array.isArray(trendingQuery.data) ? trendingQuery.data : []),
    [trendingQuery.data],
  );

  useEffect(() => {
    if (trendingQuery.error) {
      reportQueryError("SearchPage", ["trending-this-week"], trendingQuery.error, {});
    }
  }, [trendingQuery.error]);

  return (
    <div className="main-content content-page content-page--search">
      <AmbientBackground
        src={
          visibleResults[0]?.backdropUrl ||
          visibleResults[0]?.posterUrl ||
          visibleResults[0]?.poster ||
          (results[0] && (results[0].backdropUrl || results[0].posterUrl || results[0].poster)) ||
          (trendingTitles[0]?.backdropUrl || trendingTitles[0]?.posterUrl)
        }
      />
      {/* ── Cinejoy-style search hero ── */}
      <section className={`search-hero${query ? " search-hero--compact" : ""}`}>
        {!query && (
          <h1 className="search-hero__title">What would you like to watch?</h1>
        )}

        {/* Search input — live, dynamic search */}
        <form
          className={`search-panel ${query ? "" : "search-panel--hero"}`}
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (localQuery.trim()) {
              setSearchParams({ q: localQuery.trim() }, { replace: true });
            }
          }}
        >
            <Search
              size={20}
              className="search-panel__icon"
              aria-hidden="true"
            />
            <input
              className="search-panel__input"
              type="text"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              placeholder="Search movies, shows, actors..."
              aria-label="Search"
              autoFocus={!isTouchDevice}
            />
            {localQuery && (
              <button
                type="button"
                className="search-panel__clear"
                aria-label="Clear search"
                onClick={() => {
                  setLocalQuery("");
                  setSearchParams({}, { replace: true });
                }}
              >
                <X size={16} />
              </button>
            )}
        </form>

        {/* Quick starts — recent searches + popular keywords */}
        {!query && (
          <div className="search-hero__quick" aria-label="Quick searches">
            {searchHistory.length > 0 && (
              <div className="search-hero__quick-group" aria-label="Recent searches">
                {searchHistory.map((term) => (
                  <button
                    key={term}
                    type="button"
                    className="search-chippill"
                    onClick={() => navigate(`/search?q=${encodeURIComponent(term)}`)}
                  >
                    <Clock size={13} aria-hidden="true" /> {term}
                  </button>
                ))}
                <button
                  type="button"
                  className="search-chippill search-chippill--clear"
                  onClick={clearSearchHistory}
                >
                  Clear
                </button>
              </div>
            )}
            {QUICK_STARTS.map((item) => (
              <button
                key={item.query}
                type="button"
                className="search-chippill"
                onClick={() => navigate(`/search?q=${encodeURIComponent(item.query)}`)}
              >
                <item.icon size={13} aria-hidden="true" /> {item.label}
              </button>
            ))}
          </div>
        )}
      </section>

      <div className="content-page__inner">
        {/* Header — shown while searching */}
        {query && (
          <ContentPageHeader
            eyebrow="Search"
            title={<>Results for <span className="page-title-quote">“{query}”</span></>}
            description="Fine-tune the results or keep exploring."
            count={results.length}
            actions={results.length > 0 && (
              <div className="filter-controls">
                <div className="filter-group" aria-label="Filter results by type">
                  {["All", "Movies", "TV Shows", "Anime"].map((f) => (
                    <Chip key={f} active={filterType === f} onClick={() => setFilterType(f)}>
                      {f}
                    </Chip>
                  ))}
                </div>
                <div className="filter-group filter-group--quiet" aria-label="Sort results">
                  {[
                    { label: "Relevant", value: "Relevance" },
                    { label: "Rating", value: "Rating" },
                    { label: "Newest", value: "Year (Newest)" },
                    { label: "Oldest", value: "Year (Oldest)" },
                  ].map((opt) => (
                    <Chip
                      key={opt.value}
                      size="sm"
                      active={sortBy === opt.value}
                      onClick={() => setSortBy(opt.value)}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          />
        )}

        {/* Content */}
        <ErrorBoundary>
          {loading ? (
          <div className="movie-grid" style={{ marginTop: "1rem" }}>
            {[...Array(12)].map((_, i) => (
              <div key={i} className="skeleton-moviecard">
                <div className="skeleton sk-poster"></div>
                <div className="skeleton sk-line sk-line--w70"></div>
                <div className="skeleton sk-line sk-line--sub"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <EmptyState
            icon="error"
            title="Couldn't load results"
            description={error}
            actions={
              <Button variant="secondary" pill icon={RotateCw} onClick={() => refetch()}>
                Try Again
              </Button>
            }
          />
        ) : !query ? (
          /* Landing — Cinejoy-style "Trending Today" grid */
          <section className="search-trending" aria-label="Trending Today">
            <div className="search-trending__head">
              <h2>Trending Today</h2>
            </div>

            {trendingQuery.isLoading ? (
              <div className="movie-grid">
                {[...Array(10)].map((_, i) => (
                  <div key={i} className="skeleton-moviecard">
                    <div className="skeleton sk-poster"></div>
                    <div className="skeleton sk-line sk-line--w70"></div>
                    <div className="skeleton sk-line sk-line--sub"></div>
                  </div>
                ))}
              </div>
            ) : trendingQuery.isError ? (
              <EmptyState
                icon="error"
                title="Couldn't load trending"
                description="Trending titles are unavailable right now."
                actions={
                  <Button variant="secondary" pill icon={RotateCw} onClick={() => trendingQuery.refetch()}>
                    Try Again
                  </Button>
                }
              />
            ) : trendingTitles.length === 0 ? (
              <EmptyState
                icon="film"
                title="Nothing trending yet"
                description="Check back soon — trending titles will appear here."
              />
            ) : (
              <div className="movie-grid">
                {trendingTitles.map((movie, idx) => (
                  <motion.div
                    key={movie.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      duration: 0.4,
                      delay: (idx % 10) * 0.05,
                      ease: "easeOut",
                    }}
                  >
                    <MovieCard movie={movie} />
                  </motion.div>
                ))}
              </div>
            )}
          </section>
        ) : filteredAndSortedList.length === 0 ? (
          <EmptyState
            icon="search"
            title={filterType === "All" ? `No results found for "${query}"` : `No ${filterType.toLowerCase()} match "${query}"`}
            description={filterType === "All" ? "Try a different spelling, or browse by genre and platform." : "Try another filter, or clear the current search."}
            actions={
              <>
                {filterType === "Anime" && (
                  <span
                    style={{
                      fontSize: "0.85rem",
                      color: "#a1a1aa",
                      textAlign: "center",
                      marginBottom: "0.5rem",
                    }}
                  >
                    No anime found — try "naruto", "demon slayer", or "one piece"
                  </span>
                )}
                {/* Did you mean suggestions */}
                {didYouMean.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.5rem",
                      marginBottom: "0.5rem",
                      width: "100%",
                    }}
                  >
                    <span style={{ fontSize: "0.85rem", color: "#a1a1aa" }}>
                      Did you mean:
                    </span>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
                      {didYouMean.map((s) => (
                        <Button
                          key={s}
                          variant="accent"
                          pill
                          size="sm"
                          style={{ minHeight: "38px" }}
                          onClick={() => navigate(`/search?q=${encodeURIComponent(s)}`)}
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                <Button
                  variant="secondary"
                  pill
                  onClick={() => navigate("/")}
                >
                  Browse Home
                </Button>
                <Button
                  variant="secondary"
                  pill
                  onClick={() => navigate("/search?q=action")}
                >
                  Action Movies
                </Button>
                <Button
                  variant="secondary"
                  pill
                  onClick={() => navigate("/search?q=anime")}
                >
                  Anime
                </Button>
                <Button
                  variant="secondary"
                  pill
                  onClick={() => navigate("/search?q=comedy")}
                >
                  Comedy
                </Button>
              </>
            }
          />
        ) : (
          <section className="mt-6 space-y-1.5" aria-label={`${results.length} results for "${query}"`}>
            {visibleResults.map((movie, idx) => (
              <SearchResultRow
                key={movie.id}
                r={movie}
                i={idx}
                selectedResultIndex={selectedIndex}
                setSelectedResultIndex={setSelectedIndex}
                onClick={() => openDetails(movie)}
              />
            ))}
          </section>
        )}
        </ErrorBoundary>
      </div>

      {modalHost}
    </div>
  );
}
