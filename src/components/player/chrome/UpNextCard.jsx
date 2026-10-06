// Netflix "Up Next" post-roll card (TV only).
//
// Shown when a TV episode has ended and a next installment exists. The engine
// owns the countdown timer and the auto-advance; this owns the card and the
// Play now / cancel actions.
import { AnimatePresence, motion } from "framer-motion";
import { Play, X } from "lucide-react";
import { useMotionTokens } from "../../../constants/motion";
import IconBtn from "./IconBtn";
import { IS_TOUCH } from "./constants";
import { ACCENT, GLASS_BG_STRONG, GLASS_BLUR, GLASS_BORDER, RADIUS } from "./theme";

export default function UpNextCard({ upNext, upNextMs, onPlayNow, onCancel }) {
  const M = useMotionTokens();
  return (
    <AnimatePresence>
      {upNext && (
        <motion.div
          key="np-upnext"
          role="complementary"
          aria-label={`Up Next: playing in ${Math.round(upNextMs / 1000)} seconds`}
          initial={{ opacity: 0, x: 28, scale: 0.97 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 20, scale: 0.98 }}
          transition={M.SPRING.SHEET}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: 24,
            bottom: IS_TOUCH ? 120 : 100,
            width: "min(260px, 55%)",
            background: GLASS_BG_STRONG,
            borderRadius: RADIUS.card,
            border: `1px solid ${GLASS_BORDER}`,
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            padding: "14px 16px",
            zIndex: 6,
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,255,255,0.55)" }}>
              Up Next
            </span>
            <IconBtn label="Cancel up next" onClick={onCancel}>
              <X size={16} />
            </IconBtn>
          </div>
          <div style={{ marginTop: 6, color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>
            {upNext.title ? `E${upNext.number} · ${upNext.title}` : `Episode ${upNext.number}`}
          </div>
          <div
            style={{
              marginTop: 8,
              height: 3,
              borderRadius: 999,
              background: "rgba(255,255,255,0.18)",
              overflow: "hidden",
              pointerEvents: "auto",
            }}
          >
            <div
              // Full width, drained by the keyframe — the old `width:
              // "15000ms"` was not a length CSS understands, so the bar
              // rendered at the track's natural 0% and never counted down.
              className="np-upnext-countdown"
              style={{
                height: "100%",
                width: "100%",
                background: ACCENT,
                transformOrigin: "left",
                animation: "upNextCountdown linear both",
                animationDuration: `${upNextMs}ms`,
              }}
            />
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>
            Playing in {Math.round(upNextMs / 1000)} seconds
          </div>
          <button
            type="button"
            className="np-resume-btn"
            onClick={() => onPlayNow(upNext.number)}
            style={{
              marginTop: 10,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "9px 16px",
              background: "#fff",
              color: "#000",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            <Play size={18} />
            Play now
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}