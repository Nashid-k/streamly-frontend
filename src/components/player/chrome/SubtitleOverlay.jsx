// The active subtitle line matching player-v4.html:
// - .capw wrapper with lift calculation above controls (--lift: calc(5.8em + (var(--is, 1) - 1) * 1.4em))
// - .cap container with font size calc(1.35em * var(--cz, 1)) and color var(--cc, #fff)
// - .cl caption line with text shadow, box, or outline based on data-cb
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";

export default function SubtitleOverlay({
  text,
  controlsVisible,
  size: _size = 1,
  background: _background = 1,
  subBgStyle,
  fontFamily,
  color,
  scale = 100,
}) {
  const M = useMotionTokens(useReducedMotion());

  const cbMode = subBgStyle || (_background === 2 ? "box" : _background === 3 ? "outline" : "shadow");
  const sizeScale = (Number(scale) || 100) / 100;
  // If a custom scale is provided outside default 100%, adjust font size
  const customFontSize =
    sizeScale !== 1 ? `calc(1.35em * var(--cz, 1) * ${sizeScale.toFixed(2)})` : undefined;

  return (
    <div
      className={["capw", controlsVisible ? "lifted" : ""].filter(Boolean).join(" ")}
      data-cb={cbMode}
      aria-hidden="true"
    >
      <div
        className="cap np-subtitle"
        id="cap"
        data-cb={cbMode}
        style={{
          fontFamily: fontFamily || undefined,
          color: color || undefined,
          fontSize: customFontSize,
        }}
      >
        <AnimatePresence mode="wait">
          {text ? (
            <motion.div
              key={text}
              className="cl"
              data-cb={cbMode}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={M.FADE.transition}
            >
              {text}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
