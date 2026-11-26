import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import useRailArrows from "../../hooks/useRailArrows";
import { getSavedDetailRailScroll, isDetailRestoring } from "../../hooks/useDetailView";

export function getRailScrollBehavior({ appReducedMotion = false, systemReducedMotion = false } = {}) {
  return appReducedMotion || systemReducedMotion ? "auto" : "smooth";
}

/* The canonical 2.0 shelf: `.sh > .ar/.rail`, with the six-card stagger cap
   owned by CSS. No legacy wrapper, curtain or hover metadata is emitted. */
const HomeRail = memo(function HomeRail({
  title,
  header,
  movies,
  renderItem,
  className = "",
  ariaLabel,
  empty,
  rowIndex = 0,
}) {
  const cards = Array.isArray(movies) ? movies : [];
  const label = typeof title === "string" ? title : ariaLabel || "Titles";
  const initialRestoredScroll = getSavedDetailRailScroll(label);
  const trackRef = useRef(null);
  const sectionRef = useRef(null);
  const scrollPosRef = useRef(initialRestoredScroll ?? 0);
  const [inView, setInView] = useState(() => initialRestoredScroll != null || isDetailRestoring());
  const [visibleCount, setVisibleCount] = useState(() =>
    initialRestoredScroll != null && initialRestoredScroll > 0
      ? Math.max(15, cards.length)
      : 15,
  );
  const throttleRef = useRef(0);
  const throttleTimerRef = useRef(0);

  useLayoutEffect(() => {
    const saved = getSavedDetailRailScroll(label);
    if (saved == null || !trackRef.current) return;
    scrollPosRef.current = saved;
    if (cards.length > visibleCount) {
      setVisibleCount(cards.length);
    }
    trackRef.current.scrollLeft = saved;
  }, [label, cards.length, visibleCount]);

  useEffect(() => {
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        const visible = entry.isIntersecting;
        if (!visible && trackRef.current) scrollPosRef.current = trackRef.current.scrollLeft;
        setInView(visible);
      },
      { rootMargin: "2200px 0px 2200px 0px" },
    );
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (inView && trackRef.current && scrollPosRef.current > 0) {
      trackRef.current.scrollLeft = scrollPosRef.current;
    }
  }, [inView]);

  useEffect(() => {
    if (window.__streamlyDetailScrollRestored) return;
    setVisibleCount(15);
    if (trackRef.current) trackRef.current.scrollLeft = 0;
  }, [title, movies]);

  useRailArrows(trackRef, { enabled: inView, syncEdges: true });

  const scroll = useCallback((direction) => {
    const track = trackRef.current;
    if (!track) return;
    const amount = track.clientWidth > 800 ? track.clientWidth * 0.8 : track.clientWidth * 0.9;
    const appReducedMotion =
      typeof document !== "undefined" &&
      document.documentElement?.dataset?.reduceMotion === "true";
    const systemReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
    track.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: getRailScrollBehavior({ appReducedMotion, systemReducedMotion }),
    });
  }, []);

  const handleScroll = useCallback(
    (event) => {
      if (throttleRef.current) return;
      const { scrollLeft, clientWidth, scrollWidth } = event.currentTarget;
      if (scrollLeft + clientWidth >= scrollWidth - 400) {
        setVisibleCount((count) => Math.min(count + 10, cards.length));
      }
      throttleRef.current = 1;
      clearTimeout(throttleTimerRef.current);
      throttleTimerRef.current = setTimeout(() => {
        throttleRef.current = 0;
      }, 150);
    },
    [cards.length],
  );

  useEffect(
    () => () => {
      clearTimeout(throttleTimerRef.current);
    },
    [],
  );

  if (cards.length === 0 && !header) return null;

  return (
    <section
      ref={sectionRef}
      className={`sh rv home-rail${inView ? " in" : ""}${className ? ` ${className}` : ""}`}
      style={{ "--row-i": Math.min(rowIndex, 5) }}
      aria-label={ariaLabel || label}
    >
      <div className="sh-head">
        {header || <h2>{label}</h2>}
      </div>
      <button
        type="button"
        className="ar l glass"
        aria-label={`Scroll ${label} left`}
        onClick={() => scroll("left")}
      >
        <ChevronLeft size={22} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="ar r glass"
        aria-label={`Scroll ${label} right`}
        onClick={() => scroll("right")}
      >
        <ChevronRight size={22} aria-hidden="true" />
      </button>
      <div
        ref={trackRef}
        className="rail"
        role="group"
        tabIndex={0}
        data-detail-rail={label}
        aria-label={`${label} titles`}
        onScroll={handleScroll}
      >
        {cards.length === 0 && empty
          ? empty
          : (inView ? cards.slice(0, visibleCount) : cards.slice(0, 6)).map((movie, index) =>
              renderItem(movie, index, `${label}:${index}:${movie.id}`),
            )}
      </div>
    </section>
  );
});

export default HomeRail;
