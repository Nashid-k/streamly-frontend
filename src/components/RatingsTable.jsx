import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Star } from "lucide-react";
import { movieService } from "../api/movieService";
import { getScoreColor } from "../utils/ratings";

const fmtAirDate = (d) => {
  if (!d) return "\u2014";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const RatingsTable = ({ movie, seasons = [], initialSeason, onClose }) => {
  const seasonOptions =
    seasons.length > 0 ? seasons : [{ seasonNumber: 1, name: "Season 1" }];
  const [selected, setSelected] = useState(
    initialSeason || seasonOptions[0]?.seasonNumber || 1,
  );
  const cacheRef = useRef({});
  const [, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const episodes = cacheRef.current[selected];

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lazily fetch episodes for the selected season (cached per season)
  useEffect(() => {
    if (cacheRef.current[selected]) return;
    let alive = true;
    setLoading(true);
    setError(false);
    movieService
      .getSeasonEpisodes(movie.id, selected)
      .then((res) => {
        if (!alive) return;
        cacheRef.current[selected] = res.episodes || [];
        setVersion((v) => v + 1);
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [selected, movie.id]);

  const stats = useMemo(() => {
    const rated = (episodes || []).filter(
      (ep) => Number(ep.voteAverage) > 0,
    );
    const avg = rated.length
      ? rated.reduce((sum, ep) => sum + Number(ep.voteAverage), 0) / rated.length
      : null;
    return { ratedCount: rated.length, totalCount: episodes?.length || 0, avg };
  }, [episodes]);

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
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10 bg-[#0c0c0e]/95 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06]">
              <Star size={16} className="text-[#fbbf24]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3
                id="ratings-title"
                className="truncate text-base font-bold text-white"
              >
                Episode Ratings
              </h3>
              <p className="truncate text-xs text-white/50">
                {movie.title}
              </p>
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

        {/* Season switcher */}
        <div className="flex items-center gap-2 overflow-x-auto px-5 py-3 scrollbar-hide">
          {seasonOptions.map((season) => {
            const sNum = season.seasonNumber;
            const active = sNum === selected;
            return (
              <button
                key={sNum}
                type="button"
                onClick={() => setSelected(sNum)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "border-[#95ff50]/60 bg-[#95ff50]/15 text-white"
                    : "border-white/10 bg-white/[0.04] text-white/55 hover:bg-white/[0.08] hover:text-white/80"
                }`}
                aria-pressed={active}
              >
                Season {sNum}
              </button>
            );
          })}
        </div>

        {/* Season summary */}
        <div className="flex items-center justify-between gap-3 px-5 pb-3">
          <p className="text-xs text-white/45">
            {stats.totalCount > 0
              ? `${stats.totalCount} episode${stats.totalCount > 1 ? "s" : ""}${stats.ratedCount < stats.totalCount ? ` \u00b7 ${stats.totalCount - stats.ratedCount} without ratings` : ""}`
              : "Loading episodes..."}
          </p>
          {stats.avg != null && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
              style={{ background: getScoreColor(stats.avg), color: "#060606" }}
            >
              <Star size={11} fill="currentColor" stroke="none" aria-hidden="true" />
              Season {selected} avg {stats.avg.toFixed(1)}
            </span>
          )}
        </div>

        {/* Table */}
        <div className="max-h-[52vh] overflow-y-auto px-2 pb-4">
          {loading && !episodes && (
            <div className="flex flex-col items-center gap-2 py-10 text-white/45">
              <span className="animate-spin inline-block h-5 w-5 rounded-full border-2 border-white/20 border-t-[#95ff50]" aria-hidden="true" />
              <span className="text-sm">Loading Season {selected}...</span>
            </div>
          )}

          {error && !episodes && (
            <div className="flex flex-col items-center gap-2 py-10 text-white/50">
              <p className="text-sm">Couldn&apos;t load Season {selected} ratings.</p>
              <button
                type="button"
                onClick={() => {
                  setError(false);
                  setLoading(true);
                  movieService
                    .getSeasonEpisodes(movie.id, selected)
                    .then((res) => {
                      cacheRef.current[selected] = res.episodes || [];
                      setVersion((v) => v + 1);
                    })
                    .catch(() => setError(true))
                    .finally(() => setLoading(false));
                }}
                className="rounded-full border border-white/10 bg-white/[0.06] px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/[0.12]"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && !episodes && (
            <div className="py-10 text-center text-sm text-white/40">
              No episode data for Season {selected}.
            </div>
          )}

          {episodes && !loading && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-white/35">
                  <th className="px-3 py-2 font-semibold">#</th>
                  <th className="px-3 py-2 font-semibold">Episode</th>
                  <th className="hidden px-3 py-2 font-semibold sm:table-cell">Aired</th>
                  <th className="px-3 py-2 text-right font-semibold">Score</th>
                  <th className="hidden px-3 py-2 text-right font-semibold sm:table-cell">Votes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {episodes.map((ep, idx) => {
                  const score = Number(ep.voteAverage) || 0;
                  const color = getScoreColor(score);
                  const barPct = score > 0 ? Math.min(100, (score / 10) * 100) : 0;
                  return (
                    <tr key={ep.id || ep.episodeNumber || idx}>
                      <td className="px-3 py-2.5 font-mono text-xs text-white/40">
                        {String(ep.episodeNumber || idx + 1).padStart(2, "0")}
                      </td>
                      <td className="max-w-[46vw] px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <span className="shrink-0 font-mono text-[11px] font-bold text-white/40">
                            S{selected}:E{String(ep.episodeNumber || idx + 1).padStart(2, "0")}
                          </span>
                          <span className="truncate text-sm font-medium text-white/90">
                            {ep.title || `Episode ${ep.episodeNumber}`}
                          </span>
                        </div>
                        <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${barPct}%`,
                              background: color || "rgba(255,255,255,0.2)",
                            }}
                          />
                        </div>
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 text-xs text-white/45 sm:table-cell">
                        {fmtAirDate(ep.airDate)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {score > 0 ? (
                          <span
                            className="inline-flex min-w-[44px] items-center justify-center rounded-full px-2 py-1 text-xs font-bold"
                            style={{ background: color, color: "#060606" }}
                          >
                            {score.toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-xs text-white/30">{"\u2014"}</span>
                        )}
                      </td>
                      <td className="hidden whitespace-nowrap px-3 py-2.5 text-right text-xs text-white/45 sm:table-cell">
                        {ep.voteCount > 0 ? ep.voteCount.toLocaleString() : "\u2014"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default RatingsTable;