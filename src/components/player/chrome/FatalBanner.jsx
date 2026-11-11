// Fatal failure banner matching player-v4.html (.nxt#err):
// - Dark obsidian container (#0d1219, subtle border, shadow)
// - role="alert" message
// - .nxt-a actions: .nxb (Try again / Retry) and .nxb.sec (Back to browse)
import { motion, useReducedMotion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";

export default function FatalBanner({ message, onRetry, onBack }) {
  const M = useMotionTokens(useReducedMotion());
  if (!message) return null;
  return (
    <motion.div
      key="np-fatal"
      initial={M.MODAL_PANEL.initial}
      animate={M.MODAL_PANEL.animate}
      exit={M.MODAL_PANEL.exit}
      transition={M.MODAL_PANEL.transition}
      id="err"
      className="np-fatal nxt"
      style={{
        position: "absolute",
        bottom: "calc(6.4em + env(safe-area-inset-bottom))",
        left: "max(1em, env(safe-area-inset-left))",
        right: "max(1em, env(safe-area-inset-right))",
        maxWidth: "min(34em, calc(100% - 2em))",
        margin: "0 auto",
        zIndex: 7,
        background: "#0d1219",
        border: "1px solid rgba(var(--white-rgb), 0.09)",
        borderRadius: "1.1em",
        boxShadow: "0 .5em 1.4em rgba(var(--black-rgb), 0.47)",
        padding: "1em 1.1em",
        display: "flex",
        flexDirection: "column",
        gap: ".7em",
      }}
    >
      <b role="alert" style={{ display: "block", color: "var(--white)", lineHeight: 1.4, fontSize: "0.95em" }}>
        {message}
      </b>
      <div className="nxt-a" style={{ display: "flex", gap: ".6em", marginTop: ".2em" }}>
        <button
          type="button"
          className="np-fatal-btn nxb"
          id="retry"
          onClick={onRetry}
          style={{
            flex: 1,
            minHeight: 44,
            padding: ".5em 1em",
            borderRadius: ".8em",
            background: "var(--accent, #8652bb)",
            color: "var(--white)",
            fontWeight: 600,
            fontSize: "0.95em",
            border: 0,
            cursor: "pointer",
            transition: "transform .2s var(--ease), filter .2s",
          }}
        >
          Try again
        </button>
        <button
          type="button"
          className="np-fatal-btn nxb sec"
          aria-label="Back to browse"
          onClick={onBack}
          style={{
            flex: 1,
            minHeight: 44,
            padding: ".5em 1em",
            borderRadius: ".8em",
            background: "rgba(var(--white-rgb), 0.1)",
            color: "var(--white)",
            fontWeight: 600,
            fontSize: "0.95em",
            border: 0,
            cursor: "pointer",
            transition: "transform .2s var(--ease), filter .2s",
          }}
        >
          Back
        </button>
      </div>
    </motion.div>
  );
}
