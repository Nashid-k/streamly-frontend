import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

/**
 * Sticky browse status bar (brief P3-3/P3-4): result count, one removable chip
 * per active filter, and "Clear all". It sits directly under the fixed header,
 * sticks while the grid scrolls, and gets out of the way when the viewer scrolls
 * down (restoring on any scroll up or near the top).
 *
 * Scroll handling is passive + rAF-throttled and reads `window.scrollY` only —
 * no layout reads (no getBoundingClientRect) inside the handler, so the sticky
 * bar never forces a synchronous layout during the grid's paint.
 */
const BrowseBar = React.memo(function BrowseBar({
  countLabel,
  loading = false,
  chips = [],
  onRemove,
  onClearAll,
}) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY.current;
        if (y < 140) setHidden(false);
        else if (delta > 6) setHidden(true);
        else if (delta < -6) setHidden(false);
        lastY.current = y;
        ticking.current = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      ticking.current = false;
    };
  }, []);

  const activeCount = chips.length;

  return (
    <div
      className={`browse-bar${hidden ? " browse-bar--hidden" : ""}`}
      aria-label="Browse results and active filters"
    >
      <div className="browse-bar__inner">
        <span className="browse-bar__count" aria-live="polite">
          {loading ? "Loading titles…" : countLabel}
        </span>

        {activeCount > 0 && (
          <>
            <span className="browse-bar__summary">
              {activeCount} filter{activeCount === 1 ? "" : "s"}
            </span>
            <ul className="browse-bar__chips">
              {chips.map((chip) => (
                <li key={chip.key}>
                  <button
                    type="button"
                    className="browse-chip"
                    onClick={() => onRemove(chip.key)}
                    aria-label={`Remove ${chip.label} filter`}
                  >
                    <span className="browse-chip__label">{chip.label}</span>
                    <X size={12} aria-hidden="true" className="browse-chip__x" />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="browse-bar__clear" onClick={onClearAll}>
              Clear all
            </button>
          </>
        )}
      </div>
    </div>
  );
});

export default BrowseBar;
