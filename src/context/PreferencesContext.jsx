import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PREFERENCES,
  LEGACY_SERVER_NAME_MAP,
  migrateServerOrder,
  PreferencesContext,
} from "./preferences";
import { logDebug } from "../utils/debugLogger";
const SETTING_PREFIX = "setting-";
const LEGACY_AUTOPLAY_KEY = "streamly_autoNext";

export { LEGACY_SERVER_NAME_MAP };

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseValue(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  try {
    const value = JSON.parse(raw);
    if (typeof fallback === "boolean") {
      return typeof value === "boolean" ? value : fallback;
    }
    if (typeof fallback === "number") {
      return typeof value === "number" ? value : fallback;
    }
    if (typeof fallback === "string") {
      return typeof value === "string" ? value : fallback;
    }
    if (Array.isArray(fallback)) {
      return Array.isArray(value) ? value : fallback;
    }
    if (isPlainObject(fallback)) {
      // Merge over the defaults so newly added control keys default to on
      // even for visitors with older stored objects, and so corrupt stored
      // values (strings, numbers, arrays) can never break consumers.
      return { ...fallback, ...(isPlainObject(value) ? value : {}) };
    }
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function readPreference(key) {
  const fallback = DEFAULT_PREFERENCES[key];
  try {
    const stored = localStorage.getItem(`${SETTING_PREFIX}${key}`);
    if (stored !== null) {
      let value = parseValue(stored, fallback);
      if (key === "serverOrder") {
        const migrated = migrateServerOrder(value);
        if (JSON.stringify(migrated) !== JSON.stringify(value)) {
          logDebug("preferences", "Migrated saved server order to the restored Server 1–8 labels.", { order: migrated });
        }
        value = migrated;
        // Persist the renamed order so the stored key matches the current
        // labels (idempotent — subsequent boots see no legacy names).
        try {
          localStorage.setItem(`${SETTING_PREFIX}serverOrder`, JSON.stringify(value));
        } catch {
          // In-memory rename still applies for this visit.
        }
      }
      return value;
    }

    // The player owned this value before the Settings page existed. Preserve a
    // viewer's established autoplay preference during the migration.
    if (key === "autoplay") {
      const legacy = localStorage.getItem(LEGACY_AUTOPLAY_KEY);
      if (legacy !== null) return legacy !== "false";
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
  return fallback;
}

function readPreferences() {
  return Object.fromEntries(
    Object.keys(DEFAULT_PREFERENCES).map((key) => [key, readPreference(key)]),
  );
}

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(readPreferences);

  const setPreference = useCallback((key, value) => {
    if (!Object.hasOwn(DEFAULT_PREFERENCES, key)) return;
    const fallback = DEFAULT_PREFERENCES[key];
    const nextValue =
      typeof fallback === "boolean" ? Boolean(value) : value;
    setPreferences((current) =>
      current[key] === nextValue ? current : { ...current, [key]: nextValue },
    );
    try {
      localStorage.setItem(`${SETTING_PREFIX}${key}`, JSON.stringify(nextValue));
    } catch {
      // Keep the in-memory choice for this visit even when persistence fails.
    }
  }, []);

  // Convenience: toggle one individual player-control button (e.g. "volume", "fullscreen")
  const setPlayerControl = useCallback((controlKey, enabled) => {
    setPreferences((current) => {
      const currentControls = isPlainObject(current.playerControls)
        ? current.playerControls
        : DEFAULT_PREFERENCES.playerControls;
      const next = { ...currentControls, [controlKey]: Boolean(enabled) };
      try {
        localStorage.setItem(`${SETTING_PREFIX}playerControls`, JSON.stringify(next));
      } catch {
        // Storage fallback
      }
      return { ...current, playerControls: next };
    });
  }, []);

  useEffect(() => {
    const syncFromAnotherTab = (event) => {
      if (!event.key || !event.key.startsWith(SETTING_PREFIX)) return;
      const key = event.key.slice(SETTING_PREFIX.length);
      if (!Object.hasOwn(DEFAULT_PREFERENCES, key)) return;
      setPreferences((current) => ({
        ...current,
        [key]: parseValue(event.newValue, DEFAULT_PREFERENCES[key]),
      }));
    };
    window.addEventListener("storage", syncFromAnotherTab);
    return () => window.removeEventListener("storage", syncFromAnotherTab);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = preferences.reduceMotion ? "true" : "false";
  }, [preferences.reduceMotion]);

  useEffect(() => {
    const theme = preferences.theme || "default";
    document.documentElement.dataset.theme = theme;
    logDebug("preferences", `theme applied: "${theme}". Accent-driven UI reads --accent-* vars.`, { theme });
  }, [preferences.theme]);

  // One-time cleanup of retired integrations (Trakt/Simkl handles, Ads and
  // Febbox settings). Runs on boot so removed features leave no stale keys.
  useEffect(() => {
    const retired = [
      "streamly_trakt",
      "streamly_simkl",
      "setting-enableAds",
      "setting-febboxCookie",
    ];
    for (const key of retired) {
      try {
        if (localStorage.getItem(key) !== null) {
          localStorage.removeItem(key);
          logDebug("preferences", `Retired stale key "${key}".`, { key });
        }
      } catch (error) {
        logDebug("preferences", `Could not retire stale key "${key}".`, { key, message: error?.message });
      }
    }
    try {
      delete document.documentElement.dataset.adsEnabled;
    } catch {
      // Non-DOM test environments may not support dataset mutation.
    }
  }, []);

  const value = useMemo(
    () => ({ ...preferences, setPreference, setPlayerControl }),
    [preferences, setPreference, setPlayerControl],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
