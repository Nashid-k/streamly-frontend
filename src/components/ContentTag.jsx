import React from "react";
import { DURATION, EASE_OUT } from "../constants/motion";
import { motion, useReducedMotion } from "framer-motion";

/* ContentTag — the one place a small coloured card label is drawn.

   The look lives in styles/ui-kit.css (the `.content-badge` family) so a tone
   can change with the active theme instead of being baked into inline hex
   values. Two forms only:
   • SOLID (`new`) — a positive, already-true state. Accent fill + --on-accent
     ink, so it re-tints with every theme.
   • GLASS (`soon` / `upcoming` / `weeks` / `later` / `live`) — a state of the
     future. Dark translucent pill, coloured ink, 1px tinted ring and a dot.

   NEW stays solid while CountdownBadge is always glass: on a red-accent theme
   both can be red, and the form (plus the pulse ring and Zap glyph) is what
   keeps "just out" readable apart from "out imminently". */

const TONE_CLASS = {
  new: "content-badge--solid",
  accent: "content-badge--accent",
  live: "content-badge--live",
  imminent: "content-badge--imminent",
  soon: "content-badge--soon",
  upcoming: "content-badge--upcoming",
  weeks: "content-badge--weeks",
  later: "content-badge--later",
  neutral: "content-badge--later",
};

export default function ContentTag({ label, tone = "new", reason, dot = true, size = "sm" }) {
  const reduceMotion = useReducedMotion();
  const toneClass = TONE_CLASS[tone] || TONE_CLASS.neutral;

  return (
    <motion.span
      className={`content-badge${size === "sm" ? "" : " content-badge--md"} ${toneClass}`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DURATION.MED, ease: EASE_OUT }}
      title={reason || undefined}
    >
      {dot && <span className="content-badge__dot" aria-hidden="true" />}
      {label}
    </motion.span>
  );
}
