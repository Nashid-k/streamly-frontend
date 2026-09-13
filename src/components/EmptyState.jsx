import { motion } from "framer-motion";
import { Search, Film, Tv, AlertCircle } from "lucide-react";

const ICONS = {
  search: Search,
  film: Film,
  tv: Tv,
  error: AlertCircle,
};

export default function EmptyState({
  icon = "search",
  title,
  description,
  actions,
  compact = false,
}) {
  const IconComponent = ICONS[icon] || Search;

  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      style={compact ? { padding: "3rem 1rem" } : undefined}
    >
      <div className="empty-state-icon">
        <IconComponent
          size={compact ? 28 : 36}
          color="#52525b"
          strokeWidth={1.5}
        />
      </div>
      {title && <h2 className="empty-state-title">{title}</h2>}
      {description && <p className="empty-state-desc">{description}</p>}
      {actions && <div className="empty-state-actions">{actions}</div>}
    </motion.div>
  );
}
