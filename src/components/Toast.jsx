import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, X, AlertCircle, Info, Volume2, Settings, Play } from "lucide-react";
import { useOptionalPreferences } from "../context/preferences";

const ToastContext = createContext(null);

const ICONS = {
  success: <Check size={14} strokeWidth={3} />,
  error: <AlertCircle size={14} />,
  info: <Info size={14} />,
  volume: <Volume2 size={14} />,
  settings: <Settings size={14} />,
  play: <Play size={14} fill="currentColor" />,
};

const COLORS = {
  success: {
    bg: "rgba(16, 185, 129, 0.08)",
    border: "rgba(16, 185, 129, 0.25)",
    icon: "#10b981",
    iconBg: "rgba(16, 185, 129, 0.12)",
    glow: "rgba(16, 185, 129, 0.15)",
  },
  error: {
    bg: "rgba(239, 68, 68, 0.08)",
    border: "rgba(239, 68, 68, 0.25)",
    icon: "#ef4444",
    iconBg: "rgba(239, 68, 68, 0.12)",
    glow: "rgba(239, 68, 68, 0.15)",
  },
  info: {
    bg: "rgba(255, 255, 255, 0.05)",
    border: "rgba(255, 255, 255, 0.1)",
    icon: "#a1a1aa",
    iconBg: "rgba(255, 255, 255, 0.06)",
    glow: "transparent",
  },
  volume: {
    bg: "rgba(255, 107, 0, 0.08)",
    border: "rgba(255, 107, 0, 0.25)",
    icon: "#FF6B00",
    iconBg: "rgba(255, 107, 0, 0.12)",
    glow: "rgba(255, 107, 0, 0.1)",
  },
  settings: {
    bg: "rgba(99, 102, 241, 0.08)",
    border: "rgba(99, 102, 241, 0.25)",
    icon: "#6366f1",
    iconBg: "rgba(99, 102, 241, 0.12)",
    glow: "rgba(99, 102, 241, 0.1)",
  },
  play: {
    bg: "rgba(255, 107, 0, 0.08)",
    border: "rgba(255, 107, 0, 0.25)",
    icon: "#FF6B00",
    iconBg: "rgba(255, 107, 0, 0.12)",
    glow: "rgba(255, 107, 0, 0.1)",
  },
};

function ToastItem({ toast, onDismiss }) {
  const colors = COLORS[toast.type] || COLORS.info;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.92, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -12, scale: 0.95, filter: "blur(4px)", transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 500, damping: 35, mass: 0.8 }}
      onClick={() => onDismiss(toast.id)}
      role="alert"
      aria-live="polite"
      className={`toast-item toast-${toast.type || "info"}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 14px",
        borderRadius: "12px",
        background: colors.bg,
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        border: `1px solid ${colors.border}`,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 24px ${colors.glow}`,
        minWidth: "200px",
        maxWidth: "340px",
        cursor: "pointer",
        userSelect: "none",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Subtle left accent bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "2px",
          background: colors.icon,
          borderRadius: "12px 0 0 12px",
        }}
      />

      <div
        style={{
          width: "26px",
          height: "26px",
          borderRadius: "8px",
          background: colors.iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: colors.icon,
          marginLeft: "2px",
        }}
      >
        {ICONS[toast.type] || ICONS.info}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {toast.title && (
          <div
            style={{
              fontWeight: 600,
              fontSize: "0.78rem",
              color: "#f4f4f5",
              marginBottom: toast.message ? "1px" : 0,
              letterSpacing: "-0.01em",
            }}
          >
            {toast.title}
          </div>
        )}
        {toast.message && (
          <div
            style={{ fontSize: "0.72rem", color: "#71717a", lineHeight: 1.3 }}
          >
            {toast.message}
          </div>
        )}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(toast.id);
        }}
        style={{
          background: "transparent",
          border: "none",
          color: "#52525b",
          cursor: "pointer",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "6px",
          flexShrink: 0,
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#a1a1aa")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "#52525b")}
      >
        <X size={12} />
      </button>
    </motion.div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);
  const preferences = useOptionalPreferences();
  const notificationsEnabled = preferences?.notifications ?? true;

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const timersRef = useRef(new Map());

  const toast = useCallback(
    (typeOrToast, titleOrMessage, message) => {
      const suppliedToast =
        typeOrToast && typeof typeOrToast === "object"
          ? typeOrToast
          : { type: typeOrToast, title: titleOrMessage, message };
      // Notification settings should quiet routine confirmations, never hide
      // a recovery path when an operation has failed.
      if (!notificationsEnabled && suppliedToast.type !== "error") return null;
      const id = ++idRef.current;
      const toastObj = { ...suppliedToast, id };
      setToasts((prev) => [...prev.slice(-4), toastObj]);
      const timer = setTimeout(() => {
        dismiss(id);
        timersRef.current.delete(id);
      }, toastObj.duration || 3000);
      timersRef.current.set(id, timer);
      return id;
    },
    [dismiss, notificationsEnabled],
  );

  // Cleanup all timers on unmount
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        className="toast-container"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 10000,
          display: "flex",
          flexDirection: "column-reverse",
          gap: "8px",
          alignItems: "flex-end",
          pointerEvents: "none",
        }}
      >
        <AnimatePresence mode="popLayout">
          {toasts.map((t) => (
            <div key={t.id} style={{ pointerEvents: "auto" }}>
              <ToastItem toast={t} onDismiss={dismiss} />
            </div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook shares a module with its provider so consumers get both from one import
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
