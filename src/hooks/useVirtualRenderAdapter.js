import { useState, useEffect, useCallback } from "react";

/* One IntersectionObserver per rootMargin, shared by every consumer, instead of
   one observer per card. A rail of 20 posters used to allocate 20 observers
   (and 20 callbacks) on mount; the callbacks are dropped from the WeakMap as
   soon as they fire, so nothing is retained for elements already rendered. */
const observers = new Map();
const subscribers = new WeakMap();

function acquireObserver(rootMargin) {
  let observer = observers.get(rootMargin);
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const notify = subscribers.get(entry.target);
          if (!notify) continue;
          subscribers.delete(entry.target);
          observer.unobserve(entry.target);
          notify();
        }
      },
      { rootMargin },
    );
    observers.set(rootMargin, observer);
  }
  return observer;
}

/**
 * Custom React hook that defers rendering of heavy components (like 3D effects, iframes, or large DOM trees)
 * until they are actually visible on screen. Once visible the element stays
 * rendered (lightweight items stay in DOM) and stops being observed.
 */
export function useVirtualRenderAdapter(rootMargin = "200px") {
  // No observer support means no deferral is possible, so resolve at init
  // rather than from an effect (an effect never runs without a ref callback).
  const hasObserver =
    typeof window !== "undefined" && typeof window.IntersectionObserver === "function";
  const [isVisible, setIsVisible] = useState(() => !hasObserver);
  const [node, setNode] = useState(null);

  // Stable callback ref (a fresh arrow every render would detach/reattach the
  // node on every commit and re-run the effect in a loop). Attaching as soon
  // as the node exists also beats a mount effect that can miss the element.
  const ref = useCallback((node) => setNode(node), []);

  useEffect(() => {
    // The effect still runs without observer support (the ref exists), so the
    // init-time "visible" decision has to be repeated here: without this guard
    // acquireObserver threw "IntersectionObserver is not defined" from inside
    // MovieCard in jsdom/older engines even though the hook reported visible.
    if (!node || !hasObserver) return undefined;

    const observer = acquireObserver(rootMargin);
    subscribers.set(node, () => setIsVisible(true));
    observer.observe(node);

    return () => {
      subscribers.delete(node);
      observer.unobserve(node);
    };
  }, [node, rootMargin, hasObserver]);

  return { isVisible, ref };
}
