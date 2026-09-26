import { memo } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import { motion } from "framer-motion";
import { SPRING_SNAPPY } from "../../constants/playerUi";

const NetflixVolumeHUD = memo(function NetflixVolumeHUD({ effVolume, isMuted, metrics, volume }) {
  const isZero = isMuted || volume === 0;
  const pct = isZero ? 0 : Math.round(effVolume * 100);
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
        paddingTop: metrics.top,
        pointerEvents: "none", zIndex: 65,
      }}
    >
      <div style={{
        display: "flex", alignItems: "center",
        gap: metrics.pillGap,
        padding: `${metrics.pillPadY}px ${metrics.pillPadX}px`,
        borderRadius: metrics.pillRadius,
        background: "rgba(0,0,0,0.88)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
      }}>
        {isZero ? (
          <VolumeX size={metrics.pillIcon} color="#E50914" strokeWidth={2.4} />
        ) : pct < 40 ? (
          <Volume1 size={metrics.pillIcon} color="#fff" strokeWidth={2.4} />
        ) : (
          <Volume2 size={metrics.pillIcon} color="#fff" strokeWidth={2.4} />
        )}
        <div style={{
          position: "relative",
          width: metrics.barWidth, height: metrics.barHeight,
          background: "rgba(255,255,255,0.2)", borderRadius: 1, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "#E50914", borderRadius: 1 }} />
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

export default NetflixVolumeHUD;