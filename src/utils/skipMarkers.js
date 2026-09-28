/* Skip Intro / Skip Outro (credits) windows.
   Extracted from NativePlayerView so the windows are unit-testable instead of
   being computed inline in a render body.

   ── The honest caveat, stated once here because it governs everything ───────
   Netflix knows where an intro ends and where credits start because studios
   supply that metadata. NONE of our providers do. Checked directly:
     - every resolver's payload carries only stream URLs, quality attributes
       and language rows (`source`, `variants`, `audioTracks`, `dubs`, …);
     - the ZXC per-server payload decrypts to a bare URL string, nothing more;
     - no manifest parser in the repo reads #EXT-X-CUE-OUT / #EXT-X-CUE-IN /
       #EXT-X-ASSET / SCTE-35, and the DASH→HLS transcoder emits none;
     - `server/net.js` discards upstream response headers.

   So these boundaries are ESTIMATES, not facts, and the UI must behave as
   though they might be wrong: an opt-in button, never an automatic jump except
   where the viewer explicitly asked for that. `SKIP_INTRO_OVERRIDES` is the
   seam for real boundaries — drop confirmed ones in and they win over the
   guess. */

export const SKIP_INTRO_OVERRIDES = {
  // tmdbId → seconds. An entry here beats the default estimate entirely.
  // e.g. 93405: { endSeconds: 78 }
};

export const SKIP_INTRO_DEFAULT_END = 90; // cold open + title card
export const SKIP_INTRO_MIN_EPISODE_SECONDS = 15 * 60; // never guess on a short
export const SKIP_INTRO_GRACE = 10; // linger a few seconds past the boundary

/* Credits heuristic. There is no marker, so the only defensible estimate is
   "credits live at the tail": show the pill once the head enters the last
   OUTRO_TAIL_SECONDS, and offer to jump to the end. Requires a LONGER episode
   than the intro does — a 16-minute show's last two minutes are often just
   the story, not credits, and a wrong auto-skip there is much more annoying
   than a wrong one at the start. */
export const SKIP_OUTRO_TAIL_SECONDS = 150;
export const SKIP_OUTRO_MIN_EPISODE_SECONDS = 20 * 60;
/* Land this far from the very end so `ended` fires (and Up Next appears)
   instead of the browser treating the seek as unseekable at duration. */
export const SKIP_OUTRO_END_MARGIN = 4;

const isFiniteNum = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * Where (if anywhere) the intro ends for this playback.
 * @returns {{end: number}} `end` is 0 when no estimate is offered.
 */
export function getSkipIntroEnd({ type, id, duration } = {}) {
  // TV only: a movie's cold open is a scene, not a title card, and skipping
  // 90s of it would cut actual story.
  if (type !== "tv") return 0;

  const override = SKIP_INTRO_OVERRIDES[id];
  if (override && isFiniteNum(Number(override.endSeconds)) && Number(override.endSeconds) > 0) {
    return Number(override.endSeconds);
  }
  // A known SHORT episode never gets the guess. An UNKNOWN duration does get
  // it, and that is deliberate: the estimate is only ever used for a BUTTON
  // the viewer has to tap, and an intro is exactly what plays before metadata
  // arrives — refusing there would hide the pill during the only window it is
  // useful in. The automatic path is gated separately, in
  // shouldAutoSkipIntroOnce, which is where an unrequested jump would matter.
  if (isFiniteNum(duration) && duration > 0 && duration < SKIP_INTRO_MIN_EPISODE_SECONDS) return 0;
  return SKIP_INTRO_DEFAULT_END;
}

/**
 * Whether the Skip Intro affordance should be on screen right now.
 * Only inside [0, end + grace] — the same containment the original used, so a
 * mis-estimate costs a briefly visible button and nothing else.
 */
export function shouldShowSkipIntro({ type, id, duration, currentTime, ended, autoSkip } = {}) {
  if (autoSkip) return false; // viewer asked for it to happen on its own
  if (ended) return false;
  if (!isFiniteNum(currentTime) || currentTime < 0) return false;
  const end = getSkipIntroEnd({ type, id, duration });
  if (end <= 0) return false;
  return currentTime <= end + SKIP_INTRO_GRACE;
}

/** Where the Skip Intro button seeks to: just past the boundary, never past the
    last 5 seconds of the asset. */
export function getSkipIntroTarget({ type, id, duration } = {}) {
  const end = getSkipIntroEnd({ type, id, duration });
  if (end <= 0) return 0;
  if (isFiniteNum(duration) && duration > 5) return Math.min(end, duration - 5);
  return end;
}

/** The credits tail, if this playback is long enough to plausibly have one. */
export function getSkipOutroWindow({ type, duration } = {}) {
  if (type !== "tv") return null;
  if (!isFiniteNum(duration) || duration <= 0) return null;
  if (duration < SKIP_OUTRO_MIN_EPISODE_SECONDS) return null;
  const start = Math.max(0, duration - SKIP_OUTRO_TAIL_SECONDS);
  return { start, end: Math.max(start, duration - SKIP_OUTRO_END_MARGIN) };
}

/** The Skip Credits affordance. Never automatic — a wrong tail guess should
    cost a visible button, never an unrequested jump. */
export function shouldShowSkipOutro({ type, duration, currentTime, ended } = {}) {
  if (ended) return false;
  if (!isFiniteNum(currentTime) || currentTime < 0) return false;
  const w = getSkipOutroWindow({ type, duration });
  if (!w) return false;
  return currentTime >= w.start;
}

export function getSkipOutroTarget({ type, duration } = {}) {
  const w = getSkipOutroWindow({ type, duration });
  return w ? w.end : 0;
}

/* Auto-skip is a ONE-SHOT per playback, not a rule re-evaluated every frame:
   the effect that seeks calls this, and it only says yes the first time. */
export function shouldAutoSkipIntroOnce({ type, id, duration, currentTime, firedRef } = {}) {
  if (firedRef?.current) return false;
  // Automatic is held to a stricter bar than the button: never yank a viewer on
  // an asset whose length we don't know, because a 3-minute clip would lose its
  // first 90 seconds with no one having asked for that.
  if (!isFiniteNum(duration) || duration <= 0) return false;
  const end = getSkipIntroEnd({ type, id, duration });
  if (end <= 0) return false;
  if (!isFiniteNum(currentTime) || currentTime < 0) return false;
  // Only once the head is actually inside the intro, so we never yank the
  // viewer before they have even seen it start.
  if (currentTime > end) return false;
  return true;
}
