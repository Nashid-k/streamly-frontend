import { useState, useEffect, useRef } from "react";

/**
 * An adapter hook that defers rendering of heavy components (like 3D effects, iframes, or large DOM trees)
 * until they are actually visible on screen. Disconnects after becoming visible
 * to avoid keeping heavy components rendered forever when scrolled far away.
 */
export function useVirtualRenderAdapter(rootMargin = "200px") {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    // If the browser doesn't support IntersectionObserver, fail gracefully to full render
    if (!window.IntersectionObserver) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Once visible, disconnect to keep rendered (lightweight items stay in DOM)
          // For heavy items like iframes, consider using a separate hide-on-exit observer
          observer.disconnect();
        }
      },
      { rootMargin },
    );

    const currentRef = ref.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) observer.unobserve(currentRef);
    };
  }, [rootMargin]);

  return { isVisible, ref };
}
