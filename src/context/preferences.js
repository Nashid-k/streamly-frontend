import { createContext, useContext } from "react";

/* ── Server naming migration ──────────────────────────────────────────
   The player dropdown shipped as "Server 1 … Server 7", was renamed to
   Lisbon/Nebula/Solara/Athens/Joy/Castle/Sakura, then Canaias/SmashyStream
   joined as an 8th, then the "Server N (suffix)" style came back. Today the
   labels are plain Server 1 … 8; this map carries ANY legacy spelling across so
   existing visitors keep their exact priority. Same position, new label. */
export const LEGACY_SERVER_NAME_MAP = Object.freeze({
  "Lisbon": "Server 1",
  "Nebula": "Server 2",
  "Solara": "Server 3",
  "Athens": "Server 4",
  "Joy": "Server 5",
  "Castle": "Server 6",
  "Sakura": "Server 7",
  "Canaias": "Server 8",
  "Server 2 (Fast)": "Server 2",
  "Server 3 (HD)": "Server 3",
  "Server 4 (Backup)": "Server 4",
  "Server 5 (VidCore)": "Server 5",
  "Server 6 (Peachify)": "Server 6",
  "Server 7 (VidUp)": "Server 7",
  "Server 8 (Smashy)": "Server 8",
});

export function migrateServerOrder(order) {
  if (!Array.isArray(order)) return order;
  return order.map((name) =>
    typeof name === "string" && LEGACY_SERVER_NAME_MAP[name]
      ? LEGACY_SERVER_NAME_MAP[name]
      : name,
  );
}

/* ── Legacy player volume / mute migration (task.md 5.10) ──────────────
   The legacy player persisted the audible level as a bare number string
   (`"0.65"`) and mute as `"1"`/`"0"` under its own keys, and wrote them on
   every `volumechange` (`NativePlayerView.jsx:128-129`, `:1868-1869`). Folded
   into `setting-volume`/`setting-muted` here; these readers preserve a viewer's
   established level on the one-time read. Null means "not set", which is
   distinct from a valid `0` volume, so the fallback is never confused with a
   muting. */
export const LEGACY_VOLUME_KEY = "streamly-native-volume";
export const LEGACY_MUTED_KEY = "streamly-native-muted";

export function readLegacyVolume(storage) {
  try {
    const raw = storage.getItem(LEGACY_VOLUME_KEY);
    if (raw === null || raw === "") return null;
    const value = Number(raw);
    if (!Number.isFinite(value)) return null;
    return Math.min(1, Math.max(0, value));
  } catch {
    return null;
  }
}

export function readLegacyMuted(storage) {
  try {
    const raw = storage.getItem(LEGACY_MUTED_KEY);
    return raw === null ? null : raw === "1";
  } catch {
    return null;
  }
}

export const DEFAULT_PREFERENCES = Object.freeze({
  autoplay: true,
  muteTrailers: false,
  hdThumbs: true,
  reduceMotion: false,
  notifications: true,
  // Appearance
  theme: "default",
  accentSeed: null,
  episodeViewStyle: "carousel",
  detailViewType: "page",
  useImageLogos: true,
  trailers: true,
  spoilerFreeMode: false,
  // Playback
  autoSkipIntro: false,
  seekTime: 10,
  autoSubtitles: true,
  defaultLanguage: "en",
    // PLAYER V2 (task.md 3.9). Both were owned by the legacy player under
    // SEPARATE `streamly-native-*` keys (architecture.md:68-94); these are the
    // folded-into-PreferencesContext replacements, and `PreferencesContext`
    // migrates each with a one-time read of its legacy key.
    //
    // `aspect` stores the STABLE id ("fit", "cinema"), not a catalogue index —
    // an index is a position in someone else's array, so inserting a mode would
    // re-point every viewer who had picked the one after it. See
    // `player/v2/aspect.js` for the migration and the documented lossy edge.
  aspect: "fit",
    // Snapped onto `PLAYER_SPEEDS` on write, so it can only ever hold a rate the
    // UI is able to select.
  playbackRate: 1,
    // 5.9/5.10. The legacy player owned volume/muted under its own
    // `streamly-native-*` keys; folded in here and migrated once on boot.
    // `volume` is the audible level 0..1, `muted` the separate silence toggle,
    // so unmuting restores the level instead of resetting it.
  volume: 1,
  muted: false,
    // Downloads — when ON, files land in the browser's own download list (Ctrl+J)
    // instead of the File System Access picker. Built in memory first, so it suits
    // small/medium files.
  browserDownloads: false,
    // Servers — plain labels (Server 1 … Server 8). Orders saved under the interim
    // Lisbon/Nebula/… or "Server N (suffix)" names are migrated on boot.
  serverOrder: [
    "Server 1",
    "Server 2",
    "Server 3",
    "Server 4",
    "Server 5",
    "Server 6",
    "Server 7",
    "Server 8",
  ],
  // Subtitles
  subtitleFont: "cinejoy",
  subtitleSize: 100,
  subtitleColor: "#ffffff",
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
