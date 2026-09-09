import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import { rankSearchResults, getDidYouMean } from "../utils/searchRanking";
import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Search, Film, Tv, Flame, Sparkles, Star, X } from "lucide-react";
import { motion } from "framer-motion";
import MovieCard from "../components/MovieCard";
import DiscoveryRails from "../components/DiscoveryRails";
import EmptyState from "../components/EmptyState";
import Button from "../components/Button";
import AmbientBackground from "../components/AmbientBackground";
import ErrorBoundary from "../components/ErrorBoundary";

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
    <div
      className="main-content"
      style={{ padding: "5.5rem 3rem 4rem", minHeight: "80vh" }}
    >
      <AmbientBackground
        src={
          visibleResults[0]?.backdropUrl ||
          visibleResults[0]?.posterUrl ||
          visibleResults[0]?.poster ||
          (results[0] && (results[0].backdropUrl || results[0].posterUrl || results[0].poster))
        }
      />
      <div
        style={{
          padding: "2rem 0",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
        {/* Search input — live, dynamic search */}
        <div style={{ marginBottom: "1.5rem", maxWidth: "760px" }}>
          <div style={{ position: "relative" }}>
            <Search
              size={20}
              style={{
                position: "absolute",
                left: "16px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "#71717a",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              value={localQuery}
              onChange={(e) => setLocalQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && localQuery.trim()) {
                  setSearchParams({ q: localQuery.trim() }, { replace: true });
                }
              }}
              placeholder="Search movies, shows, actors..."
              aria-label="Search"
              autoFocus
              style={{
                width: "100%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: "16px",
                padding: "1rem 3.25rem 1rem 3rem",
                fontSize: "1.05rem",
                color: "#fff",
                fontFamily: "inherit",
                outline: "none",
                transition: "border-color 0.2s ease, box-shadow 0.2s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(244,63,94,0.5)";
                e.currentTarget.style.boxShadow = "0 0 0 4px rgba(244,63,94,0.12)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            {localQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setLocalQuery("");
                  setSearchParams({}, { replace: true });
                }}
                style={{
                  position: "absolute",
                  right: "14px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "rgba(255,255,255,0.1)",
                  border: "none",
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  color: "#a1a1aa",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <h1
              className="section-title"
              style={{
                margin: 0,
                fontSize: "2.5rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
              }}
            >
              Search results for "{query}"
              <span
                style={{
                  fontSize: "1rem",
                  background: "rgba(255,255,255,0.1)",
                  padding: "2px 12px",
                  borderRadius: "100px",
                  fontWeight: 600,
                  color: "#a1a1aa",
                }}
              >
                {results.length}
              </span>
            </h1>
          </div>

          {results.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: "1.5rem",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", gap: "0.5rem" }}>
                {["All", "Movies", "TV Shows", "Anime"].map((f) => (
                  <motion.button
                    key={f}
                    onClick={() => setFilterType(f)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    aria-pressed={filterType === f}
                    className={`chip ${filterType === f ? "chip--active" : ""}`}
                  >
                    {f}
                  </motion.button>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "0.4rem",
                  flexWrap: "wrap",
                }}
              >
                {[
                  { label: "Relevant", value: "Relevance" },
                  { label: "Rating", value: "Rating" },
                  { label: "Newest", value: "Year (Newest)" },
                  { label: "Oldest", value: "Year (Oldest)" },
                ].map((opt) => (
                  <motion.button
                    key={opt.value}
                    onClick={() => setSortBy(opt.value)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    aria-pressed={sortBy === opt.value}
                    className={`chip ${sortBy === opt.value ? "chip--active" : ""}`}
                    style={{
                      fontSize: "0.82rem",
                    }}
                  >
                    {opt.label}
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Discovery banners — Trending / Airing / Latest / Popular */}
        <DiscoveryRails />

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
          <div
            style={{
              padding: "4rem 0",
              textAlign: "center",
              color: "#ef4444",
              fontSize: "1.2rem",
            }}
          >
            {error}
          </div>
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
