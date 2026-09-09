import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronUp } from "lucide-react";

/**
 * BackToTop button — appears after scrolling 600px down, but stays hidden
 * while the video player is open (matches GlobalShortcuts' player detection)
 * so it never overlaps the player UI.
 */
const PLAYER_IFRAME_SELECTOR =
  'iframe[src*="cinesrc"], iframe[src*="vidlink"], iframe[src*="vidsrc"]';

function isPlayerActive() {
  return !!document.querySelector(PLAYER_IFRAME_SELECTOR);
}

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () =>
      setVisible(window.scrollY > 600 && !isPlayerActive());
    // Re-evaluate while idle (e.g. player opens/closes without a scroll event).
    const startPlayerCheck = () => {
      if (window.scrollY > 600 && !isPlayerActive()) setVisible(true);
      else if (isPlayerActive()) setVisible(false);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    const interval = window.setInterval(startPlayerCheck, 1500);
    startPlayerCheck();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.7, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.7, y: 20 }}
          transition={{ type: "spring", stiffness: 400, damping: 28 }}
          whileHover={{ scale: 1.1, y: -3 }}
          whileTap={{ scale: 0.93 }}
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          className="back-to-top-btn"
          style={{
            position: "fixed",
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
            right: "1.5rem",
            zIndex: 998,
            width: "44px",
            height: "44px",
            borderRadius: "50%",
            background: "rgba(9, 9, 11, 0.9)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.15)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
          }}
        >
          <ChevronUp size={20} />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
