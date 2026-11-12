import React, { useRef, memo } from "react";
import { Link } from "react-router-dom";
import { BROWSE_PROVIDERS } from "../../data/homeRailDomains";
import useRailArrows from "../../hooks/useRailArrows";
import RailArrow from "../RailArrow";
import SectionHeader from "./SectionHeader";

const BrowseByProviderRail = memo(function BrowseByProviderRail() {
  const scrollRef = useRef(null);
  const { canScrollLeft, canScrollRight, refresh } = useRailArrows(scrollRef);

  const scroll = (dir) => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth > 800 ? el.clientWidth * 0.75 : el.clientWidth * 0.85;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    refresh();
  };

  return (
    <section className="row-section row-section--provider relative group/row" aria-label="Browse by Provider">
      <SectionHeader
        title={
          <h2 className="rail-title text-xl font-bold tracking-tight text-white m-0">
            Browse by Provider
          </h2>
        }
      />

      <div className="track-wrap relative">
        {canScrollLeft && (
          <RailArrow
            dir="left"
            onClick={() => scroll("left")}
            revealOnHover
            hoverClass="group-hover/row:opacity-100"
            className="z-30 -left-3"
            label="Browse by Provider"
          />
        )}
        {canScrollRight && (
          <RailArrow
            dir="right"
            onClick={() => scroll("right")}
            revealOnHover
            hoverClass="group-hover/row:opacity-100"
            className="z-30 -right-3"
            label="Browse by Provider"
          />
        )}

        <div
          ref={scrollRef}
          className="track scroll-x flex overflow-x-auto overflow-y-hidden scroll-smooth"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
            WebkitOverflowScrolling: "touch",
            gap: "20px",
            padding: "16px var(--gutter, 24px) 8px",
          }}
        >
          {BROWSE_PROVIDERS.map((p) => (
            <Link
              key={p.id}
              to={`/movies?provider=${p.id}`}
              className="provider flex-none w-[76px] lg:w-[92px] flex flex-col items-center gap-2 group cursor-pointer text-decoration-none select-none"
              aria-label={p.name}
              title={p.name}
            >
              <div className="provider__logo w-16 h-16 lg:w-20 lg:h-20 rounded-2xl overflow-hidden bg-white/5 border border-white/10 shadow-lg shadow-black/50 transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-108 group-hover:border-white/30 group-hover:shadow-black/70">
                <img
                  src={p.logo}
                  alt={p.name}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              </div>
              <span className="provider__name text-[11px] lg:text-xs font-medium text-white/60 text-center leading-tight line-clamp-2 transition-colors duration-300 group-hover:text-white">
                {p.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
});

export default BrowseByProviderRail;
