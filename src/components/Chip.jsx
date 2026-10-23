import { motion, useReducedMotion } from "framer-motion";
import { PRESS_SCALE } from "../constants/motion";

/**
 * Chip — shared pill filter/sort control. One source of truth for the
 * active state (accent gradient) so pages no longer restyle pills inline.
 */
export default function Chip({
  children,
  active = false,
  size = "md",
  onClick,
  className = "",
  ...props
}) {
  const reduceMotion = useReducedMotion();
  const sizeClass = size === "sm" ? "chip--sm" : "";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={reduceMotion ? undefined : { scale: 1.05 }}
      whileTap={reduceMotion ? undefined : { scale: PRESS_SCALE.CONTROL }}
      aria-pressed={active}
      className={`chip${active ? " chip--active" : ""} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
