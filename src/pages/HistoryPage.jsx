import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Clock, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppAuth } from "../context/AuthContext";
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
    <div className="main-content content-page content-page--library">
      <ConfirmDialogRenderer />
      <div className="content-page__inner">
        <ContentPageHeader
          eyebrow="Your activity"
          title="Watch History"
          description="Pick up where you left off, without hunting for it."
          count={continueWatching.length}
          actions={continueWatching.length > 0 && (
            <button
              type="button"
              className="page-danger-action"
              onClick={clearHistory}
            >
              Clear All
            </button>
          )}
        />

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
                            className="card-remove-button"
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
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
