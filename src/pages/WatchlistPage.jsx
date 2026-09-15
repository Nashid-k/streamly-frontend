import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bookmark, X, Search, Check, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppAuth } from "../context/auth";
import { useToast } from "../components/Toast.jsx";
import MovieCard from "../components/MovieCard";
import Chip from "../components/Chip";
import ErrorBoundary from "../components/ErrorBoundary";
import ContentPageHeader from "../components/ContentPageHeader";

export default function WatchlistPage() {
  const navigate = useNavigate();
  const { myList, toggleMyList, removeBatchFromMyList } = useAppAuth();
  const { toast } = useToast();

  const [filterType, setFilterType] = useState("All");
  const [sortBy, setSortBy] = useState("Date Added");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const filteredAndSortedList = useMemo(() => {
    let list = [...(myList || [])];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((m) => m.title?.toLowerCase().includes(q));
    }

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
  }, [myList, filterType, sortBy, searchQuery]);

  const [visibleCount, setVisibleCount] = useState(20);

  // Reset visible count when filter/sort/search changes
  useEffect(() => {
    setVisibleCount(20);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [filterType, sortBy, searchQuery]);

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

  const toggleSelectCard = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedList.map((m) => m.id)));
    }
  };

  const handleBatchDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (removeBatchFromMyList) {
      removeBatchFromMyList(ids);
    } else {
      ids.forEach((id) => {
        const item = myList.find((m) => m.id === id);
        if (item) toggleMyList(item);
      });
    }
    toast({
      title: "Items Removed",
      message: `Removed ${ids.length} item${ids.length > 1 ? "s" : ""} from your list.`,
      type: "info",
      duration: 2500,
    });
    setSelectedIds(new Set());
    setIsSelectMode(false);
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
            <div className="filter-controls" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
              <button
                type="button"
                onClick={() => {
                  setIsSelectMode((v) => !v);
                  setSelectedIds(new Set());
                }}
                style={{
                  background: isSelectMode ? "rgba(var(--accent-primary-rgb), 0.2)" : "rgba(255,255,255,0.06)",
                  border: isSelectMode ? "1px solid rgba(var(--accent-primary-rgb), 0.4)" : "1px solid rgba(255,255,255,0.1)",
                  color: isSelectMode ? "var(--accent-primary, #60a5fa)" : "#fff",
                  borderRadius: "999px",
                  padding: "5px 14px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {isSelectMode ? "Cancel" : "Select"}
              </button>
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

        {myList.length > 0 && (
          <div style={{ position: "relative", marginBottom: "1.25rem", maxWidth: "340px" }}>
            <Search
              size={15}
              style={{
                position: "absolute",
                left: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                color: "rgba(255,255,255,0.4)",
                pointerEvents: "none",
              }}
            />
            <input
              type="text"
              placeholder="Search your list..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 32px 8px 34px",
                borderRadius: "100px",
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                color: "#fff",
                fontSize: "0.82rem",
                outline: "none",
                transition: "border-color 0.2s, background 0.2s",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "rgba(var(--accent-primary-rgb), 0.5)";
                e.target.style.background = "rgba(255, 255, 255, 0.08)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "rgba(255, 255, 255, 0.1)";
                e.target.style.background = "rgba(255, 255, 255, 0.05)";
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.5)",
                  cursor: "pointer",
                  padding: "2px",
                  display: "flex",
                }}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

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
            {searchQuery ? `No saved titles match "${searchQuery}".` : "No items match this filter."}
          </motion.div>
        ) : (
          <ErrorBoundary>
          <div className="movie-grid" style={{ marginTop: "1rem" }}>
            <AnimatePresence>
              {visibleResults.map((movie, idx) => {
                const isSelected = selectedIds.has(movie.id);
                return (
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
                    onClick={isSelectMode ? () => toggleSelectCard(movie.id) : undefined}
                    style={{
                      position: "relative",
                      cursor: isSelectMode ? "pointer" : "default",
                      borderRadius: "16px",
                      outline: isSelectMode && isSelected ? "2px solid var(--accent-primary, #60a5fa)" : "none",
                      outlineOffset: "3px",
                      transition: "outline 0.15s ease",
                    }}
                  >
                    <MovieCard movie={movie} />

                    {isSelectMode ? (
                      <div
                        style={{
                          position: "absolute",
                          top: "10px",
                          left: "10px",
                          zIndex: 10,
                          width: "24px",
                          height: "24px",
                          borderRadius: "50%",
                          background: isSelected ? "var(--accent-primary, #3b82f6)" : "rgba(0,0,0,0.6)",
                          border: isSelected ? "none" : "2px solid rgba(255,255,255,0.7)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                          transition: "all 0.2s",
                        }}
                      >
                        {isSelected && <Check size={14} color="#fff" strokeWidth={3} />}
                      </div>
                    ) : (
                      /* Remove button — positioned relative to the motion.div wrapper */
                      <motion.button
                        className="card-remove-button"
                        onClick={(e) => handleRemove(e, movie)}
                        title="Remove from List"
                        aria-label={`Remove ${movie.title} from My List`}
                      >
                        <X size={14} />
                      </motion.button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
          </ErrorBoundary>
        )}

        {/* Floating Bulk Action Bar */}
        <AnimatePresence>
          {isSelectMode && (
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 30 }}
              style={{
                position: "fixed",
                bottom: "calc(var(--mobile-nav-height, 64px) + 16px)",
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 100,
                background: "rgba(18, 18, 22, 0.92)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(255, 255, 255, 0.15)",
                borderRadius: "999px",
                padding: "8px 16px",
                display: "flex",
                alignItems: "center",
                gap: "10px",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.6)",
                maxWidth: "92vw",
              }}
            >
              <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#fff", whiteSpace: "nowrap" }}>
                {selectedIds.size} selected
              </span>
              <button
                type="button"
                onClick={handleSelectAll}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  color: "#e4e4e7",
                  padding: "5px 12px",
                  borderRadius: "999px",
                  fontSize: "0.78rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {selectedIds.size === filteredAndSortedList.length ? "Deselect All" : "Select All"}
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={handleBatchDelete}
                style={{
                  background: selectedIds.size > 0 ? "rgba(239, 68, 68, 0.95)" : "rgba(255,255,255,0.06)",
                  border: "none",
                  color: selectedIds.size > 0 ? "#fff" : "rgba(255,255,255,0.3)",
                  padding: "5px 14px",
                  borderRadius: "999px",
                  fontSize: "0.78rem",
                  fontWeight: 600,
                  cursor: selectedIds.size > 0 ? "pointer" : "default",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  whiteSpace: "nowrap",
                }}
              >
                <Trash2 size={13} />
                Delete ({selectedIds.size})
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSelectMode(false);
                  setSelectedIds(new Set());
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255,255,255,0.5)",
                  padding: "4px 8px",
                  fontSize: "0.78rem",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
