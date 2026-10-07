import MovieCardSkeleton from "./MovieCardSkeleton";

export default function SkeletonRail({ cards = 5 }) {
  return (
    <div>
      <div className="skeleton skeleton-title"></div>
      <div className="skeleton-rail">
        {Array.from({ length: cards }, (_, i) => (
          <MovieCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}