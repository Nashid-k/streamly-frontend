import { memo } from "react";
import { motion } from "framer-motion";
import { ASPECT_RATIOS, AR_GLYPH } from "../../constants/playerUi";
import { HUD_POP, SPRING } from "../../constants/motion";
import { ACCENT, HUD_GLASS, FONT } from "./chrome/theme";

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
      initial={HUD_POP.initial}
      animate={HUD_POP.animate}
      exit={HUD_POP.exit}
      transition={HUD_POP.transition}
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
          transition={SPRING.SNAPPY}
          style={{
            background: "rgba(0,0,0,0.55)", border: `1.5px solid ${ACCENT}`,
            borderRadius: 8, boxShadow: "0 0 18px rgba(255,255,255,0.35)",
          }}
        />
        <span style={{
          color: "#fff", fontSize: metrics.labelFont, fontWeight: 700,
          borderRadius: 10,
          ...HUD_GLASS,
          padding: `${Math.max(3, Math.round(metrics.labelFont * 0.35))}px ${Math.max(8, Math.round(metrics.labelFont * 0.9))}px`,
          whiteSpace: "nowrap",
          fontFamily: FONT,
        }}>{ar.name}</span>
      </div>
    </motion.div>
  );
});

export default NetflixAspectHUD;