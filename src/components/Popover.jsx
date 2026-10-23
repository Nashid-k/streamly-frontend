import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MotionLeaf } from "./MotionLeaf";

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
  const openerRef = useRef(null);
  // The popover owns the keyboard path: a menu that opens with focus still on
  // the trigger makes every item a Tab-order detour through the page behind it.
  // Kept in refs so re-renders (inline onClose is the norm here) cannot re-run
  // the effect and yank focus back to the first item mid-interaction.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Unconditional: the popover's own motion.div mounts inside `{isOpen && ...}`.
  const L = new MotionLeaf();

  useEffect(() => {
    if (!isOpen) {
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
      return undefined;
    }

    openerRef.current = document.activeElement;

    const items = () => {
      const panel = ref.current;
      if (!panel) return [];
      return [
        ...panel.querySelectorAll(
          "button:not([disabled]), [href], [role='menuitem']:not([disabled]), [role='menuitemradio']:not([disabled]), [role='option']:not([disabled])",
        ),
      ].filter((el) => !el.hidden);
    };

    const handlePointerDown = (e) => {
      const insideTrigger = triggerRef?.current?.contains(e.target);
      const insideSelf = ref.current?.contains(e.target);
      if (!insideTrigger && !insideSelf) onCloseRef.current?.();
    };

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key === "Tab") {
        // A menu is not a modal: Tab leaves it. Close first, so focus lands on
        // the trigger and the browser's own Tab moves on from there rather than
        // walking every item one press at a time.
        onCloseRef.current?.();
        return;
      }
      // WAI-ARIA menu keyboard interface. Without this the only way between
      // items would be Tab, which the branch above deliberately gives back to
      // the page — leaving items 2..n unreachable without a mouse.
      const list = items();
      if (list.length === 0) return;
      const current = list.indexOf(document.activeElement);
      let next = null;
      if (e.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % list.length;
      else if (e.key === "ArrowUp") next = current < 0 ? list.length - 1 : (current - 1 + list.length) % list.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = list.length - 1;
      if (next === null) return;
      e.preventDefault();
      list[next].focus();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    items()[0]?.focus?.({ preventScroll: true });

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, triggerRef]);

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
          transition={L.Spring.POPOVER}
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