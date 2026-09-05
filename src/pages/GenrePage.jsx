import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import { mapSource } from "../api/platformAdapter";
import MovieCard from "../components/MovieCard";
import DiscoveryRails from "../components/DiscoveryRails";

export default function GenrePage() {
  const { genre } = useParams();

  const [filterType, setFilterType] = useState("All");
  const [sortBy, setSortBy] = useState("Popularity");

  const { data: rawResults, isLoading: loading, error: queryError } = useQuery({
    queryKey: ["genre-search", genre],
    queryFn: () => movieService.searchMovies(genre),
    enabled: !!genre,
  });

  const error = queryError ? "Failed to load genre results." : null;

  const results = useMemo(() => {
    if (!rawResults || !Array.isArray(rawResults.movies)) return [];

    const mapped = rawResults.movies.filter(Boolean).map(mapSource);

    // Filter to ensure the genre matches to prevent dirty search results
    const strict = mapped.filter((m) => {
      if (
        m.genres &&
        m.genres.some((g) => g.toLowerCase() === genre.toLowerCase())
      )
        return true;
      if (
        m.tags &&
        m.tags.some((t) => t.toLowerCase() === genre.toLowerCase())
      )
        return true;
      return false;
    });

    // If strict is too small, fallback to search results (#12 fix: lower threshold)
    const finalResults = strict.length > 0 ? strict : mapped;

    // Deduplicate
    const seen = new Set();
    return finalResults.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [rawResults, genre]);

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
    else if (sortBy === "Popularity") {
      list.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    }

    return list;
  }, [results, filterType, sortBy]);

  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    setVisibleCount(20);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [genre, filterType, sortBy]);

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
    <div style={{ position: "relative" }}>
      {/* Hero Banner */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "40vh",
          background: "linear-gradient(135deg, #27272a 0%, #09090b 100%)",
          zIndex: -1,
          opacity: 0.6,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "10vh",
          left: 0,
          width: "100%",
          height: "30vh",
          background: "linear-gradient(to bottom, transparent, #000)",
          zIndex: -1,
        }}
      />

      <div
        className="main-content"
        style={{ padding: "4rem 3rem", minHeight: "80vh" }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
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
                style={{
                  margin: "0 0 0.5rem",
                  fontSize: "3.5rem",
                  fontWeight: 800,
                  textTransform: "capitalize",
                }}
              >
                {genre}
              </h1>
              <p style={{ margin: 0, color: "#a1a1aa", fontSize: "1.1rem" }}>
                Browse top titles in {genre}
              </p>
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
                  {["All", "Movies", "TV Shows"].map((f) => (
                    <motion.button
                      key={f}
                      onClick={() => setFilterType(f)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        background:
                          filterType === f ? "#fff" : "rgba(255,255,255,0.08)",
                        color: filterType === f ? "#000" : "#fff",
                        border:
                          "1px solid " +
                          (filterType === f
                            ? "transparent"
                            : "rgba(255,255,255,0.1)"),
                        padding: "6px 16px",
                        borderRadius: "100px",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        transition:
                          "background 0.2s, color 0.2s, border-color 0.2s",
                      }}
                    >
                      {f}
                    </motion.button>
                  ))}
                </div>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  {[
                    { label: "Popular", value: "Popularity" },
                    { label: "Top Rated", value: "Rating" },
                    { label: "Newest", value: "Year (Newest)" },
                  ].map((opt) => (
                    <motion.button
                      key={opt.value}
                      onClick={() => setSortBy(opt.value)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        background:
                          sortBy === opt.value
                            ? "rgba(255,255,255,0.13)"
                            : "rgba(255,255,255,0.05)",
                        color: sortBy === opt.value ? "#fff" : "#a1a1aa",
                        border:
                          "1px solid " +
                          (sortBy === opt.value
                            ? "rgba(255,255,255,0.28)"
                            : "rgba(255,255,255,0.08)"),
                        padding: "5px 13px",
                        borderRadius: "100px",
                        fontSize: "0.82rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        transition: "all 0.15s",
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
          ) : filteredAndSortedList.length === 0 ? (
            <div
              style={{
                padding: "6rem 0",
                textAlign: "center",
                color: "#a1a1aa",
              }}
            >
              <h2 style={{ color: "#fff", marginBottom: "0.5rem" }}>
                No titles found
              </h2>
              <p>We couldn't find any titles in this genre.</p>
            </div>
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
        </div>
      </div>
    </div>
  );
}
