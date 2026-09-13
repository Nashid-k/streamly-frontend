import { useMemo } from "react";
import { AppContext } from "./auth";
import { useMyList, useContinueWatching, useSearchHistory } from "../hooks/useUserData";

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
