/* Apple TV+ inspired cinematic palette.
 * Premium, ultra-high contrast, and glassmorphic. */

export const colors = {
  bg: "#000000",             // OLED Black
  surface: "#1C1C1E",        // Elevated Apple Dark Surface
  surfaceHi: "#2C2C2E",      // Higher elevation surface
  border: "rgba(255, 255, 255, 0.15)", // Softer border
  text: "#FFFFFF",
  textDim: "rgba(255, 255, 255, 0.6)",
  textFaint: "rgba(255, 255, 255, 0.3)",
  red: "#0A84FF",            // Switched primary action to Apple Blue
  redDim: "rgba(10, 132, 255, 0.25)",
  green: "#30D158",          // Apple Green
  scrim: "rgba(0,0,0,0.5)",  // Lighter scrim for glass effects
} as const;

export const space = {
  xs: 6,
  sm: 12,
  md: 18,
  lg: 24,
  xl: 32,
  xxl: 64,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const type = {
  hero: 34,
  title: 22,
  body: 16,
  small: 13,
  tiny: 11,
} as const;

export const motion = {
  press: 120,
  enter: 320,
  fade: 220,
  shimmer: 750,
  rise: 20,
} as const;
