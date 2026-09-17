/* Player constants: frame helpers, aspect ratios, shortcut/gesture docs,
   and loading tips shared by the video player and its HUDs. */

import {
  Keyboard,
  Settings,
  Volume2,
  Maximize,
  Play,
} from "lucide-react";

export const formatSMPTE = (seconds) => {
  if (!seconds || isNaN(seconds) || seconds < 0) return "00:00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 24);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
};

export const getNumericId = (s) => {
  if (!s) return null;
  const m = s.toString().match(/\d+/);
  return m ? m[0] : null;
};

export const ASPECT_RATIOS = [
  { id: "fit", name: "Fit (Original 16:9)", scale: 1 },
  { id: "fill", name: "Fill Screen (Edge-to-Edge)", scale: 1.25 },
  { id: "zoom", name: "Zoom 1.25x (Punch-Hole Cutout)", scale: 1.25 },
  { id: "cinema", name: "Cinema 2.39:1", scale: 1.344 },
  { id: "crop1610", name: "16:10", scale: 1.111 },
  { id: "stretch", name: "Stretch to Screen", scale: 1 },
];

/* Frame glyph dimensions [w, h] per aspect index — drawn in the aspect HUD
   so the shape visibly morphs as the user cycles through ratios. */
export const AR_GLYPH = [
  [44, 25], // Fit (16:9)
  [52, 23], // Fill Screen (Edge-to-Edge)
  [48, 25], // Zoom 1.25x (Punch-Hole Cutout)
  [50, 21], // Cinema 2.39:1
  [42, 25], // 16:10
  [46, 25], // Stretch to Screen
];

export const KEYBOARD_SHORTCUTS = [
  { key: "Space / K", action: "Play / Pause" },
  { key: "F", action: "Fullscreen" },
  { key: "M", action: "Mute" },
  { key: "→ / L", action: "Forward 10s" },
  { key: "← / J", action: "Rewind 10s" },
  { key: "↑↓", action: "Volume" },
  { key: "A", action: "Aspect Ratio" },
  { key: "?", action: "Shortcuts" },
];

export const TOUCH_GESTURES = [
  { gesture: "Single Tap", action: "Show / Hide Controls" },
  { gesture: "Double Tap Left / Right", action: "Rewind / Forward 10s" },
  { gesture: "Swipe Left (Up / Down)", action: "Adjust Brightness" },
  { gesture: "Swipe Right (Up / Down)", action: "Adjust Volume" },
  { gesture: "Horizontal Swipe", action: "Seek Timeline" },
  { gesture: "Aspect Button", action: "Change Aspect Ratio" },
];

export const LOADING_TIPS_DESKTOP = [
  { text: "Double-tap center for fullscreen", icon: Keyboard },
  { text: "Arrow keys to seek 10 seconds", icon: Keyboard },
  { text: "Scroll to adjust volume", icon: Keyboard },
  { text: "Press ? for all shortcuts", icon: Keyboard },
  { text: "Right-click for more options", icon: Settings },
];
export const LOADING_TIPS_TOUCH = [
  { text: "Double-tap sides to seek 10s", icon: Keyboard },
  { text: "Swipe right side for volume", icon: Volume2 },
  { text: "Swipe left side for brightness", icon: Volume2 },
  { text: "Pinch to enter fullscreen", icon: Maximize },
  { text: "Tap center to play / pause", icon: Play },
];