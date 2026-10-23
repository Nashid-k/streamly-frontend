/* Tap-vs-hold arbitration for the player surface, lifted out of the touch
   handler so the timings and the decision table can be tested directly.

   The values are not arbitrary: a double tap must complete inside
   DOUBLE_TAP_WINDOW_MS, the lone-tap toggle waits slightly longer than that so
   it can never fire while the second tap of a deliberate double tap is still
   arriving, and a 2x hold may only engage after the double-tap window has
   closed — otherwise every deliberate double tap would briefly speed the video
   up. The tests assert those relationships, not just the numbers. */

export const DOUBLE_TAP_WINDOW_MS = 400;
export const SINGLE_TAP_DELAY_MS = 420;
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
  // During a rebuffer the EDGE zones stay dead — a seek into an empty buffer
  // only deepens the stall — but the CENTER tap still toggles play/pause.
  if (buffering && zone !== "center") return { action: "ignore", tap: prevTap };
  // Center taps toggle playback immediately — the single-tap delay only exists
  // where a double-tap means seek.
  if (zone === "center") return { action: "toggle", tap: { time: 0, zone: "center" } };
  const prevTime = prevTap?.time || 0;
  const double = now - prevTime < DOUBLE_TAP_WINDOW_MS && prevTap?.zone === zone;
  if (double) {
    return {
      action: "seek",
      direction: zone === "left" ? -1 : 1,
      tap: { time: 0, zone: null },
    };
  }
  return { action: "defer", tap: { time: now, zone } };
}
