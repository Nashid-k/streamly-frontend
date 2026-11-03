/* Tap-vs-hold arbitration for the player surface, lifted out of the touch
   handler so the timings and the decision table can be tested directly.

   MOBILE MAPPING (user decision): the surface only reacts to a DOUBLE tap —
   centre double tap pauses (and the next one resumes), left double tap rewinds,
   right double tap fast-forwards. A single tap does nothing to playback; it only
   pokes the chrome. Toggling on the first tap made the gesture unusable on a
   phone: the viewer had to wait out the double-tap window to pause, and every
   double tap fired two unwanted toggles before the seek landed.

   The values are not arbitrary: a double tap must complete inside
   DOUBLE_TAP_WINDOW_MS, and a 2x hold may only engage after that window has
   closed — otherwise every deliberate double tap would briefly speed the video
   up. The tests assert those relationships, not just the numbers. */

export const DOUBLE_TAP_WINDOW_MS = 400;
export const HOLD_2X_DELAY_MS = 420;
// Backstop for a hold whose release never arrives (see the safety-net effect).
export const HOLD_2X_MAX_MS = 60 * 1000;

/**
 * Decide what one completed tap in `zone` means.
 *
 * @returns {{ action: "ignore" | "toggle" | "seek" | "defer",
 *             direction?: -1 | 1,
 *             tap: { time: number, zone: string | null } }}
 *   `tap` is the next `touchTapRef` value; callers must store it even when the
 *   action is "ignore" (which leaves it untouched).
 */
export function resolveTap({ zone, buffering = false, now = 0, prevTap = null }) {
  if (!zone) return { action: "ignore", tap: prevTap };
  // During a rebuffer the EDGE zones stay dead — a seek into an empty buffer
  // only deepens the stall — but the CENTER double tap still pauses/resumes.
  if (buffering && zone !== "center") return { action: "ignore", tap: prevTap };
  const prevTime = prevTap?.time || 0;
  const double = now - prevTime < DOUBLE_TAP_WINDOW_MS && prevTap?.zone === zone;
  if (double) {
    // Centre pauses (and the next centre double tap resumes); the sides seek.
    if (zone === "center") return { action: "toggle", tap: { time: 0, zone: null } };
    return {
      action: "seek",
      direction: zone === "left" ? -1 : 1,
      tap: { time: 0, zone: null },
    };
  }
  // The first tap only records itself: a lone tap must not change playback.
  return { action: "defer", tap: { time: now, zone } };
}
