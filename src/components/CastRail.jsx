import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import slugify from "slugify";

const castContainerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.1 },
  },
};
const castItemVariants = {
  hidden: { opacity: 0, scale: 0.85, y: 12 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 350, damping: 28 },
  },
};

export default function CastRail({ cast }) {
  const railRef = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  // Arrows are rendered on desktop (fine pointer) and hidden on touch via CSS —
  // mobile relies on swipe. Disabled states track the scroll bounds.
  const updateArrows = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useLayoutEffect(() => {
    updateArrows();
  }, [updateArrows, cast]);

  if (!cast || cast.length === 0) return null;

  const scroll = (dir) => {
    if (railRef.current)
      railRef.current.scrollBy({
        left: dir === "left" ? -400 : 400,
        behavior: "smooth",
      });
  };

  const arrowBtn = (dir) => {
    const disabled = dir === "left" ? !canLeft : !canRight;
    const Icon = dir === "left" ? ChevronLeft : ChevronRight;
    return (
      <button
        key={dir}
        onClick={() => scroll(dir)}
        disabled={disabled}
        aria-label={dir === "left" ? "Scroll cast list left" : "Scroll cast list right"}
        className="cast-rail__arrow"
      >
        <Icon size={18} />
      </button>
    );
  };

  return (
    <section style={{ marginTop: "3rem", position: "relative" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.25rem",
        }}
      >
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>Cast & Crew</h2>
        <div className="cast-rail__nav">
          {["left", "right"].map(arrowBtn)}
        </div>
      </div>
      <motion.div
        ref={railRef}
        variants={castContainerVariants}
        initial="hidden"
        animate="show"
        onScroll={updateArrows}
        className="cast-rail__scroll"
        style={{
          display: "flex",
          gap: "1rem",
          overflowX: "auto",
          paddingBottom: "0.5rem",
          scrollbarWidth: "none",
        }}
      >
        {cast.map((member) => {
          const m =
            typeof member === "string"
              ? { id: null, name: member, character: "", profileUrl: null }
              : member;
          const initial = (m.name || "?").trim().charAt(0).toUpperCase();
          return (
            <motion.div
              key={m.id || m.name}
              variants={castItemVariants}
              style={{ flexShrink: 0, width: "110px", textAlign: "center" }}
            >
              {m.id ? (
                <Link
                  to={`/person/${m.id}/${slugify(m.name, { lower: true, strict: true })}`}
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  {m.profileUrl ? (
                    <img
                      src={m.profileUrl}
                      alt={m.name}
                      loading="lazy"
                      decoding="async"
                      className="cast-rail__avatar"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const sib = e.currentTarget.nextElementSibling;
                        if (sib) sib.style.display = "flex";
                      }}
                    />
                  ) : (
                    <div className="cast-rail__avatar cast-rail__avatar--monogram" aria-hidden="true">
                      {initial}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#e4e4e7",
                      lineHeight: 1.3,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.name}
                  </div>
                  {m.character && (
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "#71717a",
                        marginTop: "2px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {m.character}
                    </div>
                  )}
                </Link>
              ) : (
                <>
                  <div className="cast-rail__avatar cast-rail__avatar--monogram">
                    {initial}
                  </div>
                  <div
                    style={{
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      color: "#e4e4e7",
                    }}
                  >
                    {m.name}
                  </div>
                </>
              )}
            </motion.div>
          );
        })}
      </motion.div>
    </section>
  );
}