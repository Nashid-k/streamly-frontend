import React, { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/**
 * Universal Loader — redesigned with smoother dual-ring spinner,
 * context-aware colors, and better visual feedback.
 *
 * Variants:
 * - 'page': Full-page centered spinner for Suspense/loading states
 * - 'inline': Section-bound spinner
 * - 'button': Tiny 16px spinner for buttons
 * - 'global': Non-blocking spinner fixed bottom-right for background fetches
 */
export default function Loader({ variant = "page", size, color }) {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const isGlobalLoading = isFetching > 0 || isMutating > 0;

  const [showGlobal, setShowGlobal] = useState(false);

  useEffect(() => {
    if (variant !== "global") return;
    let timer;
    if (isGlobalLoading) {
      timer = setTimeout(() => setShowGlobal(true), 400);
    } else {
      setShowGlobal(false);
    }
    return () => clearTimeout(timer);
  }, [isGlobalLoading, variant]);

  if (variant === "global" && !showGlobal) return null;

  // Sizing
  let dimensions = "56px";
  if (size) dimensions = size;
  else if (variant === "button") dimensions = "18px";
  else if (variant === "global") dimensions = "28px";

  const useGradient = !color;
  const primaryColor = color || "var(--accent-primary, #95ff50)";
  const secondaryColor = color || "var(--accent-secondary, #5ce21c)";
  const gradientId = "streamly-loader-grad";

  const gradientUrl = `url(#${gradientId})`;
  // NOTE: SVG geometry attributes (stroke, stop-color) do not resolve
  // CSS var() as presentation attributes — they must go through `style`.
  const ringStyle = (extra) => ({
    stroke: useGradient ? gradientUrl : primaryColor,
    ...extra,
  });
  const innerStyle = (extra) => ({
    stroke: useGradient ? secondaryColor : primaryColor,
    ...extra,
  });

  const spinnerCore = (
    <div style={{ position: "relative", width: dimensions, height: dimensions }}>
      <svg
        viewBox="0 0 44 44"
        style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}
      >
        {useGradient && (
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" style={{ stopColor: "var(--accent-primary, #95ff50)" }} />
              <stop offset="55%" style={{ stopColor: "var(--accent-primary, #95ff50)" }} />
              <stop offset="100%" style={{ stopColor: "var(--accent-secondary, #5ce21c)" }} />
            </linearGradient>
          </defs>
        )}
        {/* Outer ring */}
        <circle
          cx="22" cy="22" r="18"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="113"
          strokeDashoffset="75"
          opacity="0.2"
          style={ringStyle()}
        />
        <circle
          cx="22" cy="22" r="18"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="113"
          strokeDashoffset="75"
          style={ringStyle({ animation: "loader-dash 1.4s ease-in-out infinite" })}
        />
        {/* Inner ring (counter-rotate) */}
        <circle
          cx="22" cy="22" r="11"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="69"
          strokeDashoffset="40"
          opacity="0.2"
          style={innerStyle({ animation: "loader-spin-ccw 1.8s linear infinite", transformOrigin: "center" })}
        />
        <circle
          cx="22" cy="22" r="11"
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="69"
          strokeDashoffset="40"
          style={innerStyle({ animation: "loader-dash 2s ease-in-out infinite 0.3s" })}
        />
      </svg>
      {/* Center dot */}
      <div
        style={{
          position: "absolute",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: "20%",
          height: "20%",
          borderRadius: "50%",
          background: useGradient
            ? "var(--accent-gradient, linear-gradient(135deg, #95ff50, #5ce21c))"
            : primaryColor,
          boxShadow: useGradient
            ? "0 0 10px var(--accent-glow, rgba(149,255,80,0.6)), 0 0 22px var(--accent-glow, rgba(92,226,28,0.35))"
            : `0 0 8px ${primaryColor}80`,
          animation: "loader-pulse-center 1.2s ease-in-out infinite",
        }}
      />
    </div>
  );

  // ── Button variant ──
  if (variant === "button") {
    return (
      <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        {spinnerCore}
      </div>
    );
  }

  // ── Global variant ──
  if (variant === "global") {
    return (
      <div
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 999999,
          background: "rgba(10, 10, 13, 0.85)",
          backdropFilter: "blur(16px)",
          padding: "10px",
          borderRadius: "50%",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          pointerEvents: "none",
          animation: "loader-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {spinnerCore}
      </div>
    );
  }

  // ── Page / Inline variant ──
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: variant === "page" ? "100dvh" : "auto",
        width: "100%",
        padding: variant === "inline" ? "2rem" : "0",
        gap: "1.25rem",
        flex: variant === "page" ? 1 : undefined,
      }}
    >
      {spinnerCore}
      {variant === "page" && (
        <div
          style={{
            color: "#52525b",
            fontSize: "0.8rem",
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            animation: "loader-pulse-center 2s ease-in-out infinite",
          }}
        >
          Loading
        </div>
      )}
    </div>
  );
}
