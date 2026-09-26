import { useEffect, useRef, useState } from "react";

/* True while the observed element is within `rootMargin` of the viewport.
   Rails use it to defer BOTH their fetch and their render until the viewer is
   close enough to notice, which is what keeps a cold Home load from firing the
   whole catalogue at once. Browsers without IntersectionObserver report visible
   immediately, so behaviour degrades to "fetch everything" rather than "never
   fetch".

   Extracted from the copy that was inlined in MovieRail/Top10Rail so the
   query-gated rails share one implementation. */
export function useNearViewport(rootMargin = "1400px 0px") {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    // No IntersectionObserver support: report visible so behaviour degrades to
    // "fetch everything", never to "never fetch".
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }
    // Ref not attached yet (conditional mount): stay hidden, but do NOT pretend
    // the browser lacks support — that would open the gate for the wrong reason.
    const el = ref.current;
    if (!el) return undefined;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin]);

  return [ref, inView];
}

export default useNearViewport;
