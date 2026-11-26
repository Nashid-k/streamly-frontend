import { motion } from "framer-motion";
import { DURATION, EASE_OUT } from "../constants/motion";
import MovieCardSkeleton from "./MovieCardSkeleton";
import MovieDetailsSkeleton from "./MovieDetailsSkeleton";
import HomeSkeletonRail from "./home/HomeSkeletonRail";

/* Shape-matched 2.0 Suspense fallback for lazy route chunks mirroring
   `streamly_2.0.html` (.hero.sk-hero, HomeSkeletonRail, MovieDetailsSkeleton,
   .ph.sk.sk-ph + .gr). */

const GUTTER = "clamp(18px, 4vw, 56px)";
const TOP = "var(--header-clearance, 6rem)";
const HERO_DOT_COUNT = 5;

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

function Hero2Skeleton({ scene = "home" }) {
  return (
    <section
      className="hero sk-hero skeleton-hero"
      data-sk-scene={scene}
      aria-hidden="true"
    >
      <div className="hbd sk sk-hbd" />
      <div className="hx">
        <div className="hh"><span className="sk sk-ht" /></div>
        <p className="hm"><span className="sk sk-hm" /></p>
        <div className="hdw">
          <p className="hd sk-hd">
            <span className="sk sk-line" />
            <span className="sk sk-line" />
            <span className="sk sk-line short" />
          </p>
        </div>
        <div className="btns">
          <span className="btn p sk sk-btn" />
          <span className="btn g sk sk-btn sm" />
          <span className="btn g sk sk-btn lg" />
        </div>
      </div>
      <div className="dots glass sk-dots">
        {Array.from({ length: HERO_DOT_COUNT }, (_, index) => (
          <button key={index} type="button" tabIndex={-1} disabled>
            <span className={`sk sk-dot${index ? " dot-idle" : ""}`} />
          </button>
        ))}
      </div>
    </section>
  );
}

function GridSkeleton({ count = 12, grid = "gr discovery-grid", style }) {
  return (
    <div className={grid} style={style}>
      {Array.from({ length: count }, (_, i) => (
        <MovieCardSkeleton key={i} index={i} />
      ))}
    </div>
  );
}

function HeadLine({ width = "min(46%, 380px)", height = "2.4rem", marginBottom = "0.75rem" }) {
  return (
    <div
      className="skeleton sk"
      style={{ width, height, marginBottom, borderRadius: "10px" }}
    />
  );
}

const SHAPES = {
  home: () => (
    <div className="home-page main-content main-content--has-hero main">
      <Hero2Skeleton scene="home" />
      <div className="home-rails-section">
        <HomeSkeletonRail scene="provider" cards={12} rowIndex={0} />
        <HomeSkeletonRail scene="home" cards={8} rowIndex={1} />
        <HomeSkeletonRail scene="home" cards={8} rowIndex={2} />
      </div>
    </div>
  ),

  browse: () => (
    <div className="home-page main-content main-content--has-hero main">
      <Hero2Skeleton scene="browse" />
      <div style={{ padding: `1.5rem ${GUTTER} 4rem` }}>
        <GridSkeleton count={12} />
      </div>
    </div>
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
