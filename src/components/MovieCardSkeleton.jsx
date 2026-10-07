export default function MovieCardSkeleton({ lastLine = "sub", style, posterStyle }) {
  return (
    <div className="skeleton-moviecard" style={style}>
      <div className="skeleton sk-poster" style={posterStyle}></div>
      <div className="skeleton sk-line sk-line--w70"></div>
      <div
        className={`skeleton sk-line ${
          lastLine === "w40" ? "sk-line--w40" : "sk-line--sub"
        }`}
      ></div>
    </div>
  );
}