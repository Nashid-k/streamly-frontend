import { formatTimecode } from "./timecode";
import { hoverAnchor } from "./hoverPreview";

/**
 * The hover bubble (task.md 3.15).
 *
 * ── What 3.15 actually is ─────────────────────────────────────────────────────
 * "Hover shows the timecode bubble; the thumbnail is **opt-in** (`T`)." The legacy
 * already draws both (`NativePlayerView.jsx:4279` for the bubble, `:4249` for the
 * card), so the new part is the opt-in and the shared geometry — see
 * `hoverPreview.js`, which is where 3.17's item is discharged.
 *
 * ── Why the width is a prop and not measured ──────────────────────────────────
 * `hoverAnchor` needs the card's width to clamp its position, and the card cannot
 * be measured until it has rendered. Measuring with a ref means the bubble is
 * centred on the first frame and jumps to the edge on the second — visible on
 * every hover at the ends of the bar, which is exactly where a viewer aims when
 * they are looking for the end of a title.
 *
 * So the width is committed to in CSS as a constant and passed in. `BUBBLE_WIDTH`
 * is the contract; the stylesheet's `inline-size` is asserted against it in
 * `playerV2HoverPreview.test.js` / `playerV2Scrubber.test.jsx`, so the two cannot
 * drift apart without a test failing. That is the whole point: a clamp computed
 * from a width that has quietly changed is worse than no clamp, because it looks
 * correct in the middle of the bar.
 *
 * ── Why it is `aria-hidden` ───────────────────────────────────────────────────
 * The slider already announces `aria-valuenow` and `aria-valuetext`. A bubble that
 * is also in the accessibility tree would make a screen reader read the position
 * twice, and the bubble's number CHANGES as the pointer moves — so a live region
 * would be an unbounded stream of updates that interrupts whatever the viewer is
 * actually reading. The bubble is a pointer affordance; keyboard users get the
 * same information, more reliably, from the slider's own announcement.
 */

/** Must equal the bubble's `inline-size` in `player.css`. Pinned by a CSS test. */
export const BUBBLE_WIDTH = 64;

export default function ScrubberBubble({
  /** 0-1 along the track. */
  ratio,
  /** Track width in px, for the clamp. 0 until laid out. */
  trackWidth = 0,
  /** The seconds the pointer is over. Formatted here, once. */
  seconds = 0,
  /** 3.15. The thumbnail is opt-in; when off there is no art, only the timecode. */
  thumbnail = null,
}) {
  const anchor = hoverAnchor(ratio, BUBBLE_WIDTH, trackWidth);

  return (
    <div
      className="pv2-scrubber__bubble"
      aria-hidden="true"
      /* ONE geometry source: `hoverAnchor`, shared with the thumbnail card by 3.17.
       * The `translateX(-50%)` in the stylesheet is what makes `left` a CENTRE, so
       * the clamp in `hoverAnchor` is clamping the centre — which is the only way a
       * half-card can be kept on screen. */
      style={{ "--pv2-bubble-left": `${anchor.left}%` }}
      data-clamped={anchor.clamped ? "true" : "false"}
    >
      {thumbnail ? (
        <span className="pv2-scrubber__bubble-art">
          <img src={thumbnail} alt="" decoding="async" draggable="false" />
        </span>
      ) : null}
      <span className="pv2-scrubber__bubble-time">{formatTimecode(seconds)}</span>
    </div>
  );
}