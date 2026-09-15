import { memo } from "react";
import { motion } from "framer-motion";
import { Play, Star } from "lucide-react";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { getRatingColor } from "../utils/ratings";

/* SearchResultRow — Cinejoy-style row result: landscape thumbnail with a
   bottom gradient scrim + white play orb on hover, then title + meta.
   Keeps keyboard-option support for command-palette style lists. */
const SearchResultRow = memo(function SearchResultRow({
  r,
  i,
  selectedResultIndex,
  setSelectedResultIndex,
  onClick,
  roleOption = false,
}) {
  const selected = selectedResultIndex === i;
  const thumb = r.backdropUrl || r.posterUrl
    ? CdnImageAdapter.getUrl(r.backdropUrl || r.posterUrl, "w500")
    : null;

  return (
    <motion.div
      key={`${r.id}-${i}`}
      {...(roleOption
        ? { role: "option", "aria-selected": selected }
        : {
            role: "button",
            tabIndex: 0,
            onKeyDown: (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          })}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(i * 0.04, 0.4), duration: 0.2 }}
      onClick={onClick}
      className={`group flex items-center gap-3 md:gap-4 rounded-2xl border px-2 md:px-3 py-2 text-left transition-colors duration-200 cursor-pointer ${
        selected
          ? "bg-white/[0.08] border-white/[0.08]"
          : "bg-transparent border-transparent hover:bg-white/[0.04] hover:border-white/[0.05]"
      }`}
      onMouseEnter={() => setSelectedResultIndex(i)}
      onMouseLeave={() => {
        if (selected) setSelectedResultIndex(-1);
      }}
    >
      {/* Landscape thumbnail */}
      <div className="relative w-32 md:w-44 flex-none aspect-video rounded-xl overflow-hidden bg-[#18181b] border border-white/[0.06] group-hover:border-white/[0.14] shadow-lg shadow-black/40 transition-all duration-300">
        {thumb ? (
          <img
            loading="lazy"
            decoding="async"
            src={thumb}
            alt={r.title}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 text-zinc-600">
            <Play size={18} fill="currentColor" stroke="none" />
          </div>
        )}

        {/* Bottom gradient scrim (Cinejoy poster density) */}
        <div
          className="absolute inset-x-0 bottom-0 h-1/2 pointer-events-none"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0.4) 55%, transparent)",
          }}
        />

        {/* White play orb on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-black shadow-lg">
            <Play size={15} className="ml-0.5" fill="currentColor" stroke="none" />
          </div>
        </div>
      </div>

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[0.95rem] font-semibold text-white">
          {r.title}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-white/50">
          <span>{r.year || r.releaseYear}</span>
          {r.isSeries !== undefined && (
            <>
              <span aria-hidden="true">•</span>
              <span>{r.isSeries ? "TV Show" : "Movie"}</span>
            </>
          )}
          {r.imdbRating > 0 && (
            <span
              className="flex items-center gap-1 font-semibold"
              style={{ color: getRatingColor(r.imdbRating) }}
            >
              <Star size={11} fill="currentColor" stroke="none" aria-hidden="true" />
              {Number(r.imdbRating).toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
});

export default SearchResultRow;