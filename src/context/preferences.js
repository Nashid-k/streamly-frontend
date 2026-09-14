import { createContext, useContext } from "react";

/* ── Server naming migration ──────────────────────────────────────────
   The player dropdown originally shipped as "Server 1 … Server 7", was
   renamed to Lisbon/Nebula/Solara/Athens/Joy/Castle/Sakura (f584ba3),
   then Canaias/SmashyStream was added as an 8th. The dropdown labels are
   now restored to Server 1 … Server 8; this map carries any saved order
   across so existing visitors keep their exact priority.
   Same position, new label. */
export const LEGACY_SERVER_NAME_MAP = Object.freeze({
  "Lisbon": "Server 1",
  "Nebula": "Server 2 (Fast)",
  "Solara": "Server 3 (HD)",
  "Athens": "Server 4 (Backup)",
  "Joy": "Server 5 (VidCore)",
  "Castle": "Server 6 (Peachify)",
  "Sakura": "Server 7 (VidUp)",
  "Canaias": "Server 8 (Smashy)",
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
  // Player control visibility toggles
  playerControls: {
    playPause: true,
    jumpForwardBackward: true,
    volume: true,
    aspectRatio: true,
    subtitles: true,
    audio: true,
    playbackSpeed: true,
    screenLock: true,
    fullscreen: true,
  },
  // Player UI studio: preset id + per-control zone placement.
  // Zones: topLeft | topRight | bottomLeft | bottomRight | tray (hidden).
  playerUIPreset: "classic",
  playerIconVariants: {},
  playerUILayout: {
    playPause: "bottomLeft",
    jumpForwardBackward: "bottomLeft",
    volume: "bottomLeft",
    subtitles: "bottomRight",
    audio: "bottomRight",
    aspectRatio: "bottomRight",
    playbackSpeed: "tray",
    screenLock: "topLeft",
    fullscreen: "bottomRight",
  },
  // Servers — original player-dropdown names (Server 1 … Server 8),
  // restored from git history. Stored orders saved under the interim
  // Lisbon/Nebula/… names are migrated by PreferencesProvider on boot.
  serverOrder: [
    "Server 1",
    "Server 2 (Fast)",
    "Server 3 (HD)",
    "Server 4 (Backup)",
    "Server 5 (VidCore)",
    "Server 6 (Peachify)",
    "Server 7 (VidUp)",
    "Server 8 (Smashy)",
  ],
  // Subtitles
  subtitleFont: "cinejoy",
  subtitleSize: 100,
  subtitleColor: "#ffffff",
  subtitleBgBlur: true,
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
