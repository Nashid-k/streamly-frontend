// src/context/AuthContext.jsx — Unified Authentication & MongoDB Cloud Synchronization Provider
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AppContext } from "./auth";
import { useMyList, useContinueWatching, useSearchHistory } from "../hooks/useUserData";
import { logDebug, logError, logWarn } from "../utils/debugLogger";

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
    if (!currentUser || (!currentUser.googleId && !currentUser.email)) {
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
        email: currentUser.email,
        watchlist: currentList,
        watchHistory: currentCw,
      };

      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setSyncStatus("synced");
        setLastSyncedAt(new Date());
        logDebug("auth", "Cloud data successfully synchronized to MongoDB.");
      } else {
        setSyncStatus("error");
        logWarn("auth", "Sync to MongoDB answered with non-200 status:", { status: res.status });
      }
    } catch (err) {
      setSyncStatus("error");
      logError("auth", "Failed to sync user data to MongoDB.", err);
    }
  }, [user]);

  // ─── Initial Cloud Sync on Mount if User Logged In ─────────────────────────
  useEffect(() => {
    if (!user || (!user.googleId && !user.email)) return;

    let isMounted = true;
    async function pullCloudData() {
      try {
        const query = user.googleId ? `googleId=${encodeURIComponent(user.googleId)}` : `email=${encodeURIComponent(user.email)}`;
        const res = await fetch(`/api/sync?${query}`);
        if (!res.ok) return;

        const data = await res.json();
        if (!isMounted || !data?.userData) return;

        const { watchlist = [], watchHistory = [] } = data.userData;

        // Merge watchlist: remote items union with local items
        if (Array.isArray(watchlist) && watchlist.length > 0) {
          try {
            const localList = JSON.parse(localStorage.getItem("aios_my_list") || "[]");
            const localIds = new Set(localList.map((m) => m.id));
            const newFromRemote = watchlist.filter((m) => m && m.id && !localIds.has(m.id));

            if (newFromRemote.length > 0) {
              const merged = [...localList, ...newFromRemote];
              localStorage.setItem("aios_my_list", JSON.stringify(merged));
              window.dispatchEvent(new Event("aios_sync_mylist"));
            }
          } catch {}
        }

        // Merge watch history
        if (Array.isArray(watchHistory) && watchHistory.length > 0) {
          try {
            const localCw = JSON.parse(localStorage.getItem("aios_continue_watching") || "[]");
            const localIds = new Set(localCw.map((m) => m.id));
            const newFromRemoteCw = watchHistory.filter((m) => m && m.id && !localIds.has(m.id));

            if (newFromRemoteCw.length > 0) {
              const mergedCw = [...localCw, ...newFromRemoteCw].slice(0, 20);
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
      window.dispatchEvent(new Event("aios_user_sync"));

      // Merge returned cloud watchlist immediately
      if (Array.isArray(data.userData?.watchlist)) {
        try {
          const localList = JSON.parse(localStorage.getItem("aios_my_list") || "[]");
          const localIds = new Set(localList.map((m) => m.id));
          const toAdd = data.userData.watchlist.filter((m) => m && m.id && !localIds.has(m.id));
          if (toAdd.length > 0) {
            const merged = [...localList, ...toAdd];
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

    // Attempt guest profile sync in background
    try {
      fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "guest", name: guestUser.name, email: guestUser.email }),
      }).catch(() => {});
    } catch {}

    return { success: true, user: guestUser };
  }, []);

  // ─── Sign Out ─────────────────────────────────────────────────────────────
  const logout = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem("streamly_user");
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

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      syncStatus,
      lastSyncedAt,
      syncToCloud,
      loginWithGoogle,
      loginAsGuest,
      logout,
      ...myListData,
      ...cwData,
      ...shData,
    }),
    [user, syncStatus, lastSyncedAt, syncToCloud, loginWithGoogle, loginAsGuest, logout, myListData, cwData, shData]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
