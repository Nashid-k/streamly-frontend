/* Runtime settings, typed on the phone.
 *
 * Two kinds of value live here. The playback preferences (default quality,
 * auto-play next) are the user-facing Settings screen. The connection fields
 * are deliberately NOT surfaced as a form any more: the shipped APK is pre-wired
 * to the deployed origin and the empty values mean "use the baked defaults" -
 * they exist so a fork or a self-hosted copy can be pointed elsewhere via a
 * build-time env var without touching code (see src/config.ts), not because the
 * person holding the phone should ever meet them. */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { logError, logInfo } from "../utils/logger";

const SETTINGS_KEY = "streamly.mobile.settings";

export type QualityPreference = "auto" | "1080" | "720" | "480";

export interface RuntimeSettings {
  /* Connection overrides (hidden; empty = the shipped deployment). */
  tmdbApiKey: string;
  tmdbProxy: string;
  apiBase: string;
  relayUrl: string;
  /* User-facing playback preferences. */
  defaultQuality: QualityPreference;
  autoPlayNext: boolean;
}

const EMPTY: RuntimeSettings = {
  tmdbApiKey: "",
  tmdbProxy: "",
  apiBase: "",
  relayUrl: "",
  defaultQuality: "auto",
  autoPlayNext: true,
};

/* Module-level mirror so non-React modules (api/*) can read the current values
 * synchronously. The provider is the only writer. */
let mirror: RuntimeSettings = EMPTY;
const listeners = new Set<() => void>();

export function runtimeSettings(): RuntimeSettings {
  return mirror;
}

function commit(next: RuntimeSettings) {
  mirror = next;
  listeners.forEach((notify) => notify());
}

interface SettingsValue {
  settings: RuntimeSettings;
  ready: boolean;
  save: (patch: Partial<RuntimeSettings>) => void;
  clearAll: () => void;
}

const SettingsContext = createContext<SettingsValue | null>(null);

function sanitize(raw: any): RuntimeSettings {
  const quality = raw?.defaultQuality;
  return {
    tmdbApiKey: typeof raw?.tmdbApiKey === "string" ? raw.tmdbApiKey.trim() : "",
    tmdbProxy: typeof raw?.tmdbProxy === "string" ? raw.tmdbProxy.trim() : "",
    apiBase: typeof raw?.apiBase === "string" ? raw.apiBase.trim() : "",
    relayUrl: typeof raw?.relayUrl === "string" ? raw.relayUrl.trim() : "",
    defaultQuality: quality === "1080" || quality === "720" || quality === "480" ? quality : "auto",
    autoPlayNext: typeof raw?.autoPlayNext === "boolean" ? raw.autoPlayNext : true,
  };
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<RuntimeSettings>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SETTINGS_KEY);
        const parsed = raw ? sanitize(JSON.parse(raw)) : EMPTY;
        if (cancelled) return;
        commit(parsed);
        setSettings(parsed);
        logInfo("settings", "Runtime settings hydrated.", {
          defaultQuality: parsed.defaultQuality,
          autoPlayNext: parsed.autoPlayNext,
        });
      } catch (error) {
        logError("settings", "Could not read runtime settings; starting empty.", error);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback((patch: Partial<RuntimeSettings>) => {
    setSettings((prev) => {
      const next = sanitize({ ...prev, ...patch });
      commit(next);
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch((error) =>
        logError("settings", "Could not persist runtime settings.", error),
      );
      logInfo("settings", "Runtime settings updated.", {
        defaultQuality: next.defaultQuality,
        autoPlayNext: next.autoPlayNext,
      });
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    commit(EMPTY);
    setSettings(EMPTY);
    AsyncStorage.removeItem(SETTINGS_KEY).catch((error) =>
      logError("settings", "Could not clear runtime settings.", error),
    );
    logInfo("settings", "Runtime settings cleared.");
  }, []);

  const value = useMemo<SettingsValue>(() => ({ settings, ready, save, clearAll }), [settings, ready, save, clearAll]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside <SettingsProvider>.");
  return ctx;
}

/* Lets any component re-render when a setting changes, so a screen that was
 * showing the setup state recovers the moment the user saves. */
export function useConfigTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const notify = () => setTick((t) => t + 1);
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }, []);
  return tick;
}
