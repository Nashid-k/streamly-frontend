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
   guess.

   ── Measured boundaries, when a manifest carries them ─────────────────────
   A manifest that states its own cue tags beats every guess here. `hlsCueTags.js`
   reads `#EXT-X-CUE-OUT` / `#EXT-X-CUE-IN` and hands the result in as
   `cueIntroEnd` / `cueCreditsStart`. Precedence is therefore:

     measured cue > dataset (SkipDB) > hand-verified override > duration guess

   Measured wins because it describes the exact asset being played; the dataset is
   real crowd data but keyed by IMDb id, so it describes the TITLE, not
   necessarily the provider's cut; an override is keyed by tmdbId and so is only
   as good as whoever entered it. A cue is also the only source allowed to offer a
   movie skip — the "TV only" rule below exists to stop a 90s GUESS from eating a
   cold open, and a measured boundary cannot do that.

   The two measured sources are fetched in parallel and RACE, so their order of
   arrival says nothing about which is more trustworthy. `mergeSkipBoundaries`
   below enforces this ranking explicitly: a slow dataset response must not
   overwrite a cue tag the provider actually embedded in the stream. */

import { getCueBoundaries } from "./hlsCueTags.js";

export { getCueBoundaries };

export const SKIP_INTRO_OVERRIDES = {
  // Movie:  tmdbId → seconds.                     e.g. 93405: { endSeconds: 78 }
  // TV:     "SxxExx" → seconds.   e.g. "S01E01": { endSeconds: 132 }
  //
  // TV MUST be keyed per episode, not per show: one show's episodes routinely
  // open with a different length cold open, and a show-level key would apply one
  // episode's boundary to all of them. Entries are also read under the show id so
  // a series-wide value can be set deliberately.
};

export const SKIP_INTRO_DEFAULT_END = 90; // cold open + title card
export const SKIP_INTRO_MIN_EPISODE_SECONDS = 15 * 60; // never guess on a short
export const SKIP_INTRO_GRACE = 10; // linger a few seconds past the boundary
/* The pill appears LEAD seconds BEFORE the boundary, not from t=0. A Skip button
   sitting on screen through the whole cold open is noise that trains viewers to
   ignore it, and on a wrong estimate it is a control aimed at the wrong moment.
   The window is now "we are approaching the end of the intro" — which is when
   skipping is actually the thing on the viewer's mind. Auto-skip is unaffected:
   it seeks on the boundary and never showed a button. */
export const SKIP_INTRO_LEAD_SECONDS = 30;

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

/* Trust ranking of the two measured sources. A cue tag is embedded in the exact
   asset being played; the dataset describes the title, keyed by IMDb id, and may
   have been contributed against a different provider's cut. Higher wins. */
const BOUNDARY_SOURCE_RANK = { cues: 2, dataset: 1 };
const SOURCE_OF = (s) => BOUNDARY_SOURCE_RANK[s] || 0;

/**
 * Combine a newly-arrived boundary set with the one already held.
 *
 * The whole reason this is a function and not a one-line setter: the cue-tag
 * reader and the SkipDB fetch start at the same moment and finish in whatever
 * order the network decides. Assigning whichever arrived last would let a slow
 * dataset response silently overwrite a cue the provider embedded in the stream
 * — a MORE accurate value replaced by a less accurate one, with nothing in the
 * logs to show it happened. Ranking by source makes arrival order irrelevant.
 *
 * @returns the boundaries to hold, with `source` stamped on them.
 */
export function mergeSkipBoundaries(prev, incoming, source) {
  if (!incoming) return prev;
  if (prev && SOURCE_OF(prev.source) > SOURCE_OF(source)) return prev;
  return { ...incoming, source };
}

/**
 * Drop manifest-scoped boundaries when the manifest itself changes.
 *
 * A cue tag is a statement about ONE provider's encode. A server switch or a dub
 * switch (NHD dubs are separate full-stream manifests) moves to a different
 * encode, so carrying the previous manifest's tags forward asserts something
 * about the new stream that was never measured. Dataset boundaries are keyed by
 * IMDb id — they describe the TITLE, not the encode — so they stay, and staying is
 * the entire reason the dataset is worth having over a hardcoded table.
 *
 * @param {object|null} prev
 * @param {string} nextScope  identity of the manifest now playing
 * @returns {object|null} boundaries still valid for that manifest
 */
export function rescopeBoundaries(prev, prevScope, nextScope) {
  if (!prev || prevScope === nextScope) return prev;
  return prev.source === "cues" ? null : prev;
}

/** "S01E02" from loose numbers — the key shape a per-episode dataset uses. */
export function episodeKey(season, episode) {
  const s = Number(season);
  const e = Number(episode);
  if (!Number.isInteger(s) || !Number.isInteger(e) || s <= 0 || e <= 0) return null;
  return `S${String(s).padStart(2, "0")}E${String(e).padStart(2, "0")}`;
}

/** Seconds from a boundary record, or 0 when it states nothing usable. */
function boundarySeconds(record) {
  if (!record) return 0;
  const n = Number(record.endSeconds ?? record.seconds ?? record.introEndSeconds);
  return isFiniteNum(n) && n > 0 ? n : 0;
}

/* Most specific first: the exact episode, then the show (a deliberate series-wide
   value), then the movie id. Falling back down the chain is what lets a dataset
   carry a few hand-verified entries over a whole show without duplicating them. */
