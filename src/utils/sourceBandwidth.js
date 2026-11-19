/* Per-server throughput memory.

   The Network Information API is absent on Safari/Firefox and often useless on
   desktop Chrome, so the first rendition of a new session is otherwise a blind
   seed. The player has already measured the real pipe on the previous session
   (hls.js's `bandwidthEstimate`), and throughput is a property of the PROVIDER
   + CDN, not the title: keying by `def.key` lets the next open start near the
   rung that actually survived last time.

   Stored as one versioned JSON map rather than one localStorage key per source:
   there are only a few rows, and a single read/write is easier to validate and
   trim. A failed read/write (private mode, quota, corrupt JSON) degrades to "no
   memory" — never a thrown player error. Entries expire so a hotel-wifi
   measurement cannot follow the viewer home for months. */

export const SOURCE_BANDWIDTH_KEY = "streamly_source_bw_v1";
export const SOURCE_BANDWIDTH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SOURCE_SAMPLE_MIN_BITS = 250_000;
export const SOURCE_SAMPLE_MAX_BITS = 500_000_000;
/* At most one write every 15s: fragments arrive every few seconds, and the
   stored timestamp is the throttle, so a reload cannot spam localStorage. */
export const SOURCE_WRITE_INTERVAL_MS = 15_000;
const MAX_SOURCES = 8;
const PREVIOUS_WEIGHT = 0.65;

/**
 * The last measured throughput for a source, or null.
 *
 * @param {string} sourceKey - a `PLAYER_SOURCES[].key` (e.g. "rivo-1").
 * @param {{storage?: Storage, now?: number}} [options]
 * @returns {number|null} bits per second
 */
export function readSourceBandwidth(sourceKey, { storage, now = Date.now() } = {}) {
  if (!validKey(sourceKey)) return null;
  const entry = readMap(safeStorage(storage))[sourceKey];
  return entryBits(entry, now);
}

/**
 * Blend a fresh hls.js estimate into the source's memory.
 *
 * @param {string} sourceKey - a `PLAYER_SOURCES[].key`.
 * @param {number} sampleBits - measured bits per second.
 * @param {{storage?: Storage, now?: number, minIntervalMs?: number}} [options]
 * @returns {number|null} the stored value, or null when nothing was written.
 */
export function rememberSourceBandwidth(
  sourceKey,
  sampleBits,
  { storage, now = Date.now(), minIntervalMs = SOURCE_WRITE_INTERVAL_MS } = {},
) {
  if (!validKey(sourceKey)) return null;
  const sample = sampleBitsValue(sampleBits);
  if (sample == null) return null;
  const store = safeStorage(storage);
  if (!store) return null;

  const map = readMap(store);
  const previous = map[sourceKey];
  // A stale entry is not a useful prior — start the blend fresh instead of
  // resurrecting a measurement from another network and month.
  const previousBits = entryBits(previous, now);
  const previousAt = Number(previous?.at);
  if (
    previousBits != null &&
    Number.isFinite(previousAt) &&
    previousAt > 0 &&
    now >= previousAt &&
    now - previousAt < minIntervalMs
  ) {
    return previousBits;
  }

  // hls.js's estimate is already an EWMA; keeping the previous session's value
  // heavier prevents one fast/slow fragment from defining the next seed.
  const next =
    previousBits == null
      ? sample
      : Math.round(previousBits * PREVIOUS_WEIGHT + sample * (1 - PREVIOUS_WEIGHT));
  const bounded = clampSample(next) ?? sample;

  const merged = { ...map, [sourceKey]: { bits: bounded, at: now } };
  // Keep the newest entries only. The JSON map is tiny, but an old build or a
  // renamed roster key should not accumulate forever.
  const trimmed = Object.fromEntries(
    Object.entries(merged)
      .filter(([, entry]) => entryBits(entry, now, { allowStale: true }) != null)
      .sort((a, b) => Number(b[1]?.at || 0) - Number(a[1]?.at || 0))
      .slice(0, MAX_SOURCES),
  );

  try {
    store.setItem(SOURCE_BANDWIDTH_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota/private mode: the next open simply has no prior.
    return null;
  }
  return bounded;
}

function readMap(store) {
  if (!store) return {};
  try {
    const raw = store.getItem(SOURCE_BANDWIDTH_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function entryBits(entry, now, { allowStale = false } = {}) {
  if (!entry || typeof entry !== "object") return null;
  const bits = clampSample(entry.bits);
  const at = Number(entry.at);
  if (bits == null || !Number.isFinite(at) || at <= 0) return null;
  if (!allowStale && now - at > SOURCE_BANDWIDTH_MAX_AGE_MS) return null;
  return bits;
}

function sampleBitsValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return clampSample(n);
}

function clampSample(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(SOURCE_SAMPLE_MAX_BITS, Math.max(SOURCE_SAMPLE_MIN_BITS, Math.round(n)));
}

function validKey(key) {
  return typeof key === "string" && key.length > 0 && key.length <= 64;
}

function safeStorage(storage) {
  if (storage) return storage;
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    // Storage can throw on ACCESS in privacy-restricted contexts, not just on
    // setItem; treat it like an absent store.
    return null;
  }
}
