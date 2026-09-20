import React, { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import MovieCard from "../MovieCard";
import RailArrow from "../RailArrow";
import useRailArrows from "../../hooks/useRailArrows";

const MovieRail = React.memo(
  function MovieRail({ category, railIndex: _railIndex = 0 }) {
    const railRef = useRef(null);
    const containerRef = useRef(null);
    // Windowing: render the rail's cards only while it is near the viewport.
    // Rails scrolled far away unmount (releasing their DOM + decoded images),
    // keeping total Home memory bounded no matter how long the page is.
    const [inView, setInView] = useState(false);
    const scrollPosRef = useRef(0);
    const isDynamicRail =
      category.name === "Continue Watching" ||
      category.name === "My List" ||
      category.name === "Upcoming" ||
      category.name === "Upcoming Movies" ||
      category.name === "Upcoming TV Shows" ||
      category.name === "Upcoming Anime" ||
      category.name === "Releases This Month" ||
      category.name === "Coming This Month" ||
      category.name.startsWith("Because you watched");

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
    }, [category.name]);

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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "0.25rem",
            paddingLeft: "0.25rem",
          }}
        >
          <h3
            className={`rail-title${isDynamicRail ? " rail-title--dynamic" : ""}${category.name.startsWith("Because you watched") ? " rail-title--because" : ""}`}
            style={{
              fontSize: "20px",
              fontWeight: 600,
              margin: 0,
              letterSpacing: "-0.02em",
              color: "#ffffff",
            }}
          >
            {category.name}
          </h3>
          {!isDynamicRail && (
            <Link
              to={`/category/${encodeURIComponent(category.name)}`}
              state={{ movies: category.movies, name: category.name }}
              style={{
                fontSize: "0.72rem",
                color: "rgba(255,255,255,0.35)",
                textDecoration: "none",
                fontWeight: 500,
                padding: "2px 8px",
                borderRadius: "4px",
                border: "none",
                transition: "color 0.2s",
                background: "transparent",
              }}
            >
              Show all ›
            </Link>
          )}
        </div>

        {inView && (
          <>
            {canScrollLeft && <RailArrow dir="left" onClick={() => scroll("left")} />}
            {canScrollRight && <RailArrow dir="right" onClick={() => scroll("right")} />}

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
                padding: "0.75rem 0.5rem",
              }}
            >
              {(Array.isArray(category.movies) ? category.movies : []).slice(0, visibleCount).map((movie, i) => (
                <motion.div
                  key={movie.id}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-10px" }}
                  transition={{
                    duration: 0.35,
                    delay: Math.min((i % 10) * 0.03, 0.15),
                    ease: "easeOut",
                  }}
                  style={{ flexShrink: 0 }}
                >
                  <div className="movie-rail-item">
                    <MovieCard movie={movie} />
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.category.name === next.category.name &&
    prev.category.movies === next.category.movies,
);

export default MovieRail;