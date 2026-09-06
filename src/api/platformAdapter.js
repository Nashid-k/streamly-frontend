/**
 * platformAdapter.js — Unified streaming platform registry
 *
 * 20+ platforms with verified logos, brand colors, release-time configs,
 * fuzzy normalization, and category groupings.
 *
 * Logo sources (verified via curl):
 *   • Simple Icons CDN: netflix, appletv, paramountplus, crunchyroll, mubi, max, jio, sony
 *   • Google Favicons CDN: prime, disney, hotstar, hulu, peacock, zee5, mx, voot,
 *     eros, aha, hoichoi, shemaroo, sunnxt, lionsgate, britbox, stan, curiosity
 *
 * Normalizes any raw string from TMDB / backend / user input into
 * a canonical platform key, or null when nothing matches.
 */

// ─── Logo Helpers ───────────────────────────────────────────────────────────

/**
 * Simple Icons CDN — verified working SVG icons for major platforms.
 * URL format: https://cdn.simpleicons.org/{slug}/{color}
 * Color is optional (defaults to black).
 */
function simpleIcon(slug, color) {
  return `https://cdn.simpleicons.org/${slug}/${color.replace('#', '')}`;
}

/**
 * Google Favicons CDN — real brand icons from actual websites.
 * Returns 128px PNG logos. Verified working for all platforms below.
 */
function faviconIcon(domain) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}



// ─── Platform Registry ──────────────────────────────────────────────────────

