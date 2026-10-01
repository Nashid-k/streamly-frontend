import { memo } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { audibleVolume, clampVolume } from "./volumeGesture";

/**
 * The persistent volume level indicator (task.md 3.12).
 *
 * Path TWO of three. "Persistent" is the whole word, and it is what the legacy
 * player lacked: `showHud("volume", nv)` set a HUD that a `HUD_MS` timer then
 * cleared, so between gestures there was no on-screen evidence the volume had
 * ever been anything other than whatever it was left at.
 *
 * ── Why it is memoized, and why that matters here ─────────────────────────────
 * `memo` is not a micro-optimization on this component. It re-renders on EVERY
 * volume change, which during a drag is every pointermove. Without memo, every
 * one of those renders would also re-render the sibling chrome, because they are
 * siblings in the shell's tree — turning one drag into a full chrome re-render
 * 60 times a second.
 *
 * ── It reads the level, never the element ────────────────────────────────────
 * `audioVolume` folds mute into the displayed level so a muted player shows an
 * empty bar rather than a full one. That is a deliberate lie to the eye and the
 * truth to the ear: the bar answers "what am I hearing", and the icon beside it
 * answers "why is that nothing".
 */
function VolumeIndicatorImpl({ level, muted, visible }) {
  const effective = audibleVolume({ level, muted });
  const percent = Math.round(effective * 100);
  const label = muted
    ? "Muted"
    : effective === 0
      ? "Volume 0%"
      : `Volume ${percent}%`;

  /* The bar is present in the DOM whenever the zones layout is active, so the
   * viewer's thumb always has somewhere to look; `visible` fades it rather than
   * unmounting it. A level that mounts and unmounts per drag cannot be read while
   * the finger is still down, which is the only time the number is wanted. */
  return (
    <div
      className="pv2-volume-indicator"
      data-visible={visible ? "true" : "false"}
      data-muted={muted ? "true" : "false"}
      /* Announced politely rather than assertively: a drag fires dozens of value
       * changes, and an assertive announcement per pixel would make the player
       * unusable with a screen reader. A polite announcement coalesces. */
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="pv2-volume-indicator__icon" aria-hidden="true">
        {muted || effective === 0 ? <VolumeX /> : <Volume2 />}
      </span>
      <span
        className="pv2-volume-indicator__track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={label}
      >
        <span
          className="pv2-volume-indicator__fill"
          style={{ inlineSize: `${clampVolume(effective) * 100}%` }}
        />
      </span>
      <span className="pv2-volume-indicator__value" aria-hidden="true">
        {muted ? "—" : `${percent}%`}
      </span>
    </div>
  );
}

export default memo(VolumeIndicatorImpl);