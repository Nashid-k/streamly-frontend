// src/api/previewThumbs.js — scrubber thumbnail decoder for the native player.
//
// Netflix/YouTube show a frame preview while you hover or drag the scrubber.
// Our sources are plain HLS without sprite sheets, so we generate previews by
// decoding off-screen: a hidden hls.js instance (same transport as the main
// player — createStreamlyLoader, so relayed bytes flow identically) is seeked
// to a time and the paused frame is drawn onto a small canvas.
//
//   · One capture at a time; a newer request supersedes the older one.
//   · A hidden <video> + 2D canvas (works everywhere; cheap at 320x180).
//   · Results are cached per (sourceKey, time rounded to 8s), so a full drag
//     across the timeline costs ~a handful of decodes. The cache resets when
//     the source changes (new title / quality / referer token).
//
// Previews must NEVER break scrubbing: every failure resolves null, and only
// real pipeline failures are logged (via debugLogger, per repo contract).

import Hls from "hls.js";
import { createStreamlyLoader } from "./nativeHlsLoader.js";
import { logWarn } from "../utils/debugLogger.js";

const CACHE_STEP_SECONDS = 8;
const SEEK_SETTLE_MS = 220;
const MOUNT_TIMEOUT_MS = 8000;
const MAX_CACHE_ENTRIES = 240;

let hls = null;
let video = null;
let canvas = null;
let ctx = null;
let currentKey = null;
let currentRefUrl = null;
let captures = new Map();
// Captures are serialized on this chain (one <video> can only seek to one
// place), and a newer request supersedes queued ones — a scrub drag must not
// replay every hover position it passed through.
let chain = Promise.resolve();
let latestReq = 0;

const cacheKeyOf = (key, t) => `${key}@${Math.max(0, Math.round(t / CACHE_STEP_SECONDS))}`;

function teardown() {
  if (hls) {
    try {
      hls.destroy();
    } catch {
      // already torn down
    }
  }
  hls = null;
  if (video) {
    try {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.remove();
    } catch {
      // best-effort node cleanup
    }
  }
  video = null;
  canvas = null;
  ctx = null;
  currentKey = null;
  currentRefUrl = null;
}

/* Drop cached thumbs — with a sourceKey only that source's entries, else all. */
export function clearPreviewCache(sourceKey) {
  if (sourceKey == null) {
    captures.clear();
    return;
  }
  for (const k of captures.keys()) {
    if (k.startsWith(`${sourceKey}@`)) captures.delete(k);
  }
}

/* Full reset (title switch / player unmount): drop the decoder and the cache. */
export function resetPreviewPipeline() {
  teardown();
  captures = new Map();
}

async function ensureMounted({ url, refUrl, sourceKey }) {
  if (hls && currentKey === sourceKey && canvas && ctx) return;
  teardown();
  currentKey = sourceKey;
  currentRefUrl = refUrl;

  video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.playsInline = true;
  video.setAttribute("aria-hidden", "true");
  video.style.cssText =
    "position:fixed;left:-9999px;top:0;width:160px;height:90px;opacity:0;pointer-events:none;";
  document.body.appendChild(video);

  canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 180;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("preview-canvas-unavailable");
  ctx = context;

  hls = new Hls({
    loader: createStreamlyLoader({ getRefUrl: () => currentRefUrl }),
    // Preview needs only the video track around the seek point: cap the buffer
    // so a seek does not drag the whole film through MSE.
    maxBufferLength: 6,
    maxBufferSize: 12 * 1000 * 1000,
    backBufferLength: 0,
    // No ABR racing — one steady rendition keeps decodes predictable.
    abrEwmaDefaultEstimate: 2_000_000,
    startLevel: -1,
    capLevelToPlayerSize: true,
    autoStartLoad: true,
  });
  hls.loadSource(url);
  hls.attachMedia(video);

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("preview-mount-timeout")), MOUNT_TIMEOUT_MS);
    const onFatal = (_e, data) => {
      if (data?.fatal) {
        clearTimeout(timer);
        hls?.off(Hls.Events.ERROR, onFatal);
        reject(new Error(`preview-hls-fatal:${data?.details || "error"}`));
      }
    };
    const onParsed = () => {
      clearTimeout(timer);
      hls?.off(Hls.Events.ERROR, onFatal);
      hls?.off(Hls.Events.MANIFEST_PARSED, onParsed);
      resolve();
    };
    hls.on(Hls.Events.ERROR, onFatal);
    hls.on(Hls.Events.MANIFEST_PARSED, onParsed);
  });
}

async function captureAt(seconds) {
  const v = video;
  if (!v) throw new Error("preview-video-missing");
  await new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("preview-seek-timeout"));
    }, 4000);
    const cleanup = () => {
      v.removeEventListener("seeked", onSeeked);
      clearTimeout(timer);
    };
    v.addEventListener("seeked", onSeeked, { once: true });
    v.currentTime = seconds;
  });
  // Let the decoder paint the frame before grabbing it.
  await new Promise((r) => setTimeout(r, SEEK_SETTLE_MS));
  ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.72));
  if (!blob) return null;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("preview-encode-failed"));
    reader.readAsDataURL(blob);
  });
}

/* Public API: resolve a data URL for `seconds` on the given source, or null on
   any failure. One capture at a time — queued requests are skipped when a
   newer one exists (a drag supersedes the positions it passed through). */
export async function getPreviewThumb({ url, refUrl, sourceKey, seconds }) {
  const key = cacheKeyOf(sourceKey, seconds);
  const hit = captures.get(key);
  if (hit) return hit;
  const mine = ++latestReq;
  const job = chain.then(async () => {
    if (mine !== latestReq) return captures.get(key) || null;
    try {
      await ensureMounted({ url, refUrl, sourceKey });
      if (mine !== latestReq) return captures.get(key) || null;
      const dataUrl = await captureAt(seconds);
      if (!dataUrl) return null;
      if (captures.size >= MAX_CACHE_ENTRIES) captures.delete(captures.keys().next().value);
      captures.set(key, dataUrl);
      return dataUrl;
    } catch (error) {
      logWarn("native", "Scrubber preview unavailable", { message: error?.message });
      if (/fatal|timeout|missing|unavailable/.test(String(error?.message || ""))) teardown();
      return null;
    }
  });
  chain = job.then(
    () => {},
    () => {},
  );
  return job;
}
