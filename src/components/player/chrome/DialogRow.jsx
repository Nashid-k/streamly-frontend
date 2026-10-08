// One selectable row in the Audio & Subtitles / Servers / Quality / Episodes
// panels. Lifted verbatim from NativePlayerView.jsx.
//
// Module-level, so it has no access to the engine's motion tokens and resolves
// the preference itself — the same value, read from the same hook, so the
// checkmark still collapses to a cut under reduced motion.
import { motion, useReducedMotion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import { IconCheck, IconChevronRight } from "./icons";
import { ACCENT } from "./theme";

export default function DialogRow({ selected, onClick, title, sub, disabled, icon, hasChevron }) {
  const M = useMotionTokens(useReducedMotion());

  const renderTitle = (t) => {
    if (typeof t !== "string") return t;
    const m = t.match(/^(.*?)\s+(HD|4K)$/);
    if (m) {
      return (
        <>
          {m[1]}
          <sup style={{ fontSize: 10, fontWeight: 800, marginLeft: 4, color: ACCENT, position: "relative", top: -5 }}>
            {m[2]}
          </sup>
        </>
      );
    }
    return t;
  };

  return (
    <button
      type="button"
      className={["np-dialog-row", selected ? "selected" : ""].filter(Boolean).join(" ")}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={selected ? true : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        width: "calc(100% - 16px)",
        textAlign: "left",
        margin: "2px 8px",
        padding: sub && !hasChevron ? "8px 12px" : "0 12px",
        minHeight: sub && !hasChevron ? 52 : 48,
        borderRadius: 12,
        border: "none",
        background: selected ? "rgba(255,255,255,0.18)" : "transparent",
        color: selected ? "#fff" : "rgba(255,255,255,0.9)",
        fontWeight: selected ? 600 : 400,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 14.5,
        transition: "background 0.15s ease",
      }}
    >
      <span className="np-dialog-row-icon" style={{ width: 24, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginRight: 12 }}>
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
            <IconCheck size={16} color={ACCENT} />
          </motion.span>
        ) : null}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {renderTitle(title)}
        </span>
        {sub && !hasChevron ? (
          <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{sub}</span>
        ) : null}
      </span>
      {hasChevron && (
        <span
          className="np-dialog-row-val"
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "rgba(255,255,255,0.85)",
            fontSize: 13.5,
          }}
        >
          {sub ? <span>{sub}</span> : null}
          <IconChevronRight size={18} />
        </span>
      )}
    </button>
  );
}