import { motion } from "framer-motion";

/* Lightweight Suspense fallback for lazy route chunks. Replaces the dual-ring
   spinner with a page-shaped skeleton so the swap reads as "content loading"
   rather than "app stalled". With routeWarmup preloading chunks on idle and
   on hover this rarely renders, but when it does (first visit to a route, a
   slow network) it should feel like the page is arriving, not like a spinner. */
export default function RouteFallback() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
        padding: "6rem var(--content-gutter, 2rem) 4rem",
        minHeight: "60dvh",
        width: "100%",
      }}
      aria-busy="true"
      aria-live="polite"
    >
      {/* Hero-shaped skeleton */}
      <div className="skeleton" style={{ width: "100%", height: "clamp(200px, 38vw, 420px)", borderRadius: "var(--radius-xl, 12px)" }} />

      {/* Two rail-shaped rows of card placeholders */}
      {[0, 1].map((row) => (
        <div key={row} style={{ display: "flex", gap: "1rem", overflow: "hidden" }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="skeleton skeleton-card"
              style={{
                flex: "0 0 auto",
                width: "clamp(120px, 14vw, 180px)",
                aspectRatio: "2 / 3",
                borderRadius: "var(--radius-lg, 8px)",
              }}
            />
          ))}
        </div>
      ))}
    </motion.div>
  );
}
