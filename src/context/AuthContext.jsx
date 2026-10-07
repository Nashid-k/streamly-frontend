// src/context/AuthContext.jsx — Authentication & MongoDB cloud-sync provider.
//
// Sign-in is email + password, and the account does not exist until the emailed
// link is opened (see server/verifyToken.js). The three entry points are:
//
//   registerAccount()          → POST /api/register       → mails a link, saves nothing
//   completeEmailVerification()→ POST /api/verifyEmail   → CREATES the account, signs in
//   loginWithEmail()           → POST /api/login          → signs in an existing account
//
// All three return a `{ success, ... }` envelope and never throw, so call sites
// can render `message` straight into an error slot.
//
// The bearer token issued by verify/login is what /api/sync checks, so cloud
// sync needed no rework — only the subject key changed from the old provider id to
// `accountId` (the account's Mongo _id).
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { AppContext, SyncStatusContext } from "./auth";
import { useMyList, useContinueWatching, useSearchHistory, useMyCollections } from "../hooks/useUserData";
import { mergeListsById } from "../utils/mergeRemote";
import { logDebug, logError, logWarn } from "../utils/debugLogger";
import { morphCollections } from "../hooks/collectionMorph";
import { readPreferencesSnapshot, applyRemotePreferences } from "../utils/preferencesSnapshot";
import SignInDialog from "../components/auth/SignInDialog";

const SYNC_TOKEN_KEY = "streamly_sync_token";
const USER_KEY = "streamly_user";
// Tombstone GC: same 30-day window as useUserData.
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

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
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    logWarn("auth", "Corrupt streamly_user in localStorage — resetting to null.", { message: error?.message });
    return null;
  }
}

/**
 * The key /api/sync is scoped to.
 *
 * `accountId` is canonical; `id` is the same value under the name the server
 * sends in its public user shape, kept for anything that predates the rename.
 *
 * There is deliberately NO `googleId` fallback any more. It used to be tolerated
 * so a profile written by the retired Google path would keep syncing, but the
 * user chose to drop that provider and its synced data: a leftover Google
 * profile would otherwise look signed-in, pass the gate, and then fail every
 * sync because no sync token matches it. Treating it as "no account" is honest —
 * the viewer is prompted to sign in, and the next sign-in adopts the session
 * cleanly.
 */
function accountIdOf(user) {
  return user?.accountId || user?.id || "";
}

