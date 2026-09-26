import { memo } from "react";
import { ChevronsRight } from "lucide-react";
import { motion } from "framer-motion";
import { SPRING_SNAPPY } from "../../constants/playerUi";

/* Netflix-mobile hold-to-2x pill: a small badge pinned to the right edge of the
   frame while the hold is active. Decorative only (the video element itself
   runs at 2x); self-fades with the HUD timer when the hold releases. */
const NetflixHold2xHUD = memo(function NetflixHold2xHUD({ metrics }) {
  const scale = metrics?.scale || 1;
  const font = Math.max(13, Math.round(20 * scale));
  const icon = Math.max(16, Math.round(24 * scale));
  return (
    <motion.div
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={SPRING_SNAPPY}
      aria-hidden="true"
      style={{
        position: "absolute",
        top: metrics.top,
        right: metrics.seekInset,
        display: "flex",
        alignItems: "center",
        gap: Math.round(font * 0.35),
        background: "rgba(0,0,0,0.78)",
        border: "1px solid rgba(255,255,255,0.22)",
        borderRadius: 999,
        padding: `${Math.round(font * 0.45)}px ${Math.round(font * 0.8)}px`,
        color: "#fff",
        pointerEvents: "none",
        zIndex: 65,
      }}
    >
      <span style={{ fontSize: font, fontWeight: 800, letterSpacing: 0.5, whiteSpace: "nowrap" }}>2x</span>
      <ChevronsRight size={icon} color="#fff" strokeWidth={2.2} />
    </motion.div>
  );
});

export default NetflixHold2xHUD;
