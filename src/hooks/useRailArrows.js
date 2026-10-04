import { useState, useLayoutEffect, useCallback, useRef } from "react";

/* Scroll-aware rail arrows: returns whether the rail can scroll left
   (content hidden on the left) and right (content hidden on the right).
   Listens to scroll + resize + content size changes, and re-binds when
   the rail element mounts (ready) or remounts (windowing).

   Scroll fires per frame, and every rail on the page listens. Two guards keep
   that cheap: measurements are coalesced into one rAF, and setState is skipped
   entirely unless a boolean actually flips (a new object every tick made React
   re-render the rail, its cards and their arrow buttons on each scroll event). */
export default function useRailArrows(ref, { enabled = true, threshold = 8 } = {}) {
  const [arrows, setArrows] = useState({ left: false, right: false });
  const frameRef = useRef(0);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, clientWidth, scrollWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    const left = scrollLeft > threshold;
    const right = maxScroll > 0 && scrollLeft < maxScroll - threshold;
    setArrows((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, [ref, threshold]);

  const update = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = 0;
      measure();
    });
  }, [measure]);

  const refresh = useCallback(() => {
    if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = 0; }
    measure();
  }, [measure]);

  // useLayoutEffect so arrow availability is measured before first paint —
  // no flicker of disabled/hidden arrows right after the rail mounts.
  useLayoutEffect(() => {
    if (!enabled) return undefined;
    const el = ref.current;
    if (!el) return undefined;

    refresh();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(el);
    }
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      if (observer) observer.disconnect();
      if (frameRef.current) { cancelAnimationFrame(frameRef.current); frameRef.current = 0; }
    };
  }, [ref, enabled, threshold, update, refresh]);

  return { canScrollLeft: arrows.left, canScrollRight: arrows.right, refresh };
}