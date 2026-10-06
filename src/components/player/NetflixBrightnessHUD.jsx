import { memo } from "react";
import { motion } from "framer-motion";
import { HUD_POP } from "../../constants/motion";
import { IconSun } from "./chrome/icons";
import { ACCENT, HUD_GLASS } from "./chrome/theme";

const NetflixBrightnessHUD = memo(function NetflixBrightnessHUD({ brightness, metrics }) {
  const pct = Math.round(brightness * 100);
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
        display: "flex", alignItems: "center",
        gap: metrics.pillGap,
        padding: `${metrics.pillPadY}px ${metrics.pillPadX}px`,
        borderRadius: metrics.pillRadius,
        ...HUD_GLASS,
      }}>
        <IconSun size={metrics.pillIcon} color={pct >= 100 ? "#ffd166" : "#fff"} />
        <div style={{
          position: "relative",
          width: metrics.barWidth, height: metrics.barHeight,
          background: "rgba(255,255,255,0.22)", borderRadius: 999, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, pct)}%`, background: ACCENT, borderRadius: 999 }} />
        </div>
        <span style={{
          color: "#fff", fontSize: metrics.valueFont, fontWeight: 700,
          minWidth: metrics.valueMinWidth, textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}>{pct}%</span>
      </div>
    </motion.div>
  );
});

export default NetflixBrightnessHUD;