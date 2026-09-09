import { motion, useReducedMotion } from "framer-motion";

export default function Button({
  children,
  variant = "secondary",
  size = "md",
  pill = false,
  icon: Icon,
  iconRight: IconRight,
  onClick,
  disabled = false,
  className = "",
  style: overrideStyle,
  ...props
}) {
  const reduceMotion = useReducedMotion();
  const sizeClass = size === "sm" ? "btn-sm" : "";
  const pillClass = pill ? "btn-pill" : "";
  const variantClass = `btn-${variant}`;

  return (
    <motion.button
      className={`btn ${variantClass} ${sizeClass} ${pillClass} ${className}`}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled || reduceMotion ? undefined : { scale: 1.03 }}
      whileTap={disabled || reduceMotion ? undefined : { scale: 0.97 }}
      style={{
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        ...overrideStyle,
      }}
      {...props}
    >
      {Icon && <Icon size={size === "sm" ? 14 : 16} />}
      {children}
      {IconRight && <IconRight size={size === "sm" ? 14 : 16} />}
    </motion.button>
  );
}
