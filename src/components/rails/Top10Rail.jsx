import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import MovieCard from "../MovieCard";
import RailArrow from "../RailArrow";
import useRailArrows from "../../hooks/useRailArrows";

const Top10Rail = React.memo(
  function Top10Rail({ movies, filter, railIndex = 0 }) {
    const railRef = useRef(null);
    const containerRef = useRef(null);
    // Windowing identical to MovieRail — unmount when far offscreen
    const [inView, setInView] = useState(false);
    const scrollPosRef = useRef(0);
    const top10 = movies.slice(0, 10);

    useEffect(() => {
      if (!("IntersectionObserver" in window)) {
        setInView(true);
        return undefined;
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          const visible = entry.isIntersecting;
          if (!visible && railRef.current) {
            scrollPosRef.current = railRef.current.scrollLeft;
          }
          setInView(visible);
        },
        { rootMargin: "2200px 0px 2200px 0px" },
      );
      if (containerRef.current) {
        observer.observe(containerRef.current);
      }
      return () => observer.disconnect();
    }, []);

    const { canScrollLeft, canScrollRight, refresh } = useRailArrows(railRef, {
      enabled: inView,
    });

    // Restore horizontal position after the rail is windowed back in
    useEffect(() => {
      if (inView && railRef.current && scrollPosRef.current > 0) {
        railRef.current.scrollLeft = scrollPosRef.current;
      }
    }, [inView]);

    useEffect(() => {
      if (railRef.current) {
        railRef.current.scrollLeft = 0;
        refresh();
      }
    }, [filter, refresh]);

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

    if (top10.length === 0) return null;

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
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          <span style={{ background: "var(--accent-gradient)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginRight: "6px" }}>Top 10</span>
          {filter === "series" || filter === "tv shows"
            ? "TV Shows"
            : filter === "movies"
              ? "Movies"
              : "Today"}
        </h3>
        </div>

        {inView && (
          <>
            {canScrollLeft && <RailArrow dir="left" onClick={() => scroll("left")} />}
            {canScrollRight && <RailArrow dir="right" onClick={() => scroll("right")} />}

            <div
              ref={railRef}
              className="movie-rail"
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
              {top10.map((movie, i) => (
                <motion.div
                  key={`top10-${movie.id}`}
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-10px" }}
                  transition={{
                    duration: 0.5,
                    delay: (railIndex % 4) * 0.15 + i * 0.05,
                    ease: "easeOut",
                  }}
                  style={{ flexShrink: 0 }}
                >
                  <div
                    className="movie-rail-item"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.35rem",
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="top10-number"
                      style={{
                        display: "block",
                        whiteSpace: "nowrap",
                        lineHeight: 1,
                        fontWeight: 900,
                        letterSpacing: "-0.04em",
                        fontSize: "clamp(1.2rem, 2.2vw, 1.85rem)",
                        pointerEvents: "none",
                        userSelect: "none",
                        color:
                          i === 0
                            ? "rgba(251,191,36,0.9)"
                            : i === 1
                              ? "rgba(180,192,205,0.85)"
                              : i === 2
                                ? "rgba(201,124,74,0.85)"
                                : "rgba(255,255,255,0.35)",
                        WebkitTextStroke:
                          "1px " +
                          (i === 0
                            ? "rgba(251,191,36,0.5)"
                            : i === 1
                              ? "rgba(180,192,205,0.4)"
                              : i === 2
                                ? "rgba(201,124,74,0.45)"
                                : "rgba(255,255,255,0.14)"),
                        textShadow: "0 2px 16px rgba(0,0,0,0.6)",
                      }}
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <div style={{ width: "100%", flexShrink: 0 }}>
                      <MovieCard movie={movie} />
                    </div>
                  </div>
                </motion.div>
              ))}            </div>
          </>
        )}
      </div>
    );
  },
  (prev, next) => prev.movies === next.movies && prev.filter === next.filter,
);

export default Top10Rail;