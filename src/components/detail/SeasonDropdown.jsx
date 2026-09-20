import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

// ─── SeasonDropdown — custom styled dropdown (no native <select>) ─────────────

function SeasonDropdown({ seasons, selectedSeason, airingSeasonNumber, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const seasonOptions = seasons.length > 0
    ? seasons
    : [{ seasonNumber: selectedSeason, name: `Season ${selectedSeason}` }];

  // Close on outside click / tap
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("touchstart", handler, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("touchstart", handler);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", zIndex: 20 }}>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ borderColor: "rgba(255,255,255,0.35)" }}
        whileTap={{ scale: 0.97 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "rgba(255,255,255,0.1)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#fff",
          padding: "0 16px",
          height: "40px",
          borderRadius: "9999px",
          fontSize: "0.875rem",
          fontWeight: 600,
          cursor: "pointer",
          backdropFilter: "blur(12px)",
          transition: "background 0.2s, border-color 0.2s",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              background: "var(--accent-gradient)",
              flexShrink: 0,
            }}
          />
          Season {selectedSeason}
          {airingSeasonNumber === selectedSeason && (
            <span
              aria-label="Currently airing"
              title="Currently airing"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 10px",
                borderRadius: "7px 7px 0 0",
                background: "#3c8217",
                color: "#fff",
                fontSize: "11px",
                fontWeight: 500,
                lineHeight: 1.45,
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              Airing
            </span>
          )}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          style={{ display: "flex", color: "#a1a1aa" }}
        >
          <ChevronDown size={16} />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: "160px",
              maxHeight: "260px",
              overflowY: "auto",
              background: "linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05)), rgba(15,15,20,0.5)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "14px",
              backdropFilter: "blur(28px) saturate(160%)",
              boxShadow: "0 20px 48px rgba(0,0,0,0.75)",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.15) transparent",
            }}
          >
            {seasonOptions.map((season, index) => {
                const seasonNumber = season.seasonNumber;
                const isSelected = seasonNumber === selectedSeason;
                const isAiringSeason = seasonNumber === airingSeasonNumber;
                return (
                  <motion.button
                    key={seasonNumber}
                    onClick={() => {
                      setOpen(false);
                      onSelect(seasonNumber);
                    }}
                    whileHover={{ background: "rgba(255,255,255,0.08)" }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      padding: "0.65rem 1rem",
                      background: isSelected
                        ? "rgba(var(--accent-primary-rgb), 0.1)"
                        : "transparent",
                      border: "none",
                      color: isSelected ? "var(--accent-primary, #95ff50)" : "#e4e4e7",
                      fontSize: "0.9rem",
                      fontWeight: isSelected ? 700 : 500,
                      cursor: "pointer",
                      textAlign: "left",
                      borderRadius:
                        index === 0
                          ? "14px 14px 0 0"
                          : index === seasonOptions.length - 1
                            ? "0 0 14px 14px"
                            : "0",
                      transition: "background 0.1s",
                    }}
                  >
                    {isSelected && (
                      <span
                        style={{
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          background:
                            "var(--accent-gradient)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    {!isSelected && <span style={{ width: "6px" }} />}
                    <span style={{ flex: 1 }}>Season {seasonNumber}</span>
{isAiringSeason && (
                      <span
                        aria-label="Currently airing"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "2px 10px",
                          borderRadius: "7px 7px 0 0",
                          background: "#3c8217",
                          color: "#fff",
                          fontSize: "11px",
                          fontWeight: 500,
                          lineHeight: 1.45,
                          flexShrink: 0,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Airing
                      </span>
                    )}
                  </motion.button>
                );
              })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SeasonDropdown;