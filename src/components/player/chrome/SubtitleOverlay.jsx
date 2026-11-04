// The active subtitle line matching player-v4.html:
// - .capw wrapper with lift calculation above controls
// - .cap container with font size calc(1.35em * var(--cz, 1)) and color var(--cc, #fff)
// - .cl caption line with text shadow, box, or outline based on data-cb
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";

export default function SubtitleOverlay({
  text,
  controlsVisible: _controlsVisible,
  size = 1,
  background: _background = 1,
  fontFamily,
  color = "#fff",
  scale = 100,
}) {
  const M = useMotionTokens(useReducedMotion());

  const sizeScale = (Number(scale) || 100) / 100;
  const baseFontSize = [
    "clamp(13px, 2.1vw, 20px)",
    "clamp(16px, 2.6vw, 26px)",
    "clamp(19px, 3.2vw, 34px)",
  ][size] || "clamp(16px, 2.6vw, 26px)";
  const fontSize =
    sizeScale === 1
      ? baseFontSize
      : `calc(${baseFontSize} * ${sizeScale.toFixed(2)})`;

  return (
    <AnimatePresence mode="wait">
      {text ? (
        <motion.div
          key={text}
          className="capw"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={M.FADE.transition}
          aria-hidden="true"
        >
          <div
            className="cap np-subtitle"
            id="cap"
            style={{
              fontFamily,
              color,
              fontSize,
            }}
          >
            <div className="cl">{text}</div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
