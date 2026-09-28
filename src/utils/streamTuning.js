/* Stream start tuning — how the player SEEDS adaptive bitrate.
   Pure helpers, no browser access at the call site, so they are testable.

   ── Why this exists ────────────────────────────────────────────────────────
   hls.js starts its bandwidth estimate at 1Mbps and climbs one round-trip at a
   time, so Auto visibly stalls once per rung. Seeding it fixed at 10Mbps avoids
   that but is a blind guess: on a 4K TV at 80Mbps it starts too low and climbs
   anyway, and on a phone on a crowded café wifi it starts far too HIGH — which
   is worse, because the first rung chosen is the one that must survive, and an
   over-optimistic start shows a rebuffer before the estimate corrects itself.

   The browser already knows the shape of the connection before a single byte
   flows, via Network Information API (`navigator.connection`). We only use it
   as a PRIOR, never as a promise: hls.js's own measurement still overrides it
   after the first segments, and the existing underflow step-down is unchanged.
   Everything here degrades to the previous fixed seed when the API is absent
   (Safari, Firefox, most desktop Chrome expose no `connection`). */

/** Previous behaviour, kept as the fallback so nothing regresses. */
export const DEFAULT_INITIAL_BW_BITS = 10 * 1000 * 1000;

/** Conservative multipliers over `downlink` (Mbps → bits). Deliberately not
    1.0: `downlink` is a rounded, often optimistic figure, and over-seeding
    costs a rebuffer while under-seeding only costs one smooth rung climb. */
const DOWNLINK_TRUST = 0.75;

/** Hard bounds. Below the floor, 4K/1080p can never start; above the ceiling
    there is no rung left to climb to, so extra headroom is pure optimism. */
export const MIN_SEED_BITS = 2 * 1000 * 1000;
export const MAX_SEED_BITS = 40 * 1000 * 1000;

/* Effective connection classes, per the Network Information API, mapped to a
   CEILING. Only the slow classes are listed, and that omission is deliberate:
   they exist to stop a generous `downlink` talking a bad pipe UP. "4g" is
   absent on purpose — capping it at the old 10Mbps default would make this whole
   function a no-op on the fast connections it exists to help (fibre-backed 4g
   and Wi-Fi routinely report `downlink` far above 10). A 4g link with no usable
   `downlink` simply falls back to the previous fixed seed. */
const EFFECTIVE_TYPE_CEILING_BITS = {
  "slow-2g": 1.5 * 1000 * 1000,
  "2g": 2 * 1000 * 1000,
  "3g": 4 * 1000 * 1000,
};

/**
 * Seed for hls.js's bandwidth estimate.
 *
 * @param {object} [connection] - a `navigator.connection` (or equivalent).
 *   Passed in rather than read here so this stays pure and testable.
 * @param {number} [fallbackBits] - used when the API says nothing useful.
 * @returns {number} bits per second, always within [MIN, MAX].
 */
export function pickInitialBandwidthBits(connection, fallbackBits = DEFAULT_INITIAL_BW_BITS) {
  const fallback = clamp(fallbackBits);

  // No API, or it reported nothing → previous behaviour, unchanged.
  if (!connection || typeof connection !== "object") return fallback;

  // Data Saver: the viewer has explicitly asked to use less data. Cap hard
  // rather than guess — honouring the preference is the whole point.
  if (connection.saveData === true) return MIN_SEED_BITS;

  let bits = 0;

  const ceiling = EFFECTIVE_TYPE_CEILING_BITS[String(connection.effectiveType || "")];
  if (ceiling) bits = ceiling;

  // `downlink` is finer-grained than effectiveType, so it wins when present
  // and valid; effectiveType then only acts as a ceiling.
  const downlink = Number(connection.downlink);
  if (Number.isFinite(downlink) && downlink > 0) {
    bits = Math.max(bits, Math.round(downlink * 1e6 * DOWNLINK_TRUST));
  }

  if (!bits) return fallback;
  // effectiveType (e.g. '2g') must not be talked UP by a generous downlink.
  if (ceiling) bits = Math.min(bits, ceiling);
  return clamp(bits);
}

function clamp(bits) {
  if (!Number.isFinite(bits) || bits <= 0) return DEFAULT_INITIAL_BW_BITS;
  return Math.min(MAX_SEED_BITS, Math.max(MIN_SEED_BITS, Math.round(bits)));
}
