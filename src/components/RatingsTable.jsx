import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Star, RefreshCw } from "lucide-react";
import { movieService } from "../api/movieService";
import { getScoreColor } from "../utils/ratings";

const RATING_LEGEND = [
  { label: "8.5+", color: "#22c55e" },
  { label: "8+", color: "#4ade80" },
  { label: "7+", color: "#86efac" },
  { label: "6.5+", color: "#fbbf24" },
  { label: "6+", color: "#fb923c" },
  { label: "<6", color: "#f87171" },
];

const NO_RATING_COLOR = "rgba(255, 255, 255, 0.06)";

// SeriesGraph-style heatmap: seasons run down the vertical axis (S1, S2, …)
// and episodes run across the horizontal axis (E1, E2, …); each cell is
// colored by that episode's rating. No votes, titles or rows — pure grid.
const RatingsTable = ({ movie, seasons = [], onClose }) => {
  const seasonNumbers = useMemo(() => {
    const src =
      seasons.length > 0 ? seasons : [{ seasonNumber: 1, name: "Season 1" }];
    return src.map((s) => s.seasonNumber);
  }, [seasons]);
  const seasonOptions = useMemo(
    () => seasonNumbers.map((n) => ({ seasonNumber: n, name: `Season ${n}` })),
    [seasonNumbers],
  );

  const [loaded, setLoaded] = useState({});
  const [failed, setFailed] = useState({});
  const loadedRef = useRef({});

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Fetch every season once (cached) so the full grid renders progressively.
  useEffect(() => {
    if (seasonOptions.length === 0) return;
    let alive = true;
    seasonOptions.forEach((season) => {
      const num = season.seasonNumber;
      if (loadedRef.current[num]) return;
      movieService
        .getSeasonEpisodes(movie.id, num)
        .then((res) => {
          if (!alive) return;
          loadedRef.current[num] = res.episodes || [];
          setLoaded((prev) => ({ ...prev, [num]: loadedRef.current[num] }));
        })
        .catch(() => {
          if (alive) setFailed((prev) => ({ ...prev, [num]: true }));
        });
    });
    return () => {
      alive = false;
    };
  }, [movie.id, seasonOptions]);

  const retrySeason = (num) => {
    setFailed((prev) => ({ ...prev, [num]: false }));
    movieService
      .getSeasonEpisodes(movie.id, num)
      .then((res) => {
        loadedRef.current[num] = res.episodes || [];
        setLoaded((prev) => ({ ...prev, [num]: loadedRef.current[num] }));
      })
      .catch(() => setFailed((prev) => ({ ...prev, [num]: true })));
  };

  const rows = useMemo(() => {
    const list = seasonOptions.map((season) => ({
      seasonNumber: season.seasonNumber,
      episodes: loaded[season.seasonNumber] || [],
      failed: !!failed[season.seasonNumber],
    }));
    const maxEp = list.reduce((m, row) => Math.max(m, row.episodes.length), 0);
    return { list, maxEp };
  }, [loaded, failed, seasonOptions]);

  const gridCols = Math.max(rows.maxEp, 1);
  const cellSize = "clamp(26px, 3.5vw, 40px)";

  return (
    <motion.div
      key="ratings"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/80 backdrop-blur-md px-4 sm:px-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ratings-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 320, damping: 28 }}
        className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0e]/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
              <Star size={16} className="text-[#fbbf24]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 id="ratings-title" className="truncate text-base font-bold text-white">
                Episode Ratings
              </h3>
              <p className="truncate text-xs text-white/50">{movie.title}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close ratings"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/70 transition-colors hover:bg-white/[0.12] hover:text-white"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/[0.06] px-5 py-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Legend</span>
          {RATING_LEGEND.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5 text-[10px] text-white/60">
              <span className="inline-block h-3 w-3 rounded-[4px]" style={{ background: l.color }} aria-hidden="true" />
              {l.label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-[10px] text-white/60">
            <span
              className="inline-block h-3 w-3 rounded-[4px] border border-white/10"
              style={{ background: NO_RATING_COLOR }}
              aria-hidden="true"
            />
            No rating
          </span>
        </div>

        {/* Heatmap grid */}
        <div className="max-h-[58vh] overflow-y-auto">
          <div className="overflow-x-auto scrollbar-hide px-5 pb-5 pt-3">
            {rows.maxEp === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-white/45">
                <span
                  className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[#95ff50]"
                  aria-hidden="true"
                />
                <span className="text-sm">Loading ratings…</span>
              </div>
            ) : (
              <div
                className="inline-grid"
                role="img"
                aria-label={`Episode rating heatmap for ${movie.title}`}
                style={{
                  gridTemplateColumns: `52px repeat(${gridCols}, ${cellSize})`,
                  gap: 4,
                }}
              >
                <div className="flex items-end justify-end pb-1 text-[10px] font-bold uppercase text-white/30">
                  S\E
                </div>
                {Array.from({ length: gridCols }).map((_, i) => (
                  <div
                    key={`h-${i}`}
                    className="flex items-center justify-center pb-1 text-[10px] font-semibold text-white/35"
                  >
                    {i + 1}
                  </div>
                ))}

                {rows.list.map((row) => (
                  <React.Fragment key={row.seasonNumber}>
                    <div
                      className="sticky left-0 z-10 flex items-center justify-end pr-2 text-[11px] font-bold text-white/70"
                      style={{ background: "rgba(12,12,14,0.95)" }}
                    >
                      S{row.seasonNumber}
                    </div>

                    {row.failed ? (
                      <div
                        className="flex items-center justify-start gap-2 text-xs text-white/50"
                        style={{ gridColumn: `span ${gridCols}` }}
                      >
                        <span>Couldn&apos;t load Season {row.seasonNumber}.</span>
                        <button
                          type="button"
                          onClick={() => retrySeason(row.seasonNumber)}
                          className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-white/[0.12]"
                        >
                          <RefreshCw size={11} aria-hidden="true" /> Retry
                        </button>
                      </div>
                    ) : row.episodes.length > 0 ? (
                      Array.from({ length: gridCols }).map((_, i) => {
                        const ep = row.episodes[i];
                        const score = ep ? Number(ep.voteAverage) || 0 : 0;
                        const color = ep && score > 0 ? getScoreColor(score) : null;
                        const epNum = ep?.episodeNumber ?? i + 1;
                        return (
                          <div
                            key={`${row.seasonNumber}-${i}`}
                            title={
                              ep
                                ? `S${row.seasonNumber} E${epNum}${ep.title ? ` · ${ep.title}` : ""}${score > 0 ? ` · ${score.toFixed(1)}` : ""}`
                                : undefined
                            }
                            className="rounded-[5px] border transition-transform duration-150 hover:scale-110 hover:ring-1 hover:ring-white/40"
                            style={{
                              height: cellSize,
                              background: color || NO_RATING_COLOR,
                              borderColor: color ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
                            }}
                          />
                        );
                      })
                    ) : (
                      Array.from({ length: gridCols }).map((_, i) => (
                        <div
                          key={`sk-${row.seasonNumber}-${i}`}
                          className="animate-pulse rounded-[5px] bg-white/[0.04]"
                          style={{ height: cellSize }}
                        />
                      ))
                    )}
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default RatingsTable;