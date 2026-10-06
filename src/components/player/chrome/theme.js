// Player chrome visual language — Apple TV+.
//
// A player-scoped theme so the chrome can restyle without touching global
// tokens or the app's brand accent. Apple TV+ uses a neutral/white accent; the
// brand red stays outside the player (per user decision, 2026-10-06).
//
// Values are plain strings because the chrome is styled with inline objects
// (the engine owns no CSS layer for these nodes). Motion, hover and
// reduced-motion behaviour still live in styles/player.css keyed on class names.

// Primary accent: played progress, scrubber knob, active marks.
export const ACCENT = "#ffffff";
export const ACCENT_DIM = "rgba(255,255,255,0.88)";

// Scrubber track layers.
export const TRACK = "rgba(255,255,255,0.22)";
export const BUFFERED = "rgba(255,255,255,0.42)";
// Measured skip windows: a translucent white band, distinct from buffered.
export const SKIP_BAND = "rgba(255,255,255,0.5)";

export const TEXT = "#ffffff";
export const TEXT_DIM = "rgba(255,255,255,0.62)";

// Glass materials.
export const GLASS_BG = "rgba(22,22,24,0.62)";
export const GLASS_BG_STRONG = "rgba(20,20,22,0.82)";
export const GLASS_BORDER = "rgba(255,255,255,0.14)";
export const GLASS_BLUR = "blur(30px) saturate(1.8)";

// Geometry.
export const RADIUS = { pill: 999, control: 14, card: 14, sheet: 18 };
export const SHADOW = {
  pill: "0 8px 24px rgba(0,0,0,0.45)",
  card: "0 12px 40px rgba(0,0,0,0.55)",
};