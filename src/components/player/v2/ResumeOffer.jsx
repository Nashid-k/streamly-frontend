import { Play, RotateCcw } from "lucide-react";
import { formatTimecode } from "./timecode";

/**
 * The "You left off at …" card (task.md 5.1).
 *
 * Presentational only: the offer, the countdown and the seek all belong to
 * `useResumeOffer`. Keeping it dumb is what lets the whole timing contract be
 * asserted by rendering the card with numbers, without a video element.
 *
 * Deliberately NOT inside a `.pv2-chrome` layer. That layer is
 * `pointer-events: none` with an opt-in only for controls revealed by the
 * auto-hide timer; an offer that could be scrolled past or ignored needs its
 * buttons clickable from the first frame, so it is a direct child of the shell.
 */
export default function ResumeOffer({ at = 0, remaining = 0, onResume, onRestart }) {
  const label = formatTimecode(at);

  return (
    <div className="pv2-resume pv2-glass" role="complementary" aria-label={`Resume from ${label}`}>
      <div className="pv2-resume-copy">
        <p className="pv2-resume-title">You left off at {label}</p>
        <p className="pv2-resume-count" aria-live="polite">
          {remaining > 1 ? `Auto-resuming in ${remaining}s` : "Resuming…"}
        </p>
      </div>
      <button
        type="button"
        className="pv2-resume-btn pv2-resume-btn-primary"
        onClick={() => onResume?.(at)}
        aria-label={`Resume from ${label}`}
      >
        <Play size={16} aria-hidden="true" />
        Resume
      </button>
      <button
        type="button"
        className="pv2-resume-btn"
        onClick={() => onRestart?.()}
        aria-label="Play from the beginning"
      >
        <RotateCcw size={16} aria-hidden="true" />
        Start over
      </button>
    </div>
  );
}
