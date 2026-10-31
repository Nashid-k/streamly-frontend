import { motion } from "framer-motion";
import { DURATION, EASE_OUT } from "../constants/motion";

export default function SectionHeader({
  title,
  subtitle,
  count,
  actions,
  style: overrideStyle,
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DURATION.MED, ease: EASE_OUT }}
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "1rem",
        flexWrap: "wrap",
        gap: "0.75rem",
        ...overrideStyle,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
        <h2 className="section-title" style={{ margin: 0 }}>
          {title}
        </h2>
        {count !== undefined && (
          <span
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--text-muted)",
              fontWeight: 500,
            }}
          >
            ({count})
          </span>
        )}
        {subtitle && (
          <span
            style={{
              fontSize: "var(--text-xs)",
              /* --text-muted, not --text-faint: this is informational copy,
               * not a decorative wash — held to the AA contrast line. */
              color: "var(--text-muted)",
              fontWeight: 400,
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
      {actions && <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>{actions}</div>}
    </motion.div>
  );
}
