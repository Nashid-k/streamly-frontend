import { useEffect, useState } from "react";
import { resolveTier } from "../tiers";

/**
 * Which tier the transport should render (task.md 3.9).
 *
 * The whole policy is `resolveTier`; this only supplies the measured width.
 *
 * ── Why ResizeObserver and not a media query ────────────────────────────────
 * 3.6 banned `@media` and viewport units from V2 CSS, because a player embedded
 * in a side panel or a 700px box must lay out against ITS OWN width, not the
 * window's. That rule is not a style preference, so honouring it in JS matters
 * too: reading `window.innerWidth` here would reintroduce the exact bug 3.6
 * fixed, and would make an embedded player show Tier B in a narrow iframe.
 *
 * ── Why the initial value is null and not a synchronous read ────────────────
 * The shell root is not in the DOM on the first render, so there is nothing to
 * measure. Seeding from `getBoundingClientRect()` inside the effect would mean
 * a synchronous `setState` in an effect — an extra render on every mount for a
 * value we are about to receive anyway. `ResizeObserver` delivers one callback
 * immediately on `observe()`, so the measurement arrives without a second pass.
 *
 * Until it does, `width` is null and `resolveTier` returns Tier A — the
 * documented safe fallback, and a correct one: showing a compact row for one
 * frame beats showing a row that cannot fit.
 */
export default function useTier({ containerRef, engaged = false } = {}) {
  const [width, setWidth] = useState(null);

  useEffect(() => {
    const element = containerRef?.current;
    if (!element) return undefined;
    /* No ResizeObserver (older engine, or a test environment without one) is
     * not an error: it just means Tier B is never offered. */
    if (typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      const measured = Number(entry?.contentRect?.width);
      // 0 means collapsed/hidden, not "very narrow". Reporting it as a real
      // measurement would pin the tier to Tier A forever once the box is shown
      // again with no observer event, so an unmeasurable width stays null.
      setWidth(Number.isFinite(measured) && measured > 0 ? measured : null);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [containerRef]);

  return resolveTier({ width, engaged });
}
