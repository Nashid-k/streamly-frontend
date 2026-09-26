import { useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { movieService } from "../api/movieService";
import { DiscoveryRail } from "./DiscoveryRails";
import { useNearViewport } from "../hooks/useNearViewport";
import ErrorBoundary from "./ErrorBoundary";
import { logEmptyData, reportQueryError } from "../utils/debugLogger";

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

  if (!visible) return null;

  /* One component per rail, each with its OWN viewport-gated query. This used to
     be a single useQueries fan-out that fired all six (12 catalogue requests)
     the moment Home mounted, three rails below the fold. */
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
      {GENRE_RAILS.map((rail) => (
        <GenreRail key={rail.id} rail={rail} mediaTypes={mediaTypes} limit={limit} />
      ))}
    </div>
  );
}

function GenreRail({ rail, mediaTypes, limit }) {
  const [sentinelRef, nearViewport] = useNearViewport();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["genre-showcase", rail.id, mediaTypes.join(",")],
    queryFn: () =>
      movieService.getDiscoverByGenre({
        movies: mediaTypes.includes("movie") ? rail.movieGenres : [],
        tv: mediaTypes.includes("tv") ? rail.tvGenres : [],
      }),
    enabled: nearViewport,
    staleTime: 1000 * 60 * 10,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const movies = useMemo(() => (data || []).slice(0, limit), [data, limit]);

  useEffect(() => {
    if (isError) reportQueryError("GenreShowcase", ["genre-showcase", rail.id], error, { rail: rail.id });
  }, [isError, error, rail.id]);

  useEffect(() => {
    if (!isLoading && !isError && movies.length === 0) {
      logEmptyData(
        "GenreShowcase",
        `Genre rail "${rail.id}" empty — /discover returned nothing. Check TMDB discover + genre ids.`,
        { rail: rail.id },
      );
    }
  }, [isLoading, isError, movies.length, rail.id]);

  const title = railTitle(rail, mediaTypes);
  const section = {
    id: `gs-${rail.id}`,
    title,
    movies,
    href: `/category/${encodeURIComponent(title)}`,
    linkState: { movies, name: title },
  };

  // Settled and empty: render nothing at all (not even the sentinel), so an
  // empty rail leaves no gap in the stack. Still-pending (including while the
  // viewport gate is closed) keeps the sentinel mounted — that is what lets the
  // observer open the gate.
  if (data !== undefined && movies.length === 0) return null;

  return (
    // Always mounted so the observer has a target; a row with nothing to show
    // collapses to zero height.
    <div ref={sentinelRef}>
      {isLoading && (
        <div>
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
      )}
      {movies.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <ErrorBoundary>
            <DiscoveryRail section={section} />
          </ErrorBoundary>
        </motion.section>
      )}
    </div>
  );
}