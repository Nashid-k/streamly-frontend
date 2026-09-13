import { createContext, useContext, useMemo } from 'react';
import { useMyList, useContinueWatching, useSearchHistory } from '../hooks/useUserData';

const AppContext = createContext(null);

export function AuthProvider({ children }) {
  const myListData = useMyList();
  const cwData = useContinueWatching();
  const shData = useSearchHistory();

  const value = useMemo(
    () => ({ ...myListData, ...cwData, ...shData }),
    [myListData, cwData, shData],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppAuth() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppAuth must be used inside <AuthProvider>');
  return ctx;
}