/** True only for an account the server vouched for. */
function hasCloudAccount(user) {
  return Boolean(accountIdOf(user));
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * Fold a cloud library payload into localStorage and notify the hooks.
 *
 * Merges are timestamp-aware unions rather than replacements so a device that
 * has been offline does not clobber edits made elsewhere, and deletions ride as
 * tombstones. Every branch compares before writing: rewriting identical JSON
 * would fire the cross-tab events and re-render every rail for nothing.
 */
function applyCloudLibrary(userData) {
  if (!userData) return;

  if (Array.isArray(userData.watchlist) && userData.watchlist.length > 0) {
    const localList = readJson("aios_my_list", []);
    const merged = mergeListsById(localList, userData.watchlist, {
      pruneTombstonesMs: TOMBSTONE_TTL_MS,
    });
    if (writeJson("aios_my_list", merged) && JSON.stringify(merged) !== JSON.stringify(localList)) {
      window.dispatchEvent(new Event("aios_sync_mylist"));
    }
  }

  // History merges capped to 20 like local writes; the cap is tombstone-safe and
  // newest-first, so delete markers are never sliced away.
  if (Array.isArray(userData.watchHistory) && userData.watchHistory.length > 0) {
    const localCw = readJson("aios_continue_watching", []);
    const mergedCw = mergeListsById(localCw, userData.watchHistory, {
      limit: 20,
      pruneTombstonesMs: TOMBSTONE_TTL_MS,
      sortBy: (a, b) => Number(b.lastWatched || 0) - Number(a.lastWatched || 0),
    });
    if (writeJson("aios_continue_watching", mergedCw) && JSON.stringify(mergedCw) !== JSON.stringify(localCw)) {
      window.dispatchEvent(new Event("aios_sync_cw"));
    }
  }

  if (Array.isArray(userData.collections)) {
    const localCols = morphCollections(readJson("aios_my_collections", []));
    const mergedCols = mergeListsById(localCols, morphCollections(userData.collections), {
      pruneTombstonesMs: TOMBSTONE_TTL_MS,
    });
    if (writeJson("aios_my_collections", mergedCols) && JSON.stringify(mergedCols) !== JSON.stringify(localCols)) {
      window.dispatchEvent(new Event("aios_sync_collections"));
    }
  }

  // Apply cloud preferences for keys the device has not set locally — local
  // choices always win, this only fills in never-touched keys.
  if (userData.preferences && typeof userData.preferences === "object") {
    applyRemotePreferences(userData.preferences);
  }
}

/** POST/GET helper that always yields `{ success, ... }` and never throws. */
async function postJson(path, body) {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      // A proxy/HTML error page reaches here; fall through to the status text.
    }
    if (!res.ok || data?.success === false) {
      return { success: false, message: data?.message || `Request failed (${res.status}).`, status: res.status };
    }
    return { ...data, status: res.status };
  } catch (error) {
    logError("auth", `Network failure calling ${path}.`, error);
    return { success: false, message: "Could not reach the server. Check your connection and try again." };
  }
}

/**
 * Which actions demand an account, and the copy shown when they are refused.
 *
 * Deliberately NOT in this list:
 *   • updateProgress when the player reports playback position. That is not a
 *     deliberate data action — it fires every few seconds from onProgressChange,
 *     and gating it would mean an anonymous viewer loses their place in a film
 *     the moment they close the tab. Guests still save progress locally; it just
 *     never reaches the cloud.
 *   • addSearch, which fires from an effect on every search.
 *
 * The explicit "mark as watched" controls DO need an account even though they
 * call updateProgress, because the data layer cannot tell that call apart from
 * a progress tick. TitleDetailsPage calls requireAuth() at the top of those
 * handlers instead of relying on this map.
 */
const GATED_MUTATIONS = {
  toggleMyList: "gateReason",
  removeBatchFromMyList: "gateReason",
  createCollection: "gateCollections",
  createCollectionWithItems: "gateCollections",
  renameCollection: "gateCollections",
  deleteCollection: "gateCollections",
  addToCollection: "gateCollections",
  removeFromCollection: "gateCollections",
  toggleInCollection: "gateCollections",
  setCollectionVisibility: "gateCollections",
  removeFromContinueWatching: "gateHistory",
  removeBatchFromContinueWatching: "gateHistory",
  clearContinueWatching: "gateHistory",
};

