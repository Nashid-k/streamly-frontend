import React from "react";
import { motion, useReducedMotion } from "framer-motion";

/* ContentTag — the one place a small coloured card label is drawn.
   Every content tag in the app was inline-styled JSX with its own hex values,
   which is why the green "Airing" badge ended up duplicated in three files.
   This component centralises the look so a new tag cannot quietly introduce a
   fifth shade of red.

   The NEW tone is deliberately NOT the countdown's red. CountdownBadge pulses
   (it animates a ring) and means "not out yet — out imminently". This tag is
   static and means "this is out, and it is new". Same hue family on purpose —
   both are "attention, time-sensitive" — but a viewer must be able to tell them
   apart at a glance, so one pulses with a zap glyph and one does not. */

const TONES = {
  new: {
    background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.22)",
    // Soft, steady glow. No pulse: pulsing is CountdownBadge's signature and
    // reusing it here would blur the two states together.
    boxShadow: "0 2px 10px rgba(220,38,38,0.45)",
    dot: "rgba(255,255,255,0.95)",
  },
  neutral: {
    background: "rgba(0,0,0,0.7)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.1)",
    boxShadow: "none",
    dot: "rgba(255,255,255,0.7)",
  },
};

export default function ContentTag({ label, tone = "new", reason, dot = true, size = "sm" }) {
  const reduceMotion = useReducedMotion();
  const t = TONES[tone] || TONES.neutral;
  const pad = size === "sm" ? "2px 6px" : "3px 9px";
  const fontSize = size === "sm" ? "0.5rem" : "0.6rem";

  return (
    <motion.span
      initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      title={reason || undefined}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "3px",
        padding: pad,
        borderRadius: "3px",
        background: t.background,
        color: t.color,
        border: t.border,
        boxShadow: t.boxShadow,
        fontSize,
        fontWeight: 800,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
        lineHeight: 1.35,
        // The badge row already disables pointer events; keep text crisp.
        textShadow: "0 1px 2px rgba(0,0,0,0.28)",
        userSelect: "none",
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: "4px",
            height: "4px",
            borderRadius: "50%",
            background: t.dot,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </motion.span>
  );
}
