import { memo } from "react";
import { Sun } from "lucide-react";
import { motion } from "framer-motion";
import { HUD_POP } from "../../constants/motion";

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
        background: "rgba(9,9,11,0.82)",
        border: "1px solid rgba(255,255,255,0.1)",
        backdropFilter: "blur(14px) saturate(1.3)",
        WebkitBackdropFilter: "blur(14px) saturate(1.3)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
      }}>
        <Sun size={metrics.pillIcon} color={pct >= 100 ? "#ffd166" : "#fff"} strokeWidth={2.4} />
        <div style={{
          position: "relative",
          width: metrics.barWidth, height: metrics.barHeight,
          background: "rgba(255,255,255,0.2)", borderRadius: 1, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, pct)}%`, background: "#E50914", borderRadius: 1 }} />
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