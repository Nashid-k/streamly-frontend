import { useState, useMemo, useEffect } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import MovieCard from "../components/MovieCard";
import DiscoveryRails from "../components/DiscoveryRails";
import AmbientBackground from "../components/AmbientBackground";
import ErrorBoundary from "../components/ErrorBoundary";
import Chip from "../components/Chip";
import ContentPageHeader from "../components/ContentPageHeader";
import { selectGenreResults } from "../utils/genreResults";

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

  const results = useMemo(
    () => selectGenreResults(rawResults, genre),
    [rawResults, genre],
  );

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
      list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
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
      {/* Ambient background — banner-at-the-time gradient blur, like the watch page */}
      <AmbientBackground
        src={results[0]?.backdropUrl || results[0]?.posterUrl || results[0]?.poster}
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

      <div className="main-content content-page content-page--genre">
        <div className="content-page__inner">
          {/* Header */}
          <ContentPageHeader
            eyebrow="Browse by genre"
            title={genre}
            description={`A handpicked view of the best ${genre} stories right now.`}
            count={results.length || undefined}
            actions={results.length > 0 && (
              <div className="filter-controls">
                <div className="filter-group" aria-label="Filter genre results by type">
                  {["All", "Movies", "TV Shows"].map((f) => (
                    <Chip
                      key={f}
                      active={filterType === f}
                      onClick={() => setFilterType(f)}
                    >
                      {f}
                    </Chip>
                  ))}
                </div>
                <div className="filter-group filter-group--quiet" aria-label="Sort genre results">
                  {[
                    { label: "Popular", value: "Popularity" },
                    { label: "Top Rated", value: "Rating" },
                    { label: "Newest", value: "Year (Newest)" },
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
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
