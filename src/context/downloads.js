import { createContext, useContext } from "react";

/* Context + hook live apart from <DownloadsProvider> so fast-refresh only ever
   sees component exports in DownloadsContext.jsx (react-refresh constraint).

   The store is SESSION-LOCAL: Streamly has no backend storage, so an active
   or finished download exists only in this provider's memory. The navbar
   badge + /downloads page read it; DownloadModal writes it. */

export const DownloadsContext = createContext(null);

/* No-op fallback so isolated component tests never need the provider. */
export const DEFAULT_DOWNLOADS_FALLBACK = {
  downloads: [],
  activeCount: 0,
  registerDownload: () => "",
  updateDownload: () => {},
  cancelDownload: () => {},
  removeDownload: () => {},
};

export function useDownloads() {
  const ctx = useContext(DownloadsContext);
  if (!ctx) return DEFAULT_DOWNLOADS_FALLBACK;
  return ctx;
}