export function lookupSkipIntro({ id, season, episode } = {}) {
  if (id == null) return 0;
  const epKey = episodeKey(season, episode);
  if (epKey) {
    const byEpisode = boundarySeconds(SKIP_INTRO_OVERRIDES[epKey]);
    if (byEpisode) return byEpisode;
  }
  return boundarySeconds(SKIP_INTRO_OVERRIDES[id]);
}

/**
 * Where (if anywhere) the intro ends for this playback.
 * @param {object} [args]
 * @param {number} [args.cueIntroEnd] Measured boundary from the manifest, if any.
 * @returns {{end: number}} `end` is 0 when no estimate is offered.
 */
export function getSkipIntroEnd({ type, id, season, episode, duration, cueIntroEnd } = {}) {
  // A manifest-stated boundary is a fact about THIS playback, so it outranks
  // every heuristic below and applies to movies too.
  if (isFiniteNum(cueIntroEnd) && cueIntroEnd > 0) return cueIntroEnd;

  // Dataset boundary, keyed per episode for TV. Checked BEFORE the type guards:
  // a hand-verified per-episode value is a fact too, and is allowed for a movie
  // the same way a measured cue is.
  const looked = lookupSkipIntro({ id, season, episode });
  if (looked > 0) return looked;

  // TV only: a movie's cold open is a scene, not a title card, and skipping
  // 90s of it would cut actual story.
  if (type !== "tv") return 0;
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
 * Only inside [end - LEAD, end + grace] — the approach to the boundary, never the
 * whole cold open. A mis-estimate therefore costs a briefly visible button in the
 * right neighbourhood and nothing else.
 */
export function shouldShowSkipIntro({
  type,
  id,
  season,
  episode,
  duration,
  currentTime,
  ended,
  autoSkip,
  cueIntroEnd,
} = {}) {
  if (autoSkip) return false; // viewer asked for it to happen on its own
  if (ended) return false;
  if (!isFiniteNum(currentTime) || currentTime < 0) return false;
  const end = getSkipIntroEnd({ type, id, season, episode, duration, cueIntroEnd });
  if (end <= 0) return false;
  const opens = Math.max(0, end - SKIP_INTRO_LEAD_SECONDS);
  return currentTime >= opens && currentTime <= end + SKIP_INTRO_GRACE;
}

/** Where the Skip Intro button seeks to: just past the boundary, never past the
    last 5 seconds of the asset. */
export function getSkipIntroTarget({ type, id, season, episode, duration, cueIntroEnd } = {}) {
  const end = getSkipIntroEnd({ type, id, season, episode, duration, cueIntroEnd });
  if (end <= 0) return 0;
  if (isFiniteNum(duration) && duration > 5) return Math.min(end, duration - 5);
  return end;
}

/** The credits tail, if this playback is long enough to plausibly have one. */
export function getSkipOutroWindow({ type, duration, cueCreditsStart } = {}) {
  // A manifest-stated credits start outranks both the TV-only rule and the length
  // floor: we are no longer guessing, so neither guard has a reason to apply.
  if (isFiniteNum(cueCreditsStart) && cueCreditsStart >= 0) {
    if (!isFiniteNum(duration) || duration <= 0) return null;
    return {
      start: Math.min(cueCreditsStart, Math.max(0, duration - SKIP_OUTRO_END_MARGIN)),
      end: Math.max(0, duration - SKIP_OUTRO_END_MARGIN),
    };
  }
  if (type !== "tv") return null;
  if (!isFiniteNum(duration) || duration <= 0) return null;
  if (duration < SKIP_OUTRO_MIN_EPISODE_SECONDS) return null;
  const start = Math.max(0, duration - SKIP_OUTRO_TAIL_SECONDS);
  return { start, end: Math.max(start, duration - SKIP_OUTRO_END_MARGIN) };
}

/** The Skip Credits affordance. Never automatic — a wrong tail guess should
    cost a visible button, never an unrequested jump. */
export function shouldShowSkipOutro({ type, duration, currentTime, ended, cueCreditsStart } = {}) {
  if (ended) return false;
  if (!isFiniteNum(currentTime) || currentTime < 0) return false;
  const w = getSkipOutroWindow({ type, duration, cueCreditsStart });
  if (!w) return false;
  return currentTime >= w.start;
}

export function getSkipOutroTarget({ type, duration, cueCreditsStart } = {}) {
  const w = getSkipOutroWindow({ type, duration, cueCreditsStart });
  return w ? w.end : 0;
}

/* Auto-skip is a ONE-SHOT per playback, not a rule re-evaluated every frame:
   the effect that seeks calls this, and it only says yes the first time. */
export function shouldAutoSkipIntroOnce({
  type,
  id,
  season,
  episode,
  duration,
  currentTime,
  firedRef,
  cueIntroEnd,
} = {}) {
  if (firedRef?.current) return false;
  // Automatic is held to a stricter bar than the button: never yank a viewer on
  // an asset whose length we don't know, because a 3-minute clip would lose its
  // first 90 seconds with no one having asked for that.
  if (!isFiniteNum(duration) || duration <= 0) return false;
  const end = getSkipIntroEnd({ type, id, season, episode, duration, cueIntroEnd });
  if (end <= 0) return false;
  if (!isFiniteNum(currentTime) || currentTime < 0) return false;
  // Only once the head is actually inside the intro, so we never yank the
  // viewer before they have even seen it start.
  if (currentTime > end) return false;
  return true;
}
