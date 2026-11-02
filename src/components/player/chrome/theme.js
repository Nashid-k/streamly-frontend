// Player chrome visual language — YouTube-style.
//
// A player-scoped theme so the chrome can restyle without touching global
// tokens or the app's brand accent. The design this matches (NEW PLAYER
// UI-UX.html, 2026-10-08) uses a YouTube idiom: red #f03 played/active marks,
// filled white control glyphs, translucent black rounded pills, a floating
// black settings menu (same black glass family as the pills), and custom hover
// tooltips with keyboard badges.
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

// Bottom-bar + overlay pills (design: rgba(0,0,0,0.6) with soft blur). Opacity
// trimmed to 0.42 so more of the frame reads through the chrome.
export const PILL_BG = "rgba(0,0,0,0.42)";
export const PILL_BG_HOVER = "rgba(0,0,0,0.55)";

// Glass materials. Black, so the settings panel/cards sit in the same family as
// the translucent black pills instead of reading as a separate zinc material.
// More opaque than the pills (0.42) because these surfaces carry rows of text,
// not a single glyph; the blur keeps them legible over the picture.
export const GLASS_BG = "rgba(0,0,0,0.62)";
export const GLASS_BG_STRONG = "rgba(0,0,0,0.7)";
export const GLASS_BORDER = "rgba(255,255,255,0.16)";
/* rivo.st's shipped stylesheet uses backdrop-filter:blur(24px) most often (x4),
   then 20px (x2) and 40px once — never 12px. Ours was half their strength, which
   is most of why our sheets read as flat grey instead of their glass. */
export const GLASS_BLUR = "blur(24px)";

/* RIVO motion, read off their shipped CSS rather than guessed. Their player has
   no custom chrome — it is a native-controls <video> inside this shell — so the
   player-side half of "be like RIVO" is this vocabulary:
     · SURFACE  — their `fadeUp`: opacity 0 + translateY(12px) → settled, 0.5s
     · STANDARD — their `transition-duration:.3s` step (x6 in their CSS)
     · MICRO    — their `transition-duration:.15s` step (x10 in their CSS), on
                  their ordinary utility curve (.4,0,.2,1)
   Surfaces use `ease-tv`; micro-interactions use the utility curve, exactly as
   their own rules split them. */
export const RIVO_MOTION = {
  SURFACE: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] },
  STANDARD: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] },
  MICRO: { duration: 0.15, ease: [0.4, 0, 0.2, 1] },
};

/** Their `fadeUp` entrance shape, as framer props (exit = the same, reversed). */
export const RIVO_FADE_UP = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 12 },
};

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