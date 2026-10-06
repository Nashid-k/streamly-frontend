import { memo } from "react";
import { motion } from "framer-motion";
import { HUD_POP } from "../../constants/motion";
import { IconChevronLeft, IconChevronRight } from "./chrome/icons";
import { FONT } from "./chrome/theme";

/* Rewind / forward badge: a chevron pointing the seek direction beside a
   "+x"/"-x" seconds label, riding on the picture. Anchored to its own edge of
   the frame — left for rewind, right for forward — at the vertical position the
   measured container reports. Presentational only (pointer-events none); it
   rides above the player chrome and self-fades with the other HUDs. */
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
        gap: Math.max(2, Math.round(font * 0.18)),
        pointerEvents: "none",
        zIndex: 65,
      }}
    >
      {back && <Icon size={m.seekIcon} color="#fff" strokeWidth={2} />}
      <span
        style={{
          color: "#fff",
          fontSize: font,
          fontWeight: 700,
          whiteSpace: "nowrap",
          textShadow: "0 1px 4px rgba(0,0,0,0.8), 0 0 14px rgba(0,0,0,0.6)",
          fontFamily: FONT,
        }}
      >
        {label}
      </span>
      {!back && <Icon size={m.seekIcon} color="#fff" strokeWidth={2} />}
    </motion.div>
  );
});

export default NetflixSeekHUD;