// The Skip Intro / Skip Credits pill matching player-v4 UI/UX and animations.
//
// Placed directly above the transport bar, matching v4 .nxt card positioning:
// - #0d1219 background with translucent border
// - Fluid spring entry/exit animations
// - Theme accent progress hairline & active glow
// - Icon slide right on hover matching .row:hover .chv
import { motion, useReducedMotion } from "framer-motion";

export default function SkipPill({ label, ariaLabel, title, onClick, progress = 0 }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type="button"
      className="np-skip-intro skip-pill"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      title={title ?? ariaLabel ?? label}
      initial={reduceMotion ? false : { opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 420, damping: 28 }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      style={{
        position: "absolute",
        right: "max(1.2em, env(safe-area-inset-right))",
        bottom: "calc(6.4em + env(safe-area-inset-bottom) + (var(--is, 1) - 1) * 1.4em)",
        display: "flex",
        alignItems: "center",
        gap: ".55em",
        padding: ".55em 1.15em",
        background: "#0d1219",
        border: "1px solid #ffffff17",
        borderRadius: "1em",
        boxShadow: "0 .5em 1.4em #0007",
        color: "#fff",
        fontWeight: 600,
        fontSize: "min(15px, 2.3cqw + 5px)",
        cursor: "pointer",
        zIndex: 5,
        overflow: "hidden",
        pointerEvents: "auto",
        transition: "background .2s, border-color .2s, transform .2s",
      }}
    >
      {/* Background progress fill */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "color-mix(in srgb, var(--accent, #8652bb) 14%, transparent)",
          width: `${progress * 100}%`,
          zIndex: 0,
          transition: "width .2s linear",
          pointerEvents: "none",
        }}
      />

      {/* Bottom hairline progress track */}
      <div
        style={{
          position: "absolute",
          left: 0,
          bottom: 0,
          height: "2.5px",
          background: "var(--accent, #8652bb)",
          width: `${progress * 100}%`,
          zIndex: 1,
          transition: "width .2s linear",
          pointerEvents: "none",
        }}
      />

      <span style={{ position: "relative", zIndex: 2, display: "flex", alignItems: "center", gap: ".5em" }}>
        <span>{label}</span>
        <svg
          className="ic chv"
          style={{
            width: "1.25em",
            height: "1.25em",
            stroke: "currentColor",
            strokeWidth: 2.4,
            fill: "none",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            transition: "transform .3s var(--ease)",
          }}
          viewBox="0 0 24 24"
        >
          <path d="m9 5 7 7-7 7" />
        </svg>
      </span>
    </motion.button>
  );
}
