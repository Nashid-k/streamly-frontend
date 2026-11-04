// Transient "Tap to unmute" pill.
//
// Shows only when playback had to start muted because the autoplay policy
// blocked sound, and yields to an open panel for the same reason the skip pill
// does. Lives bottom-left so it never collides with the skip pill on the right.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMotionTokens, PRESS_SCALE } from "../../../constants/motion";
import { IconVolumeMute } from "./icons";
import { ACCENT } from "./theme";

export default function TapToUnmutePill({ visible, onUnmute }) {
  const M = useMotionTokens(useReducedMotion());
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="np-automute"
          type="button"
          {...M.PILL_IN}
          onClick={(e) => {
            e.stopPropagation();
            onUnmute();
          }}
          aria-label="Play with sound"
          title="Unmute"
          style={{
            position: "absolute",
            bottom: "calc(var(--np-safe-bottom, 24px) + 140px)",
            left: 24,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 16px",
            background: "rgba(9,12,10,0.9)",
            color: "#fff",
            border: "1px solid rgba(149,255,80,0.4)",
            borderRadius: "var(--radius-full)",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            boxShadow: "0 14px 34px rgba(0,0,0,0.55)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            zIndex: 6,
          }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: PRESS_SCALE.CONTROL }}
          data-geometry="bottom-left pill, 140px above safe bottom (skip pill is bottom-right)"
        >
          <IconVolumeMute size={16} color={ACCENT} />
          Tap to unmute
        </motion.button>
      )}
    </AnimatePresence>
  );
}