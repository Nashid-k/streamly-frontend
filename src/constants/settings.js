/* App-level settings constants: theme palettes, subtitle languages, seek presets,
   subtitle styling, server order labels, and Settings section tabs. Single source
   of truth — SettingsPage imports these; keep the data here only. */

import { LayoutGrid, User, Palette, Play, Server, Captions, Bell, Database } from "lucide-react";

import { PLAYER_SOURCE_LABELS } from "./sources";

export const THEMES = [
  {
    id: "default",
    name: "Signature Green",
    primary: "#95ff50",
    secondary: "#5ce21c",
  },
  {
    id: "emerald",
    name: "Cinejoy Emerald",
    primary: "#34d399",
    secondary: "#059669",
  },
  {
    id: "amethyst",
    name: "Amethyst Violet",
    primary: "#c084fc",
    secondary: "#7c3aed",
  },
  {
    id: "ocean",
    name: "Ocean Cyan",
    primary: "#22d3ee",
    secondary: "#2563eb",
  },
  {
    id: "crimson",
    name: "Crimson Ruby",
    primary: "#f87171",
    secondary: "#dc2626",
  },
  {
    id: "solar",
    name: "Solar Amber",
    primary: "#fbbf24",
    secondary: "#d97706",
  },
];

export const LANGUAGES = [
  { code: "en", name: "English", flag: "flags/us.svg" },
  { code: "es", name: "Spanish", flag: "flags/es.svg" },
  { code: "fr", name: "French", flag: "flags/fr.svg" },
  { code: "de", name: "German", flag: "flags/de.svg" },
  { code: "it", name: "Italian", flag: "flags/it.svg" },
  { code: "pt", name: "Portuguese", flag: "flags/br.svg" },
  { code: "ja", name: "Japanese", flag: "flags/jp.svg" },
  { code: "ko", name: "Korean", flag: "flags/kr.svg" },
  { code: "hi", name: "Hindi", flag: "flags/in.svg" },
  { code: "ar", name: "Arabic", flag: "flags/sa.svg" },
];

/* The app's language codes, derived so the i18n provider and the API client
   cannot drift apart. The API client used to trust `setting-defaultLanguage`
   verbatim and send it to TMDB as `language=`, so a corrupt or hand-edited key
   produced a catalogue request in a language nobody supports. */
export const SUPPORTED_LANGUAGE_CODES = Object.freeze(LANGUAGES.map((l) => l.code));

export const SEEK_TIMES = [
  { value: 5, label: "5 seconds" },
  { value: 10, label: "10 seconds" },
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
];

export const SUBTITLE_FONTS = [
  { id: "cinejoy", name: "Cinejoy", family: "'Inter', sans-serif" },
  { id: "classic", name: "Classic", family: "'Arial', sans-serif" },
  { id: "montserrat", name: "Montserrat", family: "'Montserrat', sans-serif" },
];

export const SUBTITLE_COLORS = [
  { name: "White", value: "#ffffff" },
  { name: "Yellow", value: "#ffff00" },
  { name: "Cyan", value: "#00ffff" },
  { name: "Magenta", value: "#ff00ff" },
  { name: "Emerald", value: "#95ff50" },
];

/* The CSS family for a subtitle font id. Shared by the Settings preview and
   the REAL player: both used to carry their own copy of this mapping, and the
   player did not apply it at all, so the preview promised a font the player
   never used. Unknown ids fall back to the default face rather than to
   `undefined` (which would make the browser pick its own default and look
   like a broken style). */
export function subtitleFontFamily(id) {
  const match = SUBTITLE_FONTS.find((f) => f.id === id);
  return match?.family || SUBTITLE_FONTS[0].family;
}

/* The OpenSubtitles track that matches an app language code.
   The track carries a language NAME ("English") and an ISO 639-2 id ("eng");
   the app carries the 2-letter code ("en"). Both spellings are tried, because
   the catalogue is inconsistent about which one it returns. */
export function findSubtitleTrack(languages, code) {
  const list = Array.isArray(languages) ? languages : [];
  const wanted = String(code || "").trim().toLowerCase();
  if (!wanted) return null;
  const name = LANGUAGES.find((l) => l.code === wanted)?.name?.toLowerCase();
  if (!name) return null;
  const byName = list.find(
    (l) => String(l.language || "").trim().toLowerCase() === name,
  );
  if (byName) return byName;
  return (
    list.find((l) =>
      String(l.languageId || "").trim().toLowerCase().startsWith(wanted),
    ) || null
  );
}

