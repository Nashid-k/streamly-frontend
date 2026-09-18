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

const SCROLL_THRESHOLD = 600;

function isPlayerActive() {
  return !!document.querySelector(PLAYER_IFRAME_SELECTOR);
}

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let interval = null;

    // Re-evaluate while idle — e.g. the player opens/closes without a scroll
    // event. The check only runs while the button can actually be shown
    // (scrolled past threshold), so we never poll the DOM at the top.
    const startPlayerCheck = () => {
      if (window.scrollY > SCROLL_THRESHOLD) {
        setVisible(!isPlayerActive());
        if (!interval) {
          interval = window.setInterval(() => {
            if (window.scrollY <= SCROLL_THRESHOLD) {
              window.clearInterval(interval);
              interval = null;
              setVisible(false);
              return;
            }
            setVisible(!isPlayerActive());
          }, 1500);
        }
      } else {
        setVisible(false);
        if (interval) {
          window.clearInterval(interval);
          interval = null;
        }
      }
    };

    const handleScroll = () => startPlayerCheck();
    window.addEventListener("scroll", handleScroll, { passive: true });
    startPlayerCheck();
    return () => {
      window.removeEventListener("scroll", handleScroll);
      if (interval) window.clearInterval(interval);
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
            background: "rgba(255,255,255,0.10)",
            backdropFilter: "blur(20px) saturate(150%)",
            WebkitBackdropFilter: "blur(20px) saturate(150%)",
            border: "2px solid #95ff50",
            color: "#fff",
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
