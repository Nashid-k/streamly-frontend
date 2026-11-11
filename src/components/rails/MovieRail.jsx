import React, { useState, useEffect, useRef } from "react";
import MovieCard from "../MovieCard";
import RailArrow from "../RailArrow";
import SectionHeader from "./SectionHeader";
import useRailArrows from "../../hooks/useRailArrows";

const MovieRail = React.memo(
  function MovieRail({ category, railIndex: _railIndex = 0, header }) {
    const railRef = useRef(null);
    const containerRef = useRef(null);
    // Windowing: render the rail's cards only while it is near the viewport.
    // Rails scrolled far away unmount (releasing their DOM + decoded images),
    // keeping total Home memory bounded no matter how long the page is.
    const [inView, setInView] = useState(false);
    const scrollPosRef = useRef(0);
    const isDynamicRail =
      Boolean(category.dynamic) ||
      category.name === "Continue Watching" ||
      category.name === "My List" ||
      category.name === "Upcoming" ||
      category.name === "Upcoming Movies" ||
      category.name === "Upcoming TV Shows" ||
      category.name === "Upcoming Anime" ||
      category.name === "Releases This Month" ||
      category.name === "Coming This Month";

    useEffect(() => {
      if (!("IntersectionObserver" in window)) {
        setInView(true);
        return undefined;
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          const visible = entry.isIntersecting;
          // Keep the horizontal scroll position across unmount/remount cycles
          if (!visible && railRef.current) {
            scrollPosRef.current = railRef.current.scrollLeft;
          }
          setInView(visible);
        },
        // Generous band (±2200px) so remounting happens well before the rail
        // is actually on screen — no visible pop-in while scrolling.
        { rootMargin: "2200px 0px 2200px 0px" },
      );
      if (containerRef.current) {
        observer.observe(containerRef.current);
      }
      return () => observer.disconnect();
    }, []);

    // Restore horizontal position after the rail is windowed back in
    useEffect(() => {
      if (inView && railRef.current && scrollPosRef.current > 0) {
        railRef.current.scrollLeft = scrollPosRef.current;
      }
    }, [inView]);

    const { canScrollLeft, canScrollRight, refresh } = useRailArrows(railRef, {
      enabled: inView,
    });

    const [visibleCount, setVisibleCount] = useState(15);
    const inThrottle = useRef(false);
    const throttleTimeoutRef = useRef(null);

    useEffect(() => {
      setVisibleCount(15);
      if (railRef.current) {
        railRef.current.scrollLeft = 0;
      }
      // movies, not just name: an anchor swap on the because rail changes the
      // row's data while the translated label stays constant.
    }, [category.name, category.movies]);

    const handleScroll = (e) => {
      if (inThrottle.current) return;
      const { scrollLeft, clientWidth, scrollWidth } = e.target;
      if (scrollLeft + clientWidth >= scrollWidth - 400) {
        setVisibleCount((prev) =>
          prev >= category.movies.length
            ? prev
            : Math.min(prev + 10, category.movies.length),
        );
      }
      inThrottle.current = true;
      if (throttleTimeoutRef.current) clearTimeout(throttleTimeoutRef.current);
      throttleTimeoutRef.current = setTimeout(() => (inThrottle.current = false), 150);
      refresh();
    };

    const scroll = (dir) => {
      if (railRef.current) {
        const clientWidth = railRef.current.clientWidth;
        const scrollAmount =
          clientWidth > 800 ? clientWidth * 0.8 : clientWidth * 0.9;
        railRef.current.scrollBy({
          left: dir === "left" ? -scrollAmount : scrollAmount,
          behavior: "smooth",
        });
        refresh();
      }
    };

    if (!category?.movies || category.movies.length === 0) return null;

    return (
      <div
        ref={containerRef}
        className="movie-rail-wrapper"
        style={{ position: "relative" }}
      >
        {/* Shared row head — title on the left, a quiet `See all` on the right
            that goes white on hover. Dynamic rails get the title alone. A
            caller-supplied `header` node replaces the plain title entirely
            (the because rail's anchor picker renders in this slot). */}
        <SectionHeader
          title={
            header || (
              <h3
                className={`rail-title${isDynamicRail ? " rail-title--dynamic" : ""}`}
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "20px",
                  fontWeight: "var(--weight-display)",
                  margin: 0,
                  letterSpacing: "var(--tracking-display)",
                  color: "var(--white)",
                }}
              >
                {category.name}
              </h3>
            )
          }
          seeAllTo={
            header || isDynamicRail
              ? undefined
              : `/category/${encodeURIComponent(category.name)}`
          }
          seeAllState={
            header || isDynamicRail
              ? undefined
              : { movies: category.movies, name: category.name }
          }
        />

        {inView && (
          <>
            {canScrollLeft && <RailArrow dir="left" onClick={() => scroll("left")} label={category.name} />}
            {canScrollRight && <RailArrow dir="right" onClick={() => scroll("right")} label={category.name} />}

            <div
              ref={railRef}
              className="movie-rail"
              onScroll={handleScroll}
              style={{
                display: "flex",
                gap: "1.5rem",
                WebkitOverflowScrolling: "touch",
                overscrollBehaviorX: "contain",
                overflowX: "auto",
                scrollbarWidth: "none",
                /* Block padding lives in rails.css (RIVO's py-6 / sm:py-8); only
                   the lateral inset is inline, so the CSS step can apply. */
                paddingInline: "0.5rem",
              }}
            >
              {(Array.isArray(category.movies) ? category.movies : []).slice(0, visibleCount                ).map((movie) => (
                /* No per-card entrance: rivo.st's rows reveal as ONE block
                   (`fadeUp` on the section), and the per-card `whileInView`
                   stagger here animated up to 15 framer nodes per rail on top
                   of that block fade — two entrances for one row, plus main-
                   thread work on every scroll. */
                <div key={movie.id} style={{ flexShrink: 0 }}>
                  <div className="movie-rail-item">
                    <MovieCard movie={movie} />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.category.name === next.category.name &&
    prev.category.movies === next.category.movies &&
    // Header node: the because picker re-renders when its anchor changes, so
    // element identity is part of the contract.
    prev.header === next.header,
);

export default MovieRail;