export function AuthProvider({ children }) {
  const myListData = useMyList();
  const cwData = useContinueWatching();
  const shData = useSearchHistory();
  const collectionsData = useMyCollections();

  const [user, setUser] = useState(safeUserParse);
  const [syncStatus, setSyncStatus] = useState("idle"); // 'idle' | 'syncing' | 'synced' | 'error'
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [signIn, setSignIn] = useState({ open: false, mode: "signin", reason: "" });
  const syncTimeoutRef = useRef(null);
  // requireAuth is called from event handlers built before the latest render (a
  // card in a rail, a memoised callback), so it must read the CURRENT user rather
  // than close over whatever it saw when it was built.
  //
  // Synced in an effect rather than by assigning during render: a render-phase
  // write means a thrown-away concurrent render can leave the ref pointing at a
  // user that never committed. One commit of lag is irrelevant here because the
  // only readers are click handlers, which always run long after commit.
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Sync across browser tabs or windows
  useEffect(() => {
    // `syncOnCustom` handles the app's OWN aios_user_sync broadcast. The native
    // `storage` event fires for EVERY localStorage write from any tab — a rail
    // saving continue-watching progress, a preference flip — so it is gated to
    // actual profile changes (or a full clear) before repainting the whole tree.
    const onUserChange = () => setUser(safeUserParse());
    const onStorageKeyChange = (e) => {
      if (e.key === null || e.key === USER_KEY) onUserChange();
    };
    window.addEventListener("storage", onStorageKeyChange);
    window.addEventListener("aios_user_sync", onUserChange);
    return () => {
      window.removeEventListener("storage", onStorageKeyChange);
      window.removeEventListener("aios_user_sync", onUserChange);
    };
  }, []);

/**
 * Drop the local library so a fresh account does not inherit a guest's data.
 *
 * Only the three synced collections go. Search history is deliberately kept — it
 * never leaves the device, so it cannot leak, and throwing it away would punish
 * someone for tapping a gate. Device preferences are kept too: wiping them would
 * flash the wrong theme on adopt, and a theme following its owner is desirable.
 *
 * The aios_sync_* events are dispatched because every rail is subscribed to them;
 * without this the UI would keep showing the wiped rows until the next write.
 */
function discardLocalLibrary() {
  const targets = [
    ["aios_my_list", "aios_sync_mylist"],
    ["aios_continue_watching", "aios_sync_cw"],
    ["aios_my_collections", "aios_sync_collections"],
  ];
  for (const [key, event] of targets) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* Private-mode storage refusal must not block the sign-in. */
    }
    window.dispatchEvent(new Event(event));
  }
  logDebug("auth", "Local library discarded — adopting a new account.");
}

  /**
   * Persist the profile + token and announce the change to other tabs.
   *
   * Also enforces the start-clean rule. The library lives in one set of
   * localStorage keys shared by everyone on the device, so "whose data is this?"
   * is answered by the account that was signed in a moment ago:
   *
   *   • same account as before → the local rows already belong to it, merge.
   *   • different account, or none (a guest, or after sign-out) → the rows are
   *     not ours. They are discarded, and the incoming account's own cloud
   *     library replaces them.
   *
   * Without the discard, the scheduled sync that fires moments after `setUser`
   * would upload a stranger's watchlist under the new accountId — and that leak
   * is invisible from the UI, because the merge looks exactly like a sync.
   */
  const adoptSession = useCallback((nextUser, syncToken) => {
    const previousAccountId = accountIdOf(safeUserParse());
    const nextAccountId = accountIdOf(nextUser);
    if (previousAccountId !== nextAccountId) discardLocalLibrary();

    setUser(nextUser);
    writeJson(USER_KEY, nextUser);
    if (syncToken) {
      try {
        localStorage.setItem(SYNC_TOKEN_KEY, syncToken);
      } catch {}
    }
    window.dispatchEvent(new Event("aios_user_sync"));
  }, []);

  const syncToCloud = useCallback(async (customPayload = null) => {
    const currentUser = user || safeUserParse();
    const accountId = accountIdOf(currentUser);
    // Anonymous visitors keep everything in localStorage and never reach the
    // network. /api/sync also rejects anything without a matching bearer token,
    // so a missing token here is a client bug, not a guest.
    if (!currentUser || !accountId) {
      logDebug("auth", "Cloud sync skipped — no verified account on this device.", {
        provider: currentUser?.provider,
      });
      return;
    }

    const token = readSyncToken();
    if (!token) {
      setSyncStatus("error");
      logWarn("auth", "No sync token — please sign in again.");
      return;
    }

    try {
      setSyncStatus("syncing");

      // Upload the MORPHED collection shape (visibility/publicId normalized), not
      // the raw legacy localStorage — unmorphed rows synced as private, so the
      // collection never became public for anyone else.
      const payload = customPayload || {
        accountId,
        watchlist: readJson("aios_my_list", []),
        watchHistory: readJson("aios_continue_watching", []),
        collections: morphCollections(readJson("aios_my_collections", [])),
        // Settings sync both ways now — the pull path applies them below.
        preferences: readPreferencesSnapshot(),
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

  useEffect(() => {
    // Only verified identities pull cloud data; guests stay local.
    const accountId = accountIdOf(user);
    if (!user || !accountId) return;

    const token = readSyncToken();
    if (!token) {
      logWarn("auth", "Cloud pull skipped — no sync token. Please sign in again.");
      return;
    }

    let isMounted = true;
    async function pullCloudData() {
      try {
        const res = await fetch(`/api/sync?accountId=${encodeURIComponent(accountId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          logWarn("auth", "Cloud pull rejected (401) — token no longer valid, please re-sign-in.");
          return;
        }
        if (!res.ok) return;

        const data = await res.json();
        if (!isMounted || !data?.userData) return;

        applyCloudLibrary(data.userData);
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

  useEffect(() => {
    if (!user) return;

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      syncToCloud();
    }, 2500);

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [myListData.myList, cwData.continueWatching, collectionsData.collections, syncToCloud, user]);

  const deleteCloudData = useCallback(async () => {
    const currentUser = user || safeUserParse();
    const token = readSyncToken();
    if (!hasCloudAccount(currentUser) || !token) {
      logWarn("auth", "Cloud delete skipped — no verified account/token.");
      return { success: false, message: "No verified account to delete." };
    }
    try {
      const res = await fetch("/api/sync", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Cloud delete failed: ${res.status}`);
      setSyncStatus("idle");
      setLastSyncedAt(null);
      logDebug("auth", "Cloud data deleted.");
      return { success: true };
    } catch (err) {
      logError("auth", "Cloud data deletion failed.", err);
      return { success: false, message: err?.message || "Deletion failed." };
    }
  }, [user]);

  /**
   * Start a signup. Nothing is written to the database — this hashes the
   * password and mails a link. The UI must move to a "check your inbox" state
   * on success rather than treating the user as signed in.
   */
  const registerAccount = useCallback(async ({ name, email, password }) => {
    const result = await postJson("/api/register", { name, email, password });
    if (result.success) {
      logDebug("auth", `Verification link sent to ${result.email || email}.`);
    }
    return result;
  }, []);

  /** Exchange the emailed token for a session. This is where the row is created. */
  const completeEmailVerification = useCallback(async (token) => {
    if (!token) {
      return { success: false, message: "This verification link is missing its token." };
    }
    setSyncStatus("syncing");
    const result = await postJson("/api/verifyEmail", { token });
    if (!result.success || !result.user) {
      setSyncStatus("error");
      return result;
    }

    adoptSession(result.user, result.syncToken);
    // A brand-new account has an empty library, so this merge is usually a
    // no-op — but it is what keeps a device that had local edits honest instead
    // of silently overwriting them a moment later.
    applyCloudLibrary(result.userData);
    setSyncStatus("synced");
    setLastSyncedAt(new Date());
    logDebug("auth", `Email verified for ${result.user.email}.`);
    return { success: true, user: result.user };
  }, [adoptSession]);

  const loginWithEmail = useCallback(async ({ email, password }) => {
    setSyncStatus("syncing");
    const result = await postJson("/api/login", { email, password });
    if (!result.success || !result.user) {
      setSyncStatus("error");
      return result;
    }

    adoptSession(result.user, result.syncToken);
    applyCloudLibrary(result.userData);
    setSyncStatus("synced");
    setLastSyncedAt(new Date());
    logDebug("auth", `User signed in: ${result.user.email}`);
    return { success: true, user: result.user };
  }, [adoptSession]);

  const logout = useCallback(() => {
    setUser(null);
    try {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(SYNC_TOKEN_KEY);
    } catch {}

    setSyncStatus("idle");
    setLastSyncedAt(null);
    window.dispatchEvent(new Event("aios_user_sync"));
    logDebug("auth", "User signed out.");
  }, []);

  // ── Login gate ─────────────────────────────────────────────────────────────
  // `requireAuth(reasonKey)` returns true when the action may proceed, and
  // otherwise opens the sign-in dialog and returns false. Call sites use it as
  // `if (!requireAuth("gateCollections")) return;` — the action simply does not
  // happen, rather than half-applying and then prompting.
  const openSignIn = useCallback((mode = "signin", reason = "") => {
    setSignIn({ open: true, mode, reason });
  }, []);

  const closeSignIn = useCallback(() => {
    setSignIn((prev) => (prev.open ? { ...prev, open: false, reason: "" } : prev));
  }, []);

  const requireAuth = useCallback((reason = "") => {
    if (hasCloudAccount(userRef.current)) return true;
    openSignIn("signin", reason);
    return false;
  }, [openSignIn]);

  /**
   * Wrap a mutator so an anonymous caller is stopped at the door.
   *
   * A refused call returns `false` — not `undefined`, which is what the hooks
   * themselves return — so a caller can tell "the gate said no" from "the hook
   * ran and had nothing to do". Without it, every caller that reports success
   * (a toast, a haptic) has no way to avoid announcing a save that never
   * happened.
   */
  const gate = useCallback(
    (fn, reason) =>
      (...args) => {
        if (!hasCloudAccount(userRef.current)) {
          openSignIn("signin", reason);
          return false;
        }
        return fn(...args);
      },
    [openSignIn],
  );

  // One gated copy of each protected mutator, shared by every consumer.
  const gated = useMemo(() => {
    const source = { ...myListData, ...cwData, ...collectionsData };
    const out = {};
    for (const [name, reason] of Object.entries(GATED_MUTATIONS)) {
      if (typeof source[name] === "function") out[name] = gate(source[name], reason);
    }
    return out;
  }, [myListData, cwData, collectionsData, gate]);

  const syncValue = useMemo(
    () => ({ syncStatus, lastSyncedAt }),
    [syncStatus, lastSyncedAt],
  );

  const value = useMemo(
    () => ({
      user,
      // "Signed in" is not the same question as "has an account the server
      // vouched for". isAuthenticated drives chrome (avatar, sign-out row);
      // hasAccount drives whether a write may reach the cloud.
      isAuthenticated: Boolean(user),
      hasAccount: hasCloudAccount(user),
      requireAuth,
      openSignIn,
      closeSignIn,
      syncToCloud,
      registerAccount,
      completeEmailVerification,
      loginWithEmail,
      logout,
      deleteCloudData,
      ...myListData,
      ...cwData,
      ...shData,
      ...collectionsData,
      // Protected mutations must win over the raw hooks, so they are spread
      // last. Everything else (reads, progress, search history) is unchanged.
      ...gated,
    }),
    [user, requireAuth, openSignIn, closeSignIn, syncToCloud, registerAccount, completeEmailVerification, loginWithEmail, logout, deleteCloudData, myListData, cwData, shData, collectionsData, gated]
  );

  return (
    <AppContext.Provider value={value}>
      <SyncStatusContext.Provider value={syncValue}>
        {children}
        {/* Mounted only while open, and keyed by mode+reason. Remounting is how
            the dialog guarantees a blank form: no half-typed password, no stale
            error, no leftover "check your inbox" panel from last time.
            AnimatePresence is kept around it so the dismiss still fades out
            instead of vanishing — the rest of the app cross-fades every route
            change, and a modal that blinks out is felt. */}
        <AnimatePresence>
          {signIn.open && (
            <SignInDialog
              key={`${signIn.mode}:${signIn.reason}`}
              initialMode={signIn.mode}
              reason={signIn.reason}
              onClose={closeSignIn}
            />
          )}
        </AnimatePresence>
      </SyncStatusContext.Provider>
    </AppContext.Provider>
  );
}
