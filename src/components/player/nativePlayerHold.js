/* Hold-to-2x and tap-vs-hold release arbitration, lifted out of the player
   handlers so the branches that caused real bugs can be tested without a media
   element. Three of them did:

   - A right-third press arms 2x after HOLD_2X_DELAY_MS, and that arm is still
     PENDING for the whole of a normal tap. A release that treated "armed" as
     "holding" swallowed every right-third tap, so double-tap forward and the
     lone-tap toggle both died. Only an arm that actually engaged 2x is a hold.
   - The rate to restore was read off the element, but a browser that paused
     playback in the background reports 1 while the viewer's setting is still
     something else. The latch must fall back to the setting rate.
   - Space defers the tap to keyup so a hold can cancel it; the keyup therefore
     has to know which of the two happened, not just that Space came up.

   The caller owns the refs and timers. These functions only answer the
   question, so the same inputs always produce the same release plan. */

import { HOLD_SPEED } from "../../constants/playerUi";
import { resolveTap } from "./nativePlayerGestures";

/**
 * The rate to restore when a 2x hold ends.
 *
 * The element's own rate is the truth — unless it is absent, zero, or still
 * sitting at the hold speed, in which case the viewer's SETTING rate is. Never
 * return a non-positive rate: `<video>` rejects one and the listener that
 * reads the result treats a throw as "already reset", leaving 2x latched.
 *
 * @param {object} input
 * @param {number} [input.elementRate] `video.playbackRate` at release time.
 * @param {number} [input.settingRate] the viewer's chosen rate, mirrored in a ref.
 * @param {number} [input.holdSpeed] the rate a hold applies.
 * @returns {number} a positive playback rate.
 */
export function holdRestoreRate({ elementRate, settingRate, holdSpeed = HOLD_SPEED } = {}) {
  const element = Number(elementRate);
  if (Number.isFinite(element) && element > 0 && element !== holdSpeed) return element;
  const setting = Number(settingRate);
  return Number.isFinite(setting) && setting > 0 ? setting : 1;
}

/**
 * What a Space keyup means.
 *
 * @param {object} input
 * @param {boolean} [input.held] Space is still down as far as the player knows.
 * @param {boolean} [input.engaged] the keydown's hold timer already reached 2x.
 * @returns {"ignore" | "release-hold" | "toggle"}
 *   `ignore` for a keyup the player did not own (for example after a panel
 *   opened and the key was released elsewhere).
 */
export function resolveSpaceRelease({ held = false, engaged = false } = {}) {
  if (!held) return "ignore";
  return engaged ? "release-hold" : "toggle";
}

/**
 * What one completed touch means, after the hold arm and the volume drag have
 * had their say.
 *
 * @param {object} input
 * @param {boolean} [input.holdLive] 2x actually engaged (`hold2xRef`), not merely armed.
 * @param {boolean} [input.gestureActive] a vertical volume drag moved.
 * @param {"left"|"center"|"right"|null} [input.zone] tap zone, or null when the
 *   surface had no measurable width / no changed touch.
 * @param {boolean} [input.buffering]
 * @param {number} [input.now] `performance.now()` at release.
 * @param {{ time: number, zone: string | null } | null} [input.prevTap]
 * @returns {{ action: "ignore" | "end-hold" | "toggle" | "seek" | "defer",
 *             direction: -1 | 0 | 1,
 *             dropArm: boolean,
 *             clearGesture: boolean,
 *             clearPendingTap: boolean,
 *             tap: { time: number, zone: string | null } | null }}
 *   `dropArm` clears the pending hold timer + pointer without ending a live
 *   hold; `tap` is the next `touchTapRef` value (null means leave it alone).
 */
export function resolveTouchRelease({
  holdLive = false,
  gestureActive = false,
  zone = null,
  buffering = false,
  now = 0,
  prevTap = null,
} = {}) {
  // A hold that reached 2x is not a tap: end it and swallow the release.
  if (holdLive) {
    return { action: "end-hold", direction: 0, dropArm: false, clearGesture: false, clearPendingTap: false, tap: null };
  }
  // A pending arm is only "a tap that has not yet become a hold", so it always
  // drops — but the tap itself survives. A volume drag is not a tap at all.
  if (gestureActive) {
    return { action: "ignore", direction: 0, dropArm: true, clearGesture: true, clearPendingTap: false, tap: null };
  }
  if (!zone) {
    return { action: "ignore", direction: 0, dropArm: true, clearGesture: false, clearPendingTap: false, tap: null };
  }
  const tap = resolveTap({ zone, buffering, now, prevTap });
  const base = { dropArm: true, clearGesture: false, tap: tap.tap };
  if (tap.action === "ignore") {
    return { action: "ignore", direction: 0, clearPendingTap: false, ...base };
  }
  if (tap.action === "toggle") {
    return { action: "toggle", direction: 0, clearPendingTap: true, ...base };
  }
  if (tap.action === "seek") {
    return { action: "seek", direction: tap.direction ?? (zone === "left" ? -1 : 1), clearPendingTap: true, ...base };
  }
  // A lone edge tap waits in case it becomes a double tap.
  return { action: "defer", direction: 0, clearPendingTap: true, ...base };
}
