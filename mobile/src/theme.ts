/* Dark cinematic palette — the mobile mirror of src/styles/tokens.css. Kept in
 * one place so a screen never invents a shade, and so the app reads as the same
 * product as the web build. */

export const colors = {
  bg: "#050505",
  surface: "#141414",
  surfaceHi: "#1f1f1f",
  border: "rgba(255,255,255,0.10)",
  text: "#ffffff",
  textDim: "rgba(255,255,255,0.62)",
  textFaint: "rgba(255,255,255,0.38)",
  red: "#E50914",
  redDim: "rgba(229,9,20,0.35)",
  green: "#3c8217",
  scrim: "rgba(0,0,0,0.72)",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 60,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  pill: 999,
} as const;

export const type = {
  hero: 30,
  title: 20,
  body: 14,
  small: 12,
  tiny: 11,
} as const;
