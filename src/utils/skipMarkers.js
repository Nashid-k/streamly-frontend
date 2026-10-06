/* Skip Intro / Skip Outro (credits) windows.
   Extracted from NativePlayerView so the windows are unit-testable instead of
   being computed inline in a render body.

    ── The honest caveat, stated once here because it governs everything ───────
    Netflix knows where an intro ends and where credits start because studios
    supply that metadata. Of our providers, only ZXC does: its
    `/backend/intro` endpoint publishes measured per-encode intro/outro
    windows (fetched as the "provider" source below). Everything else here —
    dataset, overrides, guesses — exists for what that endpoint does not
    cover, and the UI must still behave as though a boundary might be wrong:
    an opt-in button, never an automatic jump except where the viewer
    explicitly asked for that. `SKIP_INTRO_OVERRIDES` is the seam for real
    boundaries — drop confirmed ones in and they win over the guess.

    ── Measured boundaries, when a manifest carries them ─────────────────────
    A manifest that states its own cue tags beats every guess here. `hlsCueTags.js`
    reads `#EXT-X-CUE-OUT` / `#EXT-X-CUE-IN` and hands the result in as
    `cueIntroEnd` / `cueCreditsStart`. Precedence is therefore:

      measured cue > provider (ZXC) > dataset (SkipDB) > hand-verified override > duration guess

    Measured wins because it describes the exact asset being played; the
    provider record describes the provider's own encode (identical bytes on
    every server row); the dataset is real crowd data but keyed by IMDb id, so
    it describes the TITLE, not necessarily the provider's cut; an override is
    keyed by tmdbId and so is only as good as whoever entered it. A cue is
    also the only source allowed to offer a movie skip — the "TV only" rule
    below exists to stop a 90s GUESS from eating a cold open, and a measured
    boundary cannot do that.

    The measured sources are fetched in parallel and RACE, so their order of
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

/* A boundary of exactly 0 is not a boundary.
   Every source speaks 0 (or omits the field entirely) to mean "no idea", but 0 is
   also a real number that a `> 0` guard elsewhere will happily accept as fact.
   Left unchecked it means "the credits begin at the first second of the asset",
   which paints the whole progress bar orange and holds the Skip Credits button on
   screen from t=0 to the end. A boundary before the first second is meaningless,
   so 0 and negatives are always read as unknown, never as a position.
   A boundary at or past the asset's own duration is refused for a different
   reason: these records are measured against ONE encode, and playing a different
   cut (a shorter edit, or a runtime that has not settled yet) would otherwise
   place the marker off the end of the timeline. */
function usableMarker(value, duration) {
  if (!isFiniteNum(value) || value <= 0) return null;
  if (isFiniteNum(duration) && duration > 0 && value >= duration) return null;
  return value;
}

/**
 * Make one boundary set safe to act on and to draw.
 *
 * Everything upstream of here is a network response or a manifest tag, i.e. input
 * we did not write and cannot trust to be well-formed. Both skip sources have
 * shipped values that were individually valid numbers and collectively nonsense:
 * a credits start of 0 ("unknown"), a start past the end of a shorter cut, and an
 * inverted intro range whose negative width silently drew nothing. None of those
 * throw, so they reached the scrubber and became an orange bar rather than an
 * error. This is the single gate every measured boundary passes through, and it
 * is deliberately pure so the rules are unit-testable without a player.
 *
 * @param {object|null} raw   a merged boundary set, or null
 * @param {number} [duration] the real duration of what is playing, if known
 * @returns {object|null} a set with only drawable/usable markers, or null if none
 */
