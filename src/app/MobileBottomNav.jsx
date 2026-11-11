import { useRef, useEffect, useState, useCallback, useLayoutEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Settings } from "lucide-react";
import { NAV_ITEMS } from "../constants/navigation";
import { useI18n } from "../i18n/index.jsx";
import { useAppAuth } from "../context/auth";
import { useOptionalNotifications } from "../context/notifications";
import { SPRING } from "../constants/motion";

/* Mobile Bottom Navigation — Cinejoy-style floating icon pill with a sliding
   active indicator that mirrors the desktop .nav-active-pill behaviour. */
function MobileBottomNav() {
  const location = useLocation();
  const { t } = useI18n();
  const { user } = useAppAuth();
  const notifCtx = useOptionalNotifications();
  const unread = notifCtx?.unreadCount || 0;

  const items = [
    ...NAV_ITEMS.map((item) => ({
      ...item,
      label: t(`nav.${item.id}`),
      ...(item.id === "myList"
        ? { match: (p) => p === "/watchlist" || p === "/history" }
        : null),
    })),
    { id: "search", label: t("nav.search"), to: "/search", icon: Search, match: (p) => p === "/search" },
    { id: "settings", label: user ? t("settings.tabs.account") : t("nav.settings"), to: "/settings", icon: Settings, match: (p) => p === "/settings" },
  ];

  const navRef = useRef(null);
  const [pill, setPill] = useState({ x: 0, w: 0, ready: false });

  const measurePill = useCallback(() => {
    const nav = navRef.current;
    if (!nav) return;
    const active = nav.querySelector('[data-nav-active="true"]');
    if (!active) {
      setPill((prev) => (prev.ready ? { ...prev, ready: false } : prev));
      return;
    }
    const navRect = nav.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    const x = activeRect.left - navRect.left;
    const w = activeRect.width;
    if (w <= 0) return;
    setPill((prev) => (prev.x === x && prev.w === w && prev.ready ? prev : { x, w, ready: true }));
  }, []);

  useLayoutEffect(() => {
    measurePill();
  }, [measurePill, location.pathname]);

  useEffect(() => {
    window.addEventListener("resize", measurePill);
    return () => window.removeEventListener("resize", measurePill);
  }, [measurePill]);

  return (
    <motion.nav
      ref={navRef}
      className="mobile-bottom-nav"
      aria-label={t("nav.mobileNav")}
      initial={{ y: 16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 60, opacity: 0 }}
      transition={SPRING.LIFT}
    >
      {/* Sliding active pill indicator */}
      {pill.ready && (
        <motion.span
          className="bottom-nav-pill"
          initial={false}
          style={{
            position: "absolute",
            left: 0,
            top: "5px",
            bottom: "5px",
            borderRadius: "var(--radius-full)",
            background: "var(--white)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.35), 0 0 16px 1px rgba(255,255,255,0.18)",
            pointerEvents: "none",
            zIndex: 0,
          }}
          animate={{ x: pill.x, width: pill.w }}
          transition={SPRING.LIFT}
        />
      )}

      {items.map((item) => {
        const active = item.match(location.pathname);
        return (
          <Link
            key={`bottom-${item.id}`}
            to={item.to}
            data-nav-active={active ? "true" : undefined}
            className={`bottom-nav-item ${active ? "active" : ""}${item.id === "settings" && user?.picture ? " bottom-nav-item--avatar" : ""}`}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            title={item.label}
            style={{
              position: "relative",
              zIndex: 1,
            }}
          >
            {item.id === "settings" && user?.picture ? (
              <img
                src={user.picture}
                alt=""
                className="w-6 h-6 rounded-full object-cover border border-white/40"
                referrerPolicy="no-referrer"
              />
            ) : (
              <item.icon size={22} strokeWidth={2} />
            )}
            {/* 12px label under the icon (brief §5: a dock of naked icons is
                pure visual memory). The CSS already styled this class — it had
                no JSX consumer until now. */}
            <span className="bottom-nav-label" aria-hidden="true">
              {item.label}
            </span>
            {item.id === "settings" && unread > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  minWidth: 16,
                  height: 16,
                  padding: "0 4px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  background: "var(--live)",
                  color: "var(--white)",
                  lineHeight: "16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </motion.nav>
  );
}

export default MobileBottomNav;
