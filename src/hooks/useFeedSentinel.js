import { useEffect } from "react";

/* Sentinel-driven pagination for client-side reveal feeds. One
   IntersectionObserver at the end of the feed replaces the throttled scroll
   handler the pages used to carry: scroll fires per frame while IO fires only
   on intersection changes, and re-observing on every state change keeps a
   parked sentinel stepping without timers. Without IntersectionObserver (old
   engines, test DOMs) the feed grows immediately, so content stays reachable. */
export default function useFeedSentinel({ endRef, hasMore, grow, rootMargin = "900px 0px" }) {
  useEffect(() => {
    if (!hasMore) return undefined;
    if (typeof IntersectionObserver === "undefined") {
      grow();
      return undefined;
    }
    const el = endRef.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) grow();
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [endRef, hasMore, grow, rootMargin]);
}
