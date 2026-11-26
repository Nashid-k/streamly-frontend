import MovieCardSkeleton from "./MovieCardSkeleton";

export default function SkeletonRail({
  cards = 8,
  variant = "movie",
  headerType = "standard",
}) {
  if (variant === "provider") {
    return (
      <section className="skeleton-provider-rail" aria-hidden="true">
        <div className="skeleton-rail-head">
          <div className="skeleton skeleton-provider-heading" />
        </div>
        <div className="skeleton-provider-track">
          {Array.from({ length: cards }, (_, i) => (
            <div className="skeleton-provider-item" key={i}>
              <div className="skeleton skeleton-provider-logo" />
              <div className="skeleton skeleton-provider-name" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (variant === "continue") {
    return (
      <section className="skeleton-continue-rail" aria-hidden="true">
        <div className="skeleton-rail-head">
          <div className="skeleton skeleton-continue-heading" />
          <div className="skeleton skeleton-rail-action" />
        </div>
        <div className="skeleton-continue-track">
          {Array.from({ length: cards }, (_, i) => (
            <div className="skeleton-continue-card" key={i}>
              <div className="skeleton skeleton-continue-art">
                <div className="skeleton-continue-scrim">
                  <div className="skeleton skeleton-continue-title" />
                  <div className="skeleton skeleton-continue-meta" />
                </div>
                <div className="skeleton-continue-progress" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="skeleton-movie-rail sh in" aria-hidden="true">
      <div className="skeleton-rail-head">
        {headerType === "selector" ? (
          <div className="skeleton-selector-heading">
            <div className="skeleton skeleton-selector-label sk sk-h2" />
            <div className="skeleton skeleton-selector-value" />
          </div>
        ) : (
          <div className="skeleton skeleton-rail-title sk sk-h2" />
        )}
        {headerType === "standard" && (
          <div className="skeleton skeleton-rail-action" />
        )}
      </div>
      <span className="ar l glass sk-ar" aria-hidden="true" />
      <span className="ar r glass sk-ar" aria-hidden="true" />
      <div className="skeleton-rail rail">
        {Array.from({ length: cards }, (_, i) => (
          <div className="skeleton-rail-card" key={i}>
            <MovieCardSkeleton index={Math.min(i, 6)} />
          </div>
        ))}
      </div>
    </section>
  );
}
