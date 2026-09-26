// src/utils/preferencesSnapshot.js — bridge between the cloud-sync layer and the
// settings engine without importing the React context (AuthContext must stay
// import-safe from tests and non-React modules). Snapshot: reads every `setting-*`
// key the Preferences engine owns. Apply: writes ONLY keys this device has never
// set locally, so a second device's defaults can never clobber local choices.

import { DEFAULT_PREFERENCES } from '../context/preferences';
import { logDebug } from './debugLogger';

const SETTING_PREFIX = 'setting-';

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Every known preference + its locally stored value (or the default). */
export function readPreferencesSnapshot() {
  const snapshot = {};
  for (const key of Object.keys(DEFAULT_PREFERENCES)) {
    const stored = localStorage.getItem(`${SETTING_PREFIX}${key}`);
    if (stored !== null) {
      snapshot[key] = safeParse(stored, DEFAULT_PREFERENCES[key]);
    }
  }
  return snapshot;
}

/** Fill in preferences this device has never touched. Returns the applied keys so
    the caller can log/toast. Never overwrites a local choice. */
export function applyRemotePreferences(remote = {}) {
  const applied = [];
  for (const [key, value] of Object.entries(remote)) {
    if (!Object.hasOwn(DEFAULT_PREFERENCES, key)) continue;
    if (localStorage.getItem(`${SETTING_PREFIX}${key}`) !== null) continue;
    try {
      localStorage.setItem(`${SETTING_PREFIX}${key}`, JSON.stringify(value));
      applied.push(key);
    } catch {
      // storage unavailable — skip silently-but-logged
    }
  }
  if (applied.length > 0) {
    logDebug('auth', `Applied ${applied.length} cloud preferences for never-set keys.`, { applied });
    // The Preferences engine listens for storage events; the direct same-tab
    // path needs a nudge on some browsers, so dispatch one.
    try {
      window.dispatchEvent(new Event('aios_sync_preferences'));
    } catch {
      // non-DOM env
    }
  }
  return applied;
}
