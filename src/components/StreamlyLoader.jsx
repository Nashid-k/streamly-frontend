/* Streamly 2.0 activity indicator — matches streamly_2.0.html's subtle monochrome
   frosted arc (conic-gradient + radial donut mask) with zero neon logo ring. */

export function StreamlyLoader({ size = 18, label = "Loading", className = "" }) {
  const labelled = label !== "";
  return (
    <span
      className={`streamly-loader ${className}`.trim()}
      style={{ width: size, height: size }}
      {...(labelled
        ? { role: "status", "aria-label": label }
        : { "aria-hidden": true })}
    >
      <span className="streamly-loader__ring" aria-hidden="true" />
      {labelled && <span className="streamly-loader__sr-only">{label}</span>}
    </span>
  );
}

export default StreamlyLoader;
