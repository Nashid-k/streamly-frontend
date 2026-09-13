import { createContext, useContext } from "react";

/* Context + hook live apart from <AuthProvider> so fast-refresh only ever
   sees component exports in AuthContext.jsx (react-refresh constraint).
   hooks/useUserData owns the actual storage logic. */
export const AppContext = createContext(null);

export function useAppAuth() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppAuth must be used inside <AuthProvider>");
  return ctx;
}
