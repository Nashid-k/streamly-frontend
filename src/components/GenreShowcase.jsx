import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { movieService } from "../api/movieService";
import { DiscoveryRail } from "./DiscoveryRails";
import ErrorBoundary from "./ErrorBoundary";

// Netflix/Prime-style genre showcase rows. Each rail maps TMDB genre ids for
// movie vs TV so the same row works on every home tab, mixing media types on
// the "All" view. Queries are cached 10min and skip when a genre chip is active.
const GENRE_RAILS = [
  {
    id: "action",
    name: "Action & Adventure",
    movieGenres: [28, 12],
    tvGenres: [10759, 10768],
  },
  {
    id: "sci-fi",
    name: "Sci-Fi & Fantasy",
    movieGenres: [878, 14],
    tvGenres: [10765],
  },
  { id: "comedy", name: "Comedies", movieGenres: [35], tvGenres: [35] },
  { id: "drama", name: "Dramas", movieGenres: [18], tvGenres: [18] },
  {
    id: "thriller",
    name: "Mystery & Thrillers",
    movieGenres: [9648, 53],
    tvGenres: [9648],
  },
  { id: "documentary", name: "Documentaries", movieGenres: [99], tvGenres: [99] },
];

function mediaTypesFor(filter) {
  if (filter === "movies") return ["movie"];
  if (filter === "series" || filter === "tv shows") return ["tv"];
  return ["movie", "tv"];
}

function railTitle(rail, mediaTypes) {
  if (mediaTypes.length === 1)
    return `${rail.name} ${mediaTypes[0] === "tv" ? "TV Shows" : "Movies"}`;
  return rail.name;
}

export default function GenreShowcase({ filter = "all", activeGenre = "All", limit = 18 }) {
  const mediaTypes = useMemo(() => mediaTypesFor(filter), [filter]);
  const visible = activeGenre === "All";

  const results = useQueries({
    queries: GENRE_RAILS.map((rail) => ({
      queryKey: ["genre-showcase", rail.id, mediaTypes.join(",")],
      queryFn: () =>
        movieService.getDiscoverByGenre({
          movies: mediaTypes.includes("movie") ? rail.movieGenres : [],
          tv: mediaTypes.includes("tv") ? rail.tvGenres : [],
        }),
      enabled: visible,
      staleTime: 1000 * 60 * 10,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });

  const rails = useMemo(
    () =>
      GENRE_RAILS.map((rail, i) => {
        const movies = (results[i]?.data || []).slice(0, limit);
        if (movies.length === 0) return null;
        const title = railTitle(rail, mediaTypes);
        return {
          id: `gs-${rail.id}`,
          title,
          movies,
          href: `/category/${encodeURIComponent(title)}`,
          linkState: { movies, name: title },
        };
      }).filter(Boolean),
    [results, limit, mediaTypes],
  );

  if (!visible) return null;

  const loading = results.some((q) => q.isLoading);
  if (!loading && rails.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "3.5rem" }}>
      {loading
        ? [1, 2, 3, 4].map((rail) => (
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
        : rails.map((rail) => (
            <motion.section
              key={rail.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <ErrorBoundary>
                <DiscoveryRail section={rail} />
              </ErrorBoundary>
            </motion.section>
          ))}
    </div>
  );
}