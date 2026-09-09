import { createContext, useContext } from "react";

export const DEFAULT_PREFERENCES = Object.freeze({
  autoplay: true,
  muteTrailers: false,
  hdThumbs: true,
  reduceMotion: false,
  notifications: true,
});

export const PreferencesContext = createContext(null);

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used inside <PreferencesProvider>");
  }
  return context;
}

// Lets reusable primitives retain sensible defaults in isolated tests/stories.
export function useOptionalPreferences() {
  return useContext(PreferencesContext);
}
