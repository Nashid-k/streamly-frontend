import { motion } from "framer-motion";

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
  const sizeClass = size === "sm" ? "chip--sm" : "";
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-pressed={active}
      className={`chip${active ? " chip--active" : ""} ${sizeClass} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}