export default function MovieCardSkeleton({ lastLine = "sub", style, posterStyle, showInfo = false }) {
  return (
    <div className="skeleton-moviecard" style={style} aria-hidden="true">
      <div className="skeleton sk-poster" style={posterStyle} />
      {showInfo && (
        <div className="skeleton-moviecard__info">
          <div className="skeleton sk-line sk-line--w70" />
          <div
            className={`skeleton sk-line ${
              lastLine === "w40" ? "sk-line--w40" : "sk-line--sub"
            }`}
          />
        </div>
      )}
    </div>
  );
}
