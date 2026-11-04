import { memo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useMotionTokens } from "../../constants/motion";
import { IconChevronsRight } from "./chrome/icons";
import { HUD_GLASS, ACCENT } from "./chrome/theme";

/* Netflix-mobile hold-to-2x pill: a small badge pinned to the right edge of the
   frame while the hold is active. Decorative only (the video element itself
   runs at 2x); self-fades with the HUD timer when the hold releases.
   Deliberately NOT HUD_POP: the four value HUDs (volume/brightness/aspect/seek)
   share one pop because they are the same gesture repeated, but this one slides
   in from the edge it is pinned to, which is what tells you a hold is active. */
const NetflixHold2xHUD = memo(function NetflixHold2xHUD({ metrics }) {
  const M = useMotionTokens(useReducedMotion());
  const scale = metrics?.scale || 1;
  const font = Math.max(13, Math.round(20 * scale));
  const icon = Math.max(16, Math.round(24 * scale));
  return (
    <motion.div
      initial={M.PILL_IN.initial}
      animate={M.PILL_IN.animate}
      exit={M.PILL_IN.exit}
      transition={M.PILL_IN.transition}
      aria-hidden="true"
      // One-shot status pill, not a value HUD: it narrates the hold by sliding
      // in from the edge it is pinned to (unlike the value HUDs, which share the
      // same HUD_POP pop because they are the same gesture repeated). Kept on
      // PILL_IN on purpose — the test that asserts the shared tokens are adopted
      // by the value HUDs also asserts the two one-shots are NOT folded in.
      style={{
        position: "absolute",
        top: metrics.top,
        right: metrics.seekInset,
        display: "flex",
        alignItems: "center",
        gap: Math.round(font * 0.35),
        ...HUD_GLASS,
        borderRadius: "var(--radius-full)",
        padding: `${Math.round(font * 0.45)}px ${Math.round(font * 0.8)}px`,
        color: "#fff",
        pointerEvents: "none",
        zIndex: 65,
      }}
    >
      <span style={{ fontSize: font, fontWeight: 800, letterSpacing: 0.5, whiteSpace: "nowrap", color: ACCENT, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>2x</span>
      <IconChevronsRight size={icon} color="#fff" strokeWidth={2.2} />
    </motion.div>
  );
});

export default NetflixHold2xHUD;
