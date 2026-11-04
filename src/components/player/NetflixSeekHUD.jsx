import { memo } from "react";
import { motion } from "framer-motion";
import { HUD_POP } from "../../constants/motion";
import { IconChevronLeft, IconChevronRight } from "./chrome/icons";
import { ACCENT, HUD_GLASS } from "./chrome/theme";

/* Rewind / forward badge: a chevron pointing the seek direction beside a
   "+x"/"-x" seconds label, riding on the picture. From-scratch redesign
   (2026-11): it is now one glass capsule instead of loose glyphs, anchored to
   its own edge of the frame — left for rewind, right for forward — at the
   vertical position the measured container reports. Presentational only
   (pointer-events none); it rides above the player chrome and self-fades with
   the other HUDs. */
const NetflixSeekHUD = memo(function NetflixSeekHUD({ direction, metrics, seconds }) {
  const m = metrics;
  const back = direction === "back";
  const Icon = back ? IconChevronLeft : IconChevronRight;
  // Centre the badge with `top` rather than a translate: framer-motion owns
  // `transform` for the scale spring and would clobber a CSS translate.
  const top = Math.round(m.seekCenter - m.seekDiameter / 2);
  // Forward reads "+10 ›", rewind reads "‹ -10".
  const label = `${back ? "-" : "+"}${seconds}s`;
  const font = Math.max(15, Math.round(m.seekIcon * 0.72));
  return (
    <motion.div
      initial={HUD_POP.initial}
      animate={HUD_POP.animate}
      exit={HUD_POP.exit}
      transition={HUD_POP.transition}
      aria-hidden="true"
      style={{
        position: "absolute",
        top,
        ...(back ? { left: m.seekInset } : { right: m.seekInset }),
        display: "flex",
        alignItems: "center",
        gap: Math.max(2, Math.round(font * 0.16)),
        padding: `${Math.round(font * 0.42)}px ${Math.round(font * 0.72)}px`,
        borderRadius: 999,
        ...HUD_GLASS,
        pointerEvents: "none",
        zIndex: 65,
      }}
    >
      {back && <Icon size={m.seekIcon} color={ACCENT} strokeWidth={2.4} />}
      <span
        style={{
          color: "#fff",
          fontSize: font,
          fontWeight: 750,
          whiteSpace: "nowrap",
          fontVariantNumeric: "tabular-nums",
          textShadow: "0 1px 4px rgba(0,0,0,0.6)",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        {label}
      </span>
      {!back && <Icon size={m.seekIcon} color={ACCENT} strokeWidth={2.4} />}
    </motion.div>
  );
});

export default NetflixSeekHUD;
