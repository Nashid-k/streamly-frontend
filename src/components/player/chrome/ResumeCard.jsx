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
            right: 24,
            bottom: IS_TOUCH ? 150 : 136,
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: GLASS_BG_STRONG,
            borderRadius: RADIUS.card,
            border: `1px solid ${GLASS_BORDER}`,
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            padding: "12px 16px",
            zIndex: 6,
            boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
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