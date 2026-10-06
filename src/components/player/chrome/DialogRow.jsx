// One selectable row in the Audio & Subtitles / Servers / Quality / Episodes
// panels. Lifted verbatim from NativePlayerView.jsx.
//
// Module-level, so it has no access to the engine's motion tokens and resolves
// the preference itself — the same value, read from the same hook, so the
// checkmark still collapses to a cut under reduced motion.
import { motion, useReducedMotion } from "framer-motion";
import { Check, ChevronRight } from "lucide-react";
import { useMotionTokens } from "../../../constants/motion";
import { ACCENT } from "./theme";

export default function DialogRow({ selected, onClick, title, sub, disabled, icon, hasChevron }) {
  const M = useMotionTokens(useReducedMotion());
  return (
    <button
      type="button"
      className="np-dialog-row"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={selected ? true : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "10px 0",
        minHeight: 44,
        borderRadius: 0,
        border: "none",
        background: "transparent",
        color: selected ? "#fff" : "rgba(255,255,255,0.82)",
        fontWeight: selected ? 700 : 400,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 15,
      }}
    >
      <span style={{ width: 22, display: "flex", alignItems: "center", flexShrink: 0 }}>
        {icon ? (
          icon
        ) : selected ? (
          // The check itself pops, so a selection change is felt, not just seen.
          <motion.span
            key={`check-${title}`}
            initial={M.CHECK_POP.initial}
            animate={M.CHECK_POP.animate}
            transition={M.CHECK_POP.transition}
            style={{ display: "flex" }}
          >
            <Check size={16} color={ACCENT} />
          </motion.span>
        ) : null}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {title}
        </span>
        {sub ? (
          <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{sub}</span>
        ) : null}
      </span>
      {hasChevron && (
        <span style={{ display: "flex", alignItems: "center", color: "rgba(255,255,255,0.5)" }}>
          <ChevronRight size={18} />
        </span>
      )}
    </button>
  );
}