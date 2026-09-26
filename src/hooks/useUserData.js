import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { logError, logWarn } from '../utils/debugLogger';
import { mergeListsById } from '../utils/mergeRemote';
import { makePublicId, morphCollections } from './collectionMorph';

// Tombstone GC window: a deleted collection is kept (as a tombstone) for 30
// days so every synced device sees the delete, then dropped on merge.
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function safeJsonParse(str, fallback = []) {
  try { return JSON.parse(str) ?? fallback; } catch (error) {
    if (str !== null && str !== undefined) {
      logWarn('storage', 'Corrupt localStorage JSON — returning fallback. Clearing the key may fix stale UI.', { message: error?.message });
    }
    return fallback;
  }
}

function readStorage(key, fallback = []) {
  try { return safeJsonParse(localStorage.getItem(key), fallback); } catch (error) {
    logError('storage', `Failed to read localStorage key "${key}".`, error, { key });
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    logError('storage', `Failed to write localStorage key "${key}" (quota exceeded or private mode?). Change kept in memory only.`, error, { key });
    return false;
  }
}

function removeStorage(key) {
  try { localStorage.removeItem(key); } catch (error) {
    logError('storage', `Failed to remove localStorage key "${key}".`, error, { key });
  }
}
function dispatch(name) {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(name));
}

/* Legacy payloads can carry string timestamps; coerce before any comparison
   (raw strings otherwise outrank every number in a JS compare). */
