import { createContext, useContext } from "react";

import { DEFAULT_SERVER_ORDER } from "../constants/settings";
import { PLAYER_SOURCE_LABELS } from "../constants/sources";

/* ── Server naming migration ──────────────────────────────────────────
   The player dropdown shipped as "Server 1 … Server 7", was renamed to
   Lisbon/Nebula/Solara/Athens/Joy/Castle/Sakura, then Canaias/SmashyStream
   joined as an 8th, then the "Server N (suffix)" style came back. Today the
   labels are plain Server N; this map carries ANY legacy spelling across so
   existing visitors keep their exact priority. Same position, new label. Entries
   that point at a now-retired number are dropped by `pruneRetiredServers`, not
   renumbered here — a saved priority must never be silently rewritten. */
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

/* Drop rows whose server has been RETIRED. Labels are reused as the roster
   rotates (Server 1 is RIVO since 2026-11-02; Server 5/6/7 now name backends
   that replaced VidRack/VidSrc/NHD), so the comparison is against the LIVE
   catalogue only. A returning visitor's saved order can still name a removed
   row, and a dead row in the Servers drag list is a promise the player will
   never keep — which is exactly why the legacy map above is still allowed to
   point at a retired label and let THIS filter drop it, rather than silently
   renumbering someone's saved order. Order and duplicates of the surviving rows
   are preserved; an order that was entirely retired falls back to the defaults. */
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
  // Notifications v2 (Settings 2.0) — per-type gates. Defaults on so the
  // notification center has something to show; master `notifications` above
  // still wins.
  notificationsListAdds: true,
  notificationsMilestones: true,
  // Appearance v2
  hoverPreviews: true,
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
  // Gates the "Still watching?" hangout prompt (usePlayerChrome): after a long
  // unattended stretch or a binge of auto-advanced episodes the player pauses
  // and asks before continuing. On by default; off = never interrupt.
  stillWatching: true,
  // Gates the drifting liquid-blob backdrop on every page (AmbientBackground).
  // On by default; off keeps the plain gradient wash for focus/perf.
  ambientBackground: true,
  // Master switch for ALL seasonal particle effects. Off = theme colors only,
  // never particles (no snow even on Christmas/Winter). On = the shared
  // resolver (utils/seasonal) decides: calendar effect under the default
  // theme, the picked theme's effect only when a seasonal theme is manual.
  dynamic: true,
  // Seasonal snowfall overlay (global, mounted in Layout). Auto-on in winter
  // (Nov-Feb) or when the Christmas / Winter theme is active; manual override.
  snowfall: true,
  // Seasonal falling overlays (global, mounted in Layout): autumn leaves
  // (Sep-Oct) and spring blossoms (Mar-May), or their matching themes.
  fallingLeaves: true,
  // Seasonal summer overlay (global, mounted in Layout). Auto-on in summer
  // (Jun-Aug) or when the Summer Sun theme is active; manual override.
  summerGlow: true,
  // Servers — plain labels, DERIVED from the live catalogue so a roster change
    // can never leave the default missing a row (it did: Server 5 stayed absent
    // after Orion came back live). Orders saved under the interim Lisbon/Nebula/…
    // or "Server N (suffix)" names are migrated on boot, and a saved order naming
    // a retired row (a number the live catalogue no longer offers) is filtered out
    // at render time rather than silently offering a dead server.
  serverOrder: [...DEFAULT_SERVER_ORDER],
  // Subtitles
  subtitleFont: "cinejoy",
  subtitleSize: 100,
  subtitleColor: "var(--white)",
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
