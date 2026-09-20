import { memo } from "react";
import { Sun } from "lucide-react";
import { motion } from "framer-motion";
import { SPRING_SNAPPY } from "../../constants/playerUi";

const NetflixBrightnessHUD = memo(function NetflixBrightnessHUD({ brightness, top }) {
  const pct = Math.round(brightness * 100);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
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
        display: "flex", alignItems: "center",
        gap: "clamp(8px, 1.4vw, 14px)",
        padding: "clamp(8px, 1.6vw, 14px) clamp(12px, 2.4vw, 22px)",
        borderRadius: 8,
        background: "rgba(0,0,0,0.88)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
      }}>
        <Sun size={20} color={pct >= 100 ? "#ffd166" : "#fff"} strokeWidth={2.4} />
        <div style={{
          position: "relative",
          width: "clamp(72px, 11vw, 120px)", height: "clamp(3px, 0.6vw, 5px)",
          background: "rgba(255,255,255,0.2)", borderRadius: 1, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, pct)}%`, background: "#E50914", borderRadius: 1 }} />
        </div>
        <span style={{
          color: "#fff", fontSize: "clamp(11px, 1.7vw, 15px)", fontWeight: 700,
          minWidth: "clamp(30px, 6vw, 44px)", textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}>{pct}%</span>
      </div>
    </motion.div>
  );
});

export default NetflixBrightnessHUD;