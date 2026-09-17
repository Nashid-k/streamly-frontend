import { motion } from "framer-motion";
import { Sun } from "lucide-react";
import ArcRing from "./ArcRing";
import { SPRING_SNAPPY } from "../tokens";

function PresetBrightnessHUD({ skin, brightness, hudScale, hudTop }) {
  const pct = Math.round(brightness * 100);
  const skinId = skin?.id || "classic";

  return (
    <motion.div
      key="brightness-hud"
      initial={{ opacity: 0, y: -18, scale: 0.9, x: "-50%" }}
      animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
      exit={{ opacity: 0, y: -8, scale: 0.95, x: "-50%" }}
      transition={SPRING_SNAPPY}
      style={{
        position: "absolute", left: "50%",
        top: hudTop,
        zIndex: 65, pointerEvents: "none",
      }}
    >
      {skinId === "material" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(12 * hudScale),
            background: "var(--skin-hud-bg, rgba(43, 38, 48, 0.94))",
            backdropFilter: "blur(var(--skin-hud-blur, 20px))",
            WebkitBackdropFilter: "blur(var(--skin-hud-blur, 20px))",
            border: "var(--skin-hud-border, 1px solid rgba(255,255,255,0.12))",
            borderRadius: "var(--skin-hud-radius, 20px)",
            padding: `${Math.round(8 * hudScale)}px ${Math.round(16 * hudScale)}px`,
            boxShadow: "var(--skin-hud-shadow, 0 8px 32px rgba(0,0,0,0.5))",
            fontFamily: "var(--skin-hud-font, 'Roboto', sans-serif)",
          }}
        >
          <div style={{ background: "rgba(208,188,255,0.22)", color: "var(--skin-accent, #d0bcff)", borderRadius: 12, padding: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sun size={17 * hudScale} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minWidth: 100 * hudScale }}>
              <span style={{ fontSize: 10 * hudScale, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>Brightness</span>
              <span style={{ fontSize: 12 * hudScale, fontWeight: 700, color: "var(--skin-accent, #d0bcff)" }}>{pct}%</span>
            </div>
            <div style={{ width: 100 * hudScale, height: 6, background: "rgba(255,255,255,0.14)", borderRadius: 3, overflow: "hidden" }}>
              <motion.div
                animate={{ width: `${Math.min(100, Math.round((brightness / 1.5) * 100))}%` }}
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
                style={{ height: "100%", background: "var(--skin-accent, #d0bcff)", borderRadius: 3 }}
              />
            </div>
          </div>
        </motion.div>
      ) : skinId === "theater" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(14 * hudScale),
            background: "linear-gradient(180deg, rgba(32,18,6,0.96), rgba(16,8,2,0.96))",
            backdropFilter: "blur(20px)",
            border: "1.5px solid rgba(255,200,100,0.35)",
            borderRadius: "var(--skin-hud-radius, 22px)",
            padding: `${Math.round(8 * hudScale)}px ${Math.round(18 * hudScale)}px`,
            boxShadow: "0 0 28px rgba(255,178,64,0.35)",
            fontFamily: "var(--skin-hud-font, Georgia, serif)",
          }}
        >
          <span style={{ color: "#ffd166", fontSize: 14 * hudScale }}>★</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Sun size={17 * hudScale} color="#ffd166" />
            <span style={{ fontSize: 13 * hudScale, fontWeight: 700, color: "#ffd166", letterSpacing: "0.04em" }}>
              {pct}%
            </span>
          </div>
          <div style={{ width: 80 * hudScale, height: 5, background: "rgba(255,209,102,0.18)", borderRadius: 3, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${Math.min(100, Math.round((brightness / 1.5) * 100))}%` }}
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              style={{ height: "100%", background: "linear-gradient(90deg, #ffd166, #ff9e2c)", borderRadius: 3 }}
            />
          </div>
          <span style={{ fontSize: 9 * hudScale, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,209,102,0.7)" }}>PROJECTION LUMA</span>
        </motion.div>
      ) : skinId === "studio" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(12 * hudScale),
            background: "rgba(10,10,12,0.98)",
            border: "1px solid rgba(255,59,78,0.45)",
            borderRadius: 4,
            padding: `${Math.round(6 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            boxShadow: "0 4px 20px rgba(0,0,0,0.85)",
            fontFamily: "var(--skin-hud-font, 'SF Mono', monospace)",
          }}
        >
          <span style={{ color: "#ff3b4e", fontSize: 10 * hudScale, fontWeight: 800 }}>LUMA</span>
          <div style={{ width: 80 * hudScale, height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${Math.min(100, Math.round((brightness / 1.5) * 100))}%` }}
              style={{ height: "100%", background: "#00e5ff", borderRadius: 2 }}
            />
          </div>
          <span style={{ fontSize: 11 * hudScale, fontWeight: 700, color: "#00e5ff" }}>{pct}% IRE</span>
          <span style={{ fontSize: 9 * hudScale, color: "rgba(255,255,255,0.4)" }}>[CALIBRATED]</span>
        </motion.div>
      ) : skinId === "minimal" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(10 * hudScale),
            background: "rgba(12,12,16,0.75)",
            backdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 999,
            padding: `${Math.round(6 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            fontFamily: "var(--skin-hud-font, sans-serif)",
          }}
        >
          <Sun size={14 * hudScale} color="#fff" />
          <div style={{ width: 70 * hudScale, height: 2.5, background: "rgba(255,255,255,0.15)", borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${Math.min(100, Math.round((brightness / 1.5) * 100))}%` }}
              style={{ height: "100%", background: "#fff", borderRadius: 2 }}
            />
          </div>
          <span style={{ fontSize: 11 * hudScale, fontWeight: 600, color: "#fff" }}>{pct}%</span>
        </motion.div>
      ) : (
        /* Apple / Classic */
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(12 * hudScale),
            background: "var(--skin-hud-bg, rgba(30, 30, 36, 0.88))",
            backdropFilter: "blur(var(--skin-hud-blur, 36px))",
            border: "var(--skin-hud-border, 1px solid rgba(255,255,255,0.18))",
            borderRadius: "var(--skin-hud-radius, 24px)",
            padding: `${Math.round(8 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            boxShadow: "var(--skin-hud-shadow, 0 14px 40px rgba(0,0,0,0.45))",
          }}
        >
          <ArcRing
            progress={Math.min(1, brightness / 1.5)}
            size={Math.round(40 * hudScale)}
            strokeWidth={3}
            color="#fbbf24"
            bgColor="rgba(255,255,255,0.1)"
            glowColor="#fbbf24"
          >
            <Sun size={Math.round(17 * hudScale)} color="#fbbf24" strokeWidth={2.2} />
          </ArcRing>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ color: "#fff", fontSize: Math.round(12 * hudScale) + 'px', fontWeight: 700 }}>
              {pct}%
            </span>
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: Math.round(8 * hudScale) + 'px', fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.18em" }}>
              Brightness
            </span>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default PresetBrightnessHUD;