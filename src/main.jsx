import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles/tokens.css";
import "./styles/header.css";
import "./styles/primitives.css";
import "./styles/hero.css";
import "./styles/buttons.css";
import "./styles/grids.css";
import "./styles/skeleton.css";
import "./styles/rails.css";
import "./styles/responsive.css";
import "./styles/search.css";
import "./styles/collections.css";
import "./styles/settings.css";
import "./styles/ui-kit.css";
import "./styles/player.css";
import "./styles/settings-ui.css";
import "./styles/modals.css";
import "./styles/discovery.css";
import { ToastProvider } from "./components/Toast.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { PreferencesProvider } from "./context/PreferencesContext.jsx";
import { I18nProvider } from "./i18n/index.jsx";

import { QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { queryClient } from "./queryClient";
import { initGlobalErrorLogging, logBootDiagnostics } from "./utils/debugLogger";
import { shouldAttemptRecovery, clearRuntimeCaches } from "./utils/chunkRecovery";

// Boot diagnostics — always visible in the console so "nothing loads" is
// traceable to offline / missing TMDB key / bad URL before anything else.
logBootDiagnostics("boot");
initGlobalErrorLogging();

// Auto-recover when old Vite chunks fail to preload after a deploy:
// wipe every Cache Storage bucket (old hashed assets + stale HTML shell)
// so the reload boots fresh. Shared 5s loop-guard with ErrorBoundary.
if (import.meta.env.PROD) {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    if (!shouldAttemptRecovery('vite_reload')) return;
    clearRuntimeCaches().finally(() => window.location.reload());
  });

  // The service worker can't `respondWith` a replacement for a hard
  // `<script src>` (the entry bundle in index.html) — when that 404s it is
  // exactly a stale shell after a deploy. It posts a message instead; wipe
  // the caches and reload here (same throttle so the fallback UI still wins
  // if the CDN is genuinely down).
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (!event.data || event.data.type !== 'STALE_SHELL_RECOVERY') return;
    if (!shouldAttemptRecovery('sw_stale_shell')) return;
    clearRuntimeCaches().finally(() => window.location.reload());
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PreferencesProvider>
            <I18nProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </I18nProvider>
          </PreferencesProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', async () => {
      try {
        const buildTime = typeof __BUILD_TIME !== 'undefined' ? __BUILD_TIME : Date.now();
        const reg = await navigator.serviceWorker.register(`/sw.js?v=${buildTime}`);
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg.addEventListener('updatefound', () => {
          const installing = reg.installing;
          if (installing) {
            installing.addEventListener('statechange', () => {
              if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                installing.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          }
        });
        setInterval(() => {
          if (document.visibilityState !== 'visible') return;
          reg.update().catch(() => {});
        }, 60000);
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      } catch {}
    });
  } else {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    }).catch(() => {});
  }
}
