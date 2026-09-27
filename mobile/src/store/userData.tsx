/* Local user data for the Android app.
 *
 * Mirrors the web build's localStorage stores (My List + Continue Watching) on
 * AsyncStorage so the same mental model holds on both surfaces. The keys live
 * under a `streamly.mobile.*` namespace: the web keys in architecture.md §3 are
 * frozen for the browser, and the phone has no business pretending to share a
 * localStorage namespace with it. */

import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { logError, logInfo, logWarn } from "../utils/logger";
import type { MediaItem } from "../api/tmdb";

const MY_LIST_KEY = "streamly.mobile.myList";
const CONTINUE_KEY = "streamly.mobile.continueWatching";

export interface MyListEntry {
  id: string;
  title: string;
  posterUrl: string | null;
  type: "movie" | "tv";
  addedAt: number;
}

export interface ProgressEntry {
  id: string;
  title: string;
  posterUrl: string | null;
  type: "movie" | "tv";
  season: number | null;
  episode: number | null;
  positionSec: number;
  durationSec: number;
  updatedAt: number;
}

interface UserDataValue {
  ready: boolean;
  myList: MyListEntry[];
  continueWatching: ProgressEntry[];
  isInMyList: (id: string) => boolean;
  toggleMyList: (item: MediaItem) => void;
  saveProgress: (item: MediaItem, positionSec: number, durationSec: number, season: number | null, episode: number | null) => void;
  removeProgress: (id: string) => void;
  clearAll: () => void;
}

const UserDataContext = createContext<UserDataValue | null>(null);

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return (Array.isArray(parsed) ? parsed : fallback) as T;
  } catch (error) {
    logError("userdata", `Could not read ${key}; using an empty store.`, error, { key });
    return fallback;
  }
}

async function writeJson(key: string, value: unknown) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    logError("userdata", `Could not persist ${key}.`, error, { key });
  }
}

export function UserDataProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [myList, setMyList] = useState<MyListEntry[]>([]);
  const [continueWatching, setContinueWatching] = useState<ProgressEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [list, progress] = await Promise.all([
        readJson<MyListEntry[]>(MY_LIST_KEY, []),
        readJson<ProgressEntry[]>(CONTINUE_KEY, []),
      ]);
      if (cancelled) return;
      // Newest first everywhere.
      setMyList([...list].sort((a, b) => b.addedAt - a.addedAt));
      setContinueWatching([...progress].sort((a, b) => b.updatedAt - a.updatedAt));
      setReady(true);
      logInfo("userdata", "Local store hydrated.", { myList: list.length, continueWatching: progress.length });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isInMyList = useCallback((id: string) => myList.some((entry) => entry.id === id), [myList]);

  const toggleMyList = useCallback(
    (item: MediaItem) => {
      setMyList((prev) => {
        const exists = prev.some((entry) => entry.id === item.id);
        const next = exists
          ? prev.filter((entry) => entry.id !== item.id)
          : [
              {
                id: item.id,
                title: item.title,
                posterUrl: item.posterUrl,
                type: item.type,
                addedAt: Date.now(),
              },
              ...prev,
            ];
        void writeJson(MY_LIST_KEY, next);
        logInfo("userdata", exists ? "Removed from My List." : "Added to My List.", { id: item.id });
        return next;
      });
    },
    [],
  );

  const saveProgress = useCallback(
    (item: MediaItem, positionSec: number, durationSec: number, season: number | null, episode: number | null) => {
      if (!Number.isFinite(positionSec) || positionSec < 5) return;
      setContinueWatching((prev) => {
        const next = [
          {
            id: item.id,
            title: item.title,
            posterUrl: item.posterUrl,
            type: item.type,
            season,
            episode,
            positionSec: Math.floor(positionSec),
            durationSec: Math.floor(durationSec) || 0,
            updatedAt: Date.now(),
          },
          ...prev.filter((entry) => entry.id !== item.id),
        ].slice(0, 40);
        void writeJson(CONTINUE_KEY, next);
        return next;
      });
    },
    [],
  );

  const removeProgress = useCallback((id: string) => {
    setContinueWatching((prev) => {
      const next = prev.filter((entry) => entry.id !== id);
      void writeJson(CONTINUE_KEY, next);
      logInfo("userdata", "Removed from Continue Watching.", { id });
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setMyList([]);
    setContinueWatching([]);
    void writeJson(MY_LIST_KEY, []);
    void writeJson(CONTINUE_KEY, []);
    logWarn("userdata", "Cleared all local data on user request.");
  }, []);

  const value = useMemo<UserDataValue>(
    () => ({ ready, myList, continueWatching, isInMyList, toggleMyList, saveProgress, removeProgress, clearAll }),
    [ready, myList, continueWatching, isInMyList, toggleMyList, saveProgress, removeProgress, clearAll],
  );

  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

export function useUserData(): UserDataValue {
  const ctx = useContext(UserDataContext);
  if (!ctx) throw new Error("useUserData must be used inside <UserDataProvider>.");
  return ctx;
}
