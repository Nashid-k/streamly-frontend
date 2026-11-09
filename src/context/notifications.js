import { createContext, useContext } from "react";

export const NotificationsContext = createContext(null);

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error("useNotifications must be used inside <NotificationsProvider>");
  }
  return ctx;
}

// Lets reusable primitives retain sensible defaults in isolated tests/stories.
export function useOptionalNotifications() {
  return useContext(NotificationsContext);
}
