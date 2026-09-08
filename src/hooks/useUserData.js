import { useState, useEffect, useCallback, useRef } from 'react';

function safeJsonParse(str, fallback = []) {
  try { return JSON.parse(str) ?? fallback; } catch { return fallback; }
}
function dispatch(name) {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(name));
}

export function useMyList() {
  const [myList, setMyList] = useState(() => safeJsonParse(localStorage.getItem('aios_my_list'), []));

  useEffect(() => {
    const sync = () => setMyList(safeJsonParse(localStorage.getItem('aios_my_list'), []));
    window.addEventListener('aios_sync_mylist', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('aios_sync_mylist', sync); window.removeEventListener('storage', sync); };
  }, []);

  const myListRef = useRef(myList);
  myListRef.current = myList;

  const toggleMyList = useCallback((movie) => {
    const prev = myListRef.current;
    const exists = prev.some(m => m.id === movie.id);
    const next = exists ? prev.filter(m => m.id !== movie.id) : [...prev, movie];
    setMyList(next);
    localStorage.setItem('aios_my_list', JSON.stringify(next));
    dispatch('aios_sync_mylist');
  }, []);

  const isInList = useCallback((id) => myList.some(m => m.id === id), [myList]);

  return { myList, toggleMyList, isInList };
}

export function useContinueWatching() {
  const [continueWatching, setContinueWatching] = useState(() =>
    safeJsonParse(localStorage.getItem('aios_continue_watching'), []).sort((a,b) => b.lastWatched - a.lastWatched)
  );

  useEffect(() => {
    const sync = () => setContinueWatching(safeJsonParse(localStorage.getItem('aios_continue_watching'), []).sort((a,b) => b.lastWatched - a.lastWatched));
    window.addEventListener('aios_sync_cw', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('aios_sync_cw', sync); window.removeEventListener('storage', sync); };
  }, []);

  const cwRef = useRef(continueWatching);
  cwRef.current = continueWatching;

  const updateProgress = useCallback((movie, season = null, episode = null, timestamp = null) => {
    setContinueWatching(prev => {
      const existing = prev.find(m => m.id === movie.id);
      const finalTimestamp = timestamp !== null ? timestamp : existing?.timestamp ?? null;
      const newItem = { ...movie, lastWatched: Date.now(), savedSeason: season, savedEpisode: episode, timestamp: finalTimestamp };
      const updated = [newItem, ...prev.filter(m => m.id !== movie.id)].slice(0, 20);
      localStorage.setItem('aios_continue_watching', JSON.stringify(updated));
      dispatch('aios_sync_cw');
      return updated;
    });
  }, []);

  const removeFromContinueWatching = useCallback((movieId) => {
    setContinueWatching(prev => {
      const updated = prev.filter(m => m.id !== movieId);
      localStorage.setItem('aios_continue_watching', JSON.stringify(updated));
      dispatch('aios_sync_cw');
      return updated;
    });
  }, []);

  const clearContinueWatching = useCallback(() => {
    setContinueWatching([]);
    localStorage.removeItem('aios_continue_watching');
    dispatch('aios_sync_cw');
  }, []);

  return { continueWatching, updateProgress, removeFromContinueWatching, clearContinueWatching };
}

export function useSearchHistory() {
  const [searchHistory, setSearchHistory] = useState(() => safeJsonParse(localStorage.getItem('aios_search_history'), []));

  useEffect(() => {
    const sync = () => setSearchHistory(safeJsonParse(localStorage.getItem('aios_search_history'), []));
    window.addEventListener('aios_sync_sh', sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('aios_sync_sh', sync); window.removeEventListener('storage', sync); };
  }, []);

  const addSearch = useCallback((query) => {
    const term = query.trim();
    if (!term) return;
    setSearchHistory(prev => {
      const updated = [term, ...prev.filter(t => t.toLowerCase() !== term.toLowerCase())].slice(0, 10);
      localStorage.setItem('aios_search_history', JSON.stringify(updated));
      dispatch('aios_sync_sh');
      return updated;
    });
  }, []);

  const removeSearch = useCallback((query) => {
    setSearchHistory(prev => {
      const updated = prev.filter(t => t !== query);
      localStorage.setItem('aios_search_history', JSON.stringify(updated));
      dispatch('aios_sync_sh');
      return updated;
    });
  }, []);

  const clearSearchHistory = useCallback(() => {
    setSearchHistory([]);
    localStorage.removeItem('aios_search_history');
    dispatch('aios_sync_sh');
  }, []);

  return { searchHistory, addSearch, removeSearch, clearSearchHistory };
}
