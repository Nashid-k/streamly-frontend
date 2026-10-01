/**
 * Timecode formatting for the transport (task.md 3.7).
 *
 * Pure, and deliberately not a component: the format is asserted by handing it
 * numbers, which is the only way to pin down the edges. Those edges are where a
 * player shows its viewer something untrue:
 *
 *   - `NaN` before metadata arrives. Rendered as `NaN:NaN` it reads as a bug in
 *     the player rather than "we do not know yet".
 *   - `Infinity` for a live stream, and negative values for a bad seek. Both
 *     must clamp to zero rather than wrap or print a minus sign in the middle of
 *     the chrome.
 *   - An hour boundary. `61:00` is wrong the moment a title runs past an hour,
 *     and the mistake is invisible on every short title you test with.
 *
 * The output is what `.pv2-timecode` styles: monospaced with tabular figures, so
 * the clock does not change width four times a second (task.md 3.1, 3.32).
 */

/**
 * Seconds -> `m:ss`, or `h:mm:ss` from one hour.
 *
 * Flooring rather than rounding is deliberate: a timecode that rounds UP shows
 * 4:00 at 3:59.8, so the number disagrees with the video for the last fifth of a
 * second and a scrubber can appear to refuse to advance.
 */
export function formatTimecode(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "0:00";

  const whole = Math.floor(total);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;

  const pad = (n) => String(n).padStart(2, "0");

  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`;
}

/**
 * The same number as a 0-1 fraction of the duration, for the scrubber fill.
 *
 * Returns 0 — never NaN, never a negative width — while the duration is unknown.
 * A scrubber whose fill is `NaN%` collapses to nothing, which looks identical to
 * a player stuck at zero, and `duration` is unknown for exactly as long as the
 * video takes to load.
 */
export function progressFraction(currentTime, duration) {
  const now = Number(currentTime);
  const total = Number(duration);
  if (!Number.isFinite(now) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, now / total));
}

/**
 * How far past the playhead the video can play WITHOUT stalling, as a 0-1
 * fraction (task.md 3.14).
 *
 * ── Why this returns a NUMBER and not a list of ranges ────────────────────────
 * `video.buffered` is a `TimeRanges` — a list of `[start, end]` pairs, which after
 * a seek can be several disjoint spans. The legacy copied that whole list into
 * React state on every `timeupdate` and rendered one div per range:
 *
 *     const ranges = [];
 *     for (let i = 0; i < b.length; i += 1) ranges.push([b.start(i), b.end(i)]);
 *     setBufferedRanges(ranges);
 *
 * So it allocated a fresh array four times a second to draw what is, to a viewer,
 * one continuous band. The allocation is the item's complaint; the deeper one is
 * that a LIST invites a `.map` into the DOM, and a list of disjoint bars behind a
 * fill is a different visual from the single band the item asks for.
 *
 * One number, one element, one truth: "how far can I go from here without the
 * picture freezing."
 *
 * ── Which range answers that ─────────────────────────────────────────────────
 * The range CONTAINING the playhead, because that is the one whose end is a
 * promise about what happens next. Taking the largest end instead would be a lie
 * in exactly the case that matters: seek into the middle of a title with
 * `[0, 10]` and `[50, 100]` cached, and "the furthest buffer" reports 100% while
 * the bar is 50% full and the next ten seconds will stall.
 *
 * The fallbacks are ordered by how honest they are:
 *   1. the containing range's end,
 *   2. the START of the next buffered range, if the playhead sits in a gap — the
 *      viewer can seek there, so that is the honest extent, and reporting 0 would
 *      claim they cannot even see the frame they are on,
 *   3. 0 — past every cached range, or nothing cached. Explicitly NOT the furthest
 *      end: a cache of `[0, 40]` with the playhead at 100 has nothing ahead of it,
 *      and a band reaching 40% there would promise forward playback that stalls on
 *      the next frame.
 *
 * `timeRanges` is duck-typed rather than `instanceof`-checked: jsdom's `buffered`
 * is a bare object, and the legacy's own `try/catch` around this read existed only
 * because a throwing getter took the whole `timeupdate` handler with it.
 */
export function bufferedFraction(timeRanges, currentTime, duration) {
  const total = Number(duration);
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!timeRanges || typeof timeRanges.length !== "number") return 0;

  /* Clamped at 0, not just defaulted. A seek that resolves to -0.001, or a stub
   * reporting a negative `currentTime` before metadata lands, would otherwise make
   * `at >= start` false for a range starting at 0 — the playhead reads as being in
   * a GAP, the band reports 0, and it vanishes on the first frame of playback. */
  const now = Number(currentTime);
  const at = Number.isFinite(now) ? Math.max(0, now) : 0;

  let containing = 0;
  let nextStart = null;

  for (let i = 0; i < timeRanges.length; i += 1) {
    let start;
    let end;
    try {
      start = Number(timeRanges.start(i));
      end = Number(timeRanges.end(i));
    } catch {
      /* An index the browser will not answer for. Skip this range rather than
       * abandoning the read: one bad index must not cost the whole band. */
      continue;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    if (at >= start && at < end) containing = Math.max(containing, end);
    else if (start > at && (nextStart === null || start < nextStart)) nextStart = start;
  }

  if (containing > 0) return Math.min(1, containing / total);
  if (nextStart !== null) return Math.min(1, nextStart / total);
  /* The playhead is past every cached range, or nothing is cached at all.
   *
   * Zero, and NOT the furthest end: a cache of [0, 40] with the playhead at 100
   * has nothing buffered AHEAD of it, and a band reaching 40% there would be
   * claiming the viewer can watch forward when the next frame will stall. That
   * fallback is the one bug a naive "take the biggest end" implementation always
   * ships, and it is why this function walks the ranges at all. */
  return 0;
}

/**
 * Has the buffered extent moved enough to be worth a re-render?
 *
 * 3.14's item is about not allocating four times a second, and the state write is
 * the other half of that cost: even reusing the array, a `setState` on every
 * `progress` event re-renders the transport and the timecode for a band that has
 * not visibly moved.
 *
 * The threshold is a QUANTUM in seconds, not a fraction, because the fraction
 * changes meaning with the duration. Half a second is below what a viewer can see
 * on a bar and far below the 44px thumb's width on any sane duration.
 */
export const BUFFERED_QUANTUM_SECONDS = 0.5;

export function bufferedMoved(next, previous) {
  return Math.abs(Number(next) - Number(previous)) >= BUFFERED_QUANTUM_SECONDS;
}
