import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { PRESS_SCALE } from "../constants/motion";
import { MotionLeaf } from "./MotionLeaf";
import { ChevronUp } from "lucide-react";

/**
 * BackToTop button — appears after scrolling 600px down, but stays hidden
 * while the video player is open (matches GlobalShortcuts' player detection)
 * so it never overlaps the player UI.
 */
const SCROLL_THRESHOLD = 600;

export default function BackToTop() {
  const { pathname } = useLocation();
  const [visible, setVisible] = useState(false);
  const L = MotionLeaf();
  const isPlayerActive = pathname.startsWith("/watch/");
  const scrollBehavior = L.reduced ? "auto" : "smooth";

  useEffect(() => {
    let frameId = 0;

    const startPlayerCheck = () => {
      if (window.scrollY > SCROLL_THRESHOLD) {
        const nextVisible = !isPlayerActive;
        setVisible((prev) => (prev === nextVisible ? prev : nextVisible));
      } else {
        setVisible((prev) => (prev ? false : prev));
      }
    };

    const handleScroll = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(() => {
        startPlayerCheck();
        frameId = 0;
      });
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    startPlayerCheck();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [isPlayerActive]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.7, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.7, y: 20 }}
          transition={L.Spring.LIFT}
          whileHover={{ scale: 1.1, y: -3 }}
          whileTap={{ scale: PRESS_SCALE.ICON }}
          onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior })}
          aria-label="Back to top"
          className="back-to-top-btn"
          style={{
            position: "fixed",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
            right: "1.5rem",
            /* One rung below --z-sticky, where the header and the mobile bottom
               nav sit, so the button never paints over either — expressed as an
               offset from the ladder instead of a magic 998. */
            zIndex: "calc(var(--z-sticky) - 2)",
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: "rgba(255,255,255,0.10)",
            backdropFilter: "blur(20px) saturate(150%)",
            WebkitBackdropFilter: "blur(20px) saturate(150%)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "var(--white)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
          }}
        >
          <ChevronUp size={20} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
