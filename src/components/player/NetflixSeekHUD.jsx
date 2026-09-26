import { memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { SPRING_SNAPPY } from "../../constants/playerUi";

/* YouTube-style rewind / forward badge: a chunky chevron pointing the seek
   direction with a "seconds" caption under it (YouTube's double-tap flash
   instead of Netflix's circular-arrow dial). Anchored to its own edge of the
   frame - left for rewind, right for forward - at the vertical position the
   measured container reports, so it tracks the video rather than a fixed
   offset. Presentational only (pointer-events none); it rides above the
   player chrome and self-fades with the other HUDs. */
const NetflixSeekHUD = memo(function NetflixSeekHUD({ direction, metrics, seconds }) {
  const m = metrics;
  const back = direction === "back";
  // The user-supplied glyph is lucide ChevronRight exactly (40x40, stroke 1.5,
  // round caps/joins); ChevronLeft is its mirror for the rewind side.
  const Icon = back ? ChevronLeft : ChevronRight;
  // Centre the badge with `top` rather than a translate: framer-motion owns
  // `transform` for the scale spring and would clobber a CSS translate.
  const top = Math.round(m.seekCenter - m.seekDiameter / 2);
  // Chevron glyph size relative to the circle, matching the 40/84 ratio of the
  // supplied 40x40 icon in an 84px badge.
  const chevSize = Math.round(m.seekDiameter * 0.48);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.86 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={SPRING_SNAPPY}
      aria-hidden="true"
      style={{
        position: "absolute",
        top,
        ...(back ? { left: m.seekInset } : { right: m.seekInset }),
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: m.labelGap,
        pointerEvents: "none",
        zIndex: 65,
      }}
    >
      <div
        style={{
          width: m.seekDiameter,
          height: m.seekDiameter,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(20,20,20,0.72)",
          border: "1px solid rgba(255,255,255,0.28)",
          boxShadow: "0 12px 36px rgba(0,0,0,0.6)",
        }}
      >
        <Icon size={chevSize} color="#fff" strokeWidth={1.5} />
      </div>
      <span
        style={{
          color: "#fff",
          fontSize: m.seekFont,
          fontWeight: 700,
          background: "rgba(0,0,0,0.88)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 6,
          padding: `${Math.max(3, Math.round(m.seekFont * 0.35))}px ${Math.max(6, Math.round(m.seekFont * 0.7))}px`,
          whiteSpace: "nowrap",
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {seconds} seconds
      </span>
    </motion.div>
  );
});

export default NetflixSeekHUD;
