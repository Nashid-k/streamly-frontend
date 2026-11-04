// The top-left title chip: back button + title/subtitle.
//
// From-scratch redesign (2026-11): the old full-width gradient band is gone.
// The title now lives in a compact floating glass chip that mirrors the deck's
// material, so the top and bottom of the player read as one instrument. It owns
// nothing but presentation and the back action; the close policy stays with the
// player via `onBack`.
import { motion, useReducedMotion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import IconBtn from "./IconBtn";
import { IconArrowLeft } from "./icons";
import { GLASS_BG, GLASS_BLUR, GLASS_BORDER, RADIUS, TEXT_DIM } from "./theme";

export default function ChromeTopBar({ visible, title, subtitle, onBack }) {
  // Matches the deck: both bars resolve the preference themselves so they
  // hide/show on the same curve, cuts included.
  const M = useMotionTokens(useReducedMotion());
  return (
    <motion.div
      initial={M.MODAL_PANEL.initial}
      animate={M.MODAL_PANEL.animate}
      exit={M.MODAL_PANEL.exit}
      transition={M.MODAL_PANEL.transition}
      inert={!visible}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        display: "flex",
        alignItems: "center",
        padding: "var(--np-safe-top, 16px) 20px 0",
        // Only the chip is interactive: the rest of the top band must let a
        // click reach the picture (it toggles the chrome).
        pointerEvents: "none",
        // Same layer as the deck: above the panel dim (5) so Back stays
        // operable while a sheet is open, below the sheet itself (6, painted
        // later). At 4 the dim swallowed it and clicks landed on the backdrop.
        zIndex: 6,
      }}
    >
      <div
        className="np-title-chip"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          minWidth: 0,
          maxWidth: "min(82%, 680px)",
          padding: "5px 20px 5px 5px",
          borderRadius: RADIUS.pill,
          background: GLASS_BG,
          border: `1px solid ${GLASS_BORDER}`,
          backdropFilter: GLASS_BLUR,
          WebkitBackdropFilter: GLASS_BLUR,
          boxShadow: "0 14px 40px rgba(0,0,0,0.42)",
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        <IconBtn size={44} label="Back" onClick={onBack}>
          <IconArrowLeft size={21} />
        </IconBtn>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
            minWidth: 0,
            overflow: "hidden",
            paddingRight: 8,
          }}
        >
          <div
            style={{
              color: "#fff",
              fontWeight: 650,
              fontSize: "clamp(15px, 1.6vw, 18px)",
              letterSpacing: "-0.015em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </div>
          {subtitle ? (
            <div
              style={{
                color: TEXT_DIM,
                fontSize: 12,
                fontWeight: 500,
                letterSpacing: 0.1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
