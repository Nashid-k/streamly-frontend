import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, X, Search, Check, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppAuth } from "../context/auth";
import { useToast } from "../components/Toast.jsx";
import { useConfirmDialog } from "../components/ConfirmDialog.jsx";
import MovieCard from "../components/MovieCard.jsx";
import ErrorBoundary from "../components/ErrorBoundary";
import ContentPageHeader from "../components/ContentPageHeader";

export default function HistoryPage() {
  const navigate = useNavigate();
  const {
    continueWatching,
    removeFromContinueWatching,
    removeBatchFromContinueWatching,
    clearContinueWatching,
  } = useAppAuth();
  const { toast } = useToast();
  const { confirmDialog, ConfirmDialogRenderer } = useConfirmDialog();

  const [searchQuery, setSearchQuery] = useState("");
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [visibleCount, setVisibleCount] = useState(20);

  const filteredHistory = useMemo(() => {
    let list = continueWatching || [];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter((m) => m.title?.toLowerCase().includes(q));
    }
    return list;
  }, [continueWatching, searchQuery]);

  // Reset visible count when data or search query changes
  useEffect(() => {
    setVisibleCount(20);
  }, [filteredHistory.length]);

  useEffect(() => {
    let inThrottle;
    const handleScroll = () => {
      if (!inThrottle) {
        if (
          window.innerHeight + window.scrollY >=
          document.body.offsetHeight - 800
        ) {
          setVisibleCount((prev) =>
            Math.min(prev + 20, filteredHistory.length),
          );
        }
        inThrottle = true;
        setTimeout(() => (inThrottle = false), 200);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [filteredHistory.length]);

  const visibleResults = filteredHistory.slice(0, visibleCount);

  const clearHistory = async () => {
    const confirmed = await confirmDialog({
      title: "Clear Watch History?",
      message:
        "This will permanently remove all titles from your watch history. This action cannot be undone.",
      confirmLabel: "Clear All",
      cancelLabel: "Keep History",
    });
    if (!confirmed) return;

    clearContinueWatching();
    toast({
      title: "History Cleared",
      message: "Your watch history has been removed.",
      type: "info",
    });
  };

  const handleRemove = (e, movie) => {
    e.preventDefault();
    e.stopPropagation();
    removeFromContinueWatching(movie.id);
    toast({
      title: "Removed",
      message: `"${movie.title}" removed from history.`,
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
    if (selectedIds.size === filteredHistory.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredHistory.map((m) => m.id)));
    }
  };

  const handleBatchDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (removeBatchFromContinueWatching) {
      removeBatchFromContinueWatching(ids);
    } else {
      ids.forEach((id) => removeFromContinueWatching(id));
    }
    toast({
      title: "Items Removed",
      message: `Removed ${ids.length} item${ids.length > 1 ? "s" : ""} from watch history.`,
      type: "info",
      duration: 2500,
    });
    setSelectedIds(new Set());
    setIsSelectMode(false);
  };

  return (
    <div className="main-content content-page content-page--library">
      <ConfirmDialogRenderer />
      <div className="content-page__inner">
        <ContentPageHeader
          eyebrow="Your activity"
          title="Watch History"
          description="Pick up where you left off, without hunting for it."
          count={continueWatching.length}
          actions={continueWatching.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
                  padding: "6px 14px",
                  fontSize: "0.82rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {isSelectMode ? "Cancel" : "Select"}
              </button>
              <button
                type="button"
                className="page-danger-action"
                onClick={clearHistory}
              >
                Clear All
              </button>
            </div>
          )}
        />

        {continueWatching.length > 0 && (
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
              placeholder="Search watch history..."
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

        {continueWatching.length === 0 ? (
          <motion.div
            className="collection-empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
              transition={{ duration: 1.5, delay: 0.3, ease: "easeInOut" }}
            >
              <Clock
                size={56}
                style={{ opacity: 0.2, marginBottom: "1.5rem" }}
              />
            </motion.div>
            <h2>No watch history yet</h2>
            <p>
              Titles you watch will automatically appear here so you can pick up
              right where you left off.
            </p>
            <motion.button
              onClick={() => navigate("/")}
              className="btn btn-primary"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              Discover Content
            </motion.button>
          </motion.div>
        ) : filteredHistory.length === 0 ? (
          <motion.div
            className="content-page__notice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            No titles match "{searchQuery}".
          </motion.div>
        ) : (
          <ErrorBoundary>
          <div className="history-groups">
            {["Today", "Yesterday", "Earlier"].map((group) => {
              const groupItems = visibleResults.filter((item) => {
                if (!item.lastWatched) return group === "Earlier";
                const diffDays = Math.floor(
                  (Date.now() - item.lastWatched) / (1000 * 60 * 60 * 24),
                );
                if (group === "Today") return diffDays === 0;
                if (group === "Yesterday") return diffDays === 1;
                return diffDays > 1;
              });

              if (groupItems.length === 0) return null;

              return (
                <div key={group} className="history-group">
                  <h2 className="history-group__title">{group}</h2>
                  <motion.div
                    className="movie-grid"
                    variants={{
                      show: { transition: { staggerChildren: 0.05 } },
                    }}
                    initial="hidden"
                    animate="show"
                  >
                    <AnimatePresence mode="popLayout">
                      {groupItems.map((movie) => {
                        const isSelected = selectedIds.has(movie.id);
                        return (
                          <motion.div
                            key={movie.id}
                            layout
                            variants={{
                              hidden: { opacity: 0, scale: 0.9, y: 10 },
                              show: {
                                opacity: 1,
                                scale: 1,
                                y: 0,
                                transition: {
                                  type: "spring",
                                  stiffness: 350,
                                  damping: 25,
                                },
                              },
                            }}
                            initial="hidden"
                            animate="show"
                            exit={{
                              opacity: 0,
                              scale: 0.9,
                              transition: { duration: 0.2 },
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
                            <MovieCard
                              movie={movie}
                              showProgress={true}
                              progressValue={
                                movie.timestamp > 0 && movie.duration > 0
                                  ? Math.min(95, Math.round((movie.timestamp / movie.duration) * 100))
                                  : movie.timestamp > 0
                                    ? Math.min(95, Math.max(10, Math.round(movie.timestamp / 60)))
                                    : 0
                              }
                            />
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
                              <motion.button
                                onClick={(e) => handleRemove(e, movie)}
                                className="card-remove-button"
                                title="Remove from History"
                              >
                                <X size={16} />
                              </motion.button>
                            )}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </motion.div>
                </div>
              );
            })}
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
                {selectedIds.size === filteredHistory.length ? "Deselect All" : "Select All"}
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={handleBatchDelete}
                style={{
                  background: selectedIds.size > 0 ? "rgba(244, 63, 94, 0.95)" : "rgba(255,255,255,0.06)",
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
