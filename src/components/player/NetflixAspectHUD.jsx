import { memo } from "react";
import { motion } from "framer-motion";
import { ASPECT_RATIOS, AR_GLYPH, SPRING_SNAPPY } from "../../constants/playerUi";

const NetflixAspectHUD = memo(function NetflixAspectHUD({ aspectRatioIndex, top }) {
  const ar = ASPECT_RATIOS[aspectRatioIndex] || ASPECT_RATIOS[0];
  const glyph = AR_GLYPH[aspectRatioIndex] || AR_GLYPH[0];
  const [gw, gh] = glyph;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -6 }}
      transition={SPRING_SNAPPY}
      style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        paddingTop: top,
        pointerEvents: "none", zIndex: 65,
      }}
    >
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: "clamp(6px, 1.2vw, 10px)",
      }}>
        <motion.div
          animate={{ width: gw, height: gh }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          style={{
            background: "rgba(0,0,0,0.88)", border: "2px solid #E50914",
            borderRadius: 6, boxShadow: "0 0 18px rgba(229,9,20,0.5)",
          }}
        />
        <span style={{
          color: "#fff", fontSize: "clamp(11px, 1.6vw, 14px)", fontWeight: 700,
          background: "rgba(0,0,0,0.88)", borderRadius: 8,
          padding: "clamp(3px, 0.6vw, 5px) clamp(8px, 1.6vw, 14px)",
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          border: "1px solid rgba(255,255,255,0.1)",
          whiteSpace: "nowrap",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}>{ar.name}</span>
      </div>
    </motion.div>
  );
});

export default NetflixAspectHUD;