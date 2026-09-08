import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import slugify from "slugify";


/**
 * LeavingSoonBanner — Urgent alert for content leaving a platform
 *
 * Shows when a movie/show in the user's watchlist or browsing
 * is about to leave a streaming platform.
 */
export default function LeavingSoonBanner({ items = [], maxDisplay = 3 }) {
  const navigate = useNavigate();
  if (!items || items.length === 0) return null;

  const displayed = items.slice(0, maxDisplay);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: "linear-gradient(135deg, rgba(239,68,68,0.08), rgba(251,191,36,0.04))",
        border: "1px solid rgba(239,68,68,0.15)",
        borderRadius: "14px",
        padding: "16px",
        marginBottom: "1.5rem",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <div style={{
          width: "28px", height: "28px", borderRadius: "8px",
          background: "linear-gradient(135deg, #ef4444, #dc2626)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <AlertTriangle size={14} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#fff" }}>
            Leaving Soon
          </div>
          <div style={{ fontSize: "0.7rem", color: "#a1a1aa" }}>
            {items.length} title{items.length > 1 ? "s" : ""} will be removed soon
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {displayed.map((item, idx) => (
          <motion.div
            key={item.id || idx}
            whileHover={{ background: "rgba(255,255,255,0.06)" }}
            onClick={() => {
              const slug = slugify(item.title, { lower: true, strict: true });
              navigate(`/watch/${item.id}/${slug}`);
            }}
            style={{
              display: "flex", alignItems: "center", gap: "10px",
              padding: "8px 10px", borderRadius: "8px",
              cursor: "pointer", transition: "background 0.2s",
            }}
          >
            {/* Thumbnail */}
            {(item.backdropUrl || item.posterUrl) && (
              <div style={{
                width: "56px", height: "32px", borderRadius: "4px", flexShrink: 0,
                overflow: "hidden", background: "#18181b",
              }}>
                <img
                  src={item.backdropUrl || item.posterUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  loading="lazy"
                  onError={e => { e.target.style.display = "none"; }}
                />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: "0.82rem", fontWeight: 600, color: "#e4e4e7",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {item.title}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "1px" }}>
                <span style={{
                  fontSize: "0.62rem", fontWeight: 700,
                  color: item.urgency === "critical" ? "#ef4444" : item.urgency === "warning" ? "#f97316" : "#a1a1aa",
                }}>
                  {item.daysLeft <= 1 ? "Tomorrow!" : `${item.daysLeft} days left`}
                </span>
              </div>
            </div>
            <Clock size={12} color={item.urgency === "critical" ? "#ef4444" : "#71717a"} />
          </motion.div>
        ))}
      </div>

      {items.length > maxDisplay && (
        <div style={{
          fontSize: "0.7rem", color: "#71717a", textAlign: "center",
          marginTop: "8px", padding: "4px",
        }}>
          +{items.length - maxDisplay} more leaving soon
        </div>
      )}
    </motion.div>
  );
}
