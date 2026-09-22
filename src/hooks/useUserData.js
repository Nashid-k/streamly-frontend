import { useState, useEffect, useCallback, useRef } from 'react';
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

export function useMyList() {
  const [myList, setMyList] = useState(() => readStorage('aios_my_list'));

  useEffect(() => {
    const sync = () => setMyList((current) => mergeStoredList(current, readStorage('aios_my_list')));
    window.addEventListener('aios_sync_mylist', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('aios_sync_mylist', sync); window.removeEventListener('storage', sync); };
  }, []);

  const myListRef = useRef(myList);
  myListRef.current = myList;

  const toggleMyList = useCallback((movie) => {
    if (!movie?.id) return;
    const prev = myListRef.current;
    const exists = prev.some(m => m.id === movie.id);
    // updatedAt drives timestamp-aware cloud merges (src/utils/mergeRemote.js).
    const next = exists
      ? prev.filter(m => m.id !== movie.id)
      : [...prev, { ...movie, updatedAt: Date.now() }];
    setMyList(next);
    writeStorage('aios_my_list', next);
    dispatch('aios_sync_mylist');
  }, []);

  const removeBatchFromMyList = useCallback((movieIds) => {
    if (!Array.isArray(movieIds) || movieIds.length === 0) return;
    const idSet = new Set(movieIds);
    const prev = myListRef.current;
    const next = prev.filter(m => !idSet.has(m.id));
    setMyList(next);
    writeStorage('aios_my_list', next);
    dispatch('aios_sync_mylist');
  }, []);

  const isInList = useCallback((id) => myList.some(m => m.id === id), [myList]);

  return { myList, toggleMyList, removeBatchFromMyList, isInList };
}

/* User-created collections — named folders that group saved titles.
   Persisted under aios_my_collections, cross-tab via aios_sync_collections.
   itemIds reference aios_my_list ids so a collection never duplicates a
   title's full payload. Collections ride the same cloud payload as the
   watchlist when signed in (src/context/AuthContext.jsx). */
const COLLECTIONS_KEY = 'aios_my_collections';
const COLLECTIONS_SYNC = 'aios_sync_collections';

function makeCollectionId() {
  return `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

// morphCollections + makePublicId live in ./collectionMorph (shared with the
// cloud-sync layer so uploads always carry the normalized v2 shape).

/* Merge freshly-read storage into the current state using the same
   timestamp-aware rules as the cloud merge, so a second tab's writes are no
   longer clobbered (the old `setX(readStorage(key))` was blind last-write-
   wins on the WHOLE array and silently dropped the other tab's updates). */
function mergeStoredCollections(current, incoming) {
  const merged = mergeListsById(current, morphCollections(incoming), {
    pruneTombstonesMs: TOMBSTONE_TTL_MS,
  });
  return JSON.stringify(merged) === JSON.stringify(current) ? current : merged;
}

function mergeStoredList(current, incoming, { limit } = {}) {
  const merged = mergeListsById(current, incoming, { limit });
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

  /* Delete keeps a 30-day tombstone so the deletion survives cloud +
     cross-tab merges (old devices re-uploading a stale copy can no longer
     resurrect it). The card UI filters tombstones out of view. */
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
  const [continueWatching, setContinueWatching] = useState(() =>
    readStorage('aios_continue_watching').sort((a,b) => b.lastWatched - a.lastWatched)
  );

  useEffect(() => {
    const sync = () =>
      setContinueWatching((current) =>
        mergeStoredList(current, readStorage('aios_continue_watching'), { limit: 20 }).sort(
          (a, b) => b.lastWatched - a.lastWatched,
        ),
      );
    window.addEventListener('aios_sync_cw', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('aios_sync_cw', sync); window.removeEventListener('storage', sync); };
  }, []);

  const cwRef = useRef(continueWatching);
  cwRef.current = continueWatching;

  const updateProgress = useCallback((movie, season = null, episode = null, timestamp = null) => {
    if (!movie?.id) return;
    setContinueWatching(prev => {
      const existing = prev.find(m => m.id === movie.id);
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
      const updated = [newItem, ...prev.filter(m => m.id !== movie.id)].slice(0, 20);
      writeStorage('aios_continue_watching', updated);
      dispatch('aios_sync_cw');
      return updated;
    });
  }, []);

  const removeFromContinueWatching = useCallback((movieId) => {
    setContinueWatching(prev => {
      const updated = prev.filter(m => m.id !== movieId);
      writeStorage('aios_continue_watching', updated);
      dispatch('aios_sync_cw');
      return updated;
    });
  }, []);

  const removeBatchFromContinueWatching = useCallback((movieIds) => {
    if (!Array.isArray(movieIds) || movieIds.length === 0) return;
    const idSet = new Set(movieIds);
    setContinueWatching(prev => {
      const updated = prev.filter(m => !idSet.has(m.id));
      writeStorage('aios_continue_watching', updated);
      dispatch('aios_sync_cw');
      return updated;
    });
  }, []);

  const clearContinueWatching = useCallback(() => {
    setContinueWatching([]);
    removeStorage('aios_continue_watching');
    dispatch('aios_sync_cw');
  }, []);

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
