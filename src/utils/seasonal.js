/* One source of truth for which seasonal particle effect (if any) is live on
   screen. Every overlay (Snowfall, FallingLeaves, SpringBlossoms, SummerGlow)
   asks here instead of deciding on its own, which guarantees:

   · Dynamic OFF → no effect at all, in any month, under any theme — the theme's
     colors stay, only the particles go (no snow even on Christmas/Winter).
   · A seasonal theme picked by hand → ONLY that theme's effect runs. Picking
     Autumn in November shows leaves, never leaves + snow; the calendar window
     of the other seasons is suspended while a seasonal theme is active.
   · Default (non-seasonal) theme → the calendar decides, one effect per month,
     so the seasons never collide on screen. */

const SNOW_MONTHS = [10, 11, 0, 1]; // Nov -> Feb, carries across New Year
const LEAVES_MONTHS = [8, 9]; // Sep -> Oct
const BLOSSOM_MONTHS = [2, 3, 4]; // Mar -> May
const GLOW_MONTHS = [5, 6, 7]; // Jun -> Aug

export const THEME_EFFECT = {
  christmas: "snow",
  winter: "snow",
  autumn: "leaves",
  spring: "blossoms",
  summer: "glow",
};

export function resolveSeasonalEffect({ dynamic, theme, month }) {
  if (dynamic === false) return null;
  if (theme && theme in THEME_EFFECT) return THEME_EFFECT[theme];
  if (SNOW_MONTHS.includes(month)) return "snow";
  if (LEAVES_MONTHS.includes(month)) return "leaves";
  if (BLOSSOM_MONTHS.includes(month)) return "blossoms";
  if (GLOW_MONTHS.includes(month)) return "glow";
  return null;
}
