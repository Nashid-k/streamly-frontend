import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

const SPRING = { type: "spring", stiffness: 500, damping: 34, mass: 0.9 };

export default function Popover({
  isOpen,
  onClose,
  triggerRef,
  className = "",
  style: overrideStyle,
  children,
  align = "right",
  scrollable = false,
  role = "menu",
  ...props
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e) => {
      const insideTrigger = triggerRef?.current?.contains(e.target);
      const insideSelf = ref.current?.contains(e.target);
      if (!insideTrigger && !insideSelf) onClose?.();
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={ref}
          role={role || undefined}
          className={`glass-popover ${scrollable ? "glass-popover--scrollable" : ""} ${className}`}
          initial={{ opacity: 0, y: 15, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={SPRING}
          style={{
            right: align === "right" ? 0 : undefined,
            left: align === "left" ? 0 : undefined,
            ...overrideStyle,
          }}
          {...props}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}