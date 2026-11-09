import { memo } from "react";
import { DURATION, EASE_OUT } from "../constants/motion";
import { motion } from "framer-motion";
import {
  ACCENT,
  ACCENT_FG,
  GLASS_BG_STRONG,
  GLASS_BLUR,
  GLASS_BORDER,
  RADIUS,
  SHADOW,
} from "./player/chrome/theme";

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif";

/* "Still watching?" — a full-frame dim + centered prompt when playback has run
   unattended (2h idle or 3 auto-advanced episodes). Pausing + asking is the
   honest behavior: it stops data burn when nobody is behind the screen.
   "Continue Watching" resumes; "Exit" closes the player. */
const StillWatching = memo(function StillWatching({ onContinue, onExit }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: DURATION.MED, ease: EASE_OUT }}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
        fontFamily: FONT,
      }}
      role="alertdialog"
      aria-label="Still watching?"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 22,
          textAlign: "center",
          padding: "36px 44px",
          background: GLASS_BG_STRONG,
          border: `1px solid ${GLASS_BORDER}`,
          borderRadius: 24,
          backdropFilter: GLASS_BLUR,
          WebkitBackdropFilter: GLASS_BLUR,
          boxShadow: SHADOW.card,
        }}
      >
        <span style={{ color: "#fff", fontSize: 24, fontWeight: 600, letterSpacing: -0.2 }}>
          Still watching?
        </span>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={onContinue}
            style={{
              padding: "12px 30px",
              borderRadius: RADIUS.pill,
              border: "none",
              background: ACCENT,
              color: ACCENT_FG,
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 0 24px rgba(149,255,80,0.3)",
            }}
          >
            Continue Watching
          </button>
          <button
            type="button"
            onClick={onExit}
            style={{
              padding: "12px 30px",
              borderRadius: RADIUS.pill,
              border: "1px solid rgba(255,255,255,0.24)",
              background: "transparent",
              color: "#fff",
              fontSize: 15,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Exit
          </button>
        </div>
      </div>
    </motion.div>
  );
});

export default StillWatching;
