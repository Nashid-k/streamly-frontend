// Streamly player visual language — "Player v4".
//
// A player-scoped design system matching player-v4.html. Surfaces are dark
// obsidian slate, buttons use icon morphs with spring physics, loaders use
// double spinning arcs, and the accent color is user-configurable with 8 themes
// plus custom hex picker.
//
// Values are plain strings because the chrome is styled with inline objects
// (the engine owns no CSS layer for these nodes). Hover, press and
// reduced-motion behaviour live in styles/player.css keyed on class names.

// Default accent from player-v4.html
export const DEFAULT_V4_ACCENT = "#8652bb";
// Primary accent fallback: unified with player v4 theme accent.
export const ACCENT = "#8652bb";
// Glyph/text colour that sits ON an accent fill (dark, never white).
export const ACCENT_FG = "#ffffff";
export const ACCENT_DIM = "rgba(134,82,187,0.88)";
export const ACCENT_SOFT = "rgba(134,82,187,0.14)";
export const ACCENT_EDGE = "rgba(134,82,187,0.42)";
export const ACCENT_GLOW = "0 0 20px rgba(134,82,187,0.32)";

// The 8 theme swatches from player-v4.html
export const PLAYER_V4_THEMES = [
  ["Default", "#8652bb"],
  ["Blue", "#2563eb"],
  ["Green", "#059669"],
  ["Red", "#dc2626"],
  ["Orange", "#ea580c"],
  ["Pink", "#db2777"],
  ["Teal", "#0d9488"],
  ["Gray", "#64748b"],
];

// Scrubber track layers. The played bar is accent; the track is a quiet
// white film and buffered is a half step brighter so the three read in order.
export const TRACK = "rgba(255,255,255,0.16)";
export const BUFFERED = "rgba(255,255,255,0.32)";
// Measured skip windows: an accent wash, distinct from buffered.
export const SKIP_BAND = "rgba(134,82,187,0.22)";

export const TEXT = "#ffffff";
export const TEXT_DIM = "rgba(255,255,255,0.66)";
export const TEXT_FAINT = "rgba(255,255,255,0.42)";

// Chips on the deck (time, volume, utility cluster).
export const PILL_BG = "rgba(22,27,23,0.58)";
export const PILL_BG_HOVER = "rgba(40,47,41,0.82)";

// Glass materials: cool ink, not neutral black, so the player sits in the same
// family as the app's dark surfaces.
export const GLASS_BG_STRONG = "rgba(9,12,10,0.86)";
export const GLASS_BORDER = "rgba(255,255,255,0.12)";
export const GLASS_BLUR = "blur(26px) saturate(1.35)";

// The control deck's own material. Slightly lighter than the menus so it reads
// as the primary surface, with an inner top hairline for a machined edge.
export const DECK_BG =
  "linear-gradient(180deg, rgba(18,23,19,0.76) 0%, rgba(7,10,8,0.9) 100%)";
export const DECK_BORDER = "rgba(255,255,255,0.1)";
export const DECK_SHADOW =
  "0 24px 64px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.07)";

// The scrim behind the chrome: a soft falloff, never a hard black band.
export const SCRIM =
  "linear-gradient(0deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 44%, rgba(0,0,0,0) 100%)";

/* Motion timing, kept from the measured player motion scale: three steps on one
   curve (150 / 300 / 500ms). The CSS half lives in styles/player.css as
   --zxc-t-*; motion.test cross-checks the two so they cannot drift. */
export const RIVO_MOTION = {
  SURFACE: { duration: 0.5, ease: [0.2, 0.8, 0.2, 1] },
  STANDARD: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] },
  MICRO: { duration: 0.15, ease: [0.4, 0, 0.2, 1] },
};

// Geometry: a rounder, softer deck than the old chrome.
export const RADIUS = { pill: 999, control: 16, card: 22, sheet: 24, deck: 26 };
export const SHADOW = {
  pill: "0 10px 30px rgba(0,0,0,0.5)",
  card: "0 24px 70px rgba(0,0,0,0.65)",
};

/* The "Pitch" chrome (2026-11 player redesign, from the pasted reference).
   These are the reference design's own values — cool slate surfaces, muted
   labels, one accent. The signal green stays Streamly's, so the geometry and
   typography match the mock while the brand does not change. The CSS half of
   this token set lives on `.np-root` in styles/player.css. */
export const PITCH = {
  accent: ACCENT,
  muted: "#6b7f8f",
  value: "#b9c0c8",
  tile: "#121a22",
  tileHover: "#17222c",
  iconTile: "#1c2a3a",
  divider: "#19232d",
  track: "#2b2b2b",
  panelBg: "linear-gradient(160deg, #10161d 0%, #0c1117 60%, #0e1319 100%)",
  panelBorder: "#1d2935",
  radius: 22,
};

// The translucent pill the transient HUDs (volume / aspect / hold) float in.
// Shared so a value HUD and a status HUD read as the same material.
export const HUD_GLASS = {
  background: GLASS_BG_STRONG,
  border: `1px solid ${GLASS_BORDER}`,
  backdropFilter: GLASS_BLUR,
  WebkitBackdropFilter: GLASS_BLUR,
  boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
};
