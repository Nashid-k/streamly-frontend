/* ── Player UI shared definitions ────────────────────────────────────────
   Single source of truth for the fixed Netflix-style player chrome
   (black + #E50914): playback-speed ladder, aspect-ratio catalog +
   glyphs, and shared spring tokens. Leaves under src/components/player/
   and CustomVideoPlayer all import from here. */

export const PLAYER_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export const ASPECT_RATIOS = [
  { id: "fit", name: "Fit (Original 16:9)", scale: 1 },
  { id: "fill", name: "Fill Screen (Edge-to-Edge)", scale: 1.25 },
  { id: "zoom", name: "Zoom 1.25x (Punch-Hole Cutout)", scale: 1.25 },
  { id: "cinema", name: "Cinema 2.39:1", scale: 1.344 },
  { id: "crop1610", name: "16:10", scale: 1.111 },
  { id: "stretch", name: "Stretch to Screen", scale: 1 },
];

export const AR_GLYPH = [
  [44, 25],
  [52, 23],
  [48, 25],
  [50, 21],
  [42, 25],
  [46, 25],
];

export const SPRING_SNAPPY = { type: "spring", stiffness: 500, damping: 28 };