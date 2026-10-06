import { memo } from "react";
import { motion, useReducedMotion } from "framer-motion";

/* See ArcRing: this dash transition was an inline string, so no
   `prefers-reduced-motion` block could ever reach it. */
const DASH_TRANSITION = "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)";
/* One full turn of the sweep. A rotation period, not an interaction duration,
   so it stays a local constant rather than borrowing the --duration-* scale. */
const SPIN_PERIOD_S = 1.1;

const LoadingArc = memo(({ size = 56, strokeWidth = 2.5, progress = 0 }) => {
  const reduced = useReducedMotion();
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke="rgba(229,9,20,0.18)" strokeWidth={strokeWidth}
        />
      </svg>
      {/* Under reduced motion the sweep freezes instead of spinning forever,
          and dims to 40% so a still ring reads as "loading, held" rather than
          as a paused player. Same treatment the CSS gives .np-tailspin. */}
      <motion.svg
        width={size} height={size}
        style={{ position: "absolute", inset: 0, opacity: reduced ? 0.4 : 1 }}
        animate={reduced ? undefined : { rotate: 360 }}
        transition={{ repeat: Infinity, duration: SPIN_PERIOD_S, ease: "linear" }}
      >
        <defs>
          <linearGradient id="loadArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(229,9,20,0)" />
            <stop offset="55%" stopColor="rgba(229,9,20,0.55)" />
            <stop offset="100%" stopColor="#E50914" />
          </linearGradient>
        </defs>
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke="url(#loadArcGrad)" strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circ * 0.28} ${circ * 0.72}`}
        />
      </motion.svg>
      {progress > 0 && (
        <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id="loadInnerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(229,9,20,0.15)" />
              <stop offset="100%" stopColor="rgba(229,9,20,0.45)" />
            </linearGradient>
          </defs>
          <circle
            cx={size/2} cy={size/2} r={r - strokeWidth * 2}
            fill="none" stroke="url(#loadInnerGrad)" strokeWidth={strokeWidth * 0.5}
            strokeDasharray={2 * Math.PI * (r - strokeWidth * 2)}
            strokeDashoffset={2 * Math.PI * (r - strokeWidth * 2) * (1 - progress)}
            strokeLinecap="round"
            style={{ transition: reduced ? undefined : DASH_TRANSITION }}
            transform={`rotate(-90 ${size/2} ${size/2})`}
          />
        </svg>
      )}
    </div>
  );
});

export default LoadingArc;