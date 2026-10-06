// Transient "Tap to unmute" pill.
//
// Shows only when playback had to start muted because the autoplay policy
// blocked sound, and yields to an open panel for the same reason the skip pill
// does. Lives bottom-left so it never collides with the skip pill on the right.
import { AnimatePresence, motion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import { IconVolumeMute } from "./icons";
import { ACCENT } from "./theme";

export default function TapToUnmutePill({ visible, onUnmute }) {
  const M = useMotionTokens();
  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          key="np-automute"
          type="button"
          initial={{ opacity: 0, y: 14, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.96 }}
          transition={M.SPRING.LIFT}
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
            padding: "8px 14px",
            background: "rgba(0,0,0,0.65)",
            color: "#fff",
            border: "1px solid rgba(255,255,255,0.55)",
            borderRadius: 999,
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            zIndex: 6,
          }}
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
        >
          <IconVolumeMute size={16} color={ACCENT} />
          Tap to unmute
        </motion.button>
      )}
    </AnimatePresence>
  );
}