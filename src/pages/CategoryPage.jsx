import React, { useMemo, useState, useEffect } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { movieService } from "../api/movieService";
import { motion } from "framer-motion";
import MovieCard from "../components/MovieCard";
import AmbientBackground from "../components/AmbientBackground";
import ErrorBoundary from "../components/ErrorBoundary";
import ContentPageHeader from "../components/ContentPageHeader";

export default function CategoryPage() {
  const { name } = useParams();
  const categoryName = decodeURIComponent(name);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [categoryName]);

  const { data: categoriesData, isLoading } = useQuery({
    queryKey: ["categories"],
    queryFn: () => movieService.getCategories("all"),
  });

  const category = useMemo(() => {
    if (!categoriesData) return null;
    // 1. Exact match
    let found = categoriesData.find(
      (c) => c.name.toLowerCase() === categoryName.toLowerCase(),
    );
    // 2. Partial / fuzzy match — handles slight naming differences between rails and categories
    if (!found) {
      found = categoriesData.find(
        (c) =>
          c.name.toLowerCase().includes(categoryName.toLowerCase()) ||
          categoryName.toLowerCase().includes(c.name.toLowerCase()),
      );
    }
    // 3. Token match — e.g. "Horror & Thrills" matches "Horror"
    if (!found) {
      const tokens = categoryName.toLowerCase().split(/[&\s]+/).filter(Boolean);
      found = categoriesData.find((c) => {
        const catLower = c.name.toLowerCase();
        return tokens.length > 0 && tokens.every((t) => catLower.includes(t));
      });
    }
    return found;
  }, [categoriesData, categoryName]);

  const { state } = useLocation();

  const allMovies = useMemo(() => {
    if (state?.movies && state.movies.length > 0) return state.movies;
    if (category?.movies && category.movies.length > 0) return category.movies;
    return [];
  }, [state?.movies, category?.movies]);

  // Infinite scroll logic
  const [visibleCount, setVisibleCount] = useState(20);

  useEffect(() => {
    setVisibleCount(20);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [categoryName]);

  useEffect(() => {
    let inThrottle;
    const handleScroll = () => {
      if (!inThrottle) {
        if (
          window.innerHeight + window.scrollY >=
          document.body.offsetHeight - 800
        ) {
          setVisibleCount((prev) => Math.min(prev + 20, allMovies.length));
        }
        inThrottle = true;
        setTimeout(() => (inThrottle = false), 200);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [allMovies.length]);

  if (isLoading)
    return (
      <div className="main-content content-page content-page--collection">
        <div className="content-page__inner">
        <ContentPageHeader
          eyebrow="Collection"
          title={categoryName}
          description="Getting your collection ready."
          backTo="/"
          backLabel="Browse"
        />
        <div className="movie-grid" style={{ marginTop: "1rem" }}>
          {[...Array(12)].map((_, i) => (
            <div key={i} className="skeleton-moviecard">
              <div className="skeleton sk-poster"></div>
              <div className="skeleton sk-line sk-line--w70"></div>
              <div className="skeleton sk-line sk-line--sub"></div>
            </div>
          ))}
        </div>
        </div>
      </div>
    );

  if (!category && allMovies.length === 0) {
    return (
      <div className="main-content content-page content-page--collection">
        <div className="content-page__inner">
        <ContentPageHeader
          eyebrow="Collection"
          title="Category unavailable"
          description="This collection may have moved or is no longer available."
          backTo="/"
          backLabel="Browse"
        />
        <p className="content-page__notice">
          No category matching "{categoryName}" was found.
        </p>
        </div>
      </div>
    );
  }

  const visibleMovies = allMovies.slice(0, visibleCount);

  return (
    <div className="main-content content-page content-page--collection">
      <AmbientBackground
        src={
          visibleMovies[0]?.backdropUrl ||
          visibleMovies[0]?.posterUrl ||
          visibleMovies[0]?.poster
        }
      />
      <div className="content-page__inner">
      <ContentPageHeader
        eyebrow="Collection"
        title={category?.name || categoryName}
        description="A curated selection, ready when you are."
        count={allMovies.length}
        backTo="/"
        backLabel="Browse"
      />

      {allMovies.length === 0 ? (
        <p className="content-page__notice">No titles are available in this collection yet.</p>
      ) : (
        <ErrorBoundary>
        <div className="movie-grid" style={{ marginTop: "1rem" }}>
          {visibleMovies.map((movie, index) => (
            <motion.div
              key={movie.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: (index % 20) * 0.05,
                ease: "easeOut",
              }}
            >
              <MovieCard movie={movie} />
            </motion.div>
          ))}
        </div>
        </ErrorBoundary>
      )}
      </div>
    </div>
  );
}
