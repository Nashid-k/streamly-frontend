/* Durable response cache for the catalogue.
 *
 * WHY THIS EXISTS. The backend is fast - measured cold through the deployed
 * proxy: /trending 1.3s, /movie/now_playing 450ms, /movie/top_rated 476ms,
 * /tv/airing_today 409ms, a search 380ms, and a cold 4-rail Home mount in
 * parallel 978ms. So "the catalogue takes too long" was never the server. It was
 * that the app had nowhere to remember anything: every single launch, every
 * single rail and every back-and-forth into Details threw the previous answer
 * away and re-paid the network. On a phone that is 4 round trips over a mobile
 * connection, once per rail, before anything is on screen.
 *
 * So: one JSON blob in AsyncStorage, newest-first, and every read is served
 * synchronously from an in-memory mirror. A warm launch paints the catalogue in
 * its first frame and revalidates behind the user's back (stale-while-
 * revalidate) instead of showing a spinner for it. The web build gets this from
 * React Query plus a Vercel edge cache; a native client has neither, so this is
 * the same trade in ~150 lines and no new dependency.
 *
 * Bounded on purpose: 60 entries, and anything over 512 KB of JSON is not
 * cached (a 205 KB /credits payload is fine, a runaway one is not - AsyncStorage
 * is a phone's disk, not a CDN). Writes are batched on an idle timer because a
 * cold Home mount would otherwise serialise six big JSON.stringify calls back to
 * back on the JS thread, which is exactly the kind of stall this file exists to
 * remove. */

import AsyncStorage from "@react-native-async-storage/async-storage";

import { logError, logInfo } from "../utils/logger";

const CACHE_KEY = "streamly.mobile.cache";
const MAX_ENTRIES = 60;
const MAX_ENTRY_BYTES = 512 * 1024;
const FLUSH_DELAY_MS = 400;

export interface CacheEntry<T = unknown> {
  data: T;
  savedAt: number;
}

type CacheFile = Record<string, CacheEntry>;

/* In-memory mirror. Null until the first read from disk finishes. */
let mirror: CacheFile | null = null;
let loading: Promise<CacheFile> | null = null;

let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flush();
  }, FLUSH_DELAY_MS);
}

async function flush() {
  const snapshot = mirror;
  if (!snapshot) return;
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
    dirty = false;
  } catch (error) {
    logError("cache", "Could not persist the catalogue cache; continuing in memory.", error);
  }
}

async function load(): Promise<CacheFile> {
  if (mirror) return mirror;
  if (loading) return loading;
  loading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      mirror = parsed && typeof parsed === "object" ? (parsed as CacheFile) : {};
      logInfo("cache", "Catalogue cache hydrated.", { entries: Object.keys(mirror).length });
    } catch (error) {
      // A corrupt cache must never be fatal - it is an optimisation, not data.
      logError("cache", "Could not read the catalogue cache; starting empty.", error);
      mirror = {};
    } finally {
      loading = null;
    }
    return mirror!;
  })();
  return loading;
}

function evict(file: CacheFile) {
  const keys = Object.keys(file);
  if (keys.length <= MAX_ENTRIES) return;
  keys
    .sort((a, b) => (file[b]?.savedAt ?? 0) - (file[a]?.savedAt ?? 0))
    .slice(MAX_ENTRIES)
    .forEach((key) => delete file[key]);
  logInfo("cache", "Trimmed the catalogue cache.", { kept: MAX_ENTRIES });
}

export async function readCache<T>(key: string): Promise<CacheEntry<T> | null> {
  const file = await load();
  const entry = file[key];
  if (!entry || typeof entry.savedAt !== "number") return null;
  return entry as CacheEntry<T>;
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  const file = await load();
  let serialised: string;
  try {
    serialised = JSON.stringify(data);
  } catch (error) {
    logError("cache", `Response for ${key} is not serialisable; not caching it.`, error);
    return;
  }
  if (serialised.length > MAX_ENTRY_BYTES) {
    logInfo("cache", `Skipped caching ${key} (response too large).`, { bytes: serialised.length });
    return;
  }
  file[key] = { data, savedAt: Date.now() };
  evict(file);
  scheduleFlush();
}

export async function clearCache(): Promise<void> {
  mirror = {};
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
    logInfo("cache", "Catalogue cache cleared.");
  } catch (error) {
    logError("cache", "Could not clear the catalogue cache.", error);
  }
}

/* Called when Settings repoints the app at a different deployment: a cached
 * response from the old origin is not an answer to a new question. */
export async function dropCache(): Promise<void> {
  await clearCache();
}
