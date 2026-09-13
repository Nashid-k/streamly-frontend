import React from "react";
import { logError } from "../utils/debugLogger";

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
      componentStack: errorInfo?.componentStack?.split("\n").slice(0, 5).join("\n"),
    });

    // Auto-reload on Vite chunk splitting errors (deployment updates)
    if (
      error &&
      error.message &&
      (error.message.includes("Failed to fetch dynamically imported module") ||
        error.message.includes("Importing a module script failed"))
    ) {
      const lastReload = sessionStorage.getItem("chunk_reload_time");
      const now = Date.now();
      // Only reload if we haven't reloaded in the last 5 seconds to prevent infinite loops
      if (!lastReload || now - Number(lastReload) > 5000) {
        sessionStorage.setItem("chunk_reload_time", now.toString());
        // Clear all caches before reload to ensure fresh chunks
        if ('caches' in window) {
          caches.keys().then(function(names) {
            return Promise.all(names.map(function(name) { return caches.delete(name); }));
          }).then(function() {
            window.location.reload();
          }).catch(function() {
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
      }
    }
  }

  render() {
    if (this.state.hasError) {
      if (
        this.state.error?.message?.includes(
          "Failed to fetch dynamically imported module",
        ) ||
        this.state.error?.message?.includes("Importing a module script failed")
      ) {
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
        </div>
      );
    }
    return this.props.children;
  }
}
