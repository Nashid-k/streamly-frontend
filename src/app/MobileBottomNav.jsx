import { Link, useLocation } from "react-router-dom";
import { Search, Settings, Download } from "lucide-react";
import { NAV_ITEMS } from "../constants/navigation";
import { useI18n } from "../i18n/index.jsx";
import { useAppAuth } from "../context/auth";
import { useDownloads } from "../context/downloads";

/* Mobile Bottom Navigation — Cinejoy-style floating icon pill */
function MobileBottomNav() {
  const location = useLocation();
  const { t } = useI18n();
  const { user } = useAppAuth();
  const { downloads, activeCount } = useDownloads();

  const items = [
    ...NAV_ITEMS.map((item) => ({
      ...item,
      label: t(`nav.${item.id}`),
      ...(item.id === "myList"
        ? { match: (p) => p === "/watchlist" || p === "/history" }
        : null),
    })),
    ...(downloads.length > 0
      ? [{ id: "downloads", label: t("nav.downloads"), to: "/downloads", icon: Download, match: (p) => p === "/downloads" }]
      : []),
    { id: "search", label: t("nav.search"), to: "/search", icon: Search, match: (p) => p === "/search" },
    { id: "settings", label: user ? t("settings.tabs.account") : t("nav.settings"), to: "/settings", icon: Settings, match: (p) => p === "/settings" },
  ];

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {items.map((item) => {
        const active = item.match(location.pathname);
        return (
          <Link
            key={`bottom-${item.id}`}
            to={item.to}
            className={`bottom-nav-item ${active ? "active" : ""}`}
            aria-current={active ? "page" : undefined}
            aria-label={item.label}
            title={item.label}
          >
            {item.id === "downloads" && activeCount > 0 && (
              <span className="bottom-nav-badge">{activeCount}</span>
            )}
            {item.id === "settings" && user?.picture ? (
              <img
                src={user.picture}
                alt={user.name || "User"}
                className="w-6 h-6 rounded-full object-cover border border-white/40"
                referrerPolicy="no-referrer"
              />
            ) : (
              <item.icon size={24} strokeWidth={2} />
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export default MobileBottomNav;