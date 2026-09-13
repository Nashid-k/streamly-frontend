import { createContext, useContext } from "react";

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
  // Servers
  serverOrder: [
    "Lisbon",
    "Nebula",
    "Solara",
    "Athens",
    "Joy",
    "Castle",
    "Sakura",
    "Canaias",
  ],
  // Subtitles
  subtitleFont: "cinejoy",
  subtitleSize: 100,
  subtitleColor: "#ffffff",
  subtitleBgBlur: true,
  // Ads
  enableAds: true,
  // Febbox
  febboxCookie: "",
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
