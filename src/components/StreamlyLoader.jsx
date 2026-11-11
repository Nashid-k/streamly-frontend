/* Streamly compact loader — CSS-driven neon ring (lime→green→cyan conic sweep)
   with a gradient play-triangle centre. Resolution-independent, theme-aware,
   and it parks under prefers-reduced-motion (the ring stops instead of
   spinning). Used for routine navigation and data loading; the animated logo
   GIF stays reserved for the player's video startup (see PlayerLoader). */

export function StreamlyLoader({ size = 42, label = "Loading", className = "" }) {
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
      <span className="streamly-loader__center" aria-hidden="true">
        <span className="streamly-loader__play" />
      </span>
      {labelled && <span className="streamly-loader__sr-only">{label}</span>}
    </span>
  );
}

export function StreamlyLoadingScreen() {
  return (
    <div className="streamly-loading-screen">
      <StreamlyLoader size={58} label="Loading Streamly" />
      <span className="streamly-loading-screen__label">
        Loading your experience
      </span>
    </div>
  );
}

export default StreamlyLoader;
