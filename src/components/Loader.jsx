import React, { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";

/* Liquid-wave loader — three dots that flow upward in a staggered wave.
   Replaces the old dual-ring SVG spinner, which read as mechanical. The wave
   is organic: each dot scales and lifts on a 1.4 s cycle, offset by 0.14 s so
   the eye reads one continuous ripple rather than three separate pulses. */

function WaveDots({ dimensions, color }) {
  const dotSize = Math.max(4, Math.round(parseFloat(dimensions) * 0.22));
  const gap = Math.max(3, Math.round(dotSize * 0.7));
  const accent = color || "var(--accent-primary, #95ff50)";
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: `${gap}px`,
        width: dimensions,
        height: dimensions,
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: "50%",
            background: accent,
            animation: `loader-wave 1.4s ease-in-out ${i * 0.14}s infinite`,
            willChange: "transform, opacity",
          }}
        />
      ))}
    </div>
  );
}

/**
 * Universal Loader — liquid-wave dots with context-aware colours.
 *
 * Variants:
 * - 'page': Full-page centred wave for Suspense/loading states
 * - 'inline': Section-bound wave
 * - 'button': Tiny 18px wave for buttons
 * - 'global': Non-blocking frosted-glass badge fixed bottom-right for
 *   background fetches. Fades in after 400 ms so a fast request never flashes.
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

  // ── Button variant ──
  if (variant === "button") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <WaveDots dimensions={dimensions} color={color} />
      </span>
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
          WebkitBackdropFilter: "blur(16px)",
          padding: "10px",
          borderRadius: "50%",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          pointerEvents: "none",
          animation: "loader-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        <WaveDots dimensions={dimensions} color={color} />
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
        // Content-area height, not 100dvh: as a route Suspense fallback this
        // sits inside .app-main, where a full-viewport box blanks the page,
        // drops the footer a screen down and reads as a reload. 55dvh keeps the
        // spinner centred in the content well while the header/footer hold
        // their place.
        minHeight: variant === "page" ? "55dvh" : "auto",
        width: "100%",
        padding: variant === "inline" ? "2rem" : "0",
        gap: "1.25rem",
        flex: variant === "page" ? 1 : undefined,
      }}
    >
      <WaveDots dimensions={dimensions} color={color} />
      {variant === "page" && (
        <div
          style={{
            color: "#52525b",
            fontSize: "0.8rem",
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            animation: "loader-wave 1.4s ease-in-out 0.28s infinite",
          }}
        >
          Loading
        </div>
      )}
    </div>
  );
}
