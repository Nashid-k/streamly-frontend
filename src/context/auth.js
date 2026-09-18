import { createContext, useContext } from "react";

/* Context + hook live apart from <AuthProvider> so fast-refresh only ever
   sees component exports in AuthContext.jsx (react-refresh constraint).
   hooks/useUserData owns the actual storage logic. */
export const AppContext = createContext(null)

/* Cloud-sync status is the one auth field that churns: it flips
   idle → syncing → synced/error after every list/history sync. Riding it on
   the main AppContext re-rendered EVERY auth consumer (every MovieCard) twice
   per sync. It's now isolated in its own context so only SettingsPage (the
   only consumer) re-renders when it changes. */
export const SyncStatusContext = createContext({
  syncStatus: "idle",
  lastSyncedAt: null,
});

const DEFAULT_AUTH_FALLBACK = {
  user: null,
  isAuthenticated: false,
  myList: [],
  continueWatching: [],
  searchHistory: [],
  isInList: () => false,
  toggleMyList: () => {},
  removeBatchFromMyList: () => {},
  updateProgress: () => {},
  removeFromContinueWatching: () => {},
  removeBatchFromContinueWatching: () => {},
  clearContinueWatching: () => {},
  addSearch: () => {},
  removeSearch: () => {},
  clearSearchHistory: () => {},
  loginWithGoogle: async () => ({ success: false }),
  loginAsGuest: () => {},
  logout: () => {},
  syncStatus: "idle",
  lastSyncedAt: null,
  syncToCloud: async () => {},
};

export function useAppAuth() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    return DEFAULT_AUTH_FALLBACK;
  }
  return ctx;
}

/* Granular sync-status reader. Auth consumers read syncStatus via this hook
   so a cloud sync re-render only hits SettingsPage — not every MovieCard. */
export function useSyncStatus() {
  const ctx = useContext(SyncStatusContext);
  if (!ctx) {
    return {
      syncStatus: DEFAULT_AUTH_FALLBACK.syncStatus,
      lastSyncedAt: DEFAULT_AUTH_FALLBACK.lastSyncedAt,
    };
  }
  return ctx;
}
