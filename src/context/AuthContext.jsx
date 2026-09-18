// src/context/AuthContext.jsx — Unified Authentication & MongoDB Cloud Synchronization Provider
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppContext, SyncStatusContext } from "./auth";
import { useMyList, useContinueWatching, useSearchHistory } from "../hooks/useUserData";
import { mergeListsById } from "../utils/mergeRemote";
import { logDebug, logError, logWarn } from "../utils/debugLogger";

const SYNC_TOKEN_KEY = "streamly_sync_token";

// Per-account HMAC sync token issued by /api/auth for verified Google users.
// Stored separately from the user profile so logout doesn't wipe it before
// the /api/sync calls finish, and so guests never possess one.
function readSyncToken() {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(SYNC_TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

function safeUserParse() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("streamly_user");
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    logWarn("auth", "Corrupt streamly_user in localStorage — resetting to null.", { message: error?.message });
    return null;
  }
}

export function AuthProvider({ children }) {
  const myListData = useMyList();
  const cwData = useContinueWatching();
  const shData = useSearchHistory();

  const [user, setUser] = useState(safeUserParse);
  const [syncStatus, setSyncStatus] = useState("idle"); // 'idle' | 'syncing' | 'synced' | 'error'
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const syncTimeoutRef = useRef(null);

  // Sync across browser tabs or windows
  useEffect(() => {
    const onUserChange = () => setUser(safeUserParse());
    window.addEventListener("storage", onUserChange);
    window.addEventListener("aios_user_sync", onUserChange);
    return () => {
      window.removeEventListener("storage", onUserChange);
      window.removeEventListener("aios_user_sync", onUserChange);
    };
  }, []);

  // ─── Manual or Automated Cloud Sync to MongoDB ─────────────────────────────
  const syncToCloud = useCallback(async (customPayload = null) => {
    const currentUser = user || safeUserParse();
    // Verified Google users only. Guests and legacy email profiles stay
    // local — see loginAsGuest notes. /api/sync also rejects anything without
    // a matching bearer token, so a missing token here is a client bug.
    if (!currentUser || !currentUser.googleId) {
      logDebug("auth", "Cloud sync skipped — only verified Google accounts sync.", {
        provider: currentUser?.provider,
      });
      return;
    }

    const token = readSyncToken();
    if (!token) {
      setSyncStatus("error");
      logWarn("auth", "No sync token — please sign in again (re-issue token via Google Sign-In).");
      return;
    }

    try {
      setSyncStatus("syncing");

      let currentList = [];
      let currentCw = [];
      try {
        currentList = JSON.parse(localStorage.getItem("aios_my_list") || "[]");
        currentCw = JSON.parse(localStorage.getItem("aios_continue_watching") || "[]");
      } catch {}

      const payload = customPayload || {
        googleId: currentUser.googleId,
        watchlist: currentList,
        watchHistory: currentCw,
      };

      const res = await fetch("/api/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSyncStatus("synced");
        setLastSyncedAt(new Date());
        logDebug("auth", "Cloud data successfully synchronized to MongoDB.");
      } else {
        setSyncStatus("error");
        logWarn("auth", `Sync to MongoDB answered with non-200 status: ${res.status}.`, {
          status: res.status,
        });
      }
    } catch (err) {
      setSyncStatus("error");
      logError("auth", "Failed to sync user data to MongoDB.", err);
    }
  }, [user]);

  // ─── Initial Cloud Sync on Mount if User Logged In ─────────────────────────
  useEffect(() => {
    // Only verified Google identities pull cloud data; guests stay local.
    if (!user || !user.googleId) return;

    const token = readSyncToken();
    if (!token) {
      logWarn("auth", "Cloud pull skipped — no sync token. Please sign in again.");
      return;
    }

    let isMounted = true;
    async function pullCloudData() {
      try {
        const res = await fetch(`/api/sync?googleId=${encodeURIComponent(user.googleId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          logWarn("auth", "Cloud pull rejected (401) — token no longer valid, please re-sign-in.");
          return;
        }
        if (!res.ok) return;

        const data = await res.json();
        if (!isMounted || !data?.userData) return;

        const { watchlist = [], watchHistory = [] } = data.userData;

        // Timestamp-aware union merge: replace stale-local by newer-remote.
        // (Legacy local items without updatedAt lose to any new remote data.)
        if (Array.isArray(watchlist) && watchlist.length > 0) {
          try {
            const localList = JSON.parse(localStorage.getItem("aios_my_list") || "[]");
            const merged = mergeListsById(localList, watchlist);

            if (JSON.stringify(merged) !== JSON.stringify(localList)) {
              localStorage.setItem("aios_my_list", JSON.stringify(merged));
              window.dispatchEvent(new Event("aios_sync_mylist"));
            }
          } catch {}
        }

        // Merge watch history (capped to 20 like local writes).
        if (Array.isArray(watchHistory) && watchHistory.length > 0) {
          try {
            const localCw = JSON.parse(localStorage.getItem("aios_continue_watching") || "[]");
            const mergedCw = mergeListsById(localCw, watchHistory, { limit: 20 });

            if (JSON.stringify(mergedCw) !== JSON.stringify(localCw)) {
              localStorage.setItem("aios_continue_watching", JSON.stringify(mergedCw));
              window.dispatchEvent(new Event("aios_sync_cw"));
            }
          } catch {}
        }

        setSyncStatus("synced");
        setLastSyncedAt(new Date());
      } catch (error) {
        logDebug("auth", "Could not pull initial cloud data from MongoDB:", { message: error?.message });
      }
    }

    pullCloudData();

    return () => {
      isMounted = false;
    };
  }, [user]);

  // ─── Debounced Auto-Sync when Watchlist or History Updates ──────────────────
  useEffect(() => {
    if (!user) return;

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      syncToCloud();
    }, 2500);

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [myListData.myList, cwData.continueWatching, syncToCloud, user]);

  // ─── Google OAuth Login ───────────────────────────────────────────────────
  const loginWithGoogle = useCallback(async (credential) => {
    if (!credential) {
      logWarn("auth", "loginWithGoogle called without credential.");
      return { success: false, message: "Missing Google credential." };
    }

    try {
      setSyncStatus("syncing");
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "Failed to authenticate with Google.");
      }

      const authenticatedUser = data.user;
      setUser(authenticatedUser);
      localStorage.setItem("streamly_user", JSON.stringify(authenticatedUser));
      if (data.syncToken) {
        localStorage.setItem(SYNC_TOKEN_KEY, data.syncToken);
      }
      window.dispatchEvent(new Event("aios_user_sync"));

      // Merge returned cloud watchlist immediately (timestamp-aware union).
      if (Array.isArray(data.userData?.watchlist)) {
        try {
          const localList = JSON.parse(localStorage.getItem("aios_my_list") || "[]");
          const merged = mergeListsById(localList, data.userData.watchlist);
          if (JSON.stringify(merged) !== JSON.stringify(localList)) {
            localStorage.setItem("aios_my_list", JSON.stringify(merged));
            window.dispatchEvent(new Event("aios_sync_mylist"));
          }
        } catch {}
      }

      setSyncStatus("synced");
      setLastSyncedAt(new Date());
      logDebug("auth", `User signed in with Google: ${authenticatedUser.email}`);

      return { success: true, user: authenticatedUser };
    } catch (err) {
      setSyncStatus("error");
      logError("auth", "Google authentication failed.", err);
      return { success: false, message: err?.message || "Google sign-in failed." };
    }
  }, []);

  // ─── Guest / Local Sign-In ─────────────────────────────────────────────────
  // Guests are LOCAL-ONLY by design. Signing in as guest must never write to
  // MongoDB: the former default email ("viewer@streamly.io") collapsed every
  // anonymous visitor into ONE shared cloud document, so any viewer's
  // watchlist/history leaked into everyone else's. Cloud sync is reserved for
  // verified Google identities (googleId), and even those need a per-account
  // sync token issued by /api/auth.
  const loginAsGuest = useCallback(async (name, email) => {
    const guestUser = {
      name: name || "Streamly Viewer",
      email: email || "viewer@streamly.io",
      picture: "",
      provider: "guest",
    };

    setUser(guestUser);
    localStorage.setItem("streamly_user", JSON.stringify(guestUser));
    window.dispatchEvent(new Event("aios_user_sync"));

    logDebug("auth", "Guest login — local-only (no cloud sync).", {
      email: guestUser.email,
    });

    return { success: true, user: guestUser };
  }, []);

  // ─── Sign Out ─────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem("streamly_user");
      localStorage.removeItem(SYNC_TOKEN_KEY);
    } catch {}

    // Disable Google auto-select
    if (window.google?.accounts?.id?.disableAutoSelect) {
      try {
        window.google.accounts.id.disableAutoSelect();
      } catch {}
    }

    setSyncStatus("idle");
    setLastSyncedAt(null);
    window.dispatchEvent(new Event("aios_user_sync"));
    logDebug("auth", "User signed out.");
  }, []);

  // syncStatus/lastSyncedAt churn on EVERY cloud sync (idle → syncing →
  // synced/error). Riding them on the shared AppContext value re-rendered every
  // auth consumer (every MovieCard, every rail) twice per sync. They now live
  // on their own SyncStatusContext so only SettingsPage re-renders.
  const syncValue = useMemo(
    () => ({ syncStatus, lastSyncedAt }),
    [syncStatus, lastSyncedAt],
  );

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      syncToCloud,
      loginWithGoogle,
      loginAsGuest,
      logout,
      ...myListData,
      ...cwData,
      ...shData,
    }),
    [user, syncToCloud, loginWithGoogle, loginAsGuest, logout, myListData, cwData, shData]
  );

  return (
    <AppContext.Provider value={value}>
      <SyncStatusContext.Provider value={syncValue}>{children}</SyncStatusContext.Provider>
    </AppContext.Provider>
  );
}
