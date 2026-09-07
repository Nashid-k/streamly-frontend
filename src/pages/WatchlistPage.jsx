import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast.jsx";
import MovieCard from "../components/MovieCard";

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
    window.scrollTo({ top: 0, behavior: 'instant' });
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
    <div
      className="main-content"
      style={{ padding: "5.5rem 3rem 4rem", minHeight: "80vh" }}
    >
      <div
        style={{
          padding: "2rem 0",
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
        }}
      >
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
              My List
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
                {myList.length}
              </span>
            </h1>
          </div>
          {myList.length > 0 && (
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
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {[
                  { label: "Date Added", value: "Date Added" },
                  { label: "A – Z", value: "Title A–Z" },
                  { label: "Top Rated", value: "Rating" },
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

        {myList.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "6rem 0",
              color: "#a1a1aa",
            }}
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
            <h2 style={{ color: "#fff", marginBottom: "0.5rem" }}>
              Your list is empty
            </h2>
            <p
              style={{
                marginBottom: "2rem",
                textAlign: "center",
                maxWidth: "300px",
              }}
            >
              Add movies and series to your list to save them for later.
            </p>
            <div
              style={{
                marginTop: "1rem",
                color: "#52525b",
                fontSize: "0.9rem",
                lineHeight: 1.6,
                maxWidth: "320px",
                margin: "1rem auto 0",
                textAlign: "center",
              }}
            >
              <p>
                Browse any title and tap{" "}
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "3px",
                    background: "rgba(255,255,255,0.08)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: "6px",
                    padding: "1px 8px",
                    fontSize: "0.8rem",
                    verticalAlign: "middle",
                  }}
                >
                  ＋
                </span>{" "}
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ padding: "4rem 0", textAlign: "center", color: "#a1a1aa" }}
          >
            No items match this filter.
          </motion.div>
        ) : (
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
                    onClick={(e) => handleRemove(e, movie)}
                    title="Remove from List"
                    style={{
                      position: "absolute",
                      top: "10px",
                      right: "10px",
                      zIndex: 10,
                      background: "rgba(0,0,0,0.6)",
                      border: "1px solid rgba(255,255,255,0.2)",
                      color: "#fff",
                      width: "30px",
                      height: "30px",
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      backdropFilter: "blur(4px)",
                      transition: "background 0.2s, border-color 0.2s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#ef4444";
                      e.currentTarget.style.borderColor = "#ef4444";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(0,0,0,0.6)";
                      e.currentTarget.style.borderColor =
                        "rgba(255,255,255,0.2)";
                    }}
                  >
                    <X size={14} />
                  </motion.button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
