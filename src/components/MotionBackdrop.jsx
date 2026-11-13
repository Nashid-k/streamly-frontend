import { memo } from "react";
import { useOptionalPreferences } from "../context/preferences";
import { THEMES } from "../constants/settings";

/* Live motion backdrop for the motion THEMES (Living Tides / Aurora Drift).
   Mounted once in Layout, behind every page surface (z-index -1). A theme
   that carries a `motion` variant gets its CSS-only animated stage; every
   other theme renders nothing and the app keeps its ordinary background.

   Gates (2026-11-13 perf contract):
   · reduceMotion preference or prefers-reduced-motion → not mounted at all
     (the global CSS guard also freezes the drift as belt-and-braces);
   · low-power devices (few cores / little memory) → not mounted: a
     decorative layer must never outrank a frame on constrained hardware;
   · otherwise exactly two composited layers, transform/opacity only —
     see styles/motion-themes.css. */
function MotionBackdrop() {
  const prefs = useOptionalPreferences();
  const theme = THEMES.find((t) => t.id === prefs?.theme);
  if (!theme?.motion) return null;

  if (prefs?.reduceMotion) return null;
  const lowPower =
    typeof navigator !== "undefined" &&
    (navigator.hardwareConcurrency <= 4 ||
      (typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4));
  if (lowPower) return null;

  return (
    <div className={`motion-backdrop motion-backdrop--${theme.motion}`} aria-hidden="true">
      <div className="motion-backdrop__layer motion-backdrop__layer--a" />
      <div className="motion-backdrop__layer motion-backdrop__layer--b" />
    </div>
  );
}

export default memo(MotionBackdrop);
