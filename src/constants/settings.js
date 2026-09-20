/* App-level settings constants: theme palettes, subtitle languages, seek
   presets, subtitle styling, server order labels, and Settings section tabs.
   Single source of truth — SettingsPage imports these; keep the data here
   only (components that render them live in src/components/settings/). */

import { LayoutGrid, User, Palette, Play, Server, Captions, Bell } from "lucide-react";

export const THEMES = [
  {
    id: "default",
    name: "Default (Streamly)",
    primary: "#95ff50",
    secondary: "#5ce21c",
  },
  {
    id: "emerald",
    name: "Cinejoy Emerald",
    primary: "#95ff50",
    secondary: "#43861e",
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

export const SEEK_TIMES = [
  { value: 5, label: "5 seconds" },
  { value: 10, label: "10 seconds" },
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
];

export const SUBTITLE_FONTS = [
  { id: "cinejoy", name: "Cinejoy", family: "'Inter', sans-serif" },
  { id: "netflix", name: "Netflix", family: "'Arial', sans-serif" },
  { id: "montserrat", name: "Montserrat", family: "'Montserrat', sans-serif" },
];

export const SUBTITLE_COLORS = [
  { name: "White", value: "#ffffff" },
  { name: "Yellow", value: "#ffff00" },
  { name: "Cyan", value: "#00ffff" },
  { name: "Magenta", value: "#ff00ff" },
  { name: "Emerald", value: "#95ff50" },
];

/* Mirrors DEFAULT_PREFERENCES.serverOrder (plain Server 1 … Server 8
   labels). Kept as data here so the Settings page renders before the
   provider resolves; the adapter owns the authoritative list. */
export const DEFAULT_SERVER_ORDER = [
  "Server 1",
  "Server 2",
  "Server 3",
  "Server 4",
  "Server 5",
  "Server 6",
  "Server 7",
  "Server 8",
];

export const TABS = [
  { id: "all", label: "All", icon: LayoutGrid },
  { id: "account", label: "Account", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "playback", label: "Playback", icon: Play },
  { id: "servers", label: "Servers", icon: Server },
  { id: "subtitles", label: "Subtitles", icon: Captions },
  { id: "notifications", label: "Notifications", icon: Bell },
];

/* Search index for the settings filter. Every term a user can see on the
   screen must appear here, otherwise filtering looks broken. The value is a
   plain lowercase "haystack" per section; `visibleSection` tokenises the query
   and requires every word to be present, so multi-word searches work.
   When copy changes in a section, update its haystack here in the same edit
   (the unit test `search resolves real on-screen wording` guards the common
   terms). */
export const SECTION_SEARCH_TERMS = {
  account: [
    "account sign in signed out sync settings watch progress across devices",
    "profile library synchronized google continue with google",
    "cloud sync cloud database connected syncing sync now last synced",
    "my watchlist saved movies television series view list",
    "watch history recently watched movies shows progress view history",
    "keyboard touch shortcuts player gestures swipes hotkeys quick actions open guide",
  ].join(" "),
  appearance: [
    "appearance look theme color palette interface default streamly",
    "cinejoy emerald amethyst violet ocean cyan crimson ruby solar amber",
    "custom accent pick any color customize",
    "episode view style carousel rails grids lists series pages",
    "detail view type full info page netflix-style quick modal page modal",
    "use image logos movie series titles image logos",
    "trailers play trailers automatically detail pages hover previews",
    "spoiler-free mode hide information episodes",
    "reduce motion reduce effects",
    "high-quality thumbnails stream higher resolution artwork",
  ].join(" "),
  playback: [
    "playback player behaves autoplay automatically play next episode ends",
    "auto skip intro jump past intro skip intro button",
    "seek time skip forwards backwards seconds",
    "auto subtitles preferred language available",
    "default language subtitle language auto-select",
    "mute trailer audio trailers sound off",
  ].join(" "),
  servers: [
    "server order drag handle sources tried first title loads priority stream",
    "reset server 1 server 2 fast server 3 hd server 4 backup",
    "server 5 vidcore server 6 peachify server 7 vidup server 8 smashy",
  ].join(" "),
  subtitles: [
    "subtitles readability customization font cinejoy netflix montserrat",
    "text size adjust subtitle size display",
    "text color high-contrast subtitle color white yellow cyan magenta emerald",
    "background blur legibility soft glow preview",
  ].join(" "),
  notifications: [
    "notifications in-app status updates scrobble confirmations activity",
    "show in-app notifications brief status toasts items added watchlist servers change progress saved alerts toast popup banner",
  ].join(" "),
  reset: [
    "reset all preferences factory reset restore theme playback preferences",
    "factory defaults clears custom themes subtitle styling server order danger",
  ].join(" "),
};