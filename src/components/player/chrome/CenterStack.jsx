// The centre stack: everything that plays over the middle of the picture.
//
// Z-order top to bottom and mutually exclusive by state:
//   - cold stage  (no frame yet: first load / server / quality / dub switch)
//   - warm stall  (a frame exists but the stream stalled: ring only, no scrim)
//   - paused transport (rewind / play / forward while paused)
//   - replay button (end state)
// The stage and the spinner deliberately carry NO full-frame scrim (the first
// version had one): dimming + blurring the picture during every stall read as a
// broken player.
//
// Each branch fades via AnimatePresence — a `transition` on a conditionally
// mounted node never plays, which is why the spinner once looked frozen.
import { AnimatePresence, motion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import { IS_TOUCH, CENTER_GLYPH_SHADOW } from "./constants";
import { GLASS_BG_STRONG, GLASS_BLUR, GLASS_BORDER } from "./theme";
import { IconSkipBack10, IconSkipForward10, IconPlay, IconReplay } from "./icons";
import { LoadingMessage, LoadingStage, RingSpinner } from "./primitives";

export default function CenterStack({
  showStage,
  stageNote,
  displayTitle,
  backdropUrl,
  posterUrl,
  spinner,
  buffering,
  ended,
  playing,
  status,
  controlsVisible,
  onRewind,
  onTogglePlay,
  onForward,
  onReplay,
}) {
  const M = useMotionTokens();
  return (
    <>
      {/* Cold wait: no frame to preserve, so the stage is the picture. */}
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
            />
          </motion.div>
        )}
      </AnimatePresence>
      {/* Warm stall: the picture stays, only a ring appears. */}
      <AnimatePresence>
        {spinner && !showStage && (
          <motion.div
            key="np-spinner"
            role="status"
            aria-label="Loading video"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={M.FADE.transition}
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 3,
            }}
          >
            <motion.span
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={M.SPRING.SHEET}
              style={{ display: "flex", lineHeight: 0 }}
            >
              <RingSpinner size={56} />
            </motion.span>
            <div
              style={{
                marginTop: 32,
                textAlign: "center",
                textShadow: "0 2px 8px rgba(0,0,0,0.9)",
              }}
            >
              <LoadingMessage title={displayTitle} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {!buffering && !ended && !playing && status === "playing" && (
        <motion.div
          initial={false}
          animate={{ opacity: controlsVisible ? 1 : 0, scale: controlsVisible ? 1 : 0.9 }}
          transition={M.SPRING.SHEET}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: IS_TOUCH ? 20 : 28,
            zIndex: 3,
            pointerEvents: "none",
          }}
        >
          <button
            type="button"
            className="np-icon-btn np-center-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRewind();
            }}
            aria-label="Rewind 10 seconds"
            title="Rewind 10 seconds"
            style={{
              position: "relative",
              width: IS_TOUCH ? 74 : 78,
              height: IS_TOUCH ? 74 : 78,
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
            }}
          >
            <IconSkipBack10 size={IS_TOUCH ? 46 : 50} style={CENTER_GLYPH_SHADOW} />
          </button>
          <button
            type="button"
            className="np-icon-btn np-center-btn"
            onClick={onTogglePlay}
            aria-label="Play"
            title="Play"
            style={{
              width: IS_TOUCH ? 128 : 144,
              height: IS_TOUCH ? 128 : 144,
              borderRadius: "50%",
              border: "none",
              background: "rgba(70,62,55,0.6)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
              boxShadow: "0 16px 44px rgba(0,0,0,0.55)",
              transition: "transform 0.16s cubic-bezier(0.2, 0.8, 0.2, 1)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.04)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
            }}
          >
            {/* Bias the triangle optically: a centred Play glyph reads as
                slightly left-heavy against the circle. Exact drawing from NEW PLAYER UI-UX.html. */}
            <svg
              width={IS_TOUCH ? 68 : 80}
              height={IS_TOUCH ? 68 : 80}
              viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ transform: "translateX(4px)" }}
            >
              <path d="M8 5.5v13l10.5-6.5z" fill="#fff" stroke="#fff" strokeWidth={2.8} strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="np-icon-btn np-center-btn"
            onClick={(e) => {
              e.stopPropagation();
              onForward();
            }}
            aria-label="Fast forward 10 seconds"
            title="Fast forward 10 seconds"
            style={{
              position: "relative",
              width: IS_TOUCH ? 74 : 78,
              height: IS_TOUCH ? 74 : 78,
              borderRadius: "50%",
              border: "none",
              background: "transparent",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "auto",
            }}
          >
            <IconSkipForward10 size={IS_TOUCH ? 46 : 50} style={CENTER_GLYPH_SHADOW} />
          </button>
        </motion.div>
      )}
      {!buffering && ended && (
        <motion.button
          type="button"
          className="np-replay"
          onClick={onReplay}
          aria-label="Watch again"
          title="Watch again"
          // A hairline ring that blooms out once when the end card lands, so
          // the eye is pulled to the only action on screen.
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: [0.7, 1.08, 1] }}
          transition={{
            opacity: { duration: 0.2 },
            scale: M.SPRING.PRESS,
          }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          style={{
            position: "absolute",
            inset: 0,
            margin: "auto",
            width: 84,
            height: 84,
            borderRadius: "50%",
            border: `1px solid ${GLASS_BORDER}`,
            background: GLASS_BG_STRONG,
            backdropFilter: GLASS_BLUR,
            WebkitBackdropFilter: GLASS_BLUR,
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 3,
          }}
        >
          <IconReplay size={42} />
        </motion.button>
      )}
    </>
  );
}