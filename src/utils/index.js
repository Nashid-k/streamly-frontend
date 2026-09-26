/**
 * Streamly Shared Utilities
 *
 * Core runtime utilities and consolidated re-exports for diagnostics,
 * metadata normalization, chunk recovery, platform names, and ratings.
 */

// Defensive Array Normalization
export const EMPTY_ARRAY = [];
export const asArray = (x) => (Array.isArray(x) ? x : EMPTY_ARRAY);

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
export { getRatingColor, getScoreColor } from "./ratings";
export { buildMetaFacts } from "./metaFacts";

// Continue-Watching progress helpers (resume %, time left, runtime→seconds)
export {
  durationSeconds,
  progressPct,
  remainingSeconds,
} from "./resumeProgress";

// HLS download quality parsing / labels
export {
  parseMasterPlaylist,
  parseMediaPlaylist,
  parseAudioGroups,
  variantLabel,
  resolutionLabel,
  estimateBytes,
  formatBytes,
  safeFileName,
} from "./downloadQuality";

// Numeric preference reads (unset ≠ 0)
export { readStoredNumber } from "./storedNumber";

// Dynamic Import Chunk Recovery
export {
  isChunkLoadError,
  clearRuntimeCaches,
  shouldAttemptRecovery,
} from "./chunkRecovery";
