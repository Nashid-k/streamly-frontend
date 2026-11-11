import { motion } from "framer-motion";
import { DURATION, EASE_OUT } from "../constants/motion";
import MovieCardSkeleton from "./MovieCardSkeleton";
import MovieDetailsSkeleton from "./MovieDetailsSkeleton";
import SkeletonRail from "./SkeletonRail";

/* Shape-matched Suspense fallback for lazy route chunks. Every route family
   renders a skeleton of ITS OWN final layout, built from the same primitives
   the pages themselves use (.skeleton shimmer, MovieCardSkeleton,
   SkeletonRail, MovieDetailsSkeleton), so a cold chunk swap reads as the page
   simply filling in — no centred spinner, no layout jump when the real
   content lands. routeWarmup keeps this mostly unseen; when it does render
   (first visit, slow network) it is the honest shape of what is coming. */

const GUTTER = "var(--content-gutter, 2rem)";
const TOP = "var(--header-clearance, 6rem)";

const shapeFor = (pathname = "") => {
  if (pathname === "/") return "home";
  if (pathname === "/movies" || pathname === "/series") return "browse";
  if (pathname.startsWith("/watch/")) return "details";
  if (pathname.startsWith("/person/")) return "person";
  if (pathname.startsWith("/search")) return "search";
  if (pathname.startsWith("/category") || pathname.startsWith("/genre"))
    return "grid";
  if (pathname.startsWith("/watchlist") || pathname.startsWith("/history"))
    return "list";
  if (pathname.startsWith("/explore/collections")) return "collections";
  if (pathname.startsWith("/collections/")) return "collection";
  if (pathname.startsWith("/settings")) return "settings";
  return "grid";
};

const padded = { padding: `${TOP} ${GUTTER} 4rem`, width: "100%" };

function GridSkeleton({ count = 12, grid = "discovery-grid", style }) {
  return (
    <div className={grid} style={style}>
      {Array.from({ length: count }, (_, i) => (
        <MovieCardSkeleton key={i} />
      ))}
    </div>
  );
}

function HeadLine({ width = "40%", height = "2.6rem", marginBottom = "0.75rem" }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, marginBottom, borderRadius: "10px" }}
    />
  );
}

