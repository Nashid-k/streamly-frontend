import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, Trash2, X } from "lucide-react";
import { DURATION, EASE_OUT } from "../constants/motion";
import { useOptionalNotifications } from "../context/notifications";
import { useAppAuth } from "../context/auth";
import { buildWelcomeNotification } from "../utils/notificationEngine";

function timeAgo(ts) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function NotificationCenter() {
  const ctx = useOptionalNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const navigate = useNavigate();

  const items = ctx?.notifications || [];
  const unread = ctx?.unreadCount || 0;
  const auth = useAppAuth();

  // Fire a one-time welcome notification when the center is empty.
  useEffect(() => {
    if (!ctx) return;
    if (items.length > 0) return;
    try {
      if (localStorage.getItem("aios_welcome_shown_v1") === "1") return;
    } catch {
      return;
    }
    ctx.addNotification(buildWelcomeNotification({ isSignedIn: Boolean(auth?.user) }));
    try {
      localStorage.setItem("aios_welcome_shown_v1", "1");
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  useEffect(() => {
    if (!open) return undefined;
    const handleOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  const handleItemClick = (n) => {
    ctx?.markRead(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  return (
    <div className="notif-center" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="nav-icon-btn"
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={18} strokeWidth={2} />
        {unread > 0 && (
          <span className="notif-badge" aria-hidden="true">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="notif-panel"
            role="dialog"
            aria-label="Notifications"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ duration: DURATION.FAST, ease: EASE_OUT }}
          >
            <div className="notif-panel__header">
              <span className="notif-panel__title">Notifications</span>
              <div className="notif-panel__actions">
                {items.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="notif-panel__action"
                      onClick={() => ctx?.markAllRead()}
                      aria-label="Mark all read"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      type="button"
                      className="notif-panel__action"
                      onClick={() => ctx?.clear()}
                      aria-label="Clear all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="notif-panel__action"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="notif-panel__body">
              {items.length === 0 ? (
                <p className="notif-panel__empty">No notifications yet.</p>
              ) : (
                <ul className="notif-panel__list">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        className={`notif-item${n.isRead ? " is-read" : ""}`}
                        onClick={() => handleItemClick(n)}
                      >
                        {n.image && (
                          <img src={n.image} alt="" className="notif-item__img" loading="lazy" />
                        )}
                        <div className="notif-item__text">
                          <span className="notif-item__title">{n.title}</span>
                          <span className="notif-item__msg">{n.message}</span>
                          <span className="notif-item__meta">
                            {n.platform ? `${n.platform} · ` : ""}
                            {timeAgo(n.createdAt)}
                          </span>
                        </div>
                        {!n.isRead && <span className="notif-item__dot" aria-hidden="true" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
