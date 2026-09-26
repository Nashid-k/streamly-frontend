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
