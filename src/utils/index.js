/**
 * Streamly Shared Utilities
 *
 * Core runtime utilities and consolidated re-exports for diagnostics,
 * metadata normalization, chunk recovery, platform names, and ratings.
 */

// Defensive Array Normalization & Legacy URL Helpers
export const EMPTY_ARRAY = [];
export const asArray = (x) => (Array.isArray(x) ? x : EMPTY_ARRAY);

export const decodeUrl = (encodedStr) => {
  if (!encodedStr || encodedStr.startsWith("http")) return encodedStr;
  try {
    const secret = import.meta.env.VITE_URL_DECODE_KEY;
    if (!secret) return encodedStr; // Guard: env var not set
    const decodedB64 = atob(encodedStr);
    return decodedB64
      .split("")
      .map((char, i) =>
        String.fromCharCode(
          char.charCodeAt(0) ^ secret.charCodeAt(i % secret.length),
        ),
      )
      .join("");
  } catch {
    return encodedStr;
  }
};

// Logging & Diagnostics
export {
  logError,
  logWarn,
  logInfo,
  logDebug,
  reportQueryError,
  logEmptyData,
} from "./debugLogger";

// Metadata, Formatting & Ratings
export { normalizePlatformKey, getPlatformName } from "./platforms";
export { getRatingColor } from "./ratings";
export { buildMetaFacts } from "./metaFacts";

// HLS download quality parsing / labels
export {
  parseMasterPlaylist,
  parseMediaPlaylist,
  variantLabel,
  resolutionLabel,
  estimateBytes,
  formatBytes,
  safeFileName,
} from "./downloadQuality";

// Dynamic Import Chunk Recovery
export {
  isChunkLoadError,
  clearRuntimeCaches,
  shouldAttemptRecovery,
} from "./chunkRecovery";
