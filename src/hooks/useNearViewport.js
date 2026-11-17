import { useEffect, useRef, useState } from "react";

/* Query-gated rails only need to know whether their sentinel is near the
   viewport. Share one observer per rootMargin across all rows (the ten daily
   Home rails use the same 1400px margin) rather than allocating one observer
   per row. Each subscriber still receives its own enter/leave updates. */
const observers = new Map();
const subscribers = new WeakMap();

function acquireObserver(rootMargin) {
  let observer = observers.get(rootMargin);
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          subscribers.get(entry.target)?.(entry.isIntersecting);
        }
      },
      { rootMargin },
    );
    observers.set(rootMargin, observer);
  }
  return observer;
}

/* True while the observed element is within `rootMargin` of the viewport.
   Rails use it to defer BOTH their fetch and their render until the viewer is
   close enough to notice. Browsers without IntersectionObserver report visible
   immediately, so behaviour degrades to "fetch everything" rather than "never
   fetch". */
export function useNearViewport(rootMargin = "1400px 0px") {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return undefined;
    }

    // A conditional mount can leave the ref empty for this effect pass.
    const el = ref.current;
    if (!el) return undefined;

    const observer = acquireObserver(rootMargin);
    subscribers.set(el, setInView);
    observer.observe(el);

    return () => {
      subscribers.delete(el);
      observer.unobserve(el);
    };
  }, [rootMargin]);

  return [ref, inView];
}

export default useNearViewport;
