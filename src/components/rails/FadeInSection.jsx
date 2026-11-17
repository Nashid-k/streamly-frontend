import React from "react";
import { useVirtualRenderAdapter } from "../../hooks/useVirtualRenderAdapter";

/* Scroll-in reveal uses the same shared, one-shot IntersectionObserver pool as
   virtualised cards. A page with many rails therefore shares one observer for
   this root margin instead of allocating one observer per section. The
   transition itself stays CSS-only in rails.css (opacity + transform), while
   React only flips the visibility class once. Unsupported browsers and SSR
   render visible immediately, so content is never stranded behind a reveal. */
const FadeInSection = React.memo(function FadeInSection({
  children,
  delay = 0,
  style,
  className = "",
}) {
  const { isVisible, ref } = useVirtualRenderAdapter("-50px");

  return (
    <div
      ref={ref}
      className={`fade-in-section${isVisible ? " is-visible" : ""}${className ? ` ${className}` : ""}`}
      style={{ ...style, transitionDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
});

export default FadeInSection;
