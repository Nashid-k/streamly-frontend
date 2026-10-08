// Player chrome visual language — YouTube-style.
//
// A player-scoped theme so the chrome can restyle without touching global
// tokens or the app's brand accent. The design this matches (NEW PLAYER
// UI-UX.html, 2026-10-08) uses a YouTube idiom: red #f03 played/active marks,
// filled white control glyphs, translucent black rounded pills, a floating
// zinc settings menu, and custom hover tooltips with keyboard badges.
//
// Values are plain strings because the chrome is styled with inline objects
// (the engine owns no CSS layer for these nodes). Motion, hover and
// reduced-motion behaviour still live in styles/player.css keyed on class names.

// Primary accent: played progress, scrubber knob, active marks/checks, HD badge.
export const ACCENT = "#f03";
export const ACCENT_DIM = "rgba(255,51,51,0.88)";

// Scrubber track layers.
export const TRACK = "rgba(255,255,255,0.3)";
export const BUFFERED = "rgba(255,255,255,0.4)";
// Measured skip windows: a translucent white band, distinct from buffered.
export const SKIP_BAND = "rgba(255,255,255,0.5)";

export const TEXT = "#ffffff";
export const TEXT_DIM = "rgba(255,255,255,0.62)";

// Bottom-bar + overlay pills (design: rgba(0,0,0,0.6) with soft blur).
export const PILL_BG = "rgba(0,0,0,0.6)";
export const PILL_BG_HOVER = "rgba(0,0,0,0.76)";

// Glass materials.
export const GLASS_BG = "rgba(28,28,28,0.88)";
export const GLASS_BG_STRONG = "rgba(28,28,28,0.92)";
export const GLASS_BORDER = "rgba(255,255,255,0.16)";
export const GLASS_BLUR = "blur(12px)";

// Geometry.
export const RADIUS = { pill: 999, control: 14, card: 14, sheet: 14 };
export const SHADOW = {
  pill: "0 8px 24px rgba(0,0,0,0.45)",
  card: "0 12px 40px rgba(0,0,0,0.55)",
};

// The translucent pill the transient HUDs (volume / brightness / aspect / hold)
// float in. Shared so a value HUD and a status HUD read as the same material.
export const HUD_GLASS = {
  background: GLASS_BG_STRONG,
  border: `1px solid ${GLASS_BORDER}`,
  backdropFilter: GLASS_BLUR,
  WebkitBackdropFilter: GLASS_BLUR,
  boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
};