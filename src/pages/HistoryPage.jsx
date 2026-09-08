import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppAuth } from "../context/AuthContext";
import { useToast } from "../components/Toast.jsx";
import { useConfirmDialog } from "../components/ConfirmDialog.jsx";
import MovieCard from "../components/MovieCard.jsx";


export default function HistoryPage() {
  const navigate = useNavigate();
  const {
    continueWatching,
    removeFromContinueWatching,
    clearContinueWatching,
  } = useAppAuth();
  const { toast } = useToast();
  const { confirmDialog, ConfirmDialogRenderer } = useConfirmDialog();

  const [visibleCount, setVisibleCount] = useState(20);

  // Reset visible count when data changes (#15 fix)
  useEffect(() => {
    setVisibleCount(20);
  }, [continueWatching.length]);

  useEffect(() => {
    let inThrottle;
    const handleScroll = () => {
      if (!inThrottle) {
        if (
          window.innerHeight + window.scrollY >=
          document.body.offsetHeight - 800
        ) {
          setVisibleCount((prev) =>
            Math.min(prev + 20, continueWatching.length),
          );
        }
        inThrottle = true;
        setTimeout(() => (inThrottle = false), 200);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [continueWatching.length]);

  const visibleResults = continueWatching.slice(0, visibleCount);

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

  return (
    <div
      className="main-content"
      style={{ padding: "5.5rem 3rem 4rem", minHeight: "80vh" }}
    >
      <ConfirmDialogRenderer />
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
              Watch History
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
                {continueWatching.length}
              </span>
            </h1>
          </div>
          {continueWatching.length > 0 && (
            <motion.button
              onClick={clearHistory}
              style={{
                background: "transparent",
                color: "#ef4444",
                border: "1px solid rgba(239,68,68,0.3)",
                padding: "6px 16px",
                borderRadius: "100px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "rgba(239,68,68,0.1)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              Clear All
            </motion.button>
          )}
        </div>

        {continueWatching.length === 0 ? (
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
              animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
              transition={{ duration: 1.5, delay: 0.3, ease: "easeInOut" }}
            >
              <Clock
                size={56}
                style={{ opacity: 0.2, marginBottom: "1.5rem" }}
              />
            </motion.div>
            <h2 style={{ color: "#fff", marginBottom: "0.5rem" }}>
              No watch history yet
            </h2>
            <p
              style={{
                marginBottom: "2rem",
                textAlign: "center",
                maxWidth: "300px",
              }}
            >
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
        ) : (
          <div
            style={{ display: "flex", flexDirection: "column", gap: "3rem" }}
          >
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
                <div key={group}>
                  <h2
                    style={{
                      fontSize: "1.25rem",
                      color: "#e4e4e7",
                      borderBottom: "1px solid rgba(255,255,255,0.06)",
                      paddingBottom: "0.5rem",
                      marginBottom: "1.5rem",
                      fontWeight: 600,
                    }}
                  >
                    {group}
                  </h2>
                  <motion.div
                    className="movie-grid"
                    variants={{
                      show: { transition: { staggerChildren: 0.05 } },
                    }}
                    initial="hidden"
                    animate="show"
                  >
                    <AnimatePresence mode="popLayout">
                      {groupItems.map((movie) => (
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
                          style={{ position: "relative" }}
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
                          <motion.button
                            onClick={(e) => handleRemove(e, movie)}
                            className="remove-btn"
                            style={{
                              position: "absolute",
                              top: "10px",
                              right: "10px",
                              background: "rgba(0,0,0,0.7)",
                              border: "1px solid rgba(255,255,255,0.2)",
                              color: "white",
                              width: "32px",
                              height: "32px",
                              borderRadius: "50%",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              zIndex: 10,
                              backdropFilter: "blur(4px)",
                            }}
                            title="Remove from History"
                          >
                            <X size={16} />
                          </motion.button>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </motion.div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
