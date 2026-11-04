// Netflix "Left off at …" resume card.
//
// Auto-resumes after a short wait (the engine owns the countdown and the
// session-once gate); this owns the presentation and the two actions. The
// bottom-right corner matches the episodes rail, whose gradient is transparent
// at the top, so it does not show through an open panel.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import { IconPlay } from "./icons";
import { IS_TOUCH } from "./constants";
import { ACCENT, ACCENT_FG, GLASS_BG_STRONG, GLASS_BLUR, GLASS_BORDER, RADIUS } from "./theme";

export default function ResumeCard({ offer, fmtTime, onResume, onRestart }) {
  const M = useMotionTokens(useReducedMotion());
  return (
    <AnimatePresence>
      {offer && (
        <motion.div
          key="np-resume"
          role="complementary"
          aria-label={`Resume from ${fmtTime(offer.at)}`}
          initial={M.MODAL_PANEL.initial}
          animate={M.MODAL_PANEL.animate}
          exit={M.MODAL_PANEL.exit}
          transition={M.MODAL_PANEL.transition}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: "max(1em, env(safe-area-inset-right))",
            bottom: "calc(6.4em + env(safe-area-inset-bottom))",
            display: "flex",
            alignItems: "center",
            gap: "0.8em",
            width: "min(20em, calc(100% - 2em))",
            background: "#0d1219",
            borderRadius: "1.1em",
            border: "1px solid #ffffff17",
            padding: "0.9em 1.1em",
            zIndex: 6,
            boxShadow: "0 .5em 1.4em #0007",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
              You left off at {fmtTime(offer.at)}
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>
              {offer.left > 1 ? `Auto-resuming in ${offer.left}s` : "Resuming…"}
            </div>
          </div>
          <button
            type="button"
            className="np-resume-btn"
            onClick={() => onResume(offer.at)}
            aria-label={`Resume from ${fmtTime(offer.at)}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "9px 20px",
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
            <IconPlay size={16} />
            Resume
          </button>
          <button
            type="button"
            className="np-restart-btn"
            onClick={onRestart}
            aria-label="Restart from the beginning"
            style={{
              padding: "9px 16px",
              background: "transparent",
              color: "rgba(255,255,255,0.85)",
              border: "1px solid rgba(255,255,255,0.28)",
              borderRadius: RADIUS.pill,
              fontWeight: 600,
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Restart
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}