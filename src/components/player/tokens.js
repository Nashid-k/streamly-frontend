/* ═══ Apple Design Language ═══════════════════════════════════════
   Inspired by Apple TV+ player — circular arcs, frosted glass,
   SF Pro typography, spring-physics animations, minimal chrome.
   ════════════════════════════════════════════════════════════════ */

/* Spring presets (Apple-style physics) */
export const SPRING = { type: "spring", stiffness: 400, damping: 30, mass: 0.8 };
export const SPRING_FAST = { type: "spring", stiffness: 600, damping: 35 };
export const SPRING_SNAPPY = { type: "spring", stiffness: 500, damping: 28 };

/* Responsive design tokens — scale with viewport, never break */
export const R = {
  /* Sizes scale via vmin so they work on phones through ultrawide */
  btnSmall: 'clamp(24px, 4vw, 34px)',
  btnMedium: 'clamp(32px, 5vw, 42px)',
  btnPlay: 'clamp(36px, 6vw, 46px)',
  /* Arc HUD sizes */
  arcSmall: 32,
  arcVolume: 'clamp(36px, 6vw, 48px)',
  arcSeek: 'clamp(48px, 8vw, 68px)',
  arcLoading: 'clamp(44px, 8vw, 60px)',
  /* Panel widths */
  panelSettings: 'clamp(240px, 40vw, 300px)',
  panelSubtitles: 'clamp(220px, 38vw, 280px)',
  panelShortcuts: 'clamp(240px, 42vw, 300px)',
  /* Fonts */
  fontTiny: 'clamp(8px, 1.5vw, 10px)',
  fontSmall: 'clamp(10px, 1.8vw, 12px)',
  fontMedium: 'clamp(11px, 2vw, 14px)',
  fontLarge: 'clamp(13px, 2.5vw, 16px)',
  fontHero: 'clamp(1.1rem, 3.5vw, 2.2rem)',
  /* Padding */
  padTiny: 'clamp(4px, 1vw, 8px)',
  padSmall: 'clamp(6px, 1.2vw, 12px)',
  padMedium: 'clamp(8px, 1.5vw, 16px)',
  padLarge: 'clamp(12px, 2vw, 24px)',
  /* Border radius */
  radiusSmall: 'clamp(6px, 1.2vw, 10px)',
  radiusMedium: 'clamp(8px, 1.5vw, 14px)',
  radiusPill: 100,
  /* Container */
  controlRowPad: 'clamp(4px, 1vw, 14px)',
  progressBarPad: 'clamp(8px, 2vw, 20px)',
};