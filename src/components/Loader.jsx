import { StreamlyLoader } from "./StreamlyLoader";

/* 2.0 Loading adapter — global floating spinners are gone (never in 2.0);
   button/inline states use either compact monochrome arcs or 2.0 skeletal
   surfaces matching streamly_2.0.html. */

export default function Loader({ variant = "page", size }) {
  if (variant === "global") return null;

  if (variant === "button") {
    const dimensions = size || 16;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <StreamlyLoader size={dimensions} label="" />
      </span>
    );
  }

  if (variant === "inline") {
    return (
      <div
        className="sk"
        aria-hidden="true"
        style={{
          width: "min(280px, 72%)",
          height: "14px",
          borderRadius: "999px",
        }}
      />
    );
  }

  return (
    <div
      style={{
        width: "100%",
        padding: "6rem clamp(18px, 4vw, 56px) 3rem",
        display: "grid",
        gap: "18px",
      }}
      aria-busy="true"
    >
      <div className="sk" style={{ width: "min(240px, 60%)", height: "28px", borderRadius: "8px" }} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(clamp(120px, 16vw, 180px), 1fr))",
          gap: "24px 16px",
        }}
      >
        {Array.from({ length: 8 }, (_, idx) => (
          <div key={idx}>
            <div className="sk" style={{ aspectRatio: "2 / 3", borderRadius: "16px" }} />
            <div className="sk" style={{ height: "14px", width: "78%", marginTop: "10px", borderRadius: "7px" }} />
          </div>
        ))}
      </div>
    </div>
  );
}
