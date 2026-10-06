import { memo } from "react";
import { motion } from "framer-motion";
import { SPRING } from "../../constants/motion";
import { IconChevronsRight } from "./chrome/icons";
import { HUD_GLASS, FONT } from "./chrome/theme";

/* Netflix-mobile hold-to-2x pill: a small badge pinned to the right edge of the
   frame while the hold is active. Decorative only (the video element itself
   runs at 2x); self-fades with the HUD timer when the hold releases.
   Deliberately NOT HUD_POP: the four value HUDs (volume/brightness/aspect/seek)
   share one pop because they are the same gesture repeated, but this one slides
   in from the edge it is pinned to, which is what tells you a hold is active. */
const NetflixHold2xHUD = memo(function NetflixHold2xHUD({ metrics }) {
  const scale = metrics?.scale || 1;
  const font = Math.max(13, Math.round(20 * scale));
  const icon = Math.max(16, Math.round(24 * scale));
  return (
    <motion.div
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={SPRING.SNAPPY}
      aria-hidden="true"
      style={{
        position: "absolute",
        top: metrics.top,
        right: metrics.seekInset,
        display: "flex",
        alignItems: "center",
        gap: Math.round(font * 0.35),
        ...HUD_GLASS,
        borderRadius: 999,
        padding: `${Math.round(font * 0.45)}px ${Math.round(font * 0.8)}px`,
        color: "#fff",
        pointerEvents: "none",
        zIndex: 65,
      }}
    >
      <span style={{ fontSize: font, fontWeight: 800, letterSpacing: 0.5, whiteSpace: "nowrap", fontFamily: FONT }}>2x</span>
      <IconChevronsRight size={icon} color="#fff" strokeWidth={2.2} />
    </motion.div>
  );
});

export default NetflixHold2xHUD;
