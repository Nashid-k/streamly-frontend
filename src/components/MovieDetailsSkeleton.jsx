export default function MovieDetailsSkeleton() {
  return (
    <div
      style={{
        position: "relative",
        marginTop: "-56px",
        paddingTop: 0,
        minHeight: "100vh",
      }}
    >
      {/* ── Backdrop skeleton ────────────────────────────────── */}
      <div
        className="skeleton skeleton-glow"
        style={{
          height: "min(85vh, 900px)",
          width: "100vw",
          marginLeft: "calc(-50vw + 50%)",
          borderRadius: 0,
        }}
      />
      {/* Backdrop gradient overlays */}
      <div style={{
        position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)",
        width: "100vw", height: "min(85vh, 900px)",
        background: "linear-gradient(to top, #050505 0%, rgba(5,5,5,0.4) 40%, transparent 70%)",
        pointerEvents: "none", zIndex: 1,
      }} />

      {/* ── Topbar skeleton ──────────────────────────────────── */}
      <div
        style={{
          position: "sticky", top: 56, zIndex: 10,
          padding: "0.75rem clamp(1rem, 2.5vw, 2.5rem) 0.5rem",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}
      >
        {/* Left: Back + breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div className="skeleton" style={{ width: "76px", height: "32px", borderRadius: "8px" }} />
          <div className="skeleton" style={{ width: "90px", height: "12px", borderRadius: "4px", opacity: 0.6 }} />
        </div>
        {/* Right: Share / Like / Dislike */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div className="skeleton skeleton-circle" style={{ width: "36px", height: "36px" }} />
          <div className="skeleton skeleton-circle" style={{ width: "36px", height: "36px" }} />
          <div className="skeleton skeleton-circle" style={{ width: "36px", height: "36px" }} />
        </div>
      </div>

      {/* ── Main content (mirrors .details-content-wrapper) ──── */}
      <div className="details-content-wrapper">
        {/* Poster skeleton — reuse .details-poster-large so it sizes
            and hides responsively exactly like the real poster */}
        <div className="skeleton details-poster-large" />

        {/* Text content skeleton */}
        <div className="details-text" style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          {/* LIVE SEASON badge (conditional in real UI) */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "1.5rem" }}>
            <div className="skeleton" style={{ width: "104px", height: "24px", borderRadius: "4px" }} />
            <div className="skeleton" style={{ width: "190px", height: "14px", borderRadius: "4px" }} />
          </div>

          {/* Logo/Title (real: minHeight 80px, clamp up to 4rem) */}
          <div
            style={{
              minHeight: "80px",
              display: "flex",
              alignItems: "center",
              marginBottom: "1.5rem",
            }}
          >
            <div
              className="skeleton"
              style={{
                width: "min(400px, 70%)",
                height: "clamp(2.5rem, 4vw, 3.6rem)",
                borderRadius: "8px",
              }}
            />
          </div>

          {/* Platform badge */}
          <div className="skeleton" style={{ width: "110px", height: "30px", borderRadius: "8px", marginBottom: "1rem" }} />

          {/* Meta pills row (first is the gold IMDb badge in real UI) */}
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
            <div className="skeleton skeleton-glow" style={{ width: "110px", height: "34px", borderRadius: "10px" }} />
            <div className="skeleton" style={{ width: "90px", height: "34px", borderRadius: "8px" }} />
            <div className="skeleton" style={{ width: "80px", height: "34px", borderRadius: "8px" }} />
            <div className="skeleton" style={{ width: "60px", height: "34px", borderRadius: "8px" }} />
            <div className="skeleton" style={{ width: "95px", height: "34px", borderRadius: "8px" }} />
          </div>

          {/* Genre pills */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
            {[90, 70, 100, 60, 80].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: `${w}px`, height: "30px", borderRadius: "100px", animationDelay: `${i * 0.05}s` }} />
            ))}
          </div>

          {/* Description lines */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.5rem" }}>
            <div className="skeleton" style={{ width: "100%", height: "13px", borderRadius: "4px" }} />
            <div className="skeleton" style={{ width: "95%", height: "13px", borderRadius: "4px" }} />
            <div className="skeleton" style={{ width: "85%", height: "13px", borderRadius: "4px" }} />
            <div className="skeleton" style={{ width: "70%", height: "13px", borderRadius: "4px" }} />
          </div>

          {/* Tags */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton" style={{ width: `${50 + i * 8}px`, height: "22px", borderRadius: "6px", animationDelay: `${i * 0.04}s` }} />
            ))}
          </div>

          {/* Info grid: Director / Writers / Budget / Locations / Studio / Awards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                style={{
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "10px",
                  padding: "12px 14px",
                  border: "1px solid rgba(255,255,255,0.04)",
                }}
              >
                <div className="skeleton" style={{ width: "45%", height: "10px", borderRadius: "4px", marginBottom: "8px" }} />
                <div className="skeleton" style={{ width: "70%", height: "12px", borderRadius: "4px" }} />
              </div>
            ))}
          </div>

          {/* CTA Buttons */}
          <div style={{ display: "flex", gap: "0.85rem", flexWrap: "wrap", marginTop: "0.75rem", marginBottom: "3.5rem", alignItems: "center" }}>
            <div className="skeleton" style={{ width: "160px", height: "48px", borderRadius: "100px" }} />
            <div className="skeleton" style={{ width: "120px", height: "48px", borderRadius: "100px" }} />
            <div className="skeleton" style={{ width: "48px", height: "48px", borderRadius: "100px" }} />
          </div>

          {/* Cast & Crew rail skeleton (mirrors CastRail) */}
          <section style={{ marginTop: "3rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1.25rem" }}>
              <div className="skeleton" style={{ width: "3px", height: "22px", borderRadius: "999px" }} />
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
        </div>
      </div>

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
            <div className="skeleton" style={{ width: "3px", height: "24px", borderRadius: "999px" }} />
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
            <div key={i} className="skeleton-moviecard">
              <div className="skeleton sk-poster" style={{ borderRadius: "12px" }} />
              <div className="skeleton sk-line sk-line--w70" />
              <div className="skeleton sk-line sk-line--w40" />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom spacer */}
      <div style={{ height: "4rem" }} />
    </div>
  );
}