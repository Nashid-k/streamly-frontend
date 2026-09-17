import { motion } from "framer-motion";
import { Volume1, Volume2, VolumeX } from "lucide-react";
import ArcRing from "./ArcRing";
import { SPRING_FAST, SPRING_SNAPPY } from "../tokens";

function PresetVolumeHUD({ skin, effVolume, isMuted, volume, hudScale, hudTop }) {
  const isZero = isMuted || volume === 0;
  const pct = isZero ? 0 : Math.round(effVolume * 100);
  const skinId = skin?.id || "classic";

  return (
    <motion.div
      key="volume-hud"
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
          <div style={{
            background: isZero ? "rgba(255,82,82,0.2)" : "rgba(208,188,255,0.22)",
            color: isZero ? "#ff5252" : "var(--skin-accent, #d0bcff)",
            borderRadius: 12, padding: 6, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {isZero ? <VolumeX size={17 * hudScale} /> : effVolume <= 0.33 ? <Volume1 size={17 * hudScale} /> : <Volume2 size={17 * hudScale} />}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minWidth: 100 * hudScale }}>
              <span style={{ fontSize: 10 * hudScale, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.6)", fontWeight: 700 }}>Volume</span>
              <span style={{ fontSize: 12 * hudScale, fontWeight: 700, color: isZero ? "#ff5252" : "var(--skin-accent, #d0bcff)" }}>{isZero ? "Muted" : `${pct}%`}</span>
            </div>
            <div style={{ width: 100 * hudScale, height: 6, background: "rgba(255,255,255,0.14)", borderRadius: 3, overflow: "hidden" }}>
              <motion.div
                animate={{ width: `${pct}%` }}
                transition={{ type: "spring", stiffness: 450, damping: 32 }}
                style={{ height: "100%", background: isZero ? "#ff5252" : "var(--skin-accent, #d0bcff)", borderRadius: 3 }}
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
            WebkitBackdropFilter: "blur(20px)",
            border: "1.5px solid rgba(255,200,100,0.35)",
            borderRadius: "var(--skin-hud-radius, 22px)",
            padding: `${Math.round(8 * hudScale)}px ${Math.round(18 * hudScale)}px`,
            boxShadow: "0 0 28px rgba(255,178,64,0.35), inset 0 0 14px rgba(255,178,64,0.08)",
            fontFamily: "var(--skin-hud-font, Georgia, serif)",
          }}
        >
          <span style={{ color: "#ffd166", fontSize: 14 * hudScale, filter: "drop-shadow(0 0 6px rgba(255,209,102,0.8))" }}>★</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {isZero ? <VolumeX size={17 * hudScale} color="#ff5252" /> : <Volume2 size={17 * hudScale} color="#ffd166" />}
            <span style={{ fontSize: 13 * hudScale, fontWeight: 700, color: isZero ? "#ff5252" : "#ffd166", letterSpacing: "0.04em" }}>
              {isZero ? "MUTED" : `${pct}%`}
            </span>
          </div>
          <div style={{ width: 80 * hudScale, height: 5, background: "rgba(255,209,102,0.18)", borderRadius: 3, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              style={{ height: "100%", background: isZero ? "#ff5252" : "linear-gradient(90deg, #ffd166, #ff9e2c)", borderRadius: 3 }}
            />
          </div>
          <span style={{ fontSize: 9 * hudScale, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,209,102,0.7)" }}>SOUNDSTAGE</span>
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
            boxShadow: "0 4px 20px rgba(0,0,0,0.85), inset 0 0 10px rgba(255,59,78,0.1)",
            fontFamily: "var(--skin-hud-font, 'SF Mono', monospace)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#ff3b4e", fontSize: 10 * hudScale, fontWeight: 800 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ff3b4e" }} />
            CH-1
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
            {[1,2,3,4,5,6,7,8,9,10].map(step => {
              const active = !isZero && (pct / 10) >= step;
              const isPeak = step >= 9;
              const isHigh = step >= 7;
              return (
                <div
                  key={step}
                  style={{
                    width: 5 * hudScale,
                    height: 12 * hudScale,
                    borderRadius: 1,
                    background: active
                      ? (isPeak ? "#ff3b4e" : isHigh ? "#ffd600" : "#00e676")
                      : "rgba(255,255,255,0.08)",
                  }}
                />
              );
            })}
          </div>
          <span style={{ fontSize: 11 * hudScale, fontWeight: 700, color: isZero ? "#ff3b4e" : "#00e676", fontVariantNumeric: "tabular-nums" }}>
            {isZero ? "MUTE" : `${pct}%`}
          </span>
          <span style={{ fontSize: 9 * hudScale, color: "rgba(255,255,255,0.4)" }}>
            {isZero ? "-INF" : `${(effVolume * 12 - 12).toFixed(0)}dB`}
          </span>
        </motion.div>
      ) : skinId === "minimal" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(10 * hudScale),
            background: "rgba(12,12,16,0.75)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 999,
            padding: `${Math.round(6 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            fontFamily: "var(--skin-hud-font, sans-serif)",
          }}
        >
          {isZero ? <VolumeX size={14 * hudScale} color="#ff5252" /> : <Volume2 size={14 * hudScale} color="#fff" />}
          <div style={{ width: 70 * hudScale, height: 2.5, background: "rgba(255,255,255,0.15)", borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              style={{ height: "100%", background: isZero ? "#ff5252" : "#fff", borderRadius: 2 }}
            />
          </div>
          <span style={{ fontSize: 11 * hudScale, fontWeight: 600, color: isZero ? "#ff5252" : "#fff" }}>
            {isZero ? "0%" : `${pct}%`}
          </span>
        </motion.div>
      ) : skinId === "apple" ? (
        <motion.div
          layout
          style={{
            display: "flex", flexDirection: "row", alignItems: "center", gap: Math.round(11 * hudScale),
            background: "var(--skin-hud-bg, rgba(30, 30, 36, 0.88))",
            backdropFilter: "blur(var(--skin-hud-blur, 36px)) saturate(160%)",
            WebkitBackdropFilter: "blur(var(--skin-hud-blur, 36px)) saturate(160%)",
            border: isZero ? "1px solid rgba(255,69,58,0.35)" : "var(--skin-hud-border, 1px solid rgba(255,255,255,0.18))",
            borderRadius: "var(--skin-hud-radius, 24px)",
            padding: `${Math.round(8 * hudScale)}px ${Math.round(13 * hudScale)}px`,
            boxShadow: "var(--skin-hud-shadow, 0 14px 40px rgba(0,0,0,0.45))",
          }}
        >
          <ArcRing
            progress={effVolume}
            size={Math.round(40 * hudScale)}
            strokeWidth={3}
            color={isZero ? "#ff453a" : "#fff"}
            bgColor="rgba(255,255,255,0.1)"
            glowColor={isZero ? "#ff453a" : "#fff"}
          >
            <motion.span
              key={isZero ? "muted" : effVolume <= 0.33 ? "low" : "high"}
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={SPRING_FAST}
              style={{ display: "flex", alignItems: "center" }}
            >
              {isZero ? (
                <VolumeX size={Math.round(17 * hudScale)} color="#ff453a" strokeWidth={2.2} />
              ) : effVolume <= 0.33 ? (
                <Volume1 size={Math.round(17 * hudScale)} color="rgba(255,255,255,0.92)" strokeWidth={2.2} />
              ) : (
                <Volume2 size={Math.round(17 * hudScale)} color="#fff" strokeWidth={2.2} />
              )}
            </motion.span>
          </ArcRing>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: Math.round(2 * hudScale), lineHeight: 1.1 }}>
            <span style={{
              color: isZero ? "#ff453a" : "rgba(255,255,255,0.95)",
              fontSize: Math.round(12 * hudScale) + 'px',
              fontWeight: 700,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              fontVariantNumeric: "tabular-nums",
            }}>
              {isZero ? "Muted" : `${pct}%`}
            </span>
            <span style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: Math.round(8 * hudScale) + 'px',
              fontWeight: 600, letterSpacing: "0.18em", textTransform: "uppercase",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
            }}>
              Volume
            </span>
          </div>
        </motion.div>
      ) : (
        /* Classic Streaming Standard */
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: Math.round(12 * hudScale),
            background: "linear-gradient(180deg, rgba(22,22,26,0.92), rgba(10,10,12,0.92))",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 18,
            padding: `${Math.round(8 * hudScale)}px ${Math.round(16 * hudScale)}px`,
            boxShadow: "0 14px 40px rgba(0,0,0,0.6)",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
          }}
        >
          {isZero ? <VolumeX size={17 * hudScale} color="#ff453a" /> : <Volume2 size={17 * hudScale} color="#fff" />}
          <div style={{ width: 90 * hudScale, height: 4, background: "rgba(255,255,255,0.12)", borderRadius: 2, overflow: "hidden" }}>
            <motion.div
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 450, damping: 32 }}
              style={{ height: "100%", background: isZero ? "#ff453a" : "var(--accent-gradient, linear-gradient(90deg, #95ff50, #5ce21c))", borderRadius: 2 }}
            />
          </div>
          <span style={{ fontSize: 12 * hudScale, fontWeight: 700, color: isZero ? "#ff453a" : "#fff" }}>
            {isZero ? "Muted" : `${pct}%`}
          </span>
        </motion.div>
      )}
    </motion.div>
  );
}

export default PresetVolumeHUD;