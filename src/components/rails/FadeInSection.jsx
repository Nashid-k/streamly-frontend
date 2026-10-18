import React, { useEffect, useRef, useState } from "react";

/* Scroll-in reveal driven by ONE IntersectionObserver + a CSS class — no
   framer/JS animation per rail. The transition (translateY(30px) + opacity) is
   declared in rails.css under .fade-in-section, so the animation itself runs on
   the compositor thread where Cinejoy's rails live; the JS here only flips a
   boolean. No IntersectionObserver (jsdom/tests, ancient browsers) = visible
   immediately, so content can never be stranded behind a reveal that never
   fires. `delay` maps to the same transition-delay the framer version used. */
const FadeInSection = React.memo(function FadeInSection({ children, delay = 0, style }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === "undefined");

  useEffect(() => {
    if (visible) return undefined;
    const node = ref.current;
    if (!node) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // Mirrors the framer viewport margin: the section must be 50px INSIDE
      // the viewport before it reveals, so nothing animates while half offscreen.
      { rootMargin: "-50px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      className={`fade-in-section${visible ? " is-visible" : ""}`}
      style={{ ...style, transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
});

export default FadeInSection;
