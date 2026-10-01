/**
 * The decode target for 3.15's opt-in thumbnail, from a resolved source.
 *
 * ── Why this is a rule and not a one-liner ─────────────────────────────────────
 * `previewThumbs.js` mounts its own hls.js instance and needs two different URLs:
 *
 *   - the URL it OPENS, which for a multi-level master must be the master itself,
 *     so the decoder picks its own rendition. Opening a single rendition instead
 *     decodes the preview at whatever quality the resolve happened to return first,
 *     which on a 4K title is often the worst one available.
 *   - the referer for its loader (`createStreamlyLoader`). The CDN gating this app
 *     works around is referer-bound, and a decode without it 403s.
 *
 * `usePlayerSource` already encodes the same master-vs-refUrl rule for playback
 * (`extractPlayableUrl`) and the legacy encoded it again for previews at
 * `NativePlayerView.jsx:3397`. Three copies of one rule is two too many.
 *
 * Returns null when there is nothing decodable, INCLUDING the case where a playable
 * URL exists but no referer token does — a decode that 403s on every hover is worse
 * than an opt-in feature that visibly does nothing.
 */
export function previewTarget(payload) {
  const src = payload?.source || {};
  const referer = src.refUrl || null;
  const url = src.multiLevelMaster ? src.url || null : referer || src.url || null;
  if (!url) return null;
  return {
    url,
    refUrl: referer || url,
    /* The ladder key, not the URL. The pipeline caches per `sourceKey` and remounts
     * on a change of it (`previewThumbs.js:86`), so keying by URL would make every
     * quality switch look like a different film. */
    sourceKey: src.key || null,
  };
}

/**
 * Hover preview geometry (task.md 3.15, and 3.17's shared source).
 * ── Why this file exists at all ───────────────────────────────────────────────
 * The item for 3.15 is small: "Hover shows the timecode bubble; the thumbnail is
 * **opt-in** (`T`)." The legacy already has both — `NativePlayerView.jsx:4279`
 * draws the bubble and `:4249` draws the card. Neither is the problem.
 *
 * The problem is that they do not agree with each other:
 *
 *   bubble     left: `${Math.min(94, Math.max(6, hoverRatio * 100))}%`   (:4284)
 *   thumbnail  left: min(max(hoverRatio * playerW, thumbInset),
 *                        max(thumbInset, playerW - thumbInset)) px      (:4255)
 *
 * One is a percentage of the track, clamped in PERCENT. The other is measured in
 * PIXELS against the whole player, clamped by a half-card inset. They separate at
 * the edges in two ways at once:
 *
 *   1. `6%` of a 360px phone is 21.6px, which is narrower than a timecode bubble.
 *      Clamped to 6%, the bubble hangs off the left edge of the screen — its own
 *      half-width is never accounted for, because a percentage cannot know it.
 *   2. The thumbnail clamps against `playerW`, the bubble clamps against the
 *      track. The track is inset by the timecodes on both sides, so a bubble and a
 *      card that are both "clamped to the edge" sit at different x positions on
 *      the same hover.
 *
 * So 3.15 and 3.17 are the same change, and doing them separately would mean
 * writing the clamped-percentage maths now and replacing it in 3.17. ONE
 * geometry source: `hoverAnchor`.
 *
 * ── Why the clamp takes a measured WIDTH ─────────────────────────────────────
 * The bubble does not know its own width until it has rendered, which is the
 * chicken-and-egg the legacy's `thumbInset` was working around by measuring the
 * card with a ref. Rather than measure, the caller passes the width it has
 * already committed to (the bubble is a fixed `ch` width by design; the card is
 * `aspect-ratio: 16/9` on a known column). That makes the clamp computable BEFORE
 * layout, so the first frame of the bubble is already in the right place and it
 * never visibly jumps from the centre to the edge.
 *
 * The fallback — centre the anchor, do not clamp — is deliberate. On a track
 * narrower than the bubble there is no in-bounds position, and picking one edge
 * arbitrarily makes the bubble appear to jump between edges as the pointer moves
 * across a tiny track. Centring keeps it stable and merely overflowing.
 */

