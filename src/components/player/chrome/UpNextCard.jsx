// Netflix "Up Next" post-roll card (TV only).
//
// Shown when a TV episode has ended and a next installment exists. The engine
// owns the countdown timer and the auto-advance; this owns the card and the
// Play now / cancel actions.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import IconBtn from "./IconBtn";
import { IconClose, IconPlay } from "./icons";
import { IS_TOUCH } from "./constants";
import { ACCENT, ACCENT_FG, GLASS_BG_STRONG, GLASS_BLUR, GLASS_BORDER, RADIUS } from "./theme";

export default function UpNextCard({ upNext, upNextMs, onPlayNow, onCancel }) {
  const M = useMotionTokens(useReducedMotion());
  return (
    <AnimatePresence>
      {upNext && (
        <motion.div
          key="np-upnext"
          id="nxt"
          className="nxt"
          role="complementary"
          aria-label={`Up Next: playing in ${Math.round(upNextMs / 1000)} seconds`}
          initial={M.MODAL_PANEL.initial}
          animate={M.MODAL_PANEL.animate}
          exit={M.MODAL_PANEL.exit}
          transition={M.MODAL_PANEL.transition}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: "max(1em, env(safe-area-inset-right))",
            bottom: "calc(6.4em + env(safe-area-inset-bottom))",
            width: "min(20em, calc(100% - 2em))",
            background: "#0d1219",
            borderRadius: "1.1em",
            border: "1px solid #ffffff17",
            padding: "1em 1.1em",
            zIndex: 6,
            boxShadow: "0 .5em 1.4em #0007",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,255,255,0.55)" }}>
              Up Next
            </span>
            <IconBtn label="Cancel up next" onClick={onCancel}>
              <IconClose size={16} />
            </IconBtn>
          </div>
          <div style={{ marginTop: 6, color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>
            {upNext.title ? `E${upNext.number} · ${upNext.title}` : `Episode ${upNext.number}`}
          </div>
          <div
            style={{
              marginTop: 8,
              height: 3,
              borderRadius: "var(--radius-full)",
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
            className="np-resume-btn nxb"
            onClick={() => onPlayNow(upNext.number)}
            style={{
              marginTop: 12,
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "10px 16px",
              background: ACCENT,
              color: ACCENT_FG,
              border: "none",
              borderRadius: RADIUS.pill,
              fontWeight: 700,
              fontSize: 14,
              cursor: "pointer",
              boxShadow: "0 0 20px rgba(149,255,80,0.28)",
            }}
          >
            <IconPlay size={18} />
            Play now
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}