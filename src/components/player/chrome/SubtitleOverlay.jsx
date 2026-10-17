// The active subtitle line.
//
// Its own component because the caption has exactly one job — show the current
// cue, cross-fade to the next — and it must not re-render the transport tree on
// every cue change. Keyed on the cue TEXT so a new line cross-fades in rather
// than the old one vanishing mid-read.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";

export default function SubtitleOverlay({ text, controlsVisible, size = 1, background = 1 }) {
  // A leaf that is rendered outside the engine, so it resolves the motion
  // preference itself — a cue cross-fade must collapse to a cut under reduced
  // motion like every other player surface.
  const M = useMotionTokens(useReducedMotion());
  // Styling comes from the provider-parity "Subtitle style" menu: size 0/1/2
  // scales the clamp range, background 0/1/2 picks none / drop-shadow / solid box.
  const fontSize = [
    "clamp(13px, 2.1vw, 20px)",
    "clamp(16px, 2.6vw, 26px)",
    "clamp(19px, 3.2vw, 34px)",
  ][size] || "clamp(16px, 2.6vw, 26px)";
  const textShadow =
    background === 0 ? "none" : "0 2px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)";
  const boxStyle =
    background === 2
      ? { background: "rgba(0,0,0,0.72)", padding: "2px 10px", borderRadius: 8 }
      : null;
  return (
    <AnimatePresence mode="wait">
      {text ? (
        <motion.div
          key={text}
          className="np-subtitle"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={M.FADE.transition}
          style={{
            position: "absolute",
            left: "6%",
            right: "6%",
            // Clears the visible bottom chrome so a cue never sits under the
            // transport row; when the chrome is hidden the caption drops back to
            // a cinematic offset.
            bottom: controlsVisible ? 132 : 64,
            textAlign: "center",
            zIndex: 3,
            pointerEvents: "none",
            lineHeight: 1.4,
            fontSize,
            fontWeight: 700,
            color: "#fff",
            whiteSpace: "pre-line",
            textShadow,
            WebkitTextStroke: "0 0 transparent",
          }}
        >
          <span style={boxStyle}>{text}</span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}