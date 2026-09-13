import React, { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Clock, Zap } from "lucide-react";
import { getCountdown, getCountdownUrgency } from "../utils/releaseCalendar";

/**
 * CountdownBadge — Animated countdown timer for upcoming releases
 *
 * Shows on MovieCard for content with a known release date.
 * Pulses red for imminent releases, calm blue for distant ones.
 */
export default function CountdownBadge({ releaseDate, platform, compact = false }) {
  const [countdown, setCountdown] = useState(() => getCountdown(releaseDate, platform));
  const reduceMotion = useReducedMotion();

  // Update every minute for live countdown
  useEffect(() => {
    if (!releaseDate || countdown.isReleased) return;
    const interval = setInterval(() => {
      setCountdown(getCountdown(releaseDate, platform));
    }, 60000);
    return () => clearInterval(interval);
  }, [releaseDate, platform, countdown.isReleased]);

  if (!releaseDate || countdown.isReleased) return null;

  const urgency = getCountdownUrgency(countdown.days);

  const styles = {
    imminent: {
      background: "linear-gradient(135deg, rgba(239,68,68,0.9), rgba(220,38,38,0.9))",
      text: "#fff",
      shadow: "0 2px 8px rgba(239,68,68,0.4)",
      animate: true,
    },
    soon: {
      background: "linear-gradient(135deg, rgba(249,115,22,0.9), rgba(234,88,12,0.9))",
      text: "#fff",
      shadow: "0 2px 8px rgba(249,115,22,0.3)",
      animate: false,
    },
    upcoming: {
      background: "rgba(96,165,250,0.15)",
      text: "#60a5fa",
      shadow: "none",
      animate: false,
    },
    future: {
      background: "rgba(255,255,255,0.08)",
      text: "#a1a1aa",
      shadow: "none",
      animate: false,
    },
  };

  const s = styles[urgency] || styles.future;
  const pulse = s.animate && !reduceMotion;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{
        opacity: 1,
        scale: 1,
        ...(pulse ? {
          boxShadow: [
            "0 0 0 0 rgba(239,68,68,0.4)",
            "0 0 0 6px rgba(239,68,68,0)",
            "0 0 0 0 rgba(239,68,68,0.4)",
          ],
        } : {}),
      }}
      transition={{
        duration: pulse ? 2 : 0.3,
        repeat: pulse ? Infinity : 0,
        ease: "easeInOut",
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? "3px" : "5px",
        padding: compact ? "2px 6px" : "3px 8px",
        borderRadius: "6px",
        background: s.background,
        color: s.text,
        fontSize: compact ? "0.5rem" : "0.6rem",
        fontWeight: 800,
        letterSpacing: "0.04em",
        boxShadow: s.shadow,
        whiteSpace: "nowrap",
        backdropFilter: "blur(4px)",
      }}
      title={`Releases ${countdown.text}`}
    >
      {urgency === "imminent" ? (
        <Zap size={compact ? 8 : 10} fill="currentColor" stroke="none" />
      ) : (
        <Clock size={compact ? 8 : 10} />
      )}
      {countdown.text}
    </motion.div>
  );
}
