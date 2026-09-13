import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast.jsx";
import MovieCard from "../components/MovieCard";
import Chip from "../components/Chip";
import ErrorBoundary from "../components/ErrorBoundary";
import ContentPageHeader from "../components/ContentPageHeader";

export default function WatchlistPage() {
  const navigate = useNavigate();
  const { myList, toggleMyList } = useAppAuth();
  const { toast } = useToast();

  const [filterType, setFilterType] = useState("All");
  const [sortBy, setSortBy] = useState("Date Added");

  const filteredAndSortedList = useMemo(() => {
    let list = [...(myList || [])];
    if (filterType === "Movies") list = list.filter((m) => !m.isSeries);
    else if (filterType === "TV Shows") list = list.filter((m) => m.isSeries);

    if (sortBy === "Title A–Z") {
      list.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "Rating") {
      list.sort((a, b) => (b.imdbRating || 0) - (a.imdbRating || 0));
    }
    if (sortBy === "Date Added") {
      list.reverse();
    }
    return list;
  }, [myList, filterType, sortBy]);

  const [visibleCount, setVisibleCount] = useState(20);

  // Reset visible count when filter/sort changes (#14 fix)
  useEffect(() => {
    setVisibleCount(20);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [filterType, sortBy]);

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

  const handleRemove = (e, movie) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMyList(movie);
    toast({
      title: "Removed from List",
      message: `"${movie.title}" was removed.`,
      type: "info",
      duration: 2500,
    });
  };

  return (
    <div className="main-content content-page content-page--library">
      <div className="content-page__inner">
        <ContentPageHeader
          eyebrow="Your library"
          title="My List"
          description="Keep the next great watch close at hand."
          count={myList.length}
          actions={myList.length > 0 && (
            <div className="filter-controls">
              <div className="filter-group" aria-label="Filter My List by type">
                {["All", "Movies", "TV Shows"].map((f) => (
                  <Chip key={f} active={filterType === f} onClick={() => setFilterType(f)}>
                    {f}
                  </Chip>
                ))}
              </div>
              <div className="filter-group filter-group--quiet" aria-label="Sort My List">
                {[
                  { label: "Date Added", value: "Date Added" },
                  { label: "A – Z", value: "Title A–Z" },
                  { label: "Top Rated", value: "Rating" },
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

        {myList.length === 0 ? (
          <motion.div
            className="collection-empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <Bookmark
                size={56}
                style={{ opacity: 0.2, marginBottom: "1.5rem" }}
              />
            </motion.div>
            <h2>Your list is empty</h2>
            <p>
              Add movies and series to your list to save them for later.
            </p>
            <div className="collection-empty__hint">
              <p>
                Browse any title and tap{" "}
                <span className="collection-empty__key">＋</span>{" "}
                to save it here.
              </p>
            </div>
            <motion.button
              onClick={() => navigate("/")}
              className="btn btn-primary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Discover Content
            </motion.button>
          </motion.div>
        ) : filteredAndSortedList.length === 0 ? (
          <motion.div
            className="content-page__notice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            No items match this filter.
          </motion.div>
        ) : (
          <ErrorBoundary>
          <div className="movie-grid" style={{ marginTop: "1rem" }}>
            <AnimatePresence>
              {visibleResults.map((movie, idx) => (
                <motion.div
                  key={movie.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{
                    opacity: 0,
                    scale: 0.85,
                    transition: { duration: 0.2 },
                  }}
                  transition={{
                    duration: 0.4,
                    delay: (idx % 20) * 0.04,
                    ease: "easeOut",
                  }}
                  style={{ position: "relative" }}
                >
                  <MovieCard movie={movie} />

                  {/* Remove button — positioned relative to the motion.div wrapper */}
                  <motion.button
                    className="card-remove-button"
                    onClick={(e) => handleRemove(e, movie)}
                    title="Remove from List"
                    aria-label={`Remove ${movie.title} from My List`}
                  >
                    <X size={14} />
                  </motion.button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
