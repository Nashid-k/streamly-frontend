import { useMemo } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { movieService } from "../api/movieService";
import { normalizeMovieSource } from "../api/platformAdapter";
import ErrorBoundary from "./ErrorBoundary";
import SectionHeader from "./SectionHeader";
import MovieCard from "./MovieCard";
import { asArray, EMPTY_ARRAY } from "../utils";

const hasArt = (m) => Boolean(m && (m.posterUrl || m.poster || m.backdropUrl));
const dedupeKey = (m) => m.tmdbId || m.id;

// Compact banner-style discovery rails for listing pages. Mirrors the
// authentic streaming pattern: Trend / Airing / Latest / Popular rows on
// top of genre + search results so fresh OTT releases are always visible.
export default function DiscoveryRails({ limit = 20 } = {}) {
  const trendingQuery = useQuery({
    queryKey: ["trending-this-week"],
    queryFn: () => movieService.getTrendingThisWeek("all"),
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const airingQuery = useQuery({
    queryKey: ["airing-this-week"],
    queryFn: () => movieService.getAiringThisWeek("all"),
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const top10Query = useQuery({
    queryKey: ["top10"],
    queryFn: () => movieService.getTop10("all"),
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => movieService.getCategories("all"),
    staleTime: 1000 * 60 * 5,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const latestReleases = useMemo(() => {
    try {
      // Collect every catalog movie, keeping the first occurrence per id.
      const allMovies = new Map();
      for (const cat of asArray(categoriesQuery.data)) {
        for (const m of asArray(cat?.movies)) {
          if (m && m.id && !allMovies.has(m.id)) allMovies.set(m.id, m);
        }
      }
      const pool = Array.from(allMovies.values());

      // Prefer editorial "new/recently added" rails, else infer freshness
      // from releaseDate within the last 90 days.
      const freshRails = asArray(categoriesQuery.data)
        .filter(
          (c) =>
            c &&
            /new|recently|fresh|latest|release/i.test(c.name || "") &&
            !/upcoming/i.test(c.name || ""),
        )
        .flatMap((c) => asArray(c.movies));

      const ninetyDays = 90 * 24 * 60 * 60 * 1000;
      const inferred = pool.filter(
        (m) =>
          m.releaseDate &&
          Date.now() - new Date(m.releaseDate).getTime() < ninetyDays,
      );

      const merged = new Map();
      const source = freshRails.length >= 8 ? freshRails : inferred;
      for (const m of source) {
        if (m && m.id && !merged.has(m.id)) merged.set(m.id, m);
      }
      return Array.from(merged.values()).slice(0, limit);
    } catch (e) {
      console.error("DiscoveryRails latestReleases error:", e);
      return EMPTY_ARRAY;
    }
  }, [categoriesQuery.data, limit]);

  // Deduplicate across sections so one title never appears twice on a page.
  const { sections, loading } = useMemo(() => {
    const seen = new Set();
    const take = (list) => {
      const out = [];
      for (const raw of asArray(list)) {
        const m = hasArt(raw) ? normalizeMovieSource(raw) : null;
        if (!m) continue;
        const key = dedupeKey(m);
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        out.push(m);
        if (out.length >= limit) break;
      }
      return out;
    };

    const loaded =
      !trendingQuery.isLoading &&
      !airingQuery.isLoading &&
      !top10Query.isLoading &&
      !categoriesQuery.isLoading;

    const sections = [
      { id: "trending", title: "Trending Now", movies: take(trendingQuery.data) },
      { id: "airing", title: "Airing This Week", movies: take(airingQuery.data) },
      { id: "latest", title: "Latest Releases", movies: take(latestReleases) },
      { id: "popular", title: "Popular Right Now", movies: take(top10Query.data) },
    ].filter((s) => s.movies.length > 0);

    return { sections, loading: !loaded };
  }, [
    trendingQuery.data,
    trendingQuery.isLoading,
    airingQuery.data,
    airingQuery.isLoading,
    top10Query.data,
    top10Query.isLoading,
    categoriesQuery.isLoading,
    latestReleases,
    limit,
  ]);

  if (!loading && sections.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      {loading
        ? [1, 2, 3].map((rail) => (
            <div key={rail}>
              <div className="skeleton skeleton-title"></div>
              <div className="skeleton-rail">
                {[1, 2, 3, 4, 5].map((card) => (
                  <div key={card} className="skeleton-moviecard">
                    <div className="skeleton sk-poster"></div>
                    <div className="skeleton sk-line sk-line--w70"></div>
                    <div className="skeleton sk-line sk-line--sub"></div>
                  </div>
                ))}
              </div>
            </div>
          ))
        : sections.map((section) => (
            <motion.section
              key={section.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <ErrorBoundary>
                <SectionHeader
                  title={section.title}
                  actions={
                    <Link
                      to={`/search?q=${encodeURIComponent(section.title)}`}
                      style={{
                        fontSize: "0.72rem",
                        color: "rgba(255,255,255,0.35)",
                        textDecoration: "none",
                        fontWeight: 500,
                        padding: "2px 8px",
                        borderRadius: "4px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Show all ›
                    </Link>
                  }
                />
                <div
                  className="movie-rail"
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    WebkitOverflowScrolling: "touch",
                    overscrollBehaviorX: "contain",
                    overflowX: "auto",
                    scrollbarWidth: "none",
                    padding: "0.25rem 0.5rem",
                  }}
                >
                  {section.movies.map((movie, idx) => (
                    <div
                      key={`${section.id}-${dedupeKey(movie)}-${idx}`}
                      style={{ flexShrink: 0 }}
                    >
                      <MovieCard movie={movie} platformBadge="xs" />
                    </div>
                  ))}
                </div>
              </ErrorBoundary>
            </motion.section>
          ))}
    </div>
  );
}