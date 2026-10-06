// Player chrome visual language — Apple TV+.
//
// A player-scoped theme so the chrome can restyle without touching global
// tokens or the app's brand accent. Apple TV+ uses a neutral/white accent; the
// brand red stays outside the player (per user decision, 2026-10-06).
//
// Values are plain strings because the chrome is styled with inline objects
// (the engine owns no CSS layer for these nodes). Motion, hover and
// reduced-motion behaviour still live in styles/player.css keyed on class names.

// The single most identifiable Apple detail: SF Pro / system-UI type. The app
// body is Inter, so the player opts out of the brand font here — Apple TV+
// chrome speaks in the platform face on every OS.
export const FONT =
  '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Segoe UI", system-ui, sans-serif';

// Primary accent: played progress, scrubber knob, active marks.
export const ACCENT = "#ffffff";
export const ACCENT_DIM = "rgba(255,255,255,0.88)";

// Persistent control material: every control glyph sits on a frosted system-fill
// disc (Apple tvOS), so a white icon never disappears over a bright frame and the
// chrome reads as a row of glass buttons rather than bare icons. Active controls
// invert to a solid white disc with a dark glyph.
export const CONTROL_BG = "rgba(120,120,128,0.32)";
export const CONTROL_BG_HOVER = "rgba(120,120,128,0.5)";
export const CONTROL_BORDER = "rgba(255,255,255,0.18)";
export const CONTROL_BLUR = "blur(16px) saturate(1.6)";
export const CONTROL_ACTIVE_BG = "#ffffff";
export const CONTROL_ACTIVE_FG = "#0a0a0a";

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

// The translucent pill the transient HUDs (volume / brightness / aspect / hold)
// float in. Shared so a value HUD and a status HUD read as the same material.
export const HUD_GLASS = {
  background: GLASS_BG_STRONG,
  border: `1px solid ${GLASS_BORDER}`,
  backdropFilter: GLASS_BLUR,
  WebkitBackdropFilter: GLASS_BLUR,
  boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
};