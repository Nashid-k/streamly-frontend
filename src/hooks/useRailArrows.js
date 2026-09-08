import { useState, useEffect, useCallback } from "react";

/* Scroll-aware rail arrows: returns whether the rail can scroll left
   (content hidden on the left) and right (content hidden on the right).
   Listens to scroll + resize + content size changes, and re-binds when
   the rail element mounts (ready) or remounts (windowing). */
export default function useRailArrows(ref, { enabled = true, threshold = 8 } = {}) {
  const [arrows, setArrows] = useState({ left: false, right: false });

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, clientWidth, scrollWidth } = el;
    const maxScroll = scrollWidth - clientWidth;
    setArrows({
      left: scrollLeft > threshold,
      right: maxScroll > 0 && scrollLeft < maxScroll - threshold,
    });
  }, [ref, threshold]);

  useEffect(() => {
    if (!enabled) return undefined;
    const el = ref.current;
    if (!el) return undefined;

    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [ref, enabled, threshold, update]);

  return { canScrollLeft: arrows.left, canScrollRight: arrows.right, refresh: update };
}