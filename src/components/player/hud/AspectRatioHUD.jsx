import { motion } from "framer-motion";
import { Maximize } from "lucide-react";
import { ASPECT_RATIOS, AR_GLYPH } from "../constants";
import { SPRING_SNAPPY, SPRING_FAST } from "../tokens";

function PresetAspectRatioHUD({ skin, aspectRatioIndex, hudScale, hudTop, isTouch }) {
  const skinId = skin?.id || "classic";
  const currentAr = ASPECT_RATIOS[aspectRatioIndex] || ASPECT_RATIOS[0];

  return (
    <motion.div
      key="aspect-hud"
      initial={{ opacity: 0, y: -18, scale: 0.88, x: "-50%" }}
      animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
      exit={{ opacity: 0, y: -6, scale: 0.92, x: "-50%" }}
      transition={SPRING_SNAPPY}
      style={{
        position: "absolute", left: "50%",
        top: isTouch ? "calc(clamp(14px, 3vh, 28px) + var(--sat))" : hudTop,
        zIndex: 65, pointerEvents: "none",
      }}
    >
      {skinId === "material" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: isTouch ? 10 : Math.round(14 * hudScale),
            background: "var(--skin-hud-bg, rgba(43, 38, 48, 0.94))",
            backdropFilter: "blur(var(--skin-hud-blur, 20px))",
            WebkitBackdropFilter: "blur(var(--skin-hud-blur, 20px))",
            border: "var(--skin-hud-border, 1px solid rgba(255,255,255,0.12))",
            borderRadius: "var(--skin-hud-radius, 20px)",
            padding: isTouch ? "8px 16px" : `${Math.round(8 * hudScale)}px ${Math.round(18 * hudScale)}px`,
            boxShadow: "var(--skin-hud-shadow, 0 8px 32px rgba(0,0,0,0.5))",
            fontFamily: "var(--skin-hud-font, 'Roboto', sans-serif)",
          }}
        >
          <div style={{
            background: "var(--skin-accent, #d0bcff)",
            color: "#1e1b22",
            borderRadius: 14,
            padding: 8,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Maximize size={16 * hudScale} strokeWidth={2.5} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ fontSize: 13 * hudScale, fontWeight: 700, color: "#fff" }}>
              {currentAr.name}
            </span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {ASPECT_RATIOS.map((ar, idx) => (
                <span
                  key={ar.name}
                  style={{
                    padding: "2px 6px",
                    borderRadius: 8,
                    fontSize: 9 * hudScale,
                    fontWeight: 700,
                    background: idx === aspectRatioIndex ? "var(--skin-accent, #d0bcff)" : "rgba(255,255,255,0.08)",
                    color: idx === aspectRatioIndex ? "#1e1b22" : "rgba(255,255,255,0.6)",
                  }}
                >
                  {ar.name}
                </span>
              ))}
            </div>
          </div>
        </motion.div>
      ) : skinId === "theater" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: isTouch ? 10 : Math.round(14 * hudScale),
            background: "linear-gradient(180deg, rgba(32,18,6,0.96), rgba(16,8,2,0.96))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            border: "1.5px solid rgba(255,200,100,0.45)",
            borderRadius: "var(--skin-hud-radius, 22px)",
            padding: isTouch ? "8px 18px" : `${Math.round(9 * hudScale)}px ${Math.round(20 * hudScale)}px`,
            boxShadow: "0 0 32px rgba(255,178,64,0.4), inset 0 0 12px rgba(255,178,64,0.1)",
            fontFamily: "var(--skin-hud-font, Georgia, serif)",
          }}
        >
          <span style={{ color: "#ffd166", fontSize: 15 * hudScale, filter: "drop-shadow(0 0 8px rgba(255,209,102,0.9))" }}>★</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 13 * hudScale, fontWeight: 700, color: "#ffd166", letterSpacing: "0.06em" }}>
              CINEMA FRAME: {currentAr.name.toUpperCase()}
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 10 * hudScale, color: "rgba(255,209,102,0.8)", letterSpacing: "0.08em" }}>
                {aspectRatioIndex === 0 ? "1.78:1 FLAT" : aspectRatioIndex === 1 ? "16:9 EXPANDED" : aspectRatioIndex === 2 ? "4:3 ACADEMY" : "2.39:1 ANAMORPHIC"}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                {ASPECT_RATIOS.map((_, idx) => (
                  <span
                    key={idx}
                    style={{
                      width: idx === aspectRatioIndex ? 10 : 4,
                      height: 4,
                      borderRadius: 2,
                      background: idx === aspectRatioIndex ? "#ffd166" : "rgba(255,209,102,0.25)",
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      ) : skinId === "studio" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: isTouch ? 10 : Math.round(14 * hudScale),
            background: "rgba(10,10,12,0.98)",
            border: "1px solid rgba(255,59,78,0.5)",
            borderRadius: 4,
            padding: isTouch ? "7px 14px" : `${Math.round(7 * hudScale)}px ${Math.round(16 * hudScale)}px`,
            boxShadow: "0 4px 24px rgba(0,0,0,0.85), inset 0 0 12px rgba(255,59,78,0.12)",
            fontFamily: "var(--skin-hud-font, 'SF Mono', monospace)",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ background: "#ff3b4e", color: "#fff", padding: "1px 5px", borderRadius: 2, fontSize: 9 * hudScale, fontWeight: 800 }}>
                RASTER
              </span>
              <span style={{ color: "#00e5ff", fontSize: 11 * hudScale, fontWeight: 700 }}>
                [{currentAr.name.toUpperCase()}] 1920x1080 SCAN
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 9 * hudScale }}>
                SCALE: {(currentAr.scale).toFixed(2)}x
              </span>
              <span style={{ color: "rgba(255,255,255,0.2)" }}>|</span>
              <span style={{ color: "#00e676", fontSize: 9 * hudScale }}>
                SMPTE GRID ON
              </span>
            </div>
          </div>
        </motion.div>
      ) : skinId === "minimal" ? (
        <motion.div
          layout
          style={{
            display: "flex", alignItems: "center", gap: isTouch ? 8 : Math.round(10 * hudScale),
            background: "rgba(12,12,16,0.75)",
            backdropFilter: "blur(18px)",
            WebkitBackdropFilter: "blur(18px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 999,
            padding: isTouch ? "6px 14px" : `${Math.round(6 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            fontFamily: "var(--skin-hud-font, sans-serif)",
          }}
        >
          <Maximize size={13 * hudScale} color="#fff" />
          <span style={{ fontSize: 12 * hudScale, fontWeight: 600, color: "#fff" }}>
            {currentAr.name}
          </span>
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {ASPECT_RATIOS.map((_, idx) => (
              <span
                key={idx}
                style={{
                  width: idx === aspectRatioIndex ? 6 : 3,
                  height: 3,
                  borderRadius: 2,
                  background: idx === aspectRatioIndex ? "#fff" : "rgba(255,255,255,0.2)",
                }}
              />
            ))}
          </div>
        </motion.div>
      ) : (
        /* Apple TV & Classic */
        <motion.div
          layout
          transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.9 }}
          style={{
            display: "flex", alignItems: "center", gap: isTouch ? 10 : Math.round(12 * hudScale),
            background: "var(--skin-hud-bg, linear-gradient(180deg, rgba(22,22,26,0.92), rgba(10,10,12,0.92)))",
            backdropFilter: "blur(var(--skin-hud-blur, 24px)) saturate(160%)",
            WebkitBackdropFilter: "blur(var(--skin-hud-blur, 24px)) saturate(160%)",
            border: "var(--skin-hud-border, 1px solid rgba(255,255,255,0.12))",
            borderRadius: "var(--skin-hud-radius, 999px)",
            padding: isTouch ? "6px 14px" : `${Math.round(7 * hudScale)}px ${Math.round(14 * hudScale)}px`,
            boxShadow:
              "var(--skin-hud-shadow, 0 16px 48px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.04), inset 0 0.5px 0 rgba(255,255,255,0.14))",
          }}
        >
          <motion.div
            animate={{ width: Math.round(44 * hudScale), height: Math.round(44 * hudScale) }}
            transition={{ type: "spring", stiffness: 380, damping: 30, mass: 0.9 }}
            style={{
              position: "relative", flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 70%)",
              border: "1px solid rgba(255,255,255,0.07)",
            }} />
            <motion.div
              key={aspectRatioIndex}
              initial={{ scale: 0.7, opacity: 0.6 }}
              animate={{ scale: 1.8, opacity: 0 }}
              transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: "absolute", width: Math.round(36 * hudScale), height: Math.round(36 * hudScale),
                borderRadius: "50%",
                border: "1.5px solid rgba(255,255,255,0.35)",
              }}
            />
            <motion.div
              initial={false}
              animate={{
                width: AR_GLYPH[aspectRatioIndex][0] * hudScale,
                height: AR_GLYPH[aspectRatioIndex][1] * hudScale,
              }}
              transition={{ type: "spring", stiffness: 430, damping: 24, mass: 0.9 }}
              style={{
                position: "relative", zIndex: 1, flexShrink: 0,
                borderRadius: 3, overflow: "hidden",
                border: "1.5px solid rgba(255,255,255,0.92)",
                background:
                  "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 100%)",
                boxShadow: "0 0 16px rgba(255,255,255,0.22), inset 0 0 12px rgba(255,255,255,0.06)",
              }}
            >
              <motion.div
                key={aspectRatioIndex}
                initial={{ x: "-85%", opacity: 0 }}
                animate={{ x: "85%", opacity: [0, 0.85, 0] }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                style={{
                  position: "absolute", top: 0, bottom: 0, width: "55%",
                  background: "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
                }}
              />
            </motion.div>
            <motion.div
              key={aspectRatioIndex}
              initial={{ opacity: 0, scale: 1.25 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.08, type: "spring", stiffness: 500, damping: 32 }}
              style={{ position: "absolute", inset: 0, zIndex: 2 }}
            >
              <div style={{ position: "absolute", top: -2, left: -2, width: 7, height: 7, borderTop: "2px solid rgba(255,255,255,0.85)", borderLeft: "2px solid rgba(255,255,255,0.85)", borderTopLeftRadius: 2 }} />
              <div style={{ position: "absolute", top: -2, right: -2, width: 7, height: 7, borderTop: "2px solid rgba(255,255,255,0.85)", borderRight: "2px solid rgba(255,255,255,0.85)", borderTopRightRadius: 2 }} />
              <div style={{ position: "absolute", bottom: -2, left: -2, width: 7, height: 7, borderBottom: "2px solid rgba(255,255,255,0.85)", borderLeft: "2px solid rgba(255,255,255,0.85)", borderBottomLeftRadius: 2 }} />
              <div style={{ position: "absolute", bottom: -2, right: -2, width: 7, height: 7, borderBottom: "2px solid rgba(255,255,255,0.85)", borderRight: "2px solid rgba(255,255,255,0.85)", borderBottomRightRadius: 2 }} />
            </motion.div>
          </motion.div>

          <div style={{ display: "flex", flexDirection: "column", gap: Math.round(5 * hudScale) }}>
            <motion.span
              key={`${aspectRatioIndex}-name`}
              initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={SPRING_SNAPPY}
              style={{
                color: "#fff", fontSize: Math.round(13 * hudScale) + 'px', fontWeight: 700, lineHeight: 1.2,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                whiteSpace: "nowrap",
              }}
            >
              {currentAr.name}
            </motion.span>
            <div style={{ display: "flex", alignItems: "center", gap: Math.round(6 * hudScale) }}>
              <motion.span
                key={`${aspectRatioIndex}-pct`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={SPRING_FAST}
                style={{
                  color: aspectRatioIndex === 0 ? "rgba(255,255,255,0.9)" : "#7DD3FC",
                  fontSize: Math.round(10 * hudScale) + 'px', fontWeight: 700,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {aspectRatioIndex === 0 ? "Original" : `+${Math.round((currentAr.scale - 1) * 100)}%`}
              </motion.span>
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                {ASPECT_RATIOS.map((_, i) => (
                  <motion.i
                    key={i}
                    animate={{
                      width: i === aspectRatioIndex ? 7 : 4,
                      height: 3.5,
                      backgroundColor: i === aspectRatioIndex
                        ? (aspectRatioIndex === 0 ? "rgba(255,255,255,0.95)" : "#7DD3FC")
                        : "rgba(255,255,255,0.18)",
                    }}
                    transition={{ type: "spring", stiffness: 600, damping: 32 }}
                    style={{ display: "block", borderRadius: 2 }}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

export default PresetAspectRatioHUD;