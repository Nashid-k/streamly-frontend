import React from "react";
import { logError, logWarn } from "../utils/debugLogger";
import {
  isChunkLoadError,
  recoverFromChunkError,
  clearRuntimeCaches,
} from "../utils/chunkRecovery";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    logError("ErrorBoundary", `Render crash caught (route: ${window.location.pathname}). UI shows fallback; navigate to recover.`, error, {
      route: window.location.pathname,
      chunkFailure: isChunkLoadError(error),
      componentStack: errorInfo?.componentStack?.split("\n").slice(0, 5).join("\n"),
    });

    // Auto-recover stale deployment chunks: clear every Cache Storage
    // bucket, then reload into a fresh boot. Detection covers the
    // Chromium, WebKit and Firefox wording (see chunkRecovery.js) and a
    // 5s throttle keeps a persistently failing chunk out of a reload
    // loop — the fallback UI below stays as the escape hatch.
    if (isChunkLoadError(error) && !recoverFromChunkError(error)) {
      logWarn("recovery", "Stale-chunk reload suppressed by throttle — fallback shown.", {
        route: window.location.pathname,
      });
    }
  }

  render() {
    if (this.state.hasError) {
      if (isChunkLoadError(this.state.error)) {
        return (
          <div
            style={{
              padding: "4rem",
              textAlign: "center",
              minHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "1.5rem",
            }}
          >
            {/* Spinner */}
            <div
              style={{
                width: "48px",
                height: "48px",
                border: "3px solid rgba(var(--accent-primary-rgb), 0.2)",
                borderTopColor: "var(--accent-primary, #f43f5e)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <h1
              style={{ color: "#fff", fontSize: "1.5rem", fontWeight: 700, margin: 0 }}
            >
              Updating Application
            </h1>
            <p style={{ color: "#71717a", fontSize: "0.9rem", margin: 0 }}>
              Fetching the latest version...
            </p>
            {/* Escape hatch when the loop-guard suppressed auto-recovery
                (or a previous reload failed): wipe caches + reload. */}
            <button
              onClick={() => clearRuntimeCaches().finally(() => window.location.reload())}
              style={{
                background: "transparent",
                color: "#a1a1aa",
                border: "1px solid rgba(255,255,255,0.2)",
                padding: "0.6rem 1.4rem",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Reload App
            </button>
          </div>
        );
      }

      return (
        <div
          style={{
            padding: "4rem",
            textAlign: "center",
            minHeight: "80vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <h1
            style={{
              color: "#ef4444",
              marginBottom: "1rem",
              fontSize: "2.5rem",
            }}
          >
            Oops! Something went wrong.
          </h1>
          <p style={{ color: "#a1a1aa", marginBottom: "2rem" }}>
            We're sorry, an unexpected error occurred.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.href = "/";
              }}
              style={{
                background: "var(--accent-gradient, #e50914)",
                color: "var(--on-accent, white)",
                border: "none",
                padding: "0.8rem 1.5rem",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Return to Home
            </button>
            {/* Escape hatch when the loop guard suppressed auto-recovery
                (e.g. a stale chunk after a deploy): wipe caches + reload. */}
            <button
              onClick={() => clearRuntimeCaches().finally(() => window.location.reload())}
              style={{
                background: "transparent",
                color: "#a1a1aa",
                border: "1px solid rgba(255,255,255,0.2)",
                padding: "0.8rem 1.5rem",
                borderRadius: "8px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
