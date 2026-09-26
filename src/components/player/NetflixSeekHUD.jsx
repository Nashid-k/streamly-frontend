import { memo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { SPRING_SNAPPY } from "../../constants/playerUi";

/* YouTube-style rewind / forward badge: a chevron pointing the seek direction
   beside a "+x"/"-x" seconds label (YouTube's double-tap flash) — no circular
   dial, no pill background, just the glyph + text riding on the picture.
   Anchored to its own edge of the frame - left for rewind, right for forward -
   at the vertical position the measured container reports, so it tracks the
   video rather than a fixed offset. Presentational only (pointer-events
   none); it rides above the player chrome and self-fades with the other HUDs. */
const NetflixSeekHUD = memo(function NetflixSeekHUD({ direction, metrics, seconds }) {
  const m = metrics;
  const back = direction === "back";
  // The user-supplied glyph is lucide ChevronRight exactly (40x40, stroke 1.5,
  // round caps/joins); ChevronLeft is its mirror for the rewind side.
  const Icon = back ? ChevronLeft : ChevronRight;
  // Centre the badge with `top` rather than a translate: framer-motion owns
  // `transform` for the scale spring and would clobber a CSS translate.
  const top = Math.round(m.seekCenter - m.seekDiameter / 2);
  // YouTube's layout: forward reads "+10 ›", rewind reads "‹ -10".
  const label = `${back ? "-" : "+"}${seconds}s`;
  const font = Math.max(15, Math.round(m.seekIcon * 0.72));
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
        alignItems: "center",
        gap: Math.max(2, Math.round(font * 0.18)),
        pointerEvents: "none",
        zIndex: 65,
      }}
    >
      {back && <Icon size={m.seekIcon} color="#fff" strokeWidth={1.5} />}
      <span
        style={{
          color: "#fff",
          fontSize: font,
          fontWeight: 700,
          whiteSpace: "nowrap",
          textShadow: "0 1px 4px rgba(0,0,0,0.8), 0 0 14px rgba(0,0,0,0.6)",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {label}
      </span>
      {!back && <Icon size={m.seekIcon} color="#fff" strokeWidth={1.5} />}
    </motion.div>
  );
});

export default NetflixSeekHUD;
