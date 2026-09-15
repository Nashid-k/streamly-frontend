/**
 * Streamly Contexts Barrel
 *
 * Consolidated exports for Auth and Preferences context providers and hooks.
 */

export { AppContext, useAppAuth } from "./auth";
export { AuthProvider } from "./AuthContext";
export { PreferencesProvider, LEGACY_SERVER_NAME_MAP } from "./PreferencesContext";
export {
  PreferencesContext,
  usePreferences,
  useOptionalPreferences,
  DEFAULT_PREFERENCES,
  migrateServerOrder,
} from "./preferences";
