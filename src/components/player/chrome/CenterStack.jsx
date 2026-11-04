// The centre stack: cold start stage and replay button.
// In player-v4:
// - Buffering uses .loading on .player which shows .ld (double arc spinner)
// - Paused play button is the single .big button
// - End state shows replay
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMotionTokens, DURATION, EASE_OUT, PRESS_SCALE } from "../../../constants/motion";
import {
  ACCENT,
  ACCENT_FG,
  ACCENT_GLOW,
  GLASS_BLUR,
} from "./theme";
import { IconReplay } from "./icons";
import { LoadingStage } from "./primitives";

export default function CenterStack({
  showStage,
  stageNote,
  stageInitial,
  switchFrame,
  displayTitle,
  backdropUrl,
  posterUrl,
  ended,
  onReplay,
}) {
  const M = useMotionTokens(useReducedMotion());

  return (
    <>
      {/* Cold start / server switch stage */}
      <AnimatePresence>
        {showStage && (
          <motion.div
            key="np-stage"
            role="status"
            aria-label="Loading video"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={M.FADE.transition}
            style={{ position: "absolute", inset: 0, zIndex: 3 }}
          >
            <LoadingStage
              title={displayTitle}
              backdropUrl={backdropUrl}
              posterUrl={posterUrl}
              message={stageNote}
              initial={stageInitial}
              frame={switchFrame}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* End state: replay button */}
      <AnimatePresence>
        {ended && (
          <motion.button
            key="np-replay"
            type="button"
            className="np-replay"
            onClick={onReplay}
            aria-label="Watch again"
            title="Watch again"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: [0.7, 1.08, 1] }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{
              opacity: { duration: DURATION.FAST, ease: EASE_OUT },
              scale: M.SPRING.PRESS,
            }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: PRESS_SCALE.CONTROL }}
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: 86,
              height: 86,
              borderRadius: "50%",
              border: "none",
              background: "var(--accent, #8652bb)",
              backdropFilter: GLASS_BLUR,
              WebkitBackdropFilter: GLASS_BLUR,
              color: ACCENT_FG,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `${ACCENT_GLOW}, 0 22px 54px rgba(0,0,0,0.5)`,
              zIndex: 3,
            }}
          >
            <IconReplay size={42} />
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
