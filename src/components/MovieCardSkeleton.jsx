export default function MovieCardSkeleton({
  lastLine = "sub",
  style,
  posterStyle,
  showInfo = false,
  index = 0,
}) {
  const staggerIndex = Math.min(Math.max(Number(index) || 0, 0), 6);

  return (
    <div
      className={`skeleton-moviecard cw sk-cw${showInfo ? " show-info" : ""}`}
      style={{ ...style, "--i": staggerIndex }}
      aria-hidden="true"
    >
      <div className="cd">
        <div className="skeleton sk-poster po sk" style={posterStyle}>
          <span className="sk sk-badge" />
          <span className="sk sk-pname" />
        </div>
        <span
          className={`skeleton sk sk-ctitle${
            showInfo ? " sk-line sk-line--w70" : ""
          }`}
        />
        <span
          className={`skeleton sk sk-cmeta${
            showInfo
              ? ` sk-line ${lastLine === "w40" ? "sk-line--w40" : "sk-line--sub"}`
              : ""
          }`}
        />
      </div>
    </div>
  );
}
