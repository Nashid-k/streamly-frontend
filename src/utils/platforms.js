/**
 * Platform labels arrive from TMDB, saved list entries, and older app builds
 * in several formats. Keep the canonical key and display name in one small,
 * dependency-free place so UI copy never exposes a raw provider slug.
 */
const PLATFORM_ALIASES = {
  "amazon-prime": "prime",
  "amazon-prime-video": "prime",
  "prime-video": "prime",
  primevideo: "prime",
  "apple-tv": "appletv",
  "apple-tv-plus": "appletv",
  appletvplus: "appletv",
  "disney-plus": "disneyplus",
  disneyplus: "disneyplus",
  "jio-cinema": "jio",
  jiocinema: "jio",
  "sony-liv": "sonyliv",
  "zee-5": "zee5",
  "hbo-max": "max",
  "max-originals": "max",
};

const PLATFORM_NAMES = {
  netflix: "Netflix",
  prime: "Prime Video",
  appletv: "Apple TV+",
  disneyplus: "Disney+",
  hotstar: "JioHotstar",
  jio: "JioCinema",
  zee5: "ZEE5",
  sonyliv: "Sony LIV",
  max: "Max",
  hulu: "Hulu",
  peacock: "Peacock",
  paramountplus: "Paramount+",
  crunchyroll: "Crunchyroll",
  mubi: "MUBI",
};

export function normalizePlatformKey(platform) {
  if (typeof platform !== "string") return null;
  const normalized = platform
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!normalized) return null;
  return PLATFORM_ALIASES[normalized] || normalized.replace(/-/g, "");
}

export function getPlatformName(platform) {
  const key = normalizePlatformKey(platform);
  if (key && PLATFORM_NAMES[key]) return PLATFORM_NAMES[key];
  if (typeof platform !== "string" || !platform.trim()) return null;

  // Unknown providers should still look intentional in a title detail or toast.
  return platform
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
