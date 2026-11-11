// Transient "Tap to unmute" pill matching player-v4 styling.
//
// Shows only when playback had to start muted because the autoplay policy
// blocked sound, and yields to an open panel.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMotionTokens, PRESS_SCALE } from "../../../constants/motion";

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
          className="btn osd"
          style={{
            position: "absolute",
            bottom: "calc(6.4em + env(safe-area-inset-bottom))",
            left: "max(1.2em, env(safe-area-inset-left))",
            display: "flex",
            alignItems: "center",
            gap: ".6em",
            padding: ".6em 1.2em",
            background: "#0d1219",
            color: "var(--white)",
            border: "1px solid rgba(var(--white-rgb), 0.09)",
            borderRadius: "2em",
            boxShadow: "0 .5em 1.4em rgba(var(--black-rgb), 0.47)",
            fontWeight: 700,
            fontSize: "0.92em",
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            zIndex: 6,
          }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: PRESS_SCALE.CONTROL }}
        >
          <svg
            className="ic"
            style={{ width: "1.25em", height: "1.25em", color: "var(--accent, #8652bb)" }}
          >
            <use href="#i-mute" />
          </svg>
          <span>Tap to unmute</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
