// The Skip Intro / Skip Credits pill.
//
// One component for both, because they were two byte-for-byte copies of the same
// 40-line inline-JSX block that had already drifted in nothing but their label.
// The only things that differ are what it SAYS, what it seeks to, and how full
// its progress hairline is — all props.
//
// `label` (visible) and `ariaLabel`/`title` (accessible name + tooltip) are
// deliberately separate: the visible pill reads "Skip Intro" while assistive tech
// and the tooltip say "Skip the opening credits", and a test asserts that name.
//
// Behaviour note (do not "fix" this into an auto-jump): a wrong tail estimate is
// always a visible button, never an unrequested seek. This seeks only on press.
import { motion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import { IconSkipForward10 } from "./icons";
import { GLASS_BG, GLASS_BLUR, GLASS_BORDER, RADIUS, FONT } from "./theme";

export default function SkipPill({ label, ariaLabel, title, onClick, progress = 0 }) {
  const M = useMotionTokens();
  return (
    <motion.button
      type="button"
      className="np-skip-intro"
      onClick={onClick}
      aria-label={ariaLabel ?? label}
      title={title ?? ariaLabel ?? label}
      {...M.PILL_IN}
      whileTap={{ scale: 0.97 }}
      style={{
        position: "absolute",
        // SAFE_BOTTOM + 96px keeps it above the transport row. The safe-area
        // policy is published as a CSS var by the chrome shell, so no leaf
        // component has to know whether this is touch or desktop.
        bottom: "calc(var(--np-safe-bottom, 24px) + 96px)",
        right: 24,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 20px",
        background: GLASS_BG,
        backdropFilter: GLASS_BLUR,
        WebkitBackdropFilter: GLASS_BLUR,
        color: "#fff",
        border: `1px solid ${GLASS_BORDER}`,
        borderRadius: RADIUS.card,
        fontFamily: FONT,
        fontWeight: 700,
        fontSize: 16,
        letterSpacing: "-0.01em",
        cursor: "pointer",
        zIndex: 5,
        overflow: "hidden",
        pointerEvents: "auto",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          background: "rgba(255, 255, 255, 0.2)",
          width: `${progress * 100}%`,
          zIndex: 0,
        }}
      />
      <IconSkipForward10 size={17} />
      {label}
    </motion.button>
  );
}