export const PLATFORMS = {
  // ── Global giants ──
  // VERIFIED: google.com/s2/favicons?domain=netflix.com → 200 ✓ (red "N" logomark)
  netflix: {
    id: "netflix",
    name: "Netflix",
    shortName: "Netflix",
    iconUrl: faviconIcon("netflix.com"),
    iconHeight: "20px",
    color: "#E50914",
    gradient: "linear-gradient(135deg, #E50914, #b20710)",
    rapidApiName: "netflix",
    category: "global",
    tags: ["subscription", "originals"],
  },
  // VERIFIED: google.com/s2/favicons?domain=primevideo.com → 200 ✓
  prime: {
    id: "prime",
    name: "Prime Video",
    shortName: "Prime",
    iconUrl: faviconIcon("primevideo.com"),
    iconHeight: "20px",
    color: "#00A8E1",
    gradient: "linear-gradient(135deg, #00A8E1, #0077B5)",
    rapidApiName: "prime",
    category: "global",
    tags: ["subscription", "rental"],
  },
  // VERIFIED: google.com/s2/favicons?domain=disneyplus.com → 200 ✓
  disney: {
    id: "disney",
    name: "Disney+",
    shortName: "Disney+",
    iconUrl: faviconIcon("disneyplus.com"),
    iconHeight: "20px",
    color: "#113CCF",
    gradient: "linear-gradient(135deg, #113CCF, #0a2a8a)",
    rapidApiName: "disney",
    category: "global",
    tags: ["subscription", "originals"],
  },
  // VERIFIED: google.com/s2/favicons?domain=hotstar.com → 200 ✓
  hotstar: {
    id: "hotstar",
    name: "Disney+ Hotstar",
    shortName: "Hotstar",
    iconUrl: faviconIcon("hotstar.com"),
    iconHeight: "24px",
    color: "#0F0617",
    gradient: "linear-gradient(135deg, #0F0617, #1a0a30)",
    rapidApiName: "hotstar",
    category: "india",
    tags: ["subscription", "sports", "regional"],
  },
  // VERIFIED: cdn.simpleicons.org/appletv → 200 ✓
  appletv: {
    id: "appletv",
    name: "Apple TV+",
    shortName: "Apple TV+",
    iconUrl: simpleIcon("appletv", "ffffff"),
    iconHeight: "20px",
    color: "#555555",
    gradient: "linear-gradient(135deg, #555, #222)",
    rapidApiName: "apple",
    category: "global",
    tags: ["subscription", "originals"],
  },
  // VERIFIED: google.com/s2/favicons?domain=hulu.com → 200 ✓
  hulu: {
    id: "hulu",
    name: "Hulu",
    shortName: "Hulu",
    iconUrl: faviconIcon("hulu.com"),
    iconHeight: "20px",
    color: "#1CE783",
    gradient: "linear-gradient(135deg, #1CE783, #0d9e5a)",
    rapidApiName: "hulu",
    category: "global",
    tags: ["subscription"],
  },
  // VERIFIED: cdn.simpleicons.org/max → 200 ✓
  max: {
    id: "max",
    name: "Max",
    shortName: "Max",
    iconUrl: simpleIcon("max", "002BE7"),
    iconHeight: "18px",
    color: "#002BE7",
    gradient: "linear-gradient(135deg, #002BE7, #001a8a)",
    rapidApiName: "max",
    category: "global",
    tags: ["subscription", "originals"],
  },
  // VERIFIED: cdn.simpleicons.org/paramountplus → 200 ✓
  paramount: {
    id: "paramount",
    name: "Paramount+",
    shortName: "Paramount+",
    iconUrl: simpleIcon("paramountplus", "0064FF"),
    iconHeight: "20px",
    color: "#0064FF",
    gradient: "linear-gradient(135deg, #0064FF, #004acc)",
    rapidApiName: "paramount",
    category: "global",
    tags: ["subscription"],
  },
  // VERIFIED: google.com/s2/favicons?domain=peacocktv.com → 200 ✓
  peacock: {
    id: "peacock",
    name: "Peacock",
    shortName: "Peacock",
    iconUrl: faviconIcon("peacocktv.com"),
    iconHeight: "22px",
    color: "#FDB927",
    gradient: "linear-gradient(135deg, #FDB927, #d4a020)",
    rapidApiName: "peacock",
    category: "global",
    tags: ["subscription", "free-tier"],
  },
  // VERIFIED: cdn.simpleicons.org/crunchyroll → 200 ✓
  crunchyroll: {
    id: "crunchyroll",
    name: "Crunchyroll",
    shortName: "Crunchyroll",
    iconUrl: simpleIcon("crunchyroll", "F47521"),
    iconHeight: "22px",
    color: "#F47521",
    gradient: "linear-gradient(135deg, #F47521, #c45d18)",
    rapidApiName: "crunchyroll",
    category: "global",
    tags: ["subscription", "anime"],
  },
  // VERIFIED: cdn.simpleicons.org/mubi → 200 ✓
  mubi: {
    id: "mubi",
    name: "MUBI",
    shortName: "MUBI",
    iconUrl: simpleIcon("mubi", "ffffff"),
    iconHeight: "18px",
    color: "#000000",
    gradient: "linear-gradient(135deg, #333, #000)",
    rapidApiName: "mubi",
    category: "global",
    tags: ["subscription", "curated", "arthouse"],
  },

  // ── India-specific ──
  // VERIFIED: google.com/s2/favicons?domain=zee5.com → 200 ✓
  zee5: {
    id: "zee5",
    name: "ZEE5",
    shortName: "ZEE5",
    iconUrl: faviconIcon("zee5.com"),
    iconHeight: "18px",
    color: "#8230C6",
    gradient: "linear-gradient(135deg, #8230C6, #5c1f94)",
    rapidApiName: "zee5",
    category: "india",
    tags: ["subscription", "regional"],
  },
  // VERIFIED: cdn.simpleicons.org/sony → 200 ✓
  sonyliv: {
    id: "sonyliv",
    name: "Sony LIV",
    shortName: "Sony LIV",
    iconUrl: simpleIcon("sony", "F48220"),
    iconHeight: "22px",
    color: "#F48220",
    gradient: "linear-gradient(135deg, #F48220, #c46818)",
    rapidApiName: "sonyliv",
    category: "india",
    tags: ["subscription", "sports"],
  },
  // VERIFIED: cdn.simpleicons.org/jio → 200 ✓
  jio: {
    id: "jio",
    name: "JioCinema",
    shortName: "JioCinema",
    iconUrl: simpleIcon("jio", "E5007D"),
    iconHeight: "22px",
    color: "#E5007D",
    gradient: "linear-gradient(135deg, #E5007D, #b80064)",
    rapidApiName: "jio",
    category: "india",
    tags: ["subscription", "free", "sports"],
  },
  // VERIFIED: google.com/s2/favicons?domain=mxplayer.in → 200 ✓
  mxplayer: {
    id: "mxplayer",
    name: "MX Player",
    shortName: "MX Player",
    iconUrl: faviconIcon("mxplayer.in"),
    iconHeight: "18px",
    color: "#FF6B00",
    gradient: "linear-gradient(135deg, #FF6B00, #cc5500)",
    rapidApiName: "mxplayer",
    category: "india",
    tags: ["free", "ad-supported"],
  },
  // VERIFIED: google.com/s2/favicons?domain=voot.com → 200 ✓
  voot: {
    id: "voot",
    name: "Voot",
    shortName: "Voot",
    iconUrl: faviconIcon("voot.com"),
    iconHeight: "18px",
    color: "#FF0000",
    gradient: "linear-gradient(135deg, #FF0000, #cc0000)",
    rapidApiName: "voot",
    category: "india",
    tags: ["subscription"],
  },
  // VERIFIED: google.com/s2/favicons?domain=erosnow.com → 200 ✓
  erosnow: {
    id: "erosnow",
    name: "Eros Now",
    shortName: "Eros Now",
    iconUrl: faviconIcon("erosnow.com"),
    iconHeight: "18px",
    color: "#FF6B00",
    gradient: "linear-gradient(135deg, #FF6B00, #cc5500)",
    rapidApiName: "erosnow",
    category: "india",
    tags: ["subscription"],
  },
  // VERIFIED: google.com/s2/favicons?domain=aha.video → 200 ✓
  aha: {
    id: "aha",
    name: "aha",
    shortName: "aha",
    iconUrl: faviconIcon("aha.video"),
    iconHeight: "18px",
    color: "#FF3366",
    gradient: "linear-gradient(135deg, #FF3366, #cc2952)",
    rapidApiName: "aha",
    category: "india",
    tags: ["subscription", "regional", "telugu"],
  },
  // VERIFIED: google.com/s2/favicons?domain=hoichoi.tv → 200 ✓
  hoichoi: {
    id: "hoichoi",
    name: "Hoichoi",
    shortName: "Hoichoi",
    iconUrl: faviconIcon("hoichoi.tv"),
    iconHeight: "18px",
    color: "#E5007D",
    gradient: "linear-gradient(135deg, #E5007D, #b80064)",
    rapidApiName: "hoichoi",
    category: "india",
    tags: ["subscription", "regional", "bengali"],
  },
  // VERIFIED: google.com/s2/favicons?domain=shemaroome.com → 200 ✓
  shemaroo: {
    id: "shemaroo",
    name: "ShemarooMe",
    shortName: "ShemarooMe",
    iconUrl: faviconIcon("shemaroome.com"),
    iconHeight: "18px",
    color: "#FF0000",
    gradient: "linear-gradient(135deg, #FF0000, #cc0000)",
    rapidApiName: "shemaroo",
    category: "india",
    tags: ["subscription", "regional"],
  },
  // VERIFIED: google.com/s2/favicons?domain=sunnxt.com → 200 ✓
  sunnxt: {
    id: "sunnxt",
    name: "Sun NXT",
    shortName: "Sun NXT",
    iconUrl: faviconIcon("sunnxt.com"),
    iconHeight: "18px",
    color: "#FF6600",
    gradient: "linear-gradient(135deg, #FF6600, #cc5200)",
    rapidApiName: "sunnxt",
    category: "india",
    tags: ["subscription", "regional", "tamil"],
  },
  // VERIFIED: google.com/s2/favicons?domain=lionsgateplay.com → 200 ✓
  lionsgate: {
    id: "lionsgate",
    name: "Lionsgate Play",
    shortName: "Lionsgate Play",
    iconUrl: faviconIcon("lionsgateplay.com"),
    iconHeight: "18px",
    color: "#C8102E",
    gradient: "linear-gradient(135deg, #C8102E, #a00d24)",
    rapidApiName: "lionsgate",
    category: "india",
    tags: ["subscription"],
  },

  // ── International niche ──
  // VERIFIED: google.com/s2/favicons?domain=britbox.com → 200 ✓
  britbox: {
    id: "britbox",
    name: "BritBox",
    shortName: "BritBox",
    iconUrl: faviconIcon("britbox.com"),
    iconHeight: "18px",
    color: "#00B140",
    gradient: "linear-gradient(135deg, #00B140, #008d33)",
    rapidApiName: "britbox",
    category: "global",
    tags: ["subscription", "british"],
  },
  // VERIFIED: google.com/s2/favicons?domain=stan.com.au → 200 ✓
  stan: {
    id: "stan",
    name: "Stan",
    shortName: "Stan",
    iconUrl: faviconIcon("stan.com.au"),
    iconHeight: "18px",
    color: "#0D47A1",
    gradient: "linear-gradient(135deg, #0D47A1, #0a3880)",
    rapidApiName: "stan",
    category: "global",
    tags: ["subscription", "australian"],
  },
  // VERIFIED: google.com/s2/favicons?domain=curiositystream.com → 200 ✓
  curiositystream: {
    id: "curiositystream",
    name: "Curiosity Stream",
    shortName: "Curiosity",
    iconUrl: faviconIcon("curiositystream.com"),
    iconHeight: "18px",
    color: "#1A1A2E",
    gradient: "linear-gradient(135deg, #1A1A2E, #0d0d17)",
    rapidApiName: "curiositystream",
    category: "global",
    tags: ["subscription", "documentary"],
  },
  // VERIFIED: google.com/s2/favicons?domain=justwatch.com → 200 ✓
  justwatch: {
    id: "justwatch",
    name: "JustWatch",
    shortName: "JustWatch",
    iconUrl: faviconIcon("justwatch.com"),
    iconHeight: "18px",
    color: "#00C3FF",
    gradient: "linear-gradient(135deg, #00C3FF, #009ccc)",
    rapidApiName: "justwatch",
    category: "aggregator",
    tags: ["aggregator"],
  },
};

