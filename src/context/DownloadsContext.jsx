// src/context/DownloadsContext.jsx — Session-local downloads store provider.
import { useCallback, useMemo, useRef, useState } from "react";
import { DownloadsContext } from "./downloads";
import { logDebug } from "../utils/debugLogger";

/* SESSION-LOCAL download registry. Cheap by design: a register/update/cancel
   cycle for a handful of concurrent downloads. No persistence — Streamly has
   no backend, download state is inherently ephemeral (a save target is
   already written to disk by the time it reaches "done"). */

export function DownloadsProvider({ children }) {
  const [downloads, setDownloads] = useState([]);
  const idCounterRef = useRef(0);

  const registerDownload = useCallback((record) => {
    idCounterRef.current += 1;
    const id = `dl-${idCounterRef.current}`;
    setDownloads((prev) => [{ id, ...record }, ...prev]);
    logDebug("downloads", "Registered download.", { id, title: record?.title });
    return id;
  }, []);

  const updateDownload = useCallback((id, patch) => {
    setDownloads((prev) =>
      prev.map((d) => (d.id === id ? { ...d, ...patch } : d)),
    );
  }, []);

  const cancelDownload = useCallback((id) => {
    setDownloads((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        try {
          d.abort?.();
        } catch (err) {
          logDebug("downloads", "Abort call threw while cancelling.", { id, message: err?.message });
        }
        return { ...d, status: "cancelled" };
      }),
    );
  }, []);

  const removeDownload = useCallback((id) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      downloads,
      activeCount: downloads.filter((d) => d.status === "downloading").length,
      registerDownload,
      updateDownload,
      cancelDownload,
      removeDownload,
    }),
    [downloads, registerDownload, updateDownload, cancelDownload, removeDownload],
  );

  return <DownloadsContext.Provider value={value}>{children}</DownloadsContext.Provider>;
}