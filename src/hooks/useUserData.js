import { useState, useEffect, useCallback, useRef } from 'react';

function safeJsonParse(str, fallback = []) {
  try { return JSON.parse(str) ?? fallback; } catch { return fallback; }
}

function readStorage(key, fallback = []) {
  try { return safeJsonParse(localStorage.getItem(key), fallback); } catch { return fallback; }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function removeStorage(key) {
  try { localStorage.removeItem(key); } catch {}
}
function dispatch(name) {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(name));
}

export function useMyList() {
  const [myList, setMyList] = useState(() => readStorage('aios_my_list'));

  useEffect(() => {
    const sync = () => setMyList(readStorage('aios_my_list'));
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
    const next = exists ? prev.filter(m => m.id !== movie.id) : [...prev, movie];
    setMyList(next);
    writeStorage('aios_my_list', next);
    dispatch('aios_sync_mylist');
  }, []);

  const isInList = useCallback((id) => myList.some(m => m.id === id), [myList]);

  return { myList, toggleMyList, isInList };
}

export function useContinueWatching() {
  const [continueWatching, setContinueWatching] = useState(() =>
    readStorage('aios_continue_watching').sort((a,b) => b.lastWatched - a.lastWatched)
  );

  useEffect(() => {
    const sync = () => setContinueWatching(readStorage('aios_continue_watching').sort((a,b) => b.lastWatched - a.lastWatched));
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
      const newItem = { ...movie, lastWatched: Date.now(), savedSeason: season, savedEpisode: episode, timestamp: finalTimestamp };
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

  const clearContinueWatching = useCallback(() => {
    setContinueWatching([]);
    removeStorage('aios_continue_watching');
    dispatch('aios_sync_cw');
  }, []);

  return { continueWatching, updateProgress, removeFromContinueWatching, clearContinueWatching };
}

export function useSearchHistory() {
  const [searchHistory, setSearchHistory] = useState(() => readStorage('aios_search_history'));

  useEffect(() => {
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