export function normalizeSkipBoundaries(raw, duration) {
  if (!raw) return null;
  const out = { source: raw.source };

  const introEnd = usableMarker(raw.introEndSeconds, duration);
  if (introEnd != null) {
    out.introEndSeconds = introEnd;
    const introStart = usableMarker(raw.introStartSeconds, duration);
    /* An inverted range (`introStart >= introEnd`) would render a NEGATIVE width,
       so the start is the half that gets dropped. The end keeps winning because
       it is the value every window and seek is actually derived from. */
    if (introStart != null && introStart < introEnd) out.introStartSeconds = introStart;
  }

  const creditsStart = usableMarker(raw.creditsStartSeconds, duration);
  if (creditsStart != null) {
    out.creditsStartSeconds = creditsStart;
    /* The FINISH is clamped rather than range-checked, because "a bit too large"
       is the only wrong shape worth keeping: it still tells us the credits are
       running, and clamping to the asset draws the correct band. An end at or
       before the start is the inverted case, and is dropped. A missing end stays
       missing, which the scrubber reads as "runs to the end of the asset". */
    const finish = Number(raw.creditsEndSeconds);
    if (Number.isFinite(finish) && finish > creditsStart) {
      const limit = isFiniteNum(duration) && duration > 0 ? duration : finish;
      out.creditsEndSeconds = Math.min(finish, limit);
    }
  }

  if (isFiniteNum(Number(raw.confidence))) out.confidence = Number(raw.confidence);
  // Nothing survived, so there is no measured data to report. null lets the caller
  // fall back to the estimates instead of painting a set of zeros.
  if (out.introEndSeconds == null && out.creditsStartSeconds == null) return null;
  return out;
}

/* Trust ranking of the measured sources. A cue tag is embedded in the exact
   asset being played; the provider record is measured against the provider's
   own encode (the same bytes we play on every server row); the dataset
   describes the title, keyed by IMDb id, and may have been contributed
   against a different provider's cut. Higher wins. */
const BOUNDARY_SOURCE_RANK = { cues: 3, provider: 2, dataset: 1 };
const SOURCE_OF = (s) => BOUNDARY_SOURCE_RANK[s] || 0;

/** The measured fields, in the order they are worth keeping. */
const BOUNDARY_FIELDS = [
  "introStartSeconds",
  "introEndSeconds",
  "creditsStartSeconds",
  "creditsEndSeconds",
];

/* Which fields use 0 as their "I don't know" sentinel. An intro/credits END and
   an intro START can legitimately be 0, but `introEndSeconds: 0` and
   `creditsStartSeconds: 0` are how every source says "no such marker" — and a
   merge that mistakes either for a measurement is the bug that turned a whole
   episode's scrubber orange. Must stay in step with usableMarker above. */
const ZERO_IS_UNKNOWN = new Set(["introEndSeconds", "creditsStartSeconds"]);

/** Did this side actually measure the field, as opposed to restating a sentinel? */
const statesField = (field, value) =>
  isFiniteNum(value) && (!ZERO_IS_UNKNOWN.has(field) || value > 0);

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
 * Ranking decides which side wins a field both sides measured; it does NOT let a
 * side erase a field it never had. The two sources are asymmetric — the provider
 * record can arrive with credits only, while SkipDB answers with intro *and*
 * credits — so a whole-object swap at the provider's higher rank used to throw
 * away a real measured intro and silently demote it to the 90s guess. The loser's
 * value is therefore kept for any field the winner does not state, which makes
 * the merge field-wise and still order-independent.
 *
 * @returns the boundaries to hold, with `source` stamped as the winning side.
 */
