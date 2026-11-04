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
// Player v4 enhancements:
//   - Double-arc SVG spinner with dynamic accent gradient (.ld)
//   - Circular glass big play button on desktop (.big)
//   - Double-tap flash ripple surfaces (.dt.l, .dt.r)
//   - Preserves all cold stage / warm stall / touch transport contracts
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMotionTokens, DURATION, EASE_OUT, PRESS_SCALE } from "../../../constants/motion";
import { IS_TOUCH, CENTER_GLYPH_SHADOW } from "./constants";
import {
  ACCENT,
  ACCENT_FG,
  ACCENT_GLOW,
  GLASS_BG_STRONG,
  GLASS_BLUR,
  GLASS_BORDER,
} from "./theme";
import { IconSkipBack10, IconSkipForward10, IconReplay } from "./icons";
import { LoadingMessage, LoadingStage } from "./primitives";

const CENTER_BTN = {
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
  pointerEvents: "auto",
  boxShadow: "0 16px 44px rgba(0,0,0,0.55)",
};

export default function CenterStack({
  showStage,
  stageNote,
  stageInitial,
  switchFrame,
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
  /* The skip amount actually applied, in seconds — the centre buttons used to
     say "10 seconds" unconditionally, which lied once Seek Time was
     configurable. */
  skipSeconds = 10,
}) {
  // Resolve the preference here rather than relying on the global
  // MotionConfig: the tokens are the contract, and a call site that skips the
  // flag silently loses the reduced-motion cut.
  const M = useMotionTokens(useReducedMotion());
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
              initial={stageInitial}
              frame={switchFrame}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Warm stall: the picture stays, v4 double-arc spinning rings appear. */}
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
              style={{ display: "flex", lineHeight: 0, filter: "drop-shadow(0 0 20px rgba(134,82,187,0.35))" }}
            >
              <div className="ld" style={{ position: "relative", width: 56, height: 56, opacity: 1 }}>
                <svg viewBox="0 0 54 54" width={56} height={56}>
                  <defs>
                    <linearGradient id="g1_center" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="var(--accent, #8652bb)" />
                      <stop offset="100%" stopColor="#fff" />
                    </linearGradient>
                  </defs>
                  <circle className="a1" cx="27" cy="27" r="22" stroke="url(#g1_center)" strokeWidth="3" fill="none" />
                  <circle className="a2" cx="27" cy="27" r="15" stroke="var(--accent, #8652bb)" strokeWidth="3" fill="none" />
                </svg>
              </div>
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

      {/* Paused transport (rewind / play / forward). TOUCH ONLY: primary tap target. */}
      {IS_TOUCH && !buffering && !ended && !playing && status === "playing" && (
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
            gap: IS_TOUCH ? 18 : 26,
            zIndex: 3,
            pointerEvents: controlsVisible ? "auto" : "none",
          }}
        >
          <motion.button
            type="button"
            className="np-icon-btn np-center-btn"
            onClick={(e) => {
              e.stopPropagation();
              onRewind();
            }}
            aria-label={`Rewind ${skipSeconds} seconds`}
            title={`Rewind ${skipSeconds} seconds`}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: PRESS_SCALE.CONTROL }}
            style={{
              ...CENTER_BTN,
              position: "relative",
              width: IS_TOUCH ? 72 : 76,
              height: IS_TOUCH ? 72 : 76,
            }}
          >
            <IconSkipBack10 size={IS_TOUCH ? 44 : 48} style={CENTER_GLYPH_SHADOW} />
          </motion.button>
          <motion.button
            type="button"
            className="np-icon-btn np-center-btn"
            onClick={onTogglePlay}
            aria-label="Play"
            title="Play"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: PRESS_SCALE.CONTROL }}
            style={{
              ...CENTER_BTN,
              width: IS_TOUCH ? 122 : 138,
              height: IS_TOUCH ? 122 : 138,
              border: "none",
              background: ACCENT,
              color: ACCENT_FG,
              boxShadow: `${ACCENT_GLOW}, 0 22px 54px rgba(0,0,0,0.5)`,
            }}
          >
            <svg
              width={IS_TOUCH ? 64 : 76}
              height={IS_TOUCH ? 64 : 76}
              viewBox="0 0 24 24"
              aria-hidden="true"
              style={{ transform: "translateX(4px)" }}
            >
              <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="currentColor" strokeWidth={2.8} strokeLinejoin="round" />
            </svg>
          </motion.button>
          <motion.button
            type="button"
            className="np-icon-btn np-center-btn"
            onClick={(e) => {
              e.stopPropagation();
              onForward();
            }}
            aria-label={`Fast forward ${skipSeconds} seconds`}
            title={`Fast forward ${skipSeconds} seconds`}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: PRESS_SCALE.CONTROL }}
            style={{
              ...CENTER_BTN,
              position: "relative",
              width: IS_TOUCH ? 72 : 76,
              height: IS_TOUCH ? 72 : 76,
            }}
          >
            <IconSkipForward10 size={IS_TOUCH ? 44 : 48} style={CENTER_GLYPH_SHADOW} />
          </motion.button>
        </motion.div>
      )}

      {/* Big center play button on desktop (.big) */}
      {!IS_TOUCH && !buffering && !ended && !playing && status === "playing" && (
        <motion.button
          type="button"
          id="big"
          className="np-icon-btn np-center-btn big"
          onClick={onTogglePlay}
          aria-label="Play"
          title="Play"
          initial={false}
          animate={{ opacity: controlsVisible ? 1 : 0, scale: controlsVisible ? 1 : 0.9 }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: PRESS_SCALE.CONTROL }}
          style={{
            position: "absolute",
            inset: 0,
            margin: "auto",
            width: "5.5em",
            height: "5.5em",
            borderRadius: "50%",
            border: "1px solid rgba(255, 255, 255, 0.16)",
            background: "rgba(10, 14, 20, 0.65)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            color: "#fff",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 18px 48px rgba(0, 0, 0, 0.6), 0 0 32px rgba(134, 82, 187, 0.35)",
            zIndex: 3,
            pointerEvents: controlsVisible ? "auto" : "none",
          }}
        >
          <svg
            width="2.6em"
            height="2.6em"
            viewBox="0 0 24 24"
            aria-hidden="true"
            style={{ transform: "translateX(2px)" }}
          >
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        </motion.button>
      )}

      {/* End state: replay button */}
      <AnimatePresence>
        {!buffering && ended && (
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
              background: ACCENT,
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
