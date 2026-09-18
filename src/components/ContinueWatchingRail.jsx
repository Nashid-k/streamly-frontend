import React, { useState, useRef, memo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock, ChevronRight, Play, X } from "lucide-react";
import slugify from "slugify";
import { useAppAuth } from "../context/auth";
import useRailArrows from "../hooks/useRailArrows";
import RailArrow from "./RailArrow";
import { durationSeconds, progressPct, remainingSeconds } from "../utils/resumeProgress";

const fmtTimeLeft = (seconds) => {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}hr ${m}m left` : `${h}hr left`;
  }
  return `${mins}m left`;
};

const episodeLabel = (item) =>
  item.isSeries && item.savedSeason && item.savedEpisode
    ? `S${item.savedSeason}:E${item.savedEpisode}`
    : null;

const remainingLabel = (item) => {
  const rem = remainingSeconds(item);
  return rem != null ? fmtTimeLeft(rem) : null;
};

const ContinueWatchingRail = memo(function ContinueWatchingRail({ items = [] }) {
  const { removeFromContinueWatching } = useAppAuth();
  const scrollRef = useRef(null);
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(false);
  const { canScrollLeft, canScrollRight, refresh } = useRailArrows(scrollRef);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth > 800 ? el.clientWidth * 0.8 : el.clientWidth * 0.9;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    refresh();
  };

  const handleRemove = (e, item) => {
    e.preventDefault();
    e.stopPropagation();
    removeFromContinueWatching(item.id);
  };

  if (!items || items.length === 0) return null;

  const maskStyle = {
    maskImage:
      canScrollLeft && canScrollRight
        ? "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)"
        : canScrollLeft
        ? "linear-gradient(to right, transparent 0%, black 5%, black 100%, black 100%)"
        : canScrollRight
        ? "linear-gradient(to right, black 0%, black 95%, transparent 100%)"
        : "none",
    WebkitMaskImage:
      canScrollLeft && canScrollRight
        ? "linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)"
        : canScrollLeft
        ? "linear-gradient(to right, transparent 0%, black 5%, black 100%, black 100%)"
        : canScrollRight
        ? "linear-gradient(to right, black 0%, black 95%, transparent 100%)"
        : "none",
    WebkitOverflowScrolling: "touch",
    overscrollBehaviorX: "contain",
  };

  return (
    <div className="space-y-4 relative z-10 group/row mb-8 lg:mb-12">
      {/* ── Section Header ── */}
      <div className="px-6 lg:px-16 flex items-center justify-between group/title">
        <Link
          to="/continue-watching"
          className="group/label flex items-center gap-1 min-w-0 transition-colors duration-300"
        >
          <h2 className="text-xl font-semibold text-white/90 group-hover/label:text-white shadow-black drop-shadow-md transition-all duration-300">
            Continue Watching
          </h2>
          <ChevronRight className="lucide-icon lucide lucide-chevron-right w-5 h-5 text-white/70 shrink-0 opacity-0 -translate-x-1 transition-all duration-300 group-hover/title:opacity-100 group-hover/title:translate-x-0 group-hover/label:text-white" />
        </Link>
        <button
          className={`text-white/50 hover:text-white transition-colors duration-300 p-1 flex items-center gap-1.5 rounded-lg ${
            editMode ? "text-emerald-400 font-medium" : ""
          }`}
          onClick={() => setEditMode((v) => !v)}
          aria-label={editMode ? "Done editing" : "Edit list"}
        >
          {editMode ? (
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold">
              Done
            </span>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-4 h-4"
              width="1em"
              height="1em"
              viewBox="0 0 512 512"
              aria-hidden="true"
            >
              <path
                fill="currentColor"
                d="M362.7 19.3L314.3 67.7 444.3 197.7l48.4-48.4c25-25 25-65.5 0-90.5L453.3 19.3c-25-25-65.5-25-90.5 0zm-71 71L58.6 323.5c-10.4 10.4-18 23.3-22.2 37.4L1 481.2C-1.5 489.7 .8 498.8 7 505s15.3 8.5 23.7 6.1l120.3-35.4c14.1-4.2 27-11.8 37.4-22.2L421.7 220.3 291.7 90.3z"
              />
            </svg>
          )}
        </button>
      </div>

      {/* ── Rail with Left/Right Arrows ── */}
      <div className="relative">
        {canScrollLeft && (
          <RailArrow
            dir="left"
            onClick={() => scroll("left")}
            revealOnHover
            hoverClass="group-hover/row:opacity-100"
            className="z-[60]"
          />
        )}

        {canScrollRight && (
          <RailArrow
            dir="right"
            onClick={() => scroll("right")}
            revealOnHover
            hoverClass="group-hover/row:opacity-100"
            className="z-[60]"
          />
        )}

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto overflow-y-clip pb-6 pt-3 px-6 lg:px-16 scrollbar-hide items-start"
          style={maskStyle}
        >
          {items.map((item, i) => {
            const pct = progressPct(item);
            const label = episodeLabel(item);
            const remaining = remainingLabel(item);
            const art = item.backdropUrl || item.posterUrl || item.poster;
            const watchTo = `/watch/${item.id}/${slugify(item.title || "watch", {
              lower: true,
              strict: true,
            })}`;

            return (
              <div
                key={`${item.id}-${i}`}
                role="group"
                className="relative flex-none w-60 md:w-72 group/card hover:z-30"
              >
                <Link
                  to={editMode ? undefined : watchTo}
                  onClick={(e) => {
                    if (editMode) e.preventDefault();
                  }}
                  className="block w-full aspect-video rounded-2xl overflow-hidden cursor-pointer bg-[#1a1a1a] relative shadow-lg shadow-black/40 transition-transform duration-300 ease-out origin-bottom active:scale-95 group-hover/card:scale-[1.07] group-hover/card:shadow-2xl group-hover/card:shadow-black/70"
                >
                  {art ? (
                    <img
                      className="block w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                      src={art}
                      alt={item.title}
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-900 text-zinc-600">
                      <Play size={28} fill="currentColor" stroke="none" />
                    </div>
                  )}

                  {/* Play icon overlay on hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity duration-200 pointer-events-none">
                    <div className="w-11 h-11 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center text-white shadow-lg border border-white/20">
                      <Play size={18} className="ml-0.5" fill="currentColor" stroke="none" />
                    </div>
                  </div>

                  {/* 3px Progress Bar */}
                  <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white/20">
                    <div
                      className="h-full bg-white theme-progress-bar rounded-r-full transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Remove Button in Edit Mode */}
                  {editMode && (
                    <button
                      className="absolute top-2 right-2 z-20 w-7 h-7 rounded-full bg-red-600/90 hover:bg-red-600 text-white flex items-center justify-center shadow-lg transition-transform active:scale-90 cursor-pointer"
                      onClick={(e) => handleRemove(e, item)}
                      aria-label={`Remove ${item.title} from continue watching`}
                    >
                      <X size={15} strokeWidth={3} />
                    </button>
                  )}

                  {/* Hover preview panel — Cinejoy-style popup that slides up
                      over the thumbnail: gradient scrim, title, episode +
                      remaining + pct, and a solid-white Resume pill. */}
                  {!editMode && (
                    <div className="absolute inset-x-0 bottom-0 z-10 max-h-0 overflow-hidden opacity-0 transition-all duration-300 ease-out group-hover/card:max-h-28 group-hover/card:opacity-100">
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                          background:
                            "linear-gradient(to top, rgba(0,0,0,0.9), rgba(0,0,0,0.45) 55%, transparent)",
                        }}
                      />
                      <div className="relative p-3 md:p-3.5">
                        <p className="truncate text-sm font-semibold text-white drop-shadow-md">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-[0.7rem] text-white/70 flex items-center gap-1.5">
                          {label && (
                            <span className="font-medium text-white/85">{label}</span>
                          )}
                          {remaining && (
                            <>
                              <span className="text-white/35" aria-hidden="true">•</span>
                              <span>{remaining}</span>
                            </>
                          )}
                          {pct > 0 && (
                            <>
                              <span className="text-white/35" aria-hidden="true">•</span>
                              <span className="font-semibold text-white">{Math.round(pct)}%</span>
                            </>
                          )}
                        </p>
                        <button
                          type="button"
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-[0.75rem] font-bold text-black shadow-lg cursor-pointer transition-transform duration-150 active:scale-95 hover:bg-white/90"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(watchTo);
                          }}
                          aria-label={`Resume ${item.title}`}
                        >
                          <Play size={12} className="ml-0.5" fill="currentColor" stroke="none" />
                          Resume
                        </button>
                      </div>
                    </div>
                  )}
                </Link>

                {/* Metadata Below Thumbnail */}
                <Link
                  to={editMode ? undefined : watchTo}
                  onClick={(e) => {
                    if (editMode) e.preventDefault();
                  }}
                  className="block mt-2 px-0.5"
                >
                  <p
                    className="text-sm font-medium text-white/90 truncate group-hover/card:text-white transition-colors"
                    title={item.title}
                  >
                    {item.title}
                  </p>
                  <p className="text-xs text-white/50 mt-0.5 flex items-center gap-1 overflow-hidden">
                    {label && (
                      <>
                        <span className="shrink-0 font-medium text-white/70">{label}</span>
                        {remaining && <span className="text-white/30">•</span>}
                      </>
                    )}
                    {remaining && (
                      <>
                        <Clock
                          className="lucide-icon lucide lucide-clock w-3 h-3 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="shrink-0">{remaining}</span>
                      </>
                    )}
                  </p>
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export default ContinueWatchingRail;