export function mergeSkipBoundaries(prev, incoming, source) {
  if (!incoming) return prev;
  if (!prev) return { ...incoming, source };
  const incomingWins = SOURCE_OF(source) > SOURCE_OF(prev.source);
  const winner = incomingWins ? incoming : prev;
  const loser = incomingWins ? prev : incoming;
  const merged = { source: incomingWins ? source : prev.source };
  for (const field of BOUNDARY_FIELDS) {
    merged[field] = statesField(field, winner[field]) ? winner[field] : loser[field];
  }
  if (isFiniteNum(Number(winner.confidence))) merged.confidence = Number(winner.confidence);
  else if (isFiniteNum(Number(loser.confidence))) merged.confidence = Number(loser.confidence);
  return merged;
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
  // every heuristic below and applies to movies too. A boundary at or past the
  // asset's duration does not, though — that is a record measured against a
  // different cut, and trusting it would aim the Skip Intro pill at the credits.
  if (isFiniteNum(cueIntroEnd) && cueIntroEnd > 0) {
    if (!(isFiniteNum(duration) && duration > 0 && cueIntroEnd >= duration)) return cueIntroEnd;
  }

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
  /* A manifest/provider/dataset-stated credits start outranks both the TV-only
     rule and the length floor: we are no longer guessing, so neither guard has a
     reason to apply. It must be strictly positive though — 0 is every source's
     way of saying "no outro", and treating it as a position starts the credits
     window at the first second of the asset, which pins the Skip Credits button
     on screen for the whole episode. */
  if (isFiniteNum(cueCreditsStart) && cueCreditsStart > 0) {
    if (!isFiniteNum(duration) || duration <= 0) return null;
    /* Clamped into the asset: a record measured against a longer cut of the same
       title names a credits start past where this playback ends, and an
       unclamped window would cover the final seconds of every episode. */
    const lastUseful = Math.max(0, duration - SKIP_OUTRO_END_MARGIN);
    const start = Math.min(cueCreditsStart, lastUseful);
    return { start, end: Math.max(start, lastUseful) };
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

/**
 * The two measured bands drawn on the scrubber, as percentages of the track.
 *
 * Lives here, not in the render body, for the same reason every other rule in
 * this file does: this is where the bug was. The bands used to be computed inline
 * in JSX, where `right: 0` silently meant "orange from the credits all the way to
 * the end of the bar" for every record with no credits finish time — and, once a
 * source reported 0 for "no credits", for the whole episode. Geometry derived
 * from someone else's numbers belongs next to the numbers, under tests.
 *
 * Two invariants hold for every return value, and both exist because the failure
 * they prevent is the loudest one this feature has:
 *   1. no band is emitted unless it can be placed strictly INSIDE the track, so
 *      no combination of source data can produce a full-width orange bar;
 *   2. a credits start of 0 is never a position, so it can never start a band at
 *      the first second of the asset.
 *
 * @param {object|null} bounds   already-normalized boundaries (see above)
 * @param {number} duration      the real duration of what is playing
 * @returns {{intro: object|null, credits: object|null}|null}
 */
export function getScrubberBands(bounds, duration) {
  const span = Number(duration);
  if (!(span > 0) || !bounds?.source) return null;
  const pctOf = (seconds) => (seconds / span) * 100;

  let intro = null;
  const introEnd = bounds.introEndSeconds;
  if (isFiniteNum(introEnd) && introEnd > 0 && introEnd < span) {
    /* A measured END with no measured START still earns a band: the intro runs up
       to the point the provider measured, so the leading edge is placed one
       default-length back. SKIP_INTRO_DEFAULT_END is used rather than a second
       literal 90 so the drawn width and the guessed window cannot drift apart. */
    const start =
      isFiniteNum(bounds.introStartSeconds) && bounds.introStartSeconds > 0
        ? bounds.introStartSeconds
        : Math.max(0, introEnd - SKIP_INTRO_DEFAULT_END);
    if (start > 0 && start < introEnd) intro = { left: `${pctOf(start)}%`, width: `${pctOf(introEnd - start)}%` };
  }

  let credits = null;
  const creditsStart = bounds.creditsStartSeconds;
  if (isFiniteNum(creditsStart) && creditsStart > 0 && creditsStart < span) {
    /* No finish time means the credits run to the end of the asset, which is what
       credits do — so the band is bounded by the track itself rather than left to
       run off it. This is the ONE place a right edge of 0% is correct, and it is
       only reachable from a credits start already known to be positive and
       shorter than this playback. */
    const finish =
      isFiniteNum(bounds.creditsEndSeconds) && bounds.creditsEndSeconds > creditsStart
        ? Math.min(bounds.creditsEndSeconds, span)
        : span;
    credits = { left: `${pctOf(creditsStart)}%`, right: `${Math.max(0, 100 - pctOf(finish))}%` };
  }

  if (!intro && !credits) return null;
  return { intro, credits };
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
