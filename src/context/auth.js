import { createContext, useContext } from "react";

/* Context + hook live apart from <AuthProvider> so fast-refresh only ever
   sees component exports in AuthContext.jsx (react-refresh constraint).
   hooks/useUserData owns the actual storage logic. */
export const AppContext = createContext(null);

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
