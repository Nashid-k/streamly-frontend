// Fatal failure banner.
//
// The old banner was a bare <p> with no role and no exit: a screen reader never
// announced the failure, and a viewer whose source failed had no way forward but
// the browser Back button. role="alert" goes on the MESSAGE only — putting it on
// the wrapper would make a live region announce "…cannot run here.Try againBack"
// as one string. "Try again" re-runs the load effect via the engine's reload
// token; the back button leaves the player.
import { motion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import { GLASS_BG_STRONG, GLASS_BLUR, GLASS_BORDER, RADIUS } from "./theme";

export default function FatalBanner({ message, onRetry, onBack }) {
  const M = useMotionTokens();
  if (!message) return null;
  return (
    <motion.div
      key="np-fatal"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={M.SPRING.SHEET}
      className="np-fatal"
      style={{
        position: "absolute",
        bottom: 80,
        left: 16,
        right: 16,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        borderRadius: RADIUS.card,
        background: GLASS_BG_STRONG,
        backdropFilter: GLASS_BLUR,
        WebkitBackdropFilter: GLASS_BLUR,
        border: `1px solid ${GLASS_BORDER}`,
        fontSize: 14,
        zIndex: 7,
        color: "#fff",
        boxShadow: "0 10px 34px rgba(0,0,0,0.6)",
      }}
    >
      <span role="alert" style={{ flex: 1, minWidth: 0 }}>
        {message}
      </span>
      <button
        type="button"
        className="np-fatal-btn"
        onClick={onRetry}
        style={{
          padding: "7px 14px",
          background: "#fff",
          color: "#000",
          border: "none",
          borderRadius: 8,
          fontWeight: 700,
          fontSize: 13,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Try again
      </button>
      <button
        type="button"
        className="np-fatal-btn"
        // Not "Back": the top bar already owns a Back button, and two
        // controls with the same accessible name in one view is ambiguous
        // to get by voice or screen-reader rotor.
        aria-label="Back to browse"
        onClick={onBack}
        style={{
          padding: "7px 14px",
          background: "transparent",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.4)",
          borderRadius: 8,
          fontWeight: 600,
          fontSize: 13,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        Back
      </button>
    </motion.div>
  );
}