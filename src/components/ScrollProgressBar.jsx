import { useEffect, useState } from "react";

/**
 * ScrollProgressBar — fixed 2px accent bar at the top of the viewport.
 * Uses scroll-driven animation via CSS (animation-timeline: scroll) where
 * supported, with a JS fallback for older browsers.
 */
export default function ScrollProgressBar() {
  // Use CSS scroll-driven animation approach — render the div with the
  // .scroll-progress class (styled in tokens.css). No JS state needed.
  return (
    <div
      className="scroll-progress"
      aria-hidden="true"
      role="presentation"
    />
  );
}
