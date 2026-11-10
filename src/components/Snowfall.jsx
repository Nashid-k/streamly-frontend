import { useMemo } from "react";
import { useOptionalPreferences } from "../context/preferences";
import { useReducedMotion } from "framer-motion";

/* Seasonal snowfall overlay — mounted once in Layout so it covers every route.
   Active November 1 through December 31 (the whole festive season) or when the
   Christmas theme is selected; the `snowfall` preference is the manual override
   (off = never). Reduced motion (OS or in-app) disables it entirely.
   Transform + opacity only — GPU cheap. */
export default function Snowfall() {
  const prefs = useOptionalPreferences();
  const osReduced = useReducedMotion();
  const reduceMotion = osReduced || !!prefs?.reduceMotion;
  const theme = prefs?.theme;
  const now = new Date();
  const month = now.getMonth(); // 0-based
  // Seasonal window: November 1 through December 31 (the whole festive season,
  // "from Nov 1 till Christmas ends"). Plus the Christmas theme as a manual override.
  const seasonal = (month === 10 || month === 11) || theme === "christmas";
  const enabled = seasonal && prefs?.snowfall !== false && !reduceMotion;

  const flakes = useMemo(() => {
    if (!enabled) return [];
    const count = 48;
    return Array.from({ length: count }, (_, i) => {
      const left = Math.random() * 100;
      const size = 2 + Math.random() * 4; // px
      const duration = 8 + Math.random() * 10; // s
      const delay = Math.random() * 10; // s
      const drift = (Math.random() * 2 - 1) * 60; // px horizontal sway
      const opacity = 0.3 + Math.random() * 0.5;
      return { id: i, left, size, duration, delay, drift, opacity };
    });
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="snowfall" aria-hidden="true">
      {flakes.map((f) => (
        <span
          key={f.id}
          className="snowfall__flake"
          style={{
            left: `${f.left}%`,
            width: `${f.size}px`,
            height: `${f.size}px`,
            animationDuration: `${f.duration}s`,
            animationDelay: `${f.delay}s`,
            opacity: f.opacity,
            "--drift": `${f.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
