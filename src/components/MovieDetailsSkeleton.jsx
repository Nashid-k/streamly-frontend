import MovieCardSkeleton from "./MovieCardSkeleton";

export default function MovieDetailsSkeleton({ hasBackdrop = true }) {
  return (
    <div
      className="relative min-h-screen font-sans overflow-x-hidden pb-24 bg-[#050505] w-[100vw] ml-[calc(50%-50vw)]"
      style={{
        marginTop: 0,
        paddingTop: 0,
      }}
    >
      {/* ── Details Hero (matches TitleDetailsPage .details-hero exactly) ── */}
      <div className={`relative w-full details-hero${hasBackdrop ? " details-hero--fit" : ""}`}>
        {/* Artwork treatment matches home & watch banners: .details-hero__art + .hero-bg + .details-hero__shade */}
        <div className="details-hero__art">
          <div
            className={`skeleton skeleton-glow hero-bg detail-transition-hero${hasBackdrop ? " detail-transition-hero--fit" : ""}`}
            style={{ width: "100%", height: "100%" }}
          />
          <div className="hero-overlay hero-overlay--apple" />
          <div className="details-hero__shade" aria-hidden="true" />
        </div>

        {/* Content Overlap — the lift + header clearance live in CSS (.details-hero__body) */}
        <div className="details-hero__body details-gutter">
          {/* Left Column matching TitleDetailsPage */}
          <div className="w-full max-w-[700px] lg:max-w-[650px] lg:min-w-0 flex flex-col items-center lg:items-start">
            {/* Logo/Title placeholder */}
            <div
              className="skeleton"
              style={{
                width: "min(380px, 80%)",
                height: "clamp(2.5rem, 4vw, 3.8rem)",
                borderRadius: "10px",
                marginBottom: "1.25rem",
              }}
            />

            {/* Genre pills / meta row */}
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
              {[80, 65, 90].map((w, i) => (
                <div key={i} className="skeleton" style={{ width: `${w}px`, height: "24px", borderRadius: "4px" }} />
              ))}
            </div>

            {/* Actions row: Play + Add to list + Watched + Ratings */}
            <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", marginBottom: "1.5rem", alignItems: "center" }}>
              <div className="skeleton skeleton-glow" style={{ width: "140px", height: "46px", borderRadius: "var(--radius-full)" }} />
              <div className="skeleton" style={{ width: "46px", height: "46px", borderRadius: "var(--radius-full)" }} />
              <div className="skeleton" style={{ width: "46px", height: "46px", borderRadius: "var(--radius-full)" }} />
              <div className="skeleton" style={{ width: "110px", height: "36px", borderRadius: "10px" }} />
            </div>

            {/* Description lines */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", width: "100%", maxWidth: "650px", marginBottom: "2rem" }}>
              <div className="skeleton" style={{ width: "100%", height: "13px", borderRadius: "4px" }} />
              <div className="skeleton" style={{ width: "95%", height: "13px", borderRadius: "4px" }} />
              <div className="skeleton" style={{ width: "85%", height: "13px", borderRadius: "4px" }} />
              <div className="skeleton" style={{ width: "70%", height: "13px", borderRadius: "4px" }} />
            </div>
          </div>
        </div>
      </div>

      {/* Cast & Crew rail skeleton (mirrors CastRail) */}
      <section style={{ position: "relative", zIndex: 1, padding: "0 clamp(1rem, 2.5vw, 2.5rem)", maxWidth: "1600px", margin: "2rem auto 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
          <div className="skeleton" style={{ width: "3px", height: "22px", borderRadius: "var(--radius-full)" }} />
          <div className="skeleton" style={{ width: "130px", height: "24px", borderRadius: "6px" }} />
        </div>
        <div style={{ display: "flex", gap: "1rem", overflow: "hidden" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton-cast">
              <div className="skeleton sk-avatar" />
              <div className="skeleton sk-name" />
              <div className="skeleton sk-character" />
            </div>
          ))}
        </div>
      </section>

      {/* ── Episodes section skeleton ───────────────────────── */}
      <div
        style={{
          position: "relative", zIndex: 1,
          padding: "0 clamp(1rem, 2.5vw, 2.5rem)",
          maxWidth: "1600px", margin: "2rem auto 0",
        }}
      >
        {/* Section header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div className="skeleton" style={{ width: "3px", height: "24px", borderRadius: "var(--radius-full)" }} />
            <div className="skeleton" style={{ width: "140px", height: "26px", borderRadius: "6px" }} />
          </div>
          {/* Layout toggle + Season dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ display: "flex", background: "rgba(255,255,255,0.05)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
              <div className="skeleton" style={{ width: "34px", height: "34px", borderRadius: 0 }} />
              <div className="skeleton" style={{ width: "34px", height: "34px", borderRadius: 0 }} />
            </div>
            <div className="skeleton" style={{ width: "150px", height: "32px", borderRadius: "12px" }} />
          </div>
        </div>

        {/* Episode grid (mirrors real 280px-min grid, 12px cards) */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))", gap: "0.8rem" }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="skeleton-card"
              style={{
                background: "#0a0a0c",
                borderRadius: "12px",
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              {/* Episode thumbnail */}
              <div className="skeleton" style={{ width: "100%", aspectRatio: "16/9", borderRadius: 0 }} />
              {/* Episode info */}
              <div style={{ padding: "0.8rem 1rem", display: "flex", gap: "10px" }}>
                <div className="skeleton" style={{ height: "1.5rem", width: "32px", borderRadius: "6px", flexShrink: 0 }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.45rem" }}>
                  <div className="skeleton" style={{ height: "14px", width: "70%", borderRadius: "4px" }} />
                  <div className="skeleton" style={{ height: "11px", width: "100%", borderRadius: "4px" }} />
                  <div className="skeleton" style={{ height: "11px", width: "80%", borderRadius: "4px" }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── More Like This section skeleton ──────────────────── */}
      <div
        style={{
          position: "relative", zIndex: 1,
          padding: "0 clamp(1rem, 2.5vw, 2.5rem)",
          maxWidth: "1600px", margin: "2.5rem auto 0",
        }}
      >
        <div className="section-header" style={{ marginBottom: "1rem" }}>
          <div className="skeleton" style={{ width: "180px", height: "26px", borderRadius: "6px" }} />
        </div>
        <div className="movie-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <MovieCardSkeleton key={i} lastLine="w40" posterStyle={{ borderRadius: "12px" }} />
          ))}
        </div>
      </div>

      {/* Bottom spacer */}
      <div style={{ height: "4rem" }} />
    </div>
  );
}