const SHAPES = {
  /* Mirror of HomePage's own skeleton-hero block (same classes), so the
     chunk handoff lands on the identical shape. */
  home: () => (
    <>
      <div className="skeleton skeleton-hero" style={{ overflow: "hidden" }}>
        <div className="hero-content" style={{ zIndex: 2 }}>
          <div
            className="skeleton"
            style={{
              width: "min(420px, 70%)",
              height: "clamp(2.2rem, 4vw, 3.4rem)",
              borderRadius: "8px",
              marginBottom: "1.2rem",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              flexWrap: "wrap",
              marginBottom: "1.1rem",
            }}
          >
            {[70, 95, 60, 85].map((w, i) => (
              <div
                key={i}
                className="skeleton"
                style={{ width: `${w}px`, height: "22px", borderRadius: "6px" }}
              />
            ))}
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "0.45rem",
              marginBottom: "1.5rem",
              maxWidth: "560px",
            }}
          >
            <div className="skeleton" style={{ width: "100%", height: "12px", borderRadius: "4px" }} />
            <div className="skeleton" style={{ width: "86%", height: "12px", borderRadius: "4px" }} />
            <div className="skeleton" style={{ width: "62%", height: "12px", borderRadius: "4px" }} />
          </div>
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
            <div className="skeleton" style={{ width: "150px", height: "48px", borderRadius: "var(--radius-full)" }} />
            <div className="skeleton" style={{ width: "120px", height: "48px", borderRadius: "var(--radius-full)" }} />
          </div>
        </div>
      </div>
      <div
        style={{
          padding: `2.5rem ${GUTTER} 4rem`,
          display: "grid",
          gap: "2.5rem",
        }}
      >
        <SkeletonRail cards={8} />
        <SkeletonRail cards={8} />
      </div>
    </>
  ),

  /* Same banner slot the page's BrowseBanner skeleton reserves, then the
     same discovery grid. */
  browse: () => (
    <>
      <div
        className="hero-container hero-container--browse skeleton-hero"
        aria-hidden="true"
      />
      <div style={{ padding: `1.5rem ${GUTTER} 4rem` }}>
        <GridSkeleton count={12} />
      </div>
    </>
  ),

  /* /watch — the page itself mounts MovieDetailsSkeleton while its query
     loads, so the fallback IS the page's first paint. */
  details: () => <MovieDetailsSkeleton />,

  person: () => (
    <div style={{ ...padded }}>
      <div
        style={{
          display: "flex",
          gap: "clamp(1.25rem, 4vw, 3rem)",
          flexWrap: "wrap",
          marginBottom: "2rem",
        }}
      >
        <div
          className="skeleton"
          style={{
            width: "min(300px, 80vw)",
            aspectRatio: "2/3",
            borderRadius: "1.25rem",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1, minWidth: "300px", paddingTop: "1rem" }}>
          <div
            className="skeleton"
            style={{ width: "45%", height: "3.5rem", marginBottom: "1.5rem" }}
          />
          <div
            style={{
              display: "flex",
              gap: "1rem",
              flexWrap: "wrap",
              marginBottom: "2rem",
            }}
          >
            {[80, 110, 90].map((w, i) => (
              <div
                key={i}
                className="skeleton"
                style={{ width: `${w}px`, height: "2rem", borderRadius: "8px" }}
              />
            ))}
          </div>
          <div style={{ display: "grid", gap: "0.6rem", maxWidth: "560px" }}>
            {[100, 86, 70].map((w, i) => (
              <div
                key={i}
                className="skeleton"
                style={{ width: `${w}%`, height: "12px", borderRadius: "4px" }}
              />
            ))}
          </div>
        </div>
      </div>
      <GridSkeleton count={6} />
    </div>
  ),

  /* .movie-grid is the exact class the search page's loading state uses. */
  search: () => (
    <div style={{ ...padded }}>
      <div
        className="skeleton"
        style={{
          width: "min(560px, 100%)",
          height: "52px",
          borderRadius: "var(--radius-full)",
          marginBottom: "1rem",
        }}
      />
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {[90, 70, 80, 60].map((w, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ width: `${w}px`, height: "32px", borderRadius: "var(--radius-full)" }}
          />
        ))}
      </div>
      <GridSkeleton count={12} grid="movie-grid" />
    </div>
  ),

  grid: () => (
    <div style={{ ...padded }}>
      <HeadLine />
      <HeadLine width="24%" height="1rem" marginBottom="1.5rem" />
      <GridSkeleton count={12} />
    </div>
  ),

  list: () => (
    <div style={{ ...padded }}>
      <HeadLine width="min(320px, 60%)" />
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {[110, 90, 100].map((w, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ width: `${w}px`, height: "36px", borderRadius: "var(--radius-full)" }}
          />
        ))}
      </div>
      <GridSkeleton count={10} grid="movie-grid" />
    </div>
  ),

  collections: () => (
    <div style={{ ...padded, maxWidth: "1200px", margin: "0 auto" }}>
      <HeadLine width="min(360px, 70%)" />
      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: "72px" }} />
        ))}
      </div>
    </div>
  ),

  collection: () => (
    <div style={{ ...padded, maxWidth: "1150px", margin: "0 auto" }}>
      <div
        className="skeleton"
        style={{ width: "120px", height: "32px", borderRadius: "var(--radius-full)", marginBottom: "1.25rem" }}
      />
      <div
        className="skeleton"
        style={{ width: "min(260px, 60%)", height: "2.6rem", marginBottom: "1.75rem" }}
      />
      <div
        style={{
          display: "grid",
          gap: "0.85rem",
          gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
        }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="skeleton" style={{ aspectRatio: "2/3" }} />
        ))}
      </div>
    </div>
  ),

  settings: () => (
    <div style={{ ...padded, maxWidth: "980px", margin: "0 auto" }}>
      <HeadLine width="min(280px, 50%)" height="2.4rem" />
      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
        {[110, 95, 105, 85].map((w, i) => (
          <div
            key={i}
            className="skeleton"
            style={{ width: `${w}px`, height: "36px", borderRadius: "var(--radius-full)" }}
          />
        ))}
      </div>
      <div
        style={{
          border: "1px solid rgba(var(--white-rgb), 0.08)",
          borderRadius: "1.25rem",
          padding: "1.5rem",
          display: "grid",
          gap: "1.4rem",
        }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "1rem",
            }}
          >
            <div style={{ display: "grid", gap: "0.45rem", flex: 1, maxWidth: "420px" }}>
              <div className="skeleton" style={{ width: "55%", height: "14px", borderRadius: "4px" }} />
              <div className="skeleton" style={{ width: "80%", height: "11px", borderRadius: "4px", opacity: 0.7 }} />
            </div>
            <div
              className="skeleton"
              style={{
                width: i === 3 ? "140px" : "54px",
                height: i === 3 ? "40px" : "28px",
                borderRadius: i === 3 ? "10px" : "var(--radius-full)",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  ),
};

export default function RouteFallback({ pathname = "" }) {
  const shape = SHAPES[shapeFor(pathname)] || SHAPES.grid;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION.FAST, ease: EASE_OUT }}
      style={{ width: "100%" }}
      aria-busy="true"
    >
      {shape()}
    </motion.div>
  );
}
