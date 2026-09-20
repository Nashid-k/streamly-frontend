import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, MonitorPlay } from "lucide-react";

// ─── ServerDropdown — custom styled dropdown for selecting servers ─────────────

function ServerDropdown({ servers, selectedIndex, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
    <div ref={ref} style={{ position: "relative", zIndex: 25 }}>
      <motion.button
        onClick={() => setOpen((o) => !o)}
        whileHover={{ background: "rgba(255,255,255,0.12)" }}
        whileTap={{ scale: 0.97 }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(255,255,255,0.07)",
          border: "none",
          color: "#fff",
          padding: "0.45rem 0.85rem",
          borderRadius: "4px",
          fontSize: "0.83rem",
          fontWeight: 600,
          cursor: "pointer",
          minWidth: "120px",
          justifyContent: "space-between",
          transition: "background 0.2s",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <MonitorPlay size={14} color="#a1a1aa" />
          {servers[selectedIndex]?.name || "Select Server"}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.22, ease: "easeInOut" }}
          style={{ display: "flex", color: "#a1a1aa" }}
        >
          <ChevronDown size={14} />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              right: 0,
              minWidth: "180px",
              maxHeight: "260px",
              overflowY: "auto",
              background: "linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05)), rgba(15,15,20,0.5)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: "4px",
              backdropFilter: "blur(28px) saturate(160%)",
              WebkitBackdropFilter: "blur(28px) saturate(160%)",
              boxShadow: "0 20px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08)",
              scrollbarWidth: "thin",
              scrollbarColor: "rgba(255,255,255,0.15) transparent",
              zIndex: 9999,
            }}
          >
            {servers.map((server, i) => {
              const isSelected = i === selectedIndex;
              return (
                <motion.button
                  key={i}
                  onClick={() => {
                    setOpen(false);
                    onSelect(i);
                  }}
                  whileHover={{ background: "rgba(255,255,255,0.06)" }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "0.6rem 1rem",
                    background: isSelected
                      ? "rgba(229,9,20,0.16)"
                      : "transparent",
                    border: "none",
                    color: isSelected ? "#fff" : "#e4e4e7",
                    fontSize: "0.85rem",
                    fontWeight: isSelected ? 700 : 500,
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.1s",
                  }}
                >
                  {isSelected && (
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: "#E50914",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {!isSelected && <span style={{ width: "6px" }} />}
                  {server.name}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ServerDropdown;