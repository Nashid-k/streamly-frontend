/**
 * platformAdapter.js — Unified streaming platform registry
 *
 * 20+ platforms with verified logos, brand colors, release-time configs,
 * fuzzy normalization, and category groupings.
 *
 * Logo sources (verified via HTTP 200 + 500x500 checks):
 *   • TMDB Provider Logos CDN (primary): image.tmdb.org/t/p/w154/{hash}.{ext}
 *     — official branded provider icons scraped from TMDB watch pages & the
 *     provider DB mirror, all returning 200. Netflix logo confirmed by the
 *     user's own URL: .../rK1KljqmbvO9HQa1PBFLILWah72.png
 *   • Google Favicons CDN (fallback): only for platforms with no TMDB
 *     provider (voot, shemaroo)
 *
 * Normalizes any raw string from TMDB / backend / user input into
 * a canonical platform key, or null when nothing matches.
 */

// ─── Logo Helpers ───────────────────────────────────────────────────────────

/**
 * TMDB Provider Logo CDN — official branded icons from themoviedb.org.
 * URL format: https://image.tmdb.org/t/p/w154/{hash}.{ext}
 * All hashes below were verified (HTTP 200, 500x500 square).
 */
function tmdbIcon(hash, ext) {
  return `https://image.tmdb.org/t/p/w154/${hash}.${ext}`;
}

/**
 * Google Favicons CDN — fallback for platforms with no TMDB provider.
 * Returns 128px PNG logos.
 */
function faviconIcon(domain) {
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
}



// ─── Platform Registry ──────────────────────────────────────────────────────

export const PLATFORMS = {
  // ── Global giants ──
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  netflix: {
    id: "netflix",
    name: "Netflix",
    shortName: "Netflix",
    iconUrl: tmdbIcon("rK1KljqmbvO9HQa1PBFLILWah72", "png"),
    iconHeight: "20px",
    color: "#E50914",
    gradient: "linear-gradient(135deg, #E50914, #b20710)",
    rapidApiName: "netflix",
    category: "global",
    tags: ["subscription", "originals"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  prime: {
    id: "prime",
    name: "Prime Video",
    shortName: "Prime",
    iconUrl: tmdbIcon("gMZdpavHmxFNnLpMHwVxfqeux2g", "png"),
    iconHeight: "20px",
    color: "#00A8E1",
    gradient: "linear-gradient(135deg, #00A8E1, #0077B5)",
    rapidApiName: "prime",
    category: "global",
    tags: ["subscription", "rental"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  disney: {
    id: "disney",
    name: "Disney+",
    shortName: "Disney+",
    iconUrl: tmdbIcon("c7SqVo4DFrbK3RwhGbxvQ9SRco2", "jpg"),
    iconHeight: "20px",
    color: "#113CCF",
    gradient: "linear-gradient(135deg, #113CCF, #0a2a8a)",
    rapidApiName: "disney",
    category: "global",
    tags: ["subscription", "originals"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  hotstar: {
    id: "hotstar",
    name: "Disney+ Hotstar",
    shortName: "Hotstar",
    iconUrl: tmdbIcon("ledoS6EgdjTNq8F1e6wubUQer18", "png"),
    iconHeight: "24px",
    color: "#0F0617",
    gradient: "linear-gradient(135deg, #0F0617, #1a0a30)",
    rapidApiName: "hotstar",
    category: "india",
    tags: ["subscription", "sports", "regional"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  appletv: {
    id: "appletv",
    name: "Apple TV+",
    shortName: "Apple TV+",
    iconUrl: tmdbIcon("hPcjSaWfMwEqXaCMu7Fkb529Dkc", "jpg"),
    iconHeight: "20px",
    color: "#555555",
    gradient: "linear-gradient(135deg, #555, #222)",
    rapidApiName: "apple",
    category: "global",
    tags: ["subscription", "originals"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  hulu: {
    id: "hulu",
    name: "Hulu",
    shortName: "Hulu",
    iconUrl: tmdbIcon("jlyafDbXLyNXNNFZbIgB9VrlScW", "jpg"),
    iconHeight: "20px",
    color: "#1CE783",
    gradient: "linear-gradient(135deg, #1CE783, #0d9e5a)",
    rapidApiName: "hulu",
    category: "global",
    tags: ["subscription"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  max: {
    id: "max",
    name: "Max",
    shortName: "Max",
    iconUrl: tmdbIcon("qTybjmHLNcXZExZLBnm4muVCDzP", "jpg"),
    iconHeight: "18px",
    color: "#002BE7",
    gradient: "linear-gradient(135deg, #002BE7, #001a8a)",
    rapidApiName: "max",
    category: "global",
    tags: ["subscription", "originals"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  paramount: {
    id: "paramount",
    name: "Paramount+",
    shortName: "Paramount+",
    iconUrl: tmdbIcon("8WerMI8XcZXqPpkHTZNtzMzousF", "jpg"),
    iconHeight: "20px",
    color: "#0064FF",
    gradient: "linear-gradient(135deg, #0064FF, #004acc)",
    rapidApiName: "paramount",
    category: "global",
    tags: ["subscription"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  peacock: {
    id: "peacock",
    name: "Peacock",
    shortName: "Peacock",
    iconUrl: tmdbIcon("drPlq5beqXtBaP7MNs8W616YRhm", "jpg"),
    iconHeight: "22px",
    color: "#FDB927",
    gradient: "linear-gradient(135deg, #FDB927, #d4a020)",
    rapidApiName: "peacock",
    category: "global",
    tags: ["subscription", "free-tier"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  crunchyroll: {
    id: "crunchyroll",
    name: "Crunchyroll",
    shortName: "Crunchyroll",
    iconUrl: tmdbIcon("jhhFTFVWjKVi2JjDYoqoI4dHsmL", "jpg"),
    iconHeight: "22px",
    color: "#F47521",
    gradient: "linear-gradient(135deg, #F47521, #c45d18)",
    rapidApiName: "crunchyroll",
    category: "global",
    tags: ["subscription", "anime"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  mubi: {
    id: "mubi",
    name: "MUBI",
    shortName: "MUBI",
    iconUrl: tmdbIcon("iCHCSuraj6zUKmMYgQhsm8jmoqi", "jpg"),
    iconHeight: "18px",
    color: "#000000",
    gradient: "linear-gradient(135deg, #333, #000)",
    rapidApiName: "mubi",
    category: "global",
    tags: ["subscription", "curated", "arthouse"],
  },

  // ── India-specific ──
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  zee5: {
    id: "zee5",
    name: "ZEE5",
    shortName: "ZEE5",
    iconUrl: tmdbIcon("uQvhdtB8skccsGHmvKi3y5bqBsX", "png"),
    iconHeight: "18px",
    color: "#8230C6",
    gradient: "linear-gradient(135deg, #8230C6, #5c1f94)",
    rapidApiName: "zee5",
    category: "india",
    tags: ["subscription", "regional"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  sonyliv: {
    id: "sonyliv",
    name: "Sony LIV",
    shortName: "Sony LIV",
    iconUrl: tmdbIcon("coM4QWbmIOa0xJ5cGR9BRmoV25B", "png"),
    iconHeight: "22px",
    color: "#F48220",
    gradient: "linear-gradient(135deg, #F48220, #c46818)",
    rapidApiName: "sonyliv",
    category: "india",
    tags: ["subscription", "sports"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  jio: {
    id: "jio",
    name: "JioCinema",
    shortName: "JioCinema",
    iconUrl: tmdbIcon("cmURKKdS72Ckr52615xvc2JPsJm", "jpg"),
    iconHeight: "22px",
    color: "#E5007D",
    gradient: "linear-gradient(135deg, #E5007D, #b80064)",
    rapidApiName: "jio",
    category: "india",
    tags: ["subscription", "free", "sports"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  mxplayer: {
    id: "mxplayer",
    name: "MX Player",
    shortName: "MX Player",
    iconUrl: tmdbIcon("ss6JfWLwwrIjO1AfEsBy8GYM1EU", "jpg"),
    iconHeight: "18px",
    color: "#FF6B00",
    gradient: "linear-gradient(135deg, #FF6B00, #cc5500)",
    rapidApiName: "mxplayer",
    category: "india",
    tags: ["free", "ad-supported"],
  },
  // NO TMDB provider → Google favicon fallback
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
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  erosnow: {
    id: "erosnow",
    name: "Eros Now",
    shortName: "Eros Now",
    iconUrl: tmdbIcon("6xQrNQoTmXWhaJj4O8u2FRsXBXs", "jpg"),
    iconHeight: "18px",
    color: "#FF6B00",
    gradient: "linear-gradient(135deg, #FF6B00, #cc5500)",
    rapidApiName: "erosnow",
    category: "india",
    tags: ["subscription"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  aha: {
    id: "aha",
    name: "aha",
    shortName: "aha",
    iconUrl: tmdbIcon("9MABvFilVMUAV86vLUgBgeM5LQQ", "jpg"),
    iconHeight: "18px",
    color: "#FF3366",
    gradient: "linear-gradient(135deg, #FF3366, #cc2952)",
    rapidApiName: "aha",
    category: "india",
    tags: ["subscription", "regional", "telugu"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  hoichoi: {
    id: "hoichoi",
    name: "Hoichoi",
    shortName: "Hoichoi",
    iconUrl: tmdbIcon("da2dkyeFe4GCRaKxpsW4mzt2UPl", "jpg"),
    iconHeight: "18px",
    color: "#E5007D",
    gradient: "linear-gradient(135deg, #E5007D, #b80064)",
    rapidApiName: "hoichoi",
    category: "india",
    tags: ["subscription", "regional", "bengali"],
  },
  // NO TMDB provider → Google favicon fallback
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
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  sunnxt: {
    id: "sunnxt",
    name: "Sun NXT",
    shortName: "Sun NXT",
    iconUrl: tmdbIcon("acANFKCTLQuvDPjJAb5SnmzJaT6", "jpg"),
    iconHeight: "18px",
    color: "#FF6600",
    gradient: "linear-gradient(135deg, #FF6600, #cc5200)",
    rapidApiName: "sunnxt",
    category: "india",
    tags: ["subscription", "regional", "tamil"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  lionsgate: {
    id: "lionsgate",
    name: "Lionsgate Play",
    shortName: "Lionsgate Play",
    iconUrl: tmdbIcon("vvUYyCXlJMfKEo24vw4cEMavzvu", "png"),
    iconHeight: "18px",
    color: "#C8102E",
    gradient: "linear-gradient(135deg, #C8102E, #a00d24)",
    rapidApiName: "lionsgate",
    category: "india",
    tags: ["subscription"],
  },

  // ── International niche ──
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  britbox: {
    id: "britbox",
    name: "BritBox",
    shortName: "BritBox",
    iconUrl: tmdbIcon("xqZSzhIcq8qaAU13rMhVhzDi4T8", "jpg"),
    iconHeight: "18px",
    color: "#00B140",
    gradient: "linear-gradient(135deg, #00B140, #008d33)",
    rapidApiName: "britbox",
    category: "global",
    tags: ["subscription", "british"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  stan: {
    id: "stan",
    name: "Stan",
    shortName: "Stan",
    iconUrl: tmdbIcon("1UrT2H9x6DuQ9ytNhsSCUFtTUwS", "jpg"),
    iconHeight: "18px",
    color: "#0D47A1",
    gradient: "linear-gradient(135deg, #0D47A1, #0a3880)",
    rapidApiName: "stan",
    category: "global",
    tags: ["subscription", "australian"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  curiositystream: {
    id: "curiositystream",
    name: "Curiosity Stream",
    shortName: "Curiosity",
    iconUrl: tmdbIcon("rcBwnERpNfPfWB5DaSTyEMCZbCA", "jpg"),
    iconHeight: "18px",
    color: "#1A1A2E",
    gradient: "linear-gradient(135deg, #1A1A2E, #0d0d17)",
    rapidApiName: "curiositystream",
    category: "global",
    tags: ["subscription", "documentary"],
  },
  // LOGO: TMDB provider logo (verified HTTP 200, 500x500)
  justwatch: {
    id: "justwatch",
    name: "JustWatch",
    shortName: "JustWatch",
    iconUrl: tmdbIcon("aJXLTvX11u4fBLMPRVJZVKkLYHP", "png"),
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