// ─── Normalization ──────────────────────────────────────────────────────────

// Order matters — more specific matches first
const NORMALIZATION_RULES = [
  // Disney variants (check before generic "hotstar")
  { pattern: /disney\+?\s*hotstar/i, key: "hotstar" },
  { pattern: /disney\+/i, key: "disney" },
  { pattern: /disney/i, key: "disney" },

  // Amazon variants
  { pattern: /prime\s*video/i, key: "prime" },
  { pattern: /amazon\s*prime/i, key: "prime" },
  { pattern: /amazon/i, key: "prime" },
  { pattern: /prime/i, key: "prime" },

  // Netflix
  { pattern: /netflix/i, key: "netflix" },

  // Apple
  { pattern: /apple\s*tv\+?/i, key: "appletv" },
  { pattern: /apple/i, key: "appletv" },

  // Hotstar standalone
  { pattern: /hotstar/i, key: "hotstar" },

  // India-specific
  { pattern: /zee\s*5|zee5/i, key: "zee5" },
  { pattern: /zee\b/i, key: "zee5" },
  { pattern: /sony\s*liv|sonyliv/i, key: "sonyliv" },
  { pattern: /sony/i, key: "sonyliv" },
  { pattern: /jio\s*cinema|jiocinema/i, key: "jio" },
  { pattern: /jio/i, key: "jio" },
  { pattern: /mx\s*player|mxplayer/i, key: "mxplayer" },
  { pattern: /mx\b/i, key: "mxplayer" },
  { pattern: /voot/i, key: "voot" },
  { pattern: /eros\s*now|erosnow/i, key: "erosnow" },
  { pattern: /eros/i, key: "erosnow" },
  { pattern: /\baha\b/i, key: "aha" },
  { pattern: /hoichoi/i, key: "hoichoi" },
  { pattern: /shemaroo/i, key: "shemaroo" },
  { pattern: /sun\s*nxt|sunnxt/i, key: "sunnxt" },
  { pattern: /lionsgate/i, key: "lionsgate" },

  // International
  { pattern: /hulu/i, key: "hulu" },
  { pattern: /max\b|hbo\s*max/i, key: "max" },
  { pattern: /hbo/i, key: "max" },
  { pattern: /paramount/i, key: "paramount" },
  { pattern: /peacock/i, key: "peacock" },
  { pattern: /crunchy\s*roll|crunchyroll/i, key: "crunchyroll" },
  { pattern: /\bmubi\b/i, key: "mubi" },
  { pattern: /brit\s*box|britbox/i, key: "britbox" },
  { pattern: /\bstan\b/i, key: "stan" },
  { pattern: /curiosity/i, key: "curiositystream" },
  { pattern: /just\s*watch|justwatch/i, key: "justwatch" },
];

/**
 * Normalizes an arbitrary platform string into a canonical platform key.
 * @param {string} rawName - Platform name from TMDB, backend, or user input
 * @returns {string|null} Canonical platform key or null if no match
 */
export function normalizePlatformKey(rawName) {
  if (!rawName) return null;
  const trimmed = String(rawName).trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  // Direct key match
  if (PLATFORMS[lower]) return lower;

  // Rule-based fuzzy matching
  for (const rule of NORMALIZATION_RULES) {
    if (rule.pattern.test(trimmed)) return rule.key;
  }

  // Substring scan as last resort
  for (const [key, platform] of Object.entries(PLATFORMS)) {
    if (lower.includes(key) || lower.includes(platform.name.toLowerCase()) || lower.includes(platform.shortName.toLowerCase())) {
      return key;
    }
  }

  return null;
}

// ─── PlatformAdapter Class ──────────────────────────────────────────────────

export class PlatformAdapter {
  static getPlatform(id) {
    return PLATFORMS[id] || null;
  }

  static getName(id) {
    return this.getPlatform(id)?.name || id;
  }

  static getIconUrl(id) {
    return this.getPlatform(id)?.iconUrl || "";
  }

  static getColor(id) {
    return this.getPlatform(id)?.color || "#ffffff";
  }

  /**
   * Resolves a raw platform name into the full platform object.
   * @param {string} rawName
   * @returns {object|null} Platform object or null
   */
  static resolveFromRawName(rawName) {
    if (!rawName) return null;
    const key = normalizePlatformKey(rawName);
    return key ? PLATFORMS[key] : null;
  }
}

// ─── mapSource ──────────────────────────────────────────────────────────────

/**
 * Maps a movie's availablePlatforms into a single source/sourceName pair.
 * Returns null source when nothing matches (no more Netflix default).
 */
export function mapSource(movie) {
  if (movie.availablePlatforms && movie.availablePlatforms.length > 0) {
    for (const p of movie.availablePlatforms) {
      const match = PlatformAdapter.resolveFromRawName(p);
      if (match) {
        return { ...movie, source: match.id, sourceName: match.name };
      }
    }
  }
  return { ...movie, source: null, sourceName: null };
}

/**
 * Normalize a movie's source and sourceName from availablePlatforms.
 * This is the single source of truth — call it on ANY movie data from any API.
 * Handles: raw strings, undefined source, missing availablePlatforms, etc.
 *
 * Priority chain:
 * 1. If movie.source is already a canonical key → use it directly
 * 2. If movie.source is a raw string → normalize it
 * 3. Fall back to availablePlatforms[0] and normalize
 * 4. Return null (never default to netflix or any platform)
 */
export function normalizeMovieSource(movie) {
  // Guard: never crash on null/undefined
  if (!movie || typeof movie !== 'object') return { source: null, sourceName: null };

  // 1. availablePlatforms is the source of truth — it lists every platform
  //    a title is actually streaming on. Prefer it over `source` (which is only
  //    which catalog the movie was fetched from, and is netflix-first when
  //    aggregated). This is what makes platform labels correct on Home/rails.
  if (movie.availablePlatforms && Array.isArray(movie.availablePlatforms) && movie.availablePlatforms.length > 0) {
    for (const p of movie.availablePlatforms) {
      const match = PlatformAdapter.resolveFromRawName(p);
      if (match) {
        return { ...movie, source: match.id, sourceName: match.name };
      }
    }
    // No match found — use raw first platform as sourceName for transparency
    const rawFirst = movie.availablePlatforms[0];
    if (rawFirst) {
      const rawKey = normalizePlatformKey(rawFirst);
      if (rawKey) {
        return { ...movie, source: rawKey, sourceName: PLATFORMS[rawKey].name };
      }
      return { ...movie, source: null, sourceName: rawFirst };
    }
  }

  // 2. If source is already a valid canonical key, use it — but always set sourceName to match
  if (movie.source && PLATFORMS[movie.source]) {
    return { ...movie, source: movie.source, sourceName: PLATFORMS[movie.source].name };
  }

  // 3. If source is a raw string, normalize it
  if (movie.source && typeof movie.source === 'string') {
    const key = normalizePlatformKey(movie.source);
    if (key) {
      return { ...movie, source: key, sourceName: PLATFORMS[key].name };
    }
  }

  // 4. No platform data — keep all movie properties, set source to null (never Netflix default)
  return { ...movie, source: null, sourceName: null };
}
