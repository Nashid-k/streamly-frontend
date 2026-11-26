import { memo, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { BROWSE_PROVIDERS } from "../../data/homeRailDomains";
import useRailArrows from "../../hooks/useRailArrows";
import { getRailScrollBehavior } from "../home/HomeRail";

const BrowseByProviderRail = memo(function BrowseByProviderRail({ rowIndex = 0 }) {
  const trackRef = useRef(null);
  useRailArrows(trackRef, { enabled: true, syncEdges: true });

  const scroll = useCallback((direction) => {
    const track = trackRef.current;
    if (!track) return;
    const amount = track.clientWidth > 600 ? track.clientWidth * 0.8 : track.clientWidth * 0.9;
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

  return (
    <section
      className="sh rv home-rail provider-browse in"
      style={{ "--row-i": Math.min(rowIndex, 5) }}
      aria-label="Browse by Provider"
    >
      <div className="sh-head">
        <h2>Browse by Provider</h2>
      </div>
      <button
        type="button"
        className="ar l glass"
        aria-label="Scroll Browse by Provider left"
        onClick={() => scroll("left")}
      >
        <ChevronLeft size={22} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="ar r glass"
        aria-label="Scroll Browse by Provider right"
        onClick={() => scroll("right")}
      >
        <ChevronRight size={22} aria-hidden="true" />
      </button>
      <div
        ref={trackRef}
        className="provider-icon-grid"
        role="group"
        tabIndex={0}
        aria-label="Streaming providers"
      >
        {BROWSE_PROVIDERS.map((provider, index) => (
          <Link
            key={provider.id}
            className="provider-icon"
            style={{ "--i": Math.min(index, 6) }}
            data-initial={provider.name.charAt(0)}
            to={`/provider/${provider.id}`}
            aria-label={provider.name}
            title={provider.name}
          >
            <img
              src={provider.logo}
              alt=""
              loading="lazy"
              decoding="async"
              draggable="false"
              onError={(event) => {
                event.currentTarget.closest(".provider-icon")?.setAttribute("data-failed", "true");
              }}
            />
          </Link>
        ))}
      </div>
    </section>
  );
});

export default BrowseByProviderRail;
