/**
 * serverHealth — lightweight backend health monitoring for the SPA.
 *
 * Why: the API and the stream service run on cold-starting hosts (Render free
 * tier). A sleeping instance takes tens of seconds to boot, so requests hang
 * while it warms up. This module:
 *   • probes the real /health endpoints instead of guessing,
 *   • wakes a sleeping backend as soon as the app opens (pre-warm),
 *   • retries with capped exponential backoff while a backend is down,
 *   • sends a slow 5-minute keep-alive while this tab is open so a Render
 *     free instance never idles to sleep mid-session (backed up by the
 *     GitHub Actions keepalive when no tab is open),
 *   • still respects background tabs: no probes run while the tab is hidden.
 *
 * Pure module — no React.
 */
const API_BASE = (import.meta.env.VITE_API_URL || "").trim();
const STREAM_BASE = (import.meta.env.VITE_STREAM_SERVICE_URL || "").trim();

/** Derive the API host's health URL. Backend serves GET /health at the root. */
export function apiHealthUrl() {
  if (/^https?:\/\//.test(API_BASE)) {
    return API_BASE.replace(/\/api\/?$/, "") + "/health";
  }
  // Relative VITE_API_URL (same-origin dev/proxy) — still root-served.
  return "/health";
}

/** Derive the stream service's health URL, or null when not configured. */
export function streamHealthUrl() {
  if (!STREAM_BASE) return null;
  return STREAM_BASE.replace(/\/+$/, "") + "/api/health";
}

const TARGETS = {
  api: { name: "api", status: "unknown", latencyMs: null, checkedAt: 0, reason: null },
  stream: { name: "stream", status: "unknown", latencyMs: null, checkedAt: 0, reason: null },
};

const listeners = new Set();
let started = false;
let timer = null;
let keepaliveTimer = null;
let consecutiveFailures = 0;
let visibilityHandler = null;
let wakeupHandler = null;

const INITIAL_DELAY_MS = 300;   // probe almost immediately so cold backends start waking
const MIN_BACKOFF_MS = 2500;   // faster retry cycle on Render free tier / Vercel cold starts
const MAX_BACKOFF_MS = 20000;  // cap so we never stop probing a stuck backend
const STALE_AFTER_MS = 30000;  // re-probe sooner — cold backends can die fast
const KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000; // ping both backends every 5 min while
  // the tab is open so a Render free instance (<15min idle) never sleeps mid-session.

function snapshot() {
  return {
    api: { ...TARGETS.api },
    stream: { ...TARGETS.stream },
    allHealthy: TARGETS.api.status === "healthy" && TARGETS.stream.status !== "down",
  };
}

function notify() {
  const snap = snapshot();
  for (const cb of Array.from(listeners)) {
    try { cb(snap); } catch { /* listener errors must not break the monitor */ }
  }
}

function clearTimer() {
  if (timer) { clearTimeout(timer); timer = null; }
}

/**
 * Probe one health endpoint. Resolves quickly on network failure / timeout so
 * the caller can classify the backend without waiting on a cold start.
 */
export async function probeHealth(url, timeoutMs = 12000) {
  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  const elapsed = () =>
    Math.round(
      (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt,
    );
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: ctrl.signal,
      priority: "low",
    });
    return { ok: res.ok, latencyMs: elapsed(), status: res.status, reason: null };
  } catch (err) {
    const aborted = err && (err.name === "AbortError" || err.code === 20);
    return { ok: false, latencyMs: elapsed(), status: 0, reason: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkTargets() {
  const now = Date.now();
  const streamUrl = streamHealthUrl();
  const urls = streamUrl ? [apiHealthUrl(), streamUrl] : [apiHealthUrl()];
  const targets = streamUrl ? [TARGETS.api, TARGETS.stream] : [TARGETS.api];

  const results = await Promise.all(urls.map((u) => probeHealth(u)));

  targets.forEach((target, i) => {
    const r = results[i];
    target.latencyMs = r.latencyMs;
    target.checkedAt = now;
    // healthy -> healthy stays; a single miss degrades, repeated misses drop to down
    target.status = r.ok ? "healthy" : target.status === "healthy" ? "degraded" : "down";
    target.reason = r.ok ? null : r.reason || null;
  });

  return snapshot();
}

function scheduleNextCycle() {
  if (!started) return;
  const snap = snapshot();
  if (snap.allHealthy) {
    consecutiveFailures = 0;
    return; // healthy — idle. Re-checks happen on visibility/wakeup events only.
  }
  const delay = Math.min(MAX_BACKOFF_MS, MIN_BACKOFF_MS * 2 ** consecutiveFailures);
  consecutiveFailures += 1;
  timer = setTimeout(() => { cycle(); }, delay);
}

async function cycle() {
  if (!started) return;
  if (typeof document === "undefined" || document.visibilityState !== "visible") {
    return; // never burn network while the tab is hidden
  }
  clearTimer();
  await checkTargets(); // updates TARGETS in place
  notify();
  scheduleNextCycle();
}

/** Probe now (or very soon) — used when the tab returns or a request is slow. */
function kick() {
  if (!started) return;
  if (typeof document === "undefined" || document.visibilityState === "hidden") return;
  if (timer) return; // a cycle is already scheduled
  consecutiveFailures = 0;
  timer = setTimeout(() => { cycle(); }, 0);
}

/**
 * Start monitoring. Idempotent. Call once at app boot.
 * - onChange(snapshot): called after every completed probe round.
 * - onHealthy(snapshot): called when both backends come back healthy.
 */
export function startServerHealthMonitor({ onChange, onHealthy } = {}) {
  if (started) return stopServerHealthMonitor;
  started = true;

  if (onChange) listeners.add(onChange);
  if (onHealthy) listeners.add((s) => { if (s.allHealthy) onHealthy(s); });

  visibilityHandler = () => {
    if (document.visibilityState !== "visible") { clearTimer(); return; }
    const api = TARGETS.api;
    const stale =
      Date.now() - (api.checkedAt || 0) > STALE_AFTER_MS ||
      api.status === "down" ||
      api.status === "degraded";
    if (stale) kick();
  };

  // A slow in-flight request means the user is waiting on a cold start —
  // probe immediately so the banner can be dismissed as soon as it answers.
  wakeupHandler = () => kick();

  document.addEventListener("visibilitychange", visibilityHandler);
  window.addEventListener("server-wakeup", wakeupHandler);

  // Pre-warm: probe almost immediately so a sleeping Render/Vercel backend
  // starts waking before the user's first click.
  timer = setTimeout(() => { cycle(); }, INITIAL_DELAY_MS);

  // Keep-alive: while this tab is open AND visible, re-probe on a steady
  // cadence. Even when healthy this fires a health request every 5 minutes,
  // which is what keeps a Render free instance from idling to sleep between
  // user actions. (The GitHub Actions keepalive covers the no-tab-open case.)
  keepaliveTimer = setInterval(() => {
    if (typeof document === "undefined" || document.visibilityState !== "visible") return;
    cycle();
  }, KEEPALIVE_INTERVAL_MS);

  return stopServerHealthMonitor;
}

export function stopServerHealthMonitor() {
  if (!started) return;
  started = false;
  clearTimer();
  if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
  listeners.clear();
  if (visibilityHandler) {
    document.removeEventListener("visibilitychange", visibilityHandler);
    visibilityHandler = null;
  }
  if (wakeupHandler) {
    window.removeEventListener("server-wakeup", wakeupHandler);
    wakeupHandler = null;
  }
}

/**
 * Internal — clears all state. Harmless in prod; used by tests for isolation.
 */
export function resetServerHealthState() {
  stopServerHealthMonitor();
  consecutiveFailures = 0;
  for (const target of [TARGETS.api, TARGETS.stream]) {
    target.status = "unknown";
    target.latencyMs = null;
    target.checkedAt = 0;
    target.reason = null;
  }
}

/** Current health snapshot for one-off reads (e.g. debugging). */
export function getServerHealth() {
  return snapshot();
}
