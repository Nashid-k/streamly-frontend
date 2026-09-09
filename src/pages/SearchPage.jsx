import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import { rankSearchResults, getDidYouMean } from "../utils/searchRanking";
import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, Film, Tv, Flame, Sparkles, Star, X, RotateCw } from "lucide-react";
import { motion } from "framer-motion";
import MovieCard from "../components/MovieCard";
import DiscoveryRails from "../components/DiscoveryRails";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import Chip from "../components/Chip";
import AmbientBackground from "../components/AmbientBackground";
import ErrorBoundary from "../components/ErrorBoundary";
import ContentPageHeader from "../components/ContentPageHeader";

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") || "";
  const navigate = useNavigate();

  const [localQuery, setLocalQuery] = useState(query);

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
    window.scrollTo({ top: 0, behavior: 'instant' });
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

  return (
    <div className="main-content content-page content-page--search">
      <AmbientBackground
        src={
          visibleResults[0]?.backdropUrl ||
          visibleResults[0]?.posterUrl ||
          visibleResults[0]?.poster ||
          (results[0] && (results[0].backdropUrl || results[0].posterUrl || results[0].poster))
        }
      />
      <div className="content-page__inner">
        {/* Search input — live, dynamic search */}
        <form
          className="search-panel"
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
              autoFocus
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

        {/* Header */}
        <ContentPageHeader
          eyebrow={query ? "Search" : "Explore Streamly"}
          title={query ? <>Results for <span className="page-title-quote">“{query}”</span></> : "Find something worth watching"}
          description={query ? "Fine-tune the results or keep exploring." : "Search a title, a person, or the mood you are in."}
          count={query ? results.length : undefined}
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

        {/* Discovery banners — only when browsing (no active query), not while searching */}
        {!query && <DiscoveryRails />}

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
          <EmptyState
            icon="search"
            title="What are you looking for?"
            description="Search for movies, TV shows, actors, or genres."
            actions={
              <>
                {[
                  { label: "Trending Now", query: "trending", icon: Flame },
                  { label: "New Releases", query: "new", icon: Sparkles },
                  { label: "Top Rated", query: "top rated", icon: Star },
                  { label: "K-Drama", query: "korean drama", icon: Tv },
                  { label: "Marvel", query: "marvel", icon: Film },
                ].map((item) => (
                  <Button
                    key={item.query}
                    variant="secondary"
                    pill
                    icon={item.icon}
                    onClick={() => navigate(`/search?q=${encodeURIComponent(item.query)}`)}
                  >
                    {item.label}
                  </Button>
                ))}
              </>
            }
          />
        ) : filteredAndSortedList.length === 0 ? (
          <EmptyState
            icon="search"
            title={`No results found for "${query}"`}
            description="Try a different spelling, or browse by genre and platform."
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
          <div className="movie-grid" style={{ marginTop: "1rem" }}>
            {visibleResults.map((movie, idx) => (
              <motion.div
                key={movie.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.4,
                  delay: (idx % 20) * 0.05,
                  ease: "easeOut",
                }}
              >
                <MovieCard movie={movie} />
              </motion.div>
            ))}
          </div>
        )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
