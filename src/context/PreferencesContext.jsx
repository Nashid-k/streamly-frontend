import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_PREFERENCES, PreferencesContext } from "./preferences";
const SETTING_PREFIX = "setting-";
const LEGACY_AUTOPLAY_KEY = "streamly_autoNext";

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
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function readPreference(key) {
  const fallback = DEFAULT_PREFERENCES[key];
  try {
    const stored = localStorage.getItem(`${SETTING_PREFIX}${key}`);
    if (stored !== null) return parseValue(stored, fallback);

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
    document.documentElement.dataset.theme = preferences.theme || "default";
  }, [preferences.theme]);

  const value = useMemo(
    () => ({ ...preferences, setPreference }),
    [preferences, setPreference],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
