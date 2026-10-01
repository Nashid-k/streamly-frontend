/**
 * PLAYER V2 rollout flag.
 *
 * ── Polarity, which is the whole point of this file ──────────────────────────
 * The NEW player is the DEFAULT. This flag does not "enable" the new player —
 * enabling the default would mean the safety net is off in production, where it
 * is needed most. Instead it can only force the OLD player back:
 *
 *   VITE_PLAYER_LEGACY=1        (build-time, needs a redeploy)
 *   localStorage["streamly-player-legacy"] = "1"   (runtime, instant)
 *
 * Both are opt-OUT of v2. With neither set, v2 runs. That way a regression is
 * survivable with a localStorage write and no deploy, and "the flag is on" can
 * never be mistaken for "the new player is live".
 *
 * ── Deletion condition ──────────────────────────────────────────────────────
 * This file and both switches go away in PLAYER V2 Phase 6, gated on the 6.8
 * parity checklist. Do not let it become permanent dual-path code: a flag with
 * no expiry is a fork nobody maintains. If Phase 6 lands and this is still here,
 * that is the bug.
 *
 * ── Why localStorage AND an env var ──────────────────────────────────────────
 * The env var covers a permanent decision ("we are going back to the old player")
 * and shows up in the deployment config where it is visible to a reviewer. The
 * localStorage write covers the emergency ("something is broken right now and we
 * cannot wait for a deploy"). localStorage wins when both are set, because the
 * person who just typed it is the one reacting to the current incident.
 */

import { logWarn } from "../utils/debugLogger";

export const PLAYER_FLAG_SCOPE = "PlayerFlag";

export const LEGACY_STORAGE_KEY = "streamly-player-legacy";

/** The build-time switch. Named for what it DOES (go legacy), not for the feature. */
export const LEGACY_ENV_VAR = "VITE_PLAYER_LEGACY";

/**
 * Truthy spellings accepted from BOTH the env var and localStorage. Hand-rolled
 * because `Boolean("0")` and `Boolean("false")` are both `true`, so the naive
 * check would put every viewer on the old player the moment anyone typed "false"
 * into a Vercel env field — the exact opposite of the intended safety net.
 */
const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off", ""]);

/**
 * Pure parse of one raw flag value.
 *
 * @param {unknown} raw
 * @returns {boolean|null} true/false when it is a recognised spelling, or null
 *   when it is not — null means "this source says nothing", which is NOT the
 *   same as false. Collapsing the two is how a typo ends up silently meaning
 *   "off", so the caller can keep looking at the other source.
 */
export function parseLegacyFlag(raw) {
  if (raw == null) return null;
  const value = String(raw).trim().toLowerCase();
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  return null;
}

/**
 * Read the runtime override.
 *
 * @param {Storage|null} [storage] injected for tests; defaults to localStorage.
 * @returns {boolean|null}
 */
export function readLegacyOverride(storage) {
  let store = storage;
  if (store === undefined) {
    try {
      store = typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      // Private-mode / disabled storage. Not an error worth failing playback
      // over — the env var still applies.
      logWarn(PLAYER_FLAG_SCOPE, "localStorage unavailable; using env flag only");
      return null;
    }
  }
  if (!store) return null;
  try {
    return parseLegacyFlag(store.getItem(LEGACY_STORAGE_KEY));
  } catch (error) {
    logWarn(PLAYER_FLAG_SCOPE, "legacy override read failed; using env flag only", error);
    return null;
  }
}

/**
 * The decision itself, as a pure function of its two inputs.
 *
 * @param {string|undefined} envValue raw `VITE_PLAYER_LEGACY`
 * @param {Storage|null} [storage]
 * @returns {{ useLegacy: boolean, reason: string }}
 */
export function resolvePlayerVariant(envValue, storage) {
  const override = readLegacyOverride(storage);
  if (override !== null) {
    return {
      useLegacy: override,
      reason: `localStorage:${LEGACY_STORAGE_KEY}=${override}`,
    };
  }
  const env = parseLegacyFlag(envValue);
  if (env !== null) {
    return { useLegacy: env, reason: `${LEGACY_ENV_VAR}=${env}` };
  }
  return { useLegacy: false, reason: "default (v2)" };
}

/** Convenience for non-React callers and tests. */
export function shouldUseLegacyPlayer(envValue, storage) {
  return resolvePlayerVariant(envValue, storage).useLegacy;
}
