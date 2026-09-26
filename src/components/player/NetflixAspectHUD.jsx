import { memo } from "react";
import { motion } from "framer-motion";
import { ASPECT_RATIOS, AR_GLYPH, SPRING_SNAPPY } from "../../constants/playerUi";

const NetflixAspectHUD = memo(function NetflixAspectHUD({ aspectRatioIndex, metrics }) {
  const ar = ASPECT_RATIOS[aspectRatioIndex] || ASPECT_RATIOS[0];
  const glyph = AR_GLYPH[aspectRatioIndex] || AR_GLYPH[0];
  // AR_GLYPH is authored against a 720px short edge, so scale it with the
  // measured frame instead of rendering a fixed-size box.
  const [gw, gh] = glyph;
  const width = Math.max(12, Math.round(gw * metrics.glyphScale));
  const height = Math.max(8, Math.round(gh * metrics.glyphScale));
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
        paddingTop: metrics.top,
        pointerEvents: "none", zIndex: 65,
      }}
    >
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: metrics.labelGap,
      }}>
        <motion.div
          animate={{ width, height }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          style={{
            background: "rgba(0,0,0,0.88)", border: "2px solid #E50914",
            borderRadius: 6, boxShadow: "0 0 18px rgba(229,9,20,0.5)",
          }}
        />
        <span style={{
          color: "#fff", fontSize: metrics.labelFont, fontWeight: 700,
          background: "rgba(0,0,0,0.88)", borderRadius: 8,
          padding: `${Math.max(3, Math.round(metrics.labelFont * 0.35))}px ${Math.max(8, Math.round(metrics.labelFont * 0.9))}px`,
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