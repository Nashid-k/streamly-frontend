import { useEffect, useState } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useI18n } from "../i18n/index.jsx";
import { StreamlyLoader } from "./StreamlyLoader";

/* Universal Loader — the branded neon ring (see StreamlyLoader) in every
   data-loading slot, so the app has ONE spinner look: page, inline, button
   and the delayed global badge. Route changes use skeleton shapes
   (RouteFallback) and the player's cold open uses its own ring under the
   title art; no GIF loader path exists. The old liquid-wave dots and every
   ad-hoc spinner (lucide Loader2, Tailwind animate-spin, .btn-spinner) were
   replaced by this. */

export default function Loader({ variant = "page", size }) {
  const isFetching = useIsFetching();
  const isMutating = useIsMutating();
  const { t } = useI18n();
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

  let dimensions = 56;
  if (size) dimensions = size;
  else if (variant === "button") dimensions = 18;
  else if (variant === "global") dimensions = 28;

  // ── Button variant ──
  if (variant === "button") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <StreamlyLoader size={dimensions} label="" />
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
          zIndex: "var(--z-toast)",
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
        <StreamlyLoader size={dimensions} label="" />
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
        // drops the footer a screen down and reads as a reload. 55dvh keeps
        // the spinner centred in the content well while the header/footer
        // hold their place.
        minHeight: variant === "page" ? "55dvh" : "auto",
        width: "100%",
        padding: variant === "inline" ? "2rem" : "0",
        gap: "1.25rem",
        flex: variant === "page" ? 1 : undefined,
      }}
    >
      <StreamlyLoader size={dimensions} label="" />
      {variant === "page" && (
        <div
          style={{
            color: "var(--text-muted)",
            fontSize: "0.8rem",
            fontWeight: 500,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {t("common.loading")}
        </div>
      )}
    </div>
  );
}
