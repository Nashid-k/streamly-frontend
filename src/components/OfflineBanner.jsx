import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/* ── Offline banner ────────────────────────────────────────────────────────
   A slim, non-blocking notice pinned under the header while the browser is
   offline. It never gates content (cached pages keep working) and disappears
   the moment connectivity returns. */
function OfflineBanner() {
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" && navigator.onLine === false
  );

  useEffect(() => {
    const goOffline = () => setOffline(true);
    const goOnline = () => setOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="offline-banner" role="status" aria-live="polite">
      <WifiOff size={16} strokeWidth={2} aria-hidden="true" />
      <span>You&rsquo;re offline. Some content may not load until you reconnect.</span>
    </div>
  );
}

export default OfflineBanner;
