import React, { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Plus, Check, Info, Pencil } from "lucide-react";
import slugify from "slugify";
import { useAppAuth } from "../context/AuthContext";
import RailArrow from "./RailArrow";

/* Continue Watching rail — landscape 16:9 cards with a 3px progress bar and
   a Netflix-style hover mini-player. The popup is rendered in the rail's own
   positioned layer (not inside the horizontal scroll container) so it is never
   clipped by overflow-x. */

const fmtMins = (seconds) => {
  if (!seconds || seconds <= 0) return "0m";
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  return `${mins}m`;
};

const episodeLabel = (item) =>
  item.isSeries && item.savedSeason && item.savedEpisode
    ? `S${item.savedSeason}:E${item.savedEpisode}`
    : null;

const progressPct = (item) => {
  if (item.timestamp > 0 && item.duration > 0) {
    return Math.min(100, Math.round((item.timestamp / item.duration) * 100));
  }
  if (item.timestamp > 0) {
    return Math.min(95, Math.max(10, Math.round(item.timestamp / 60)));
  }
  return 0;
};

const remainingLabel = (item) => {
  if (item.duration > 0 && item.timestamp > 0) {
    return `${fmtMins(Math.max(0, item.duration - item.timestamp))} left`;
  }
  return null;
};

export default function ContinueWatchingRail({ items = [] }) {
  const { isInList, toggleMyList } = useAppAuth();
  const scrollRef = useRef(null);
  const layerRef = useRef(null);
  const [hover, setHover] = useState(null); // { id, x, top }

  const close = useCallback(() => setHover(null), []);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth > 800 ? el.clientWidth * 0.8 : el.clientWidth * 0.9;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  const onEnter = (e, item) => {
    const card = e.currentTarget;
    const layer = layerRef.current;
    if (!layer) return;
    const cardRect = card.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    const cardWidth = cardRect.width;
    const popupWidth = Math.min(270, layerRect.width - 16);
    const x = cardRect.left - layerRect.left + cardWidth / 2 - popupWidth / 2;
    const top = cardRect.top - layerRect.top - 148;
    setHover({ id: item.id, x, top, item });
  };

  if (!items || items.length === 0) return null;

  return (
    <div
      className="cw-rail"
      style={{ position: "relative" }}
      onMouseLeave={close}
    >
      {/* Section header — 20px title + pencil edit → history */}
      <div className="section-header-row">
        <h3 className="section-title section-title--cw">Continue Watching</h3>
        <Link to="/history" className="section-header-edit" aria-label="Edit watch history">
          <Pencil size={14} />
          <span>Edit</span>
        </Link>
      </div>

      <RailArrow dir="left" onClick={() => scroll("left")} />
      <RailArrow dir="right" onClick={() => scroll("right")} />

      <div
        ref={scrollRef}
        className="movie-rail cw-rail-scroll"
        onScroll={close}
        style={{
          display: "flex",
          gap: "1rem",
          WebkitOverflowScrolling: "touch",
          overscrollBehaviorX: "contain",
          overflowX: "auto",
          scrollbarWidth: "none",
          padding: "0.45rem 0 0.2rem",
        }}
      >
        {items.map((item, i) => {
          const pct = progressPct(item);
          const label = episodeLabel(item);
          const remaining = remainingLabel(item);
          const subtitle = label && remaining ? `${label} · ${remaining}` : remaining || label;
          const art = item.backdropUrl || item.posterUrl || item.poster;
          const watchTo = `/watch/${item.id}/${slugify(item.title, { lower: true, strict: true })}`;

          return (
            <motion.div
              key={`${item.id}-${i}`}
              className="cw-card"
              style={{ position: "relative", flexShrink: 0 }}
              onMouseEnter={(e) => onEnter(e, item)}
            >
              <Link to={watchTo} className="cw-card-link">
                <div className="cw-thumb">
                  {art ? (
                    <img src={art} alt={item.title} loading="lazy" />
                  ) : (
                    <div className="cw-thumb-fallback">
                      <Play size={22} fill="currentColor" stroke="none" />
                    </div>
                  )}
                  <div className="cw-progress">
                    <span style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <div className="cw-info">
                  <div className="cw-title">{item.title}</div>
                  {subtitle && <div className="cw-subtitle">{subtitle}</div>}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Hover mini-player — rendered in the rail's own layer, never clipped */}
      <div ref={layerRef} className="cw-popup-layer" aria-hidden="true">
        <AnimatePresence>
          {hover && hover.item && (
            <motion.div
              key={hover.item.id}
              className="cw-popup"
              style={{ left: hover.x, top: hover.top, width: "270px" }}
              initial={{ opacity: 0, y: 14, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="cw-popup-thumb">
                {hover.item.backdropUrl || hover.item.posterUrl || hover.item.poster ? (
                  <img
                    src={hover.item.backdropUrl || hover.item.posterUrl || hover.item.poster}
                    alt=""
                  />
                ) : (
                  <div className="cw-thumb-fallback">
                    <Play size={22} fill="currentColor" stroke="none" />
                  </div>
                )}
                {episodeLabel(hover.item) && (
                  <div className="cw-popup-label">{episodeLabel(hover.item)}</div>
                )}
              </div>
              <div className="cw-popup-body">
                <div className="cw-popup-controls">
                  <Link
                    to={`/watch/${hover.item.id}/${slugify(hover.item.title, { lower: true, strict: true })}`}
                    className="cw-popup-play"
                    aria-label="Play"
                  >
                    <Play size={18} fill="currentColor" stroke="none" />
                  </Link>
                  <button
                    className="cw-popup-ring"
                    onClick={() => toggleMyList(hover.item)}
                    aria-label={isInList(hover.item.id) ? "Remove from My List" : "Add to My List"}
                  >
                    {isInList(hover.item.id) ? <Check size={16} /> : <Plus size={16} />}
                  </button>
                  <Link
                    to={`/watch/${hover.item.id}/${slugify(hover.item.title, { lower: true, strict: true })}`}
                    className="cw-popup-ring"
                    aria-label="More info"
                  >
                    <Info size={16} />
                  </Link>
                </div>
                <div className="cw-popup-episode">
                  {episodeLabel(hover.item) && <strong>{episodeLabel(hover.item)}</strong>}
                  <span>{hover.item.title}</span>
                </div>
                <div className="cw-popup-meta">
                  <div className="cw-popup-progress">
                    <span style={{ width: `${progressPct(hover.item)}%` }} />
                  </div>
                  {hover.item.duration > 0 && (
                    <span className="cw-popup-time">
                      {fmtMins(hover.item.timestamp)} of {fmtMins(hover.item.duration)}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}