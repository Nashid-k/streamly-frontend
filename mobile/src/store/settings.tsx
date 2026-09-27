/* Runtime settings, typed on the phone.
 *
 * Why this exists: a shipped APK has no `.env`. Asking someone to edit a file on
 * a build machine to make an installed app show a catalogue is a dead end, and a
 * "TMDB is not configured" wall on first launch is worse - it reads as a broken
 * app. So the credentials are entered in Settings, persisted in AsyncStorage, and
 * read at REQUEST time (see src/config.ts), which means a wrong value can be
 * corrected without a rebuild.
 *
 * A TMDB key is a public read token; the deployed /api/tmdb proxy is offered
 * first so a user can stay keyless entirely. */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { logError, logInfo } from "../utils/logger";

const SETTINGS_KEY = "streamly.mobile.settings";

export interface RuntimeSettings {
  tmdbApiKey: string;
  tmdbProxy: string;
  apiBase: string;
  relayUrl: string;
}

const EMPTY: RuntimeSettings = { tmdbApiKey: "", tmdbProxy: "", apiBase: "", relayUrl: "" };

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
  return {
    tmdbApiKey: typeof raw?.tmdbApiKey === "string" ? raw.tmdbApiKey.trim() : "",
    tmdbProxy: typeof raw?.tmdbProxy === "string" ? raw.tmdbProxy.trim() : "",
    apiBase: typeof raw?.apiBase === "string" ? raw.apiBase.trim() : "",
    relayUrl: typeof raw?.relayUrl === "string" ? raw.relayUrl.trim() : "",
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
          hasKey: Boolean(parsed.tmdbApiKey),
          hasProxy: Boolean(parsed.tmdbProxy),
          hasApiBase: Boolean(parsed.apiBase),
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
        hasKey: Boolean(next.tmdbApiKey),
        hasProxy: Boolean(next.tmdbProxy),
        hasApiBase: Boolean(next.apiBase),
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
