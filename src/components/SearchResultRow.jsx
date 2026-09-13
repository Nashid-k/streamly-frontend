import { motion } from "framer-motion";
import { CdnImageAdapter } from "../api/cdnImageAdapter";
import { getRatingColor } from "../utils/ratings";

export default function SearchResultRow({
  r,
  i,
  selectedResultIndex,
  setSelectedResultIndex,
  onClick,
  roleOption = false,
}) {
  return (
    <motion.div
      key={`${r.id}-${i}`}
      {...(roleOption
        ? { role: "option", "aria-selected": selectedResultIndex === i }
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
      transition={{ delay: i * 0.05, duration: 0.2 }}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        padding: "0.75rem 1rem",
        cursor: "pointer",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        transition: "background 0.2s",
        background:
          selectedResultIndex === i ? "rgba(255,255,255,0.1)" : "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255,255,255,0.05)";
        setSelectedResultIndex(i);
      }}
      onMouseLeave={(e) => {
        if (selectedResultIndex !== i)
          e.currentTarget.style.background = "transparent";
      }}
    >
      <img
        loading="lazy"
        decoding="async"
        src={CdnImageAdapter.getSmallUrl(r.posterUrl || r.backdropUrl)}
        alt={r.title}
        style={{
          width: "50px",
          height: "75px",
          objectFit: "cover",
          borderRadius: "4px",
          background: "#18181b",
        }}
      />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "4px",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            fontSize: "0.95rem",
            color: "#fff",
          }}
        >
          {r.title}
        </div>
        <div
          style={{
            fontSize: "0.8rem",
            color: "#a1a1aa",
            display: "flex",
            gap: "8px",
            alignItems: "center",
          }}
        >
          <span>{r.year || r.releaseYear}</span>
          {r.isSeries !== undefined && (
            <>
              <span>•</span>
              <span>{r.isSeries ? "TV Show" : "Movie"}</span>
            </>
          )}
          {r.imdbRating > 0 && (
            <span
              style={{
                color: getRatingColor(r.imdbRating),
                display: "flex",
                alignItems: "center",
                gap: "2px",
                fontSize: "0.75rem",
                fontWeight: 600,
              }}
            >
              ⭐ {r.imdbRating}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
