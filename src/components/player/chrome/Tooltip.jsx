// Design's hover tooltip: a dark capsule under the control with an optional
// keyboard badge (the mock's "k / c / t / f" chips). Rendered in a portal and
// positioned from the wrapper's bounding rect so it can float above the chrome
// without escaping the picture. Fades on mouse-enter / keyboard focus; the
// reduced-motion variant drops the slide via player.css.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

export default function Tooltip({ tip, kbd, children }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const wrapRef = useRef(null);

  const measure = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ left: r.left + r.width / 2, top: r.top - 10 });
  };

  const show = () => {
    measure();
    setOpen(true);
  };

  useEffect(() => {
    if (open) {
      const tick = () => measure();
      window.addEventListener("resize", tick);
      window.addEventListener("scroll", tick, { capture: true, passive: true });
      return () => {
        window.removeEventListener("resize", tick);
        window.removeEventListener("scroll", tick, { capture: true });
      };
    }
    return undefined;
  }, [open]);

  return (
    <span
      ref={wrapRef}
      className="np-tip-wrap"
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={(e) => {
        if (e.currentTarget.contains(e.relatedTarget)) return;
        setOpen(false);
      }}
      style={{ display: "inline-flex", alignItems: "center" }}
    >
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                className="np-tip"
                role="tooltip"
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4, scale: 0.97 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                style={{
                  position: "fixed",
                  left: pos.left,
                  top: pos.top,
                  transform: "translate(-50%, -100%)",
                  zIndex: 999,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 16px",
                  borderRadius: 12,
                  background: "rgba(60,55,45,0.76)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  color: "#fff",
                  fontSize: 13.5,
                  fontWeight: 500,
                  letterSpacing: 0.2,
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}
              >
                <span>{tip}</span>
                {kbd ? <span className="np-tip-key">{kbd}</span> : null}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </span>
  );
}