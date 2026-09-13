import { logDebug, logWarn } from "./debugLogger";

/* ── Stale-chunk recovery ─────────────────────────────────────────────
   After a redeploy, browsers holding the old index.html request hashed
   chunks that no longer exist (Vercel purges old deploys), so Vite
   throws and React shows the ErrorBoundary fallback. Recovery = wipe
   every Cache Storage bucket (old SW assets + old HTML shell), then
   reload into a fresh boot.

   Detection is message-based because the exact wording varies across
   bundlers AND browsers — the same failure surfaces as
   "Failed to fetch dynamically imported module" (Chromium),
   "Importing a module script failed" (WebKit), and
   "error loading dynamically imported module" (Vite 7 / Firefox),
   matching case-insensitively. */

const CHUNK_ERROR_RE =
  /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|error loading module|failed to load module script/i;

export function isChunkLoadError(error) {
  return Boolean(
    error &&
      typeof error.message === "string" &&
      CHUNK_ERROR_RE.test(error.message),
  );
}

/** Delete every Cache Storage bucket (best effort — works everywhere). */
export function clearRuntimeCaches() {
  if (typeof window === "undefined" || !("caches" in window)) {
    return Promise.resolve();
  }
  return caches
    .keys()
    .then((names) => Promise.all(names.map((name) => caches.delete(name))))
    .catch((error) => {
      logWarn("recovery", "Cache Storage cleanup failed during reload.", error);
    });
}

/**
 * One-shot guard so a persistently failing chunk can never trap the
 * visitor in a reload loop (e.g. CDN outage). sessionStorage tracks the
 * last recovery; repeated failures within 5s skip the reload and let
 * the ErrorBoundary fallback UI show with a working reload button.
 */
export function shouldAttemptRecovery(throttleKey = "chunk_reload_time") {
  try {
    const last = sessionStorage.getItem(throttleKey);
    const now = Date.now();
    if (last && now - Number(last) < 5000) return false;
    sessionStorage.setItem(throttleKey, String(now));
    return true;
  } catch {
    return true; // sessionStorage unavailable — never block recovery
  }
}

/** Detect → throttle → clear caches → reload. Returns false when the
 *  throttle says "stand down" (ErrorBoundary then shows its fallback). */
export function recoverFromChunkError(error) {
  if (!isChunkLoadError(error)) return false;
  if (!shouldAttemptRecovery()) return false;
  logDebug("recovery", "Stale chunk detected — clearing caches and reloading.");
  clearRuntimeCaches().finally(() => window.location.reload());
  return true;
}
