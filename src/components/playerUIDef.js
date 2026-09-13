import {
  Play,
  RotateCcw,
  Volume2,
  Captions,
  AudioLines,
  Expand,
  Gauge,
  Lock,
  Maximize,
} from "lucide-react";

/* ── Player UI Studio shared definitions ─────────────────────────────
   The video player control bar is divided into overlay zones. Every
   placeable control lives in exactly one zone (or the "tray", which
   hides it from the bar — it stays reachable through the menus).
   Presets assign all 9 controls; the player merges the stored layout
   over these defaults so corrupt/partial storage can never break it. */

export const PLAYER_ZONES = [
  { id: "topLeft", label: "Top left", blurb: "Floating cluster over the video" },
  { id: "topRight", label: "Top right", blurb: "Floating cluster over the video" },
  { id: "bottomLeft", label: "Bottom left", blurb: "Left side of the control bar" },
  { id: "bottomCenter", label: "Bottom center", blurb: "Middle of the control bar" },
  { id: "bottomRight", label: "Bottom right", blurb: "Right side of the control bar" },
  { id: "tray", label: "Hidden", blurb: "Menus only — off the bar" },
];

export const PLAYER_CONTROLS = [
  { key: "playPause", label: "Play / Pause", Icon: Play },
  { key: "jumpForwardBackward", label: "Skip ±10s", Icon: RotateCcw },
  { key: "volume", label: "Volume", Icon: Volume2 },
  { key: "subtitles", label: "Subtitles", Icon: Captions },
  { key: "audio", label: "Audio tracks", Icon: AudioLines },
  { key: "aspectRatio", label: "Aspect ratio", Icon: Expand },
  { key: "playbackSpeed", label: "Speed", Icon: Gauge },
  { key: "screenLock", label: "Screen lock", Icon: Lock },
  { key: "fullscreen", label: "Fullscreen", Icon: Maximize },
];

/* Canonical left-to-right order inside a zone. */
export const PLAYER_CONTROL_ORDER = [
  "playPause",
  "jumpForwardBackward",
  "volume",
  "playbackSpeed",
  "subtitles",
  "audio",
  "aspectRatio",
  "screenLock",
  "fullscreen",
];

export const PLAYER_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const PLAYER_UI_PRESETS = [
  {
    id: "classic",
    name: "Classic",
    blurb: "The default Streamly layout",
    visibility: {
      playPause: true,
      jumpForwardBackward: true,
      volume: true,
      subtitles: true,
      audio: true,
      aspectRatio: true,
      playbackSpeed: true,
      screenLock: true,
      fullscreen: true,
    },
    layout: {
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
  },
  {
    id: "minimal",
    name: "Minimal",
    blurb: "Play, volume, fullscreen — nothing else",
    visibility: {
      playPause: true,
      jumpForwardBackward: false,
      volume: true,
      subtitles: false,
      audio: false,
      aspectRatio: false,
      playbackSpeed: false,
      screenLock: true,
      fullscreen: true,
    },
    layout: {
      playPause: "bottomLeft",
      jumpForwardBackward: "tray",
      volume: "bottomLeft",
      subtitles: "tray",
      audio: "tray",
      aspectRatio: "tray",
      playbackSpeed: "tray",
      screenLock: "topLeft",
      fullscreen: "bottomRight",
    },
  },
  {
    id: "compact",
    name: "Compact",
    blurb: "Everything in one bottom cluster",
    visibility: {
      playPause: true,
      jumpForwardBackward: true,
      volume: true,
      subtitles: true,
      audio: true,
      aspectRatio: true,
      playbackSpeed: true,
      screenLock: true,
      fullscreen: true,
    },
    layout: {
      playPause: "bottomLeft",
      jumpForwardBackward: "bottomLeft",
      volume: "bottomLeft",
      subtitles: "bottomLeft",
      audio: "bottomLeft",
      aspectRatio: "bottomLeft",
      playbackSpeed: "bottomLeft",
      screenLock: "topLeft",
      fullscreen: "bottomLeft",
    },
  },
  {
    id: "theater",
    name: "Theater",
    blurb: "Transport below, setup above",
    visibility: {
      playPause: true,
      jumpForwardBackward: true,
      volume: true,
      subtitles: true,
      audio: true,
      aspectRatio: true,
      playbackSpeed: true,
      screenLock: true,
      fullscreen: true,
    },
    layout: {
      playPause: "bottomLeft",
      jumpForwardBackward: "bottomLeft",
      volume: "bottomRight",
      subtitles: "topRight",
      audio: "topRight",
      aspectRatio: "topRight",
      playbackSpeed: "topRight",
      screenLock: "topLeft",
      fullscreen: "topRight",
    },
  },
  {
    id: "studio",
    name: "Studio",
    blurb: "Pro deck — speed on the bar",
    visibility: {
      playPause: true,
      jumpForwardBackward: true,
      volume: true,
      subtitles: true,
      audio: true,
      aspectRatio: true,
      playbackSpeed: true,
      screenLock: true,
      fullscreen: true,
    },
    layout: {
      playPause: "bottomLeft",
      jumpForwardBackward: "bottomLeft",
      volume: "topRight",
      subtitles: "bottomRight",
      audio: "bottomRight",
      aspectRatio: "bottomRight",
      playbackSpeed: "bottomRight",
      screenLock: "topLeft",
      fullscreen: "bottomRight",
    },
  },
];

export const DEFAULT_UI_LAYOUT = PLAYER_UI_PRESETS[0].layout;
export const DEFAULT_UI_VISIBILITY = PLAYER_UI_PRESETS[0].visibility;

const isPlainObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);

/* Merge a stored layout over the preset defaults; unknown zones and
   unknown keys fall back so storage can never break the player. */
export function resolveUILayout(stored) {
  const base = { ...DEFAULT_UI_LAYOUT };
  if (!isPlainObject(stored)) return base;
  const zoneIds = new Set(PLAYER_ZONES.map((z) => z.id));
  for (const { key } of PLAYER_CONTROLS) {
    if (typeof stored[key] === "string" && zoneIds.has(stored[key])) {
      base[key] = stored[key];
    }
  }
  return base;
}

export function zoneOf(layout, key) {
  const resolved = resolveUILayout(layout);
  return resolved[key] || "tray";
}

/* Controls visible in a zone, in canonical order, honoring the
   visibility toggles (default-on, same semantics as the player).
   The tray is not a visible zone — it always resolves empty. */
export function controlsInZone(layout, visibility, zoneId) {
  if (zoneId === "tray") return [];
  const resolved = resolveUILayout(layout);
  return PLAYER_CONTROL_ORDER.filter(
    (key) => resolved[key] === zoneId && visibility?.[key] !== false,
  );
}

export function presetById(id) {
  return PLAYER_UI_PRESETS.find((p) => p.id === id) || null;
}
