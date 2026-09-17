/* Circular Arc Component — the core Apple TV+ motif
   Used for: volume HUD, seek indicators, loading, up-next countdown */
const ArcRing = ({ progress = 0, size = 48, strokeWidth = 3, color = "#fff", bgColor = "rgba(255,255,255,0.08)", glowColor, children, className, responsive }) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(progress, 1)));
  return (
    <div style={{ position: "relative", width: responsive || size, height: responsive || size, flexShrink: 0 }} className={className}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={strokeWidth} style={{ stroke: bgColor }} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ stroke: color, transition: "stroke-dashoffset 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>
      {glowColor && (
        <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)", filter: `blur(4px)`, opacity: 0.5 }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="transparent" strokeWidth={strokeWidth} />
          <circle
            cx={size/2} cy={size/2} r={r} fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ stroke: glowColor, transition: "stroke-dashoffset 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
        </svg>
      )}
      {children && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          /* Counter-rotate so children stay upright despite SVG rotation */
          transform: "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArcRing;