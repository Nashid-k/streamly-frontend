import { memo } from "react";
import { motion } from "framer-motion";

const NETFLIX_RED = "#E50914";

/* Netflix "Still watching?" — a full-frame dim + centered prompt when playback
   has run unattended (2h idle or 3 auto-advanced episodes). Pausing + asking
   is the honest Netflix behavior: it stops data burn when nobody is behind
   the screen. "Continue Watching" resumes; "Exit" closes the player. */
const NetflixStillWatching = memo(function NetflixStillWatching({ onContinue, onExit }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 80,
      }}
      role="alertdialog"
      aria-label="Still watching?"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18,
          textAlign: "center",
          padding: "0 24px",
        }}
      >
        <span style={{ color: "#fff", fontSize: 26, fontWeight: 700 }}>Still watching?</span>
        <div style={{ display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={onContinue}
            style={{
              padding: "10px 26px",
              borderRadius: 4,
              border: "none",
              background: NETFLIX_RED,
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Continue Watching
          </button>
          <button
            type="button"
            onClick={onExit}
            style={{
              padding: "10px 26px",
              borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.45)",
              background: "transparent",
              color: "#fff",
              fontSize: 16,
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

export default NetflixStillWatching;