/* DERIVED from the live catalogue, never hand-listed, so adding or retiring a
   server renumbers this automatically. It used to be a hardcoded Server 1–4 and
   drifted the moment Server 5 came back live: the Settings drag list silently
   dropped the fifth row. The Settings page renders this before the provider
   resolves; the adapter owns the persisted list. */
export const DEFAULT_SERVER_ORDER = [...PLAYER_SOURCE_LABELS];

/* Settings tabs, grouped for the sidebar rail (`zone`): WATCHING = how things
   play, YOUR SPACE = identity + notifications + your data, PERSONALIZE = looks.
   "All" sits above every zone and stays the default so the global search keeps
   working across the whole page. On mobile the rail collapses to one horizontal
   pill row and the zone labels hide (CSS in settings-ui.css). */
export const TABS = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "playback", label: "Playback", icon: Play, zone: "watching" },
  { id: "subtitles", label: "Subtitles", icon: Captions, zone: "watching" },
  { id: "servers", label: "Servers", icon: Server, zone: "watching" },
  { id: "account", label: "Account", icon: User, zone: "space" },
  { id: "notifications", label: "Notifications", icon: Bell, zone: "space" },
  { id: "data", label: "Data", icon: Database, zone: "space" },
  { id: "appearance", label: "Appearance", icon: Palette, zone: "personalize" },
];

/* Search index for the settings filter. Every term a user can see on screen must
   appear here or filtering looks broken. The value is a lowercase "haystack" per
   section; `visibleSection` tokenises the query and requires every word, so
   multi-word searches work. Update a section's haystack in the same edit as its
   copy (the `search resolves real on-screen wording` test guards common terms). */
export const SECTION_SEARCH_TERMS = {
  account: [
    "account sign in signed out sync settings watch progress across devices",
    "profile library synchronized email account verified confirmation link",
    "cloud sync cloud database connected syncing sync now last synced",
    "my watchlist saved movies television series view list",
    "watch history recently watched movies shows progress view history",
    "keyboard touch shortcuts player gestures swipes hotkeys quick actions open guide",
  ].join(" "),
  appearance: [
    "appearance look theme color palette interface",
    "signature green cinejoy emerald amethyst violet ocean cyan crimson ruby solar amber",
    "custom accent pick any color customize",
    "episode view style carousel rails grids lists series pages",
    "detail view type full info page quick modal page modal",
    "use image logos movie series titles image logos",
    "trailers play trailers automatically detail pages",
    "spoiler-free mode hide information episodes",
    "reduce motion reduce effects",
    "ambient liquid backdrop drifting color blobs behind pages",
    "high-quality thumbnails stream higher resolution artwork",
    "hover previews show frame previews scrubbing player seek bar seek previews",
  ].join(" "),
  playback: [
    "playback player behaves autoplay automatically play next episode ends",
    "auto skip intro jump past intro skip intro button",
    "still watching prompt pause ask after binge unattended",
    "seek time skip forwards backwards seconds",
    "auto subtitles preferred language available",
    "default language subtitle language auto-select",
    "mute trailer audio trailers sound off",
  ].join(" "),
  servers: [
    "server order drag handle sources tried first title loads priority stream",
    "reset server 1 server 2 server 3 server 4 server 5 server 6 server 7 default priority",
  ].join(" "),
  subtitles: [
    "subtitles readability customization font cinejoy classic montserrat",
    "text size adjust subtitle size display player controls take precedence",
    "text color high-contrast subtitle color white yellow cyan magenta emerald player overrides",
    "background blur legibility soft glow preview",
  ].join(" "),
  notifications: [
    "notifications in-app status updates scrobble confirmations activity",
    "show in-app notifications brief status toasts items added watchlist servers change progress saved alerts toast popup banner hide",
    "library list adds alerts when movie series added to list",
    "milestones streaks achievements watchlist growth",
    "center bell inbox unread mark read clear",
  ].join(" "),
  data: [
    "data privacy device backup export import restore wipe",
    "clear device data wipe local storage guest reload",
    "reset all preferences factory reset restore theme playback preferences",
    "factory defaults clears custom themes subtitle styling server order danger",
    "system status capacity relay catalog live today usage",
  ].join(" "),
};