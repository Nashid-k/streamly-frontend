import { useCallback, useEffect, useState } from "react";

/**
 * The MEASURED height of the bottom chrome (task.md 3.22).
 *
 * ── Why measure ───────────────────────────────────────────────────────────────
 * The subtitle cue has to clear the transport. The legacy answered with two
 * literals — `controlsVisible ? 132 : 64` — which describe one desktop layout and
 * nothing else: on a narrow player the transport wraps to two rows and is taller
 * than 132, so a cue sits underneath it, and on a short viewport 132 clears almost
 * nothing. Every number in that pair is also a second place to update when the
 * transport changes.
 *
 * Measuring means the cue is correct by construction at any size, in both tiers,
 * in either layout mode, with the volume HUD open or not.
 *
 * ── Why a ResizeObserver rather than a height read ────────────────────────────
 * The chrome's height changes when the TIER changes (3.9 adds controls), when the
 * layout mode changes (3.11 touch zones), when safe-area insets change, and when
 * the container is resized — none of which happen on an interval a timer would
 * catch, and all of which happen without a React render on this side. An observer
 * fires for exactly those cases.
 *
 * ── Why 0 is a real value ────────────────────────────────────────────────────
 * With the chrome hidden the measured height collapses toward zero and the cue
 * takes the cinematic offset, which is the behaviour the legacy's `64` was
 * approximating. Reporting 0 rather than a floor lets CSS own the "how far from
 * the edge when there is no chrome" question via the `max()` in the call site.
 */
export default function useChromeHeight() {
  /* The node is STATE, not a ref. This is the whole subtlety: the transport is
   * conditional on a resolved source, so on a loading player there is nothing to
   * observe and the effect runs with `null`. A ref would hold the node for the
   * later `attach` call, but the effect's dependency list would not change, so it
   * would never re-run and the observer would never be created — leaving the cue
   * at its resting offset for the entire session, with nothing thrown and nothing
   * logged. Depending on the node makes "the element arrived" the trigger. */
  const [node, setNode] = useState(null);
  const [height, setHeight] = useState(0);

  const attach = useCallback((next) => {
    setNode(next);
    /* Read on attach as well, so the cue is positioned correctly on the very first
     * paint rather than waiting for the observer's first callback. */
    setHeight(next ? Math.round(next.getBoundingClientRect().height) : 0);
  }, []);

  useEffect(() => {
    /* No element yet: the transport has not resolved a source. Zero is correct,
     * and the cue node's own CSS owns the resting offset. */
    if (!node) return undefined;
    setHeight(Math.round(node.getBoundingClientRect().height));

    /* No observer available (jsdom, older embeds): the read above is the whole
     * answer. Throwing here would take the shell down over subtitles. */
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver(() =>
      setHeight(Math.round(node.getBoundingClientRect().height)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);

  return [attach, height];
}