/** A pointer position -> the ratio along the TRACK it represents. */
export function hoverRatio(clientX, rect) {
  if (!rect || !Number.isFinite(rect.width) || rect.width <= 0) return 0;
  const x = Number(clientX);
  if (!Number.isFinite(x) || !Number.isFinite(rect.left)) return 0;
  const ratio = (x - rect.left) / rect.width;
  return Math.min(1, Math.max(0, ratio));
}

/** The ratio -> the seconds it points at, clamped to the duration. */
export function hoverSeconds(ratio, duration) {
  const total = Number(duration);
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(total, Math.max(0, ratio * total));
}

/**
 * Where a preview card of `width` should sit, given `ratio` along a track.
 *
 * Returns a `translateX` percentage rather than a pixel `left`, because the card
 * is a percentage of the track's own width (`inset-inline: 0` plus a computed
 * offset). Expressing the answer in the same unit the card is sized in means a
 * track resize cannot desynchronise the two — the alternative is re-measuring on
 * every resize, which is the legacy's `playerW` bug in a different costume.
 *
 * `edgePad` is how much of the card must stay on screen at each end. It defaults
 * to half the card, which is the correct answer for a card centred on the anchor,
 * and the reason the offset is a clamp rather than a mirror.
 */
export function hoverAnchor(ratio, width, trackWidth) {
  const w = Number(width);
  const track = Number(trackWidth);
  const r = Number.isFinite(Number(ratio)) ? Math.min(1, Math.max(0, Number(ratio))) : 0;

  /* A card wider than its track has no in-bounds position. Centre it and let it
   * overflow rather than pinning it to an edge, where it would jump as `r` moves. */
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(track) || track <= 0 || w >= track) {
    return { left: r * 100, shift: 0, clamped: false };
  }

  /* Half the card may hang past each end. Expressed as a fraction of the TRACK, so
   * it composes with the percentage `left` rather than fighting it. */
  const pad = (w / 2 / track) * 100;
  const centre = r * 100;
  const left = Math.min(centre, 100 - pad);
  const safeLeft = Math.max(left, pad);
  return { left: safeLeft, shift: 0, clamped: safeLeft !== centre };
}

/**
 * Whether a preview should be shown for this interaction at all.
 *
 * Split out because the conditions are the ones worth arguing about, and they are
 * arguments about honesty rather than about layout:
 *
 *   - `live` (hover or focus) and a KNOWN duration. The legacy guarded
 *     `safeDuration > 0`; without it the bubble renders `0:00` at the pointer,
 *     which claims "the start of the film" when the truth is "we do not know yet".
 *   - `pointerType === "touch"` is NOT excluded. A touch scrub that shows a bubble
 *     is useful — it is the only way a viewer can aim a drag. What must not happen
 *     is a bubble that cannot be dismissed and does not follow the finger, and
 *     that is handled by `dragging` below rather than by refusing touch.
 *   - A `DRAG` always shows. During a drag the bubble is the feedback channel;
 *     hiding it mid-drag because the pointer briefly left the 44px wrapper would
 *     make the drag feel like it lost the pointer.
 */
export function shouldShowPreview({ live, duration, inert } = {}) {
  if (inert) return false;
  if (!live) return false;
  const total = Number(duration);
  return Number.isFinite(total) && total > 0;
}

/**
 * How long a pointer must rest before a preview appears.
 *
 * 3.15's second half is that the THUMBNAIL is opt-in. Opt-in is not enough on its
 * own: an opt-in feature that fires on every pointer pass is opt-in in name only,
 * and the legacy's cost was a second full HLS session. So the gate is two-layer:
 * the viewer must have opted in, and the pointer must have settled.
 *
 * 0 for the bubble, which is free to render and is the thing the item actually
 * asks for on hover. The delay is a property of the EXPENSIVE preview, and
 * threading it through the caller rather than hardcoding it here keeps the
 * "timecode appears immediately" promise independent of the thumbnail's cost.
 */
export const THUMBNAIL_SETTLE_MS = 120;