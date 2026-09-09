import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { ToastProvider } from "./components/Toast.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { PreferencesProvider } from "./context/PreferencesContext.jsx";

import { QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import { queryClient } from "./queryClient";

// Auto-reload when old Vite chunks fail to load due to deployment updates
if (import.meta.env.PROD) {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    const lastReload = sessionStorage.getItem('vite_reload');
    if (!lastReload || Date.now() - Number(lastReload) > 5000) {
      sessionStorage.setItem('vite_reload', Date.now().toString());
      window.location.reload();
    }
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <PreferencesProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </PreferencesProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const buildTime = typeof __BUILD_TIME !== 'undefined' ? __BUILD_TIME : Date.now();
      const reg = await navigator.serviceWorker.register(`/sw.js?v=${buildTime}`);
      setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        reg.update().catch(() => {});
      }, 60000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch {}
  });
}
