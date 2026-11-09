import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOptionalPreferences } from "./preferences";
import { NOTIF_TYPES } from "../utils/notificationEngine";
import { NotificationsContext } from "./notifications";
import { logDebug } from "../utils/debugLogger";

const STORAGE_KEY = "aios_notifications_v1";
const MAX_ITEMS = 20;
const EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;

import { safeParse as safeParseJson } from "../utils/safeJson";

function safeParse(raw) {
  const v = safeParseJson(raw, []);
  return Array.isArray(v) ? v : [];
}

function pruneExpired(items, now = Date.now()) {
  return items.filter((n) => {
    const created = typeof n?.createdAt === "number" ? n.createdAt : 0;
    return created === 0 || now - created <= EXPIRY_MS;
  });
}

function allowedByPrefs(notif, prefs) {
  if (!notif) return false;
  if (!prefs) return true; // no provider in tests → allow
  if (prefs.notifications === false) return false;
  const t = notif.type;
  if (t === NOTIF_TYPES.MOVIE_ADDED || t === NOTIF_TYPES.SERIES_ADDED) {
    return prefs.notificationsListAdds !== false;
  }
  if (t === NOTIF_TYPES.MILESTONE) {
    return prefs.notificationsMilestones !== false;
  }
  return true;
}

export function NotificationsProvider({ children }) {
  const prefs = useOptionalPreferences();
  const prefsRef = useRef(prefs);
  useEffect(() => {
    prefsRef.current = prefs;
  }, [prefs]);

  const [items, setItems] = useState(() => {
    try {
      return pruneExpired(safeParse(localStorage.getItem(STORAGE_KEY)));
    } catch {
      return [];
    }
  });

  // Persist on change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // storage unavailable — keep in-memory
    }
  }, [items]);

  // Cross-tab sync.
  useEffect(() => {
    const handler = (e) => {
      if (e.key !== STORAGE_KEY) return;
      setItems(pruneExpired(safeParse(e.newValue)));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const addNotification = useCallback((notif) => {
    if (!notif || !notif.id) return false;
    if (!allowedByPrefs(notif, prefsRef.current)) return false;
    setItems((prev) => {
      if (prev.some((n) => n.id === notif.id)) return prev;
      const next = [notif, ...prev];
      return next.slice(0, MAX_ITEMS);
    });
    logDebug("notifications", "Notification added.", { id: notif.id, type: notif.type });
    return true;
  }, []);

  const markRead = useCallback((id) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
  }, []);

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
  }, []);

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const unreadCount = useMemo(() => items.filter((n) => !n.isRead).length, [items]);

  const value = useMemo(
    () => ({
      notifications: items,
      unreadCount,
      addNotification,
      markRead,
      markAllRead,
      remove,
      clear,
    }),
    [items, unreadCount, addNotification, markRead, markAllRead, remove, clear],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}
