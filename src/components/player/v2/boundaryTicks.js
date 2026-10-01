/**
 * Chapter and credits ticks for the scrubber (task.md 3.16).
 *
 * ── The item ──────────────────────────────────────────────────────────────────
 * "Chapter + credits ticks from `cueBoundaries` — data that already exists at
 * `:3451-3453` and currently drives nothing but the skip button."
 *
 * Read honestly, that is a smaller claim than it looks. `cueBoundaries` is not
 * chapters: it is exactly two numbers, `introEndSeconds` and `creditsStartSeconds`,
 * and both may be absent. So there are at most two ticks, they are named, and there
 * is no chapter LIST to render. Inventing a chapter strip here would be building a
 * feature nobody asked for out of data that cannot support it.
 *
 * ── The rule this file exists to enforce ──────────────────────────────────────
 * The skip window has two sources and they are NOT interchangeable:
 *
 *   MEASURED   `introEndSeconds` / `creditsStartSeconds` from the manifest's own
 *              cue tags, or from the SkipDB dataset keyed by IMDb id. Real
 *              boundaries for this title.
 *   ESTIMATED  `SKIP_INTRO_DEFAULT_END = 90` and the tail heuristic in
 *              `skipMarkers.js`. A guess, used when nothing measured arrives.
 *
 * The legacy renders the SAME skip pill either way and the viewer cannot tell which
 * they are looking at — which is defensible for a button that only appears if the
 * viewer chooses to press it. It is not defensible for a MARK on a timeline. A tick
 * drawn at 90 seconds is a claim: "the intro ends here." Drawn from the heuristic
 * that is a false claim about a specific film, painted in the same ink as a measured
 * one, and it would sit on the bar permanently — the viewer cannot dismiss it and
 * will learn to trust it. So:
 *
 *   NO TICK IS EVER DRAWN FROM THE ESTIMATE.
 *
 * That is the whole reason this is a separate module rather than three lines in
 * `Scrubber`: the rule has to be visible, and a rule that lives in a component's
 * render body is a rule that gets refactored away by whoever next touches it.
 */

/** The kinds of tick a boundary can produce, in timeline order. */
export const TICK_KIND = Object.freeze({ INTRO: "intro", CREDITS: "credits" });

/** Seconds from a boundary record, or null when it states nothing usable.
 *
 *  `> 0` and not `>= 0`: a boundary at exactly 0 states nothing, because the bar
 *  already starts there. A tick at 0 is invisible AND implies an intro that ends at
 *  the instant playback begins. */
function boundarySeconds(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * The ticks to draw, as 0-1 fractions of this control's own duration.
 *
 * Returns objects rather than bare fractions because the scrubber needs each tick's
 * identity (for a stable React key) and its kind (for a title attribute and, later,
 * for labelling). A bare number array would make "which tick is this" a question
 * answered by index, which breaks the moment two ticks land at the same second.
 *
 * @param {object|null} boundaries  `{ introEndSeconds, creditsStartSeconds, source }`
 * @param {number} duration         this control's duration, in seconds
 * @returns {Array<{id: string, kind: string, at: number, seconds: number}>}
 */
export function boundaryTicks(boundaries, duration) {
  const total = Number(duration);
  /* No duration means no fractions, and a tick at `NaN` is a tick at the wrong
   * place rather than no tick at all. */
  if (!Number.isFinite(total) || total <= 0) return [];
  /* THE RULE. Refused here rather than left to the caller, because a caller who
   * forgets it draws a false claim about a specific film onto a permanent
   * timeline, and nothing about the result looks wrong. An earlier draft of this
   * function checked nothing and a test caught it drawing a tick at exactly the
   * 90s heuristic — which is the failure this whole module was written to make
   * impossible. */
  if (!boundariesAreMeasured(boundaries)) return [];

  const ticks = [];

  const intro = boundarySeconds(boundaries.introEndSeconds);
  if (intro !== null) {
    ticks.push({
      id: `intro-${intro}`,
      kind: TICK_KIND.INTRO,
      seconds: intro,
      at: Math.min(1, intro / total),
    });
  }

  const credits = boundarySeconds(boundaries.creditsStartSeconds);
  if (credits !== null) {
    ticks.push({
      id: `credits-${credits}`,
      kind: TICK_KIND.CREDITS,
      seconds: credits,
      at: Math.min(1, credits / total),
    });
  }

  /* Timeline order, so the DOM order matches what the eye reads. Two ticks at the
   * same second keep a stable order by kind rather than by sort instability. */
  return ticks.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

/**
 * Whether these boundaries are MEASURED, as opposed to the player's estimate.
 *
 * Exists so the caller can render the ticks with the confidence they actually have
 * rather than the confidence it wishes it had — and so a future tick that must only
 * appear for measured data has one function to ask.
 *
 * `source` is stamped by `mergeSkipBoundaries` in `skipMarkers.js`, which ranks the
 * two measured sources against each other and never lets the dataset overwrite a
 * provider's own cue tag.
 */
export function boundariesAreMeasured(boundaries) {
  return boundaries?.source === "cues" || boundaries?.source === "dataset";
}