function toMillis(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function splitTombstones(list) {
  const tombstones = [];
  const live = [];
  for (const item of list || []) {
    if (item && item.deletedAt !== undefined) tombstones.push(item);
    else live.push(item);
  }
  return { tombstones, live };
}

export function useMyList() {
    // State retains tombstones (so cloud/cross-tab merges can't resurrect a
    // removed title) while the EXPOSED list filters them out. Removals write
    // { id, deletedAt } markers and mergeListsById prunes them after 30 days.
  const [myListState, setMyListState] = useState(() => readStorage('aios_my_list'));

  useEffect(() => {
    const sync = () =>
      setMyListState((current) =>
        mergeStoredList(current, readStorage('aios_my_list'), { pruneTombstonesMs: TOMBSTONE_TTL_MS }),
      );
    window.addEventListener('aios_sync_mylist', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('aios_sync_mylist', sync); window.removeEventListener('storage', sync); };
  }, []);

  const myListRef = useRef(myListState);
  myListRef.current = myListState;

  const myList = useMemo(
    () => splitTombstones(myListState).live,
    [myListState],
  );

  const toggleMyList = useCallback((movie) => {
    if (!movie?.id) return;
    const prev = myListRef.current;
    const exists = prev.some(m => m.id === movie.id && m.deletedAt === undefined);
        // updatedAt drives timestamp-aware cloud merges (src/utils/mergeRemote.js);
        // a removal becomes a tombstone (delete on every device) and a re-add drops
        // the stale tombstone for a fresh live copy.
    const next = exists
      ? prev.map(m => (m.id === movie.id ? { ...m, deletedAt: Date.now(), updatedAt: Date.now() } : m))
      : [...prev.filter(m => m.id !== movie.id), { ...movie, updatedAt: Date.now() }];
    setMyListState(next);
    writeStorage('aios_my_list', next);
    dispatch('aios_sync_mylist');
  }, []);

  const removeBatchFromMyList = useCallback((movieIds) => {
    if (!Array.isArray(movieIds) || movieIds.length === 0) return;
    const idSet = new Set(movieIds);
    const prev = myListRef.current;
    const next = prev.map(m =>
      idSet.has(m.id) && m.deletedAt === undefined
        ? { ...m, deletedAt: Date.now(), updatedAt: Date.now() }
        : m,
    );
    setMyListState(next);
    writeStorage('aios_my_list', next);
    dispatch('aios_sync_mylist');
  }, []);

  const isInList = useCallback(
    (id) => myList.some(m => m.id === id),
    [myList],
  );

  return { myList, toggleMyList, removeBatchFromMyList, isInList };
}

/* User-created collections — named folders grouping saved titles. Persisted under
   aios_my_collections, cross-tab via aios_sync_collections; itemIds reference
   aios_my_list ids so a collection never duplicates a title's payload. They ride
   the same cloud payload as the watchlist (src/context/AuthContext.jsx). */
const COLLECTIONS_KEY = 'aios_my_collections';
const COLLECTIONS_SYNC = 'aios_sync_collections';

function makeCollectionId() {
  return `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// morphCollections + makePublicId live in ./collectionMorph (shared with the
// cloud-sync layer so uploads always carry the normalized v2 shape).

/* Merge freshly-read storage into current state with the same timestamp-aware
   rules as the cloud merge, so a second tab's writes are not clobbered (the old
   blind setX(readStorage(key)) silently dropped them). */
function mergeStoredCollections(current, incoming) {
  const merged = mergeListsById(current, morphCollections(incoming), {
    pruneTombstonesMs: TOMBSTONE_TTL_MS,
  });
  return JSON.stringify(merged) === JSON.stringify(current) ? current : merged;
}

function mergeStoredList(current, incoming, { limit, pruneTombstonesMs, sortBy } = {}) {
  const merged = mergeListsById(current, incoming, { limit, pruneTombstonesMs, sortBy });
  return JSON.stringify(merged) === JSON.stringify(current) ? current : merged;
}

export function useMyCollections() {
  const [collections, setCollections] = useState(() => morphCollections(readStorage(COLLECTIONS_KEY)));

  useEffect(() => {
    const sync = () =>
      setCollections((current) => mergeStoredCollections(current, readStorage(COLLECTIONS_KEY)));
    window.addEventListener(COLLECTIONS_SYNC, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(COLLECTIONS_SYNC, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const collectionsRef = useRef(collections);
  collectionsRef.current = collections;

  const commitCollections = useCallback((next) => {
    setCollections(next);
    writeStorage(COLLECTIONS_KEY, next);
    dispatch(COLLECTIONS_SYNC);
  }, []);

  const createCollection = useCallback((name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    const id = makeCollectionId();
    const next = [
      ...collectionsRef.current,
      { id, name: trimmed, createdAt: Date.now(), updatedAt: Date.now(), itemIds: [] },
    ];
    commitCollections(next);
    return id;
  }, [commitCollections]);

  /* Atomic create-and-fill: builds the new collection WITH itemIds in one
     commit, so a follow-up addToCollection call can't race a stale ref. */
  const createCollectionWithItems = useCallback((name, movieIds) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    const ids = Array.isArray(movieIds)
      ? [...new Set(movieIds.filter(Boolean))]
      : [];
    const id = makeCollectionId();
    const next = [
      ...collectionsRef.current,
      { id, name: trimmed, createdAt: Date.now(), updatedAt: Date.now(), itemIds: ids },
    ];
    commitCollections(next);
    return id;
  }, [commitCollections]);

  const renameCollection = useCallback((id, name) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    commitCollections(
      collectionsRef.current.map((c) =>
        c.id === id ? { ...c, name: trimmed, updatedAt: Date.now() } : c,
      ),
    );
  }, [commitCollections]);

    /* Delete keeps a 30-day tombstone so it survives cloud + cross-tab merges (a
       stale re-upload can no longer resurrect it). The card UI filters them out. */
  const deleteCollection = useCallback((id) => {
    const target = collectionsRef.current.find((c) => c.id === id);
    if (!target) return;
    const next = collectionsRef.current
      .map((c) => (c.id === id ? { ...c, deletedAt: Date.now(), updatedAt: Date.now() } : c))
      .filter((c) => c.id !== id || c.visibility === 'public');
    commitCollections(next);
  }, [commitCollections]);

  const addToCollection = useCallback((id, movieIds) => {
    const ids = Array.isArray(movieIds) ? movieIds.filter(Boolean) : [];
    if (ids.length === 0) return;
    commitCollections(
      collectionsRef.current.map((c) => {
        if (c.id !== id) return c;
        const merged = [...new Set([...c.itemIds, ...ids])];
        return { ...c, itemIds: merged, updatedAt: Date.now() };
      }),
    );
  }, [commitCollections]);

  const removeFromCollection = useCallback((id, movieId) => {
    commitCollections(
      collectionsRef.current.map((c) => {
        if (c.id !== id) return c;
        return {
          ...c,
          itemIds: c.itemIds.filter((mid) => mid !== movieId),
          updatedAt: Date.now(),
        };
      }),
    );
  }, [commitCollections]);

  const toggleInCollection = useCallback((id, movieId) => {
    const col = collectionsRef.current.find((c) => c.id === id);
    if (!col) return;
    if (col.itemIds.includes(movieId)) {
      removeFromCollection(id, movieId);
    } else {
      addToCollection(id, [movieId]);
    }
  }, [addToCollection, removeFromCollection]);

  const setCollectionVisibility = useCallback((id, visibility) => {
    const next = visibility === 'public' ? 'public' : 'private';
    commitCollections(
      collectionsRef.current.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, visibility: next, updatedAt: Date.now() };
        if (next === 'public' && !updated.publicId) updated.publicId = makePublicId();
        return updated;
      }),
    );
  }, [commitCollections]);

  // Tombstoned collections stay in storage for merge purposes but never show.
  const liveCollections = collections.filter((c) => c.deletedAt === undefined);
  const publicCollections = liveCollections.filter((c) => c.visibility === 'public');

  const getPublicCollection = useCallback((publicId) => {
    if (!publicId) return null;
    return collectionsRef.current.find(
      (c) => c.deletedAt === undefined && c.visibility === 'public' && c.publicId === publicId,
    ) || null;
  }, []);

  return {
    collections: liveCollections,
    createCollection,
    createCollectionWithItems,
    renameCollection,
    deleteCollection,
    addToCollection,
    removeFromCollection,
    toggleInCollection,
    setCollectionVisibility,
    publicCollections,
    getPublicCollection,
  };
}

export function useContinueWatching() {
    // Raw state includes tombstones; the exposed list filters them out. The
    // 20-title cap applies to LIVE entries only, so a delete marker is never sliced
    // away (a sliced tombstone resurrects the title on the next cloud pull).
  const [cwState, setCwState] = useState(() => readStorage('aios_continue_watching'));

  const sortByLastWatched = useCallback((a, b) => toMillis(b.lastWatched) - toMillis(a.lastWatched), []);

  useEffect(() => {
    const sync = () =>
      setCwState((current) =>
        mergeStoredList(current, readStorage('aios_continue_watching'), {
          limit: 20,
          pruneTombstonesMs: TOMBSTONE_TTL_MS,
          sortBy: sortByLastWatched,
        }),
      );
    window.addEventListener('aios_sync_cw', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('aios_sync_cw', sync); window.removeEventListener('storage', sync); };
  }, [sortByLastWatched]);

  const cwRef = useRef(cwState);
  cwRef.current = cwState;

  // Live (non-tombstoned), most-recently-watched first.
  const continueWatching = useMemo(
    () => splitTombstones(cwState).live.sort(sortByLastWatched),
    [cwState, sortByLastWatched],
  );

  const commitCw = useCallback((nextRaw) => {
    setCwState(nextRaw);
    writeStorage('aios_continue_watching', nextRaw);
    dispatch('aios_sync_cw');
  }, []);

  const updateProgress = useCallback((movie, season = null, episode = null, timestamp = null) => {
    if (!movie?.id) return;
    const prev = cwRef.current;
    const existing = prev.find(m => m.id === movie.id && m.deletedAt === undefined);
    const finalTimestamp = timestamp !== null ? timestamp : existing?.timestamp ?? null;
    // Keep every field the caller didn't set (e.g. watchedEpisodes) so
    // playing an episode never wipes the per-episode watch set.
    const newItem = {
      ...(existing || {}),
      ...movie,
      lastWatched: Date.now(),
      // updatedAt drives timestamp-aware cloud merges (src/utils/mergeRemote.js).
      updatedAt: Date.now(),
      savedSeason: season !== null && season !== undefined ? season : existing?.savedSeason ?? null,
      savedEpisode: episode !== null && episode !== undefined ? episode : existing?.savedEpisode ?? null,
      timestamp: finalTimestamp,
    };
    // Drop this id's live copy AND tombstone (re-watching revives a title),
    // keep the rest of the live list, cap, then re-attach surviving tombstones.
    const { tombstones, live } = splitTombstones(prev);
    const withoutOld = live.filter(m => m.id !== movie.id);
    const liveUpdated = [...withoutOld, newItem]
      .sort((a, b) => toMillis(b.lastWatched) - toMillis(a.lastWatched))
      .slice(0, 20);
    commitCw([...liveUpdated, ...tombstones.filter(t => t.id !== movie.id)]);
  }, [commitCw]);

  const removeFromContinueWatching = useCallback((movieId) => {
    const prev = cwRef.current;
    commitCw(prev.map(m =>
      m.id === movieId && m.deletedAt === undefined
        ? { ...m, deletedAt: Date.now(), updatedAt: Date.now() }
        : m,
    ));
  }, [commitCw]);

  const removeBatchFromContinueWatching = useCallback((movieIds) => {
    if (!Array.isArray(movieIds) || movieIds.length === 0) return;
    const idSet = new Set(movieIds);
    const prev = cwRef.current;
    commitCw(prev.map(m =>
      idSet.has(m.id) && m.deletedAt === undefined
        ? { ...m, deletedAt: Date.now(), updatedAt: Date.now() }
        : m,
    ));
  }, [commitCw]);

  const clearContinueWatching = useCallback(() => {
    const prev = cwRef.current;
    const now = Date.now();
    commitCw(prev.map(m =>
      m.deletedAt === undefined ? { ...m, deletedAt: now, updatedAt: now } : m,
    ));
  }, [commitCw]);

  return {
    continueWatching,
    updateProgress,
    removeFromContinueWatching,
    removeBatchFromContinueWatching,
    clearContinueWatching,
  };
}

export function useSearchHistory() {
  const [searchHistory, setSearchHistory] = useState(() => readStorage('aios_search_history'));

  useEffect(() => {
    // Search history merge is order-preserving by design (most-recent-first);
    // a union by id doesn't apply here, so keep last-write-wins for it.
    const sync = () => setSearchHistory(readStorage('aios_search_history'));
    window.addEventListener('aios_sync_sh', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('aios_sync_sh', sync); window.removeEventListener('storage', sync); };
  }, []);

  const addSearch = useCallback((query) => {
    const term = query.trim();
    if (!term) return;
    setSearchHistory(prev => {
      const updated = [term, ...prev.filter(t => t.toLowerCase() !== term.toLowerCase())].slice(0, 10);
      writeStorage('aios_search_history', updated);
      dispatch('aios_sync_sh');
      return updated;
    });
  }, []);

  const removeSearch = useCallback((query) => {
    setSearchHistory(prev => {
      const updated = prev.filter(t => t !== query);
      writeStorage('aios_search_history', updated);
      dispatch('aios_sync_sh');
      return updated;
    });
  }, []);

  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
    removeStorage('aios_search_history');
    dispatch('aios_sync_sh');
  }, []);

  return { searchHistory, addSearch, removeSearch, clearSearchHistory };
}
