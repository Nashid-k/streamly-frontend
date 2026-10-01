import { useId } from "react";

/**
 * PLAYER V2 loading stage.
 *
 * ============================================================================
 * KEEP, per ../v2/INVENTORY.md 1.1 — these are the two pieces of the old loader
 * worth keeping, and they are the app's signature loading moment:
 *   - the blurred `backdropUrl` art as full-screen ambience
 *   - the centred `posterUrl` logo (the TMDB title logo when the page has one)
 * plus the no-logo text fallback, because artwork cannot be assumed present.
 *
 * REPLACE: the conic-gradient ring becomes a horizontal bar (.pv2-loading-bar).
 *
 * The `role="status"` + `aria-live="polite"` pair is a KEEP and not decoration:
 * the old stage announced a fixed "Loading video", which meant a screen-reader
 * user heard nothing when the reason for the wait CHANGED (resolving a source
 * vs. a stalled stream are very different problems). Here the announced text
 * comes from the playback state, so it always describes what is actually
 * happening — and `aria-busy` marks the wait as in-progress.
 * ============================================================================
 */

/**
 * Terminal states get a frozen bar; every real WAIT animates.
 *
 * An indeterminate sweep means "working, duration unknown" — which is true of
 * resolving a source, opening a stream, filling the first buffer AND recovering
 * from a stall. Freezing on `stalled` (the first instinct) would be a lie in the
 * other direction: the wait is real, it just has no progress to show. Only
 * `ended`/`error`/`idle` mean "not waiting", and those do not render this stage
 * at all.
 */
const FREEZE_STATES = new Set(["ended", "error", "idle"]);

export default function LoadingStage({
  title = "",
  backdropUrl = "",
  posterUrl = "",
  /** Derived from the playback state by the caller — never invented here. */
  announcement = "",
  state = "buffering",
  dimmed = false,
}) {
  const titleId = useId();

  return (
    <div
      className="pv2-loading"
      data-state={state}
      data-dimmed={dimmed ? "true" : "false"}
    >
      {backdropUrl ? (
        <img className="pv2-loading-art" src={backdropUrl} alt="" aria-hidden="true" />
      ) : null}

      <div className="pv2-loading-stack">
        {posterUrl ? (
          <img className="pv2-loading-logo" src={posterUrl} alt={title || "Loading"} />
        ) : (
          /* No logo: the title text must still identify what is loading,
             otherwise the stage is an anonymous blur. */
          <p className="pv2-loading-title" id={titleId}>
            {title || "Loading…"}
          </p>
        )}

        <div
          className="pv2-loading-bar"
          aria-hidden="true"
          data-frozen={FREEZE_STATES.has(state) ? "true" : "false"}
        >
          <span className="pv2-loading-bar-fill" />
        </div>
      </div>

      {/* One live region for the whole stage (2.7). The text is supplied by the
          state machine, so it cannot describe a state the UI is not in. */}
      <p className="pv2-loading-status" role="status" aria-live="polite" aria-busy="true">
        {announcement}
      </p>
    </div>
  );
}
