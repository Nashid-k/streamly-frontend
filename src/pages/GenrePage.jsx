import { useState, useMemo, useEffect } from "react";
import { EASE_OUT } from "../constants/motion";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import MovieCard from "../components/MovieCard";
import MovieCardSkeleton from "../components/MovieCardSkeleton";
import DiscoveryRails from "../components/DiscoveryRails";
import AmbientBackground from "../components/AmbientBackground";
import ErrorBoundary from "../components/ErrorBoundary";
import Button from "../components/Button";
import Chip from "../components/Chip";
import ContentPageHeader from "../components/ContentPageHeader";
import EmptyState from "../components/EmptyState";
import SEO from "../components/SEO";
import { selectGenreResults } from "../utils/genreResults";
import { logEmptyData, reportQueryError } from "../utils/debugLogger";

export default function GenrePage() {
  const { genre } = useParams();

  const [filterType, setFilterType] = useState("All");
  const [sortBy, setSortBy] = useState("Popularity");

  const {
    data: rawResults,
    isLoading: loading,
    isPlaceholderData,
    error: queryError,
    refetch: refetchGenreResults,
  } = useQuery({
    queryKey: ["genre-search", genre],
    queryFn: () => movieService.searchMovies(genre),
    enabled: !!genre,
    // Keep the previous genre's grid on screen while the next one resolves;
    // without this every genre switch threw the list away for a skeleton even
    // when the new key was already cached.
    placeholderData: (previous) => previous,
  });

  useEffect(() => {
    if (queryError) {
      reportQueryError("GenrePage", ["genre-search", genre], queryError, { genre });
    }
  }, [queryError, genre]);

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

  useEffect(() => {
    if (!loading && !queryError && genre && filteredAndSortedList.length === 0) {
      logEmptyData("GenrePage", `Genre "${genre}" produced 0 visible titles (filter=${filterType}, sort=${sortBy}). Raw results may have been filtered out.`, { genre, filterType, sortBy, rawCount: (results || []).length });
    }
  }, [loading, queryError, genre, filteredAndSortedList.length, filterType, sortBy, results]);

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
      <SEO
        title={`${genre || "Genre"} Movies & TV Shows`}
        description={`Browse the best ${genre} movies and TV shows streaming now on Streamly.`}
      />
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
            count={filteredAndSortedList.length || undefined}
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
                <MovieCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <EmptyState
              icon="error"
              title="Couldn't load this genre"
              description={error}
              actions={
                <Button
                  variant="secondary"
                  pill
                  icon={RotateCw}
                  onClick={() => refetchGenreResults()}
                >
                  Try Again
                </Button>
              }
            />
          ) : filteredAndSortedList.length === 0 && !isPlaceholderData ? (
            // Only a settled, genuinely-empty response is "no titles found". While
            // the previous genre's placeholder is still on screen the new list is
            // legitimately empty — don't call that a miss.
            <EmptyState
              icon="film"
              title="No titles found"
              description="We couldn't find any titles in this genre."
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
                    ease: EASE_OUT,
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
