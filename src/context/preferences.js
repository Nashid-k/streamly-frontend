import { createContext, useContext } from "react";

import { PLAYER_SOURCE_LABELS } from "../constants/sources";

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

/* Drop rows whose server has been RETIRED. VidSrc (Server 6) and NHD (Server 7)
   were removed on 2026-10-03 after both answered `{ok:false, code:"no-source"}`
   for movie 27205 AND tv 1399 s1e1; VidRack (Server 5) went on 2026-10-04 after
   every ladder it published was AES-128 behind a key host that 403s us. A
   returning visitor's saved order can still name them, and a dead row in the
   Servers drag list is a promise the player will never keep — which is exactly
   why the legacy map above is still allowed to point at a retired label and let
   THIS filter drop it, rather than silently renumbering someone's saved order.
   Order and duplicates of the surviving rows are preserved; an order that was
   entirely retired falls back to the defaults. */
export function pruneRetiredServers(order, fallback) {
  if (!Array.isArray(order)) return fallback;
  const live = order.filter((name) => PLAYER_SOURCE_LABELS.includes(name));
  return live.length > 0 ? live : fallback;
}

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
    // Servers — plain labels (Server 1 … Server 4). Orders saved under the interim
    // Lisbon/Nebula/… or "Server N (suffix)" names are migrated on boot, and a
    // saved order naming a retired row (Server 5/6/7 = VidRack/VidSrc/NHD) is
    // filtered out at render time rather than silently offering a dead server.
  serverOrder: [
    "Server 1",
    "Server 2",
    "Server 3",
    "Server 4",
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
