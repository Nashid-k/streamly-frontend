// src/api/downloadService.js — client half of the browser-only download flow.
//   1. resolveVidsrc / resolveVidcore  -> HLS ladder (both serverless, same shape)
//   2. buildManifest(source, variant) -> concrete segment URL list
//   3. saveStream(...)                -> bounded Range chunks written to disk
//
// Byte transport: Vercel caps a function response at 4.5MB, so segments are
// pulled ONE at a time as <= ~3.5MB Range chunks, with the server's
// x-streamly-more header saying when the piece ended. A CDN that supports CORS +
// Range is pulled DIRECTLY (zero serverless bandwidth); everything else rides
// the relay, preferring the Cloudflare worker (relayProxy.js) when
// VITE_STREAMLY_RELAY_URL is set — whole segment per request, no 4.5MB cap, no
// Vercel egress — and falling back to /api/downloadify.
//
// Saving mirrors a browser download: File System Access API writes each chunk
// straight to the chosen file (a 2GB movie never lives in RAM), else we assemble
// a Blob and click an <a download>. Cancel is an AbortController; the
// PauseController below pauses the loops without killing the save.

import {
  KIND_FMP4,
  estimateBytes,
  formatBytes,
  safeFileName,
  variantLabel,
} from "../utils/downloadQuality.js";
import { logDebug, logError, logInfo, logWarn } from "../utils/debugLogger.js";
import { deriveSliceMore, relayProxyConfig } from "./relayProxy.js";
import { isRefererGated } from "./nativeHlsLoader.js";

const ENDPOINT = "/api/downloadify";
const CHUNK_MAX = 3.5 * 1024 * 1024;
// How many segments download in parallel. Videos stitch fine when bytes are
// written to the file in ORDER; only the network fetch needs to overlap.
const SEGMENT_CONCURRENCY = 4;

export class DownloadUnavailableError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "DownloadUnavailableError";
    this.code = code || "unavailable";
  }
}

/* Pause gate shared by the download modal and the /downloads page: one instance
   rides each download, and saveStream's fetch loops await waitIfPaused() between
   requests — so a pause stops pulling bytes without losing what is on disk.
   Aborts interrupt a paused gate too (the wait races the signal), so Cancel
   always lands. */
export function createPauseController() {
  let paused = false;
  let release = null;
  let gate = Promise.resolve();
  return {
    isPaused: () => paused,
    pause() {
      if (paused) return;
      paused = true;
      gate = new Promise((resolve) => {
        release = resolve;
      });
    },
    resume() {
      if (!paused) return;
      paused = false;
      release?.();
      release = null;
      gate = Promise.resolve();
    },
    async waitIfPaused({ signal } = {}) {
      if (signal?.aborted) return;
      while (paused) {
        if (signal) {
          const abortPromise = new Promise((resolve) => {
            if (signal.aborted) return resolve();
            signal.addEventListener("abort", () => resolve(), { once: true });
          });
          await Promise.race([gate, abortPromise]);
        } else {
          await gate;
        }
        if (signal?.aborted) return;
      }
    },
  };
}

/* Raw transport (segment bytes, playlist text) relay: proxy-first when
   configured, /api/downloadify as the automatic fallback, and re-sliced at
   CHUNK_MAX so the Vercel leg's 4.5MB cap is never breached mid-file.
   Resolution/manifest JSON never reaches here — the proxy cannot parse
   upstreams, only pipe bytes. */
async function fetchTransport(body, { signal }) {
  const proxy = relayProxyConfig();
  const candidates = proxy ? [proxy, null] : [null];
  const isSegment = body.action === "segment";
  const start = Math.max(0, Math.floor(Number(body.range?.start) || 0));
  // An upgraded worker forwards ?referer= upstream, so it can serve referer-gated
  // CDNs instead of 403ing and falling back to Vercel on every byte.
  const referer = body.refUrl ? String(body.refUrl) : "";
  for (let index = 0; index < candidates.length; index += 1) {
    const cfg = candidates[index];
    try {
      const response = cfg
        ? await fetch(
            `${cfg.base}?url=${encodeURIComponent(isSegment ? body.url : body.playlistUrl)}${
              referer ? `&referer=${encodeURIComponent(referer)}` : ""
            }`,
            {
              method: "GET",
              headers: isSegment ? { range: `bytes=${start}-${start + cfg.slice - 1}` } : undefined,
              signal,
            },
          )
        : await fetch(ENDPOINT, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(isSegment ? { ...body, range: { start, max: CHUNK_MAX } } : body),
            signal,
          });
      if (response.ok || index === candidates.length - 1) return response;
      await response.body?.cancel?.().catch?.(() => {});
    } catch (error) {
      // A throw from the proxy candidate falls through to Vercel; the last
      // candidate's failure is the one that surfaces.
      if (error?.name === "AbortError") throw error;
      if (index === candidates.length - 1) throw error;
    }
  }
  throw new DownloadUnavailableError("Download relay unreachable.", "offline");
}

async function post(body, { signal, as = "json" } = {}) {
  let response;
  try {
    response =
      body.action === "segment" || body.action === "playlist"
        ? await fetchTransport(body, { signal })
        : await fetch(ENDPOINT, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal,
          });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    logError("download", "downloadify request failed (is the function deployed?)", error, {
      action: body?.action,
    });
    throw new DownloadUnavailableError(
      "Download service unreachable. Offline downloads need the deployed app (Vercel).",
      "offline",
    );
  }

  if (as === "buffer") {
    if (!response.ok) {
      // A 502 {ok:false, code:"segment-fetch-failed"} means the upstream refused the
      // segment — keep the server's real code so saveStream can tell that from a blip.
      let code = "http";
      let message = `Segment request failed (${response.status}).`;
      try {
        const text = await response.text().catch(() => "");
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && parsed.ok === false) {
          if (parsed.code) code = parsed.code;
          if (parsed.error) message = parsed.error;
        }
      } catch {
        // Non-JSON body (a proxy error page) — keep the generic message/code.
      }
      throw new DownloadUnavailableError(message, code);
    }
    const ab = await response.arrayBuffer();
    const bytes = new Uint8Array(ab);
    // x-streamly-more comes from downloadify; the proxy exposes content-range
    // instead — deriveSliceMore answers "does the segment continue?" for both.
    const more = deriveSliceMore(response, bytes.length, relayProxyConfig()?.slice || CHUNK_MAX);
    return { bytes, more };
  }

  if (as === "text") {
    // Raw-text actions (`playlist`): the body is upstream text, not JSON, but a
    // non-OK answer is still the relay's JSON error envelope — parse it as above.
    if (!response.ok) {
      let code = "http";
      let message = `Request failed (${response.status}).`;
      try {
        const text = await response.text().catch(() => "");
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && parsed.ok === false) {
          if (parsed.code) code = parsed.code;
          if (parsed.error) message = parsed.error;
        }
      } catch {
        // Non-JSON body (a proxy error page) — keep the generic message/code.
      }
      throw new DownloadUnavailableError(message, code);
    }
    return response.text();
  }

  // On plain static hosting the SPA catch-all answers with index.html.
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new DownloadUnavailableError(
      "Download service returned a non-JSON response — the serverless function isn't running.",
      "offline",
    );
  }

  const json = await response.json().catch(() => ({}));
  if (!json.ok) {
    throw new DownloadUnavailableError(json.error || `Request failed (${response.status}).`, json.code);
  }
  return json;
}

/* Direct-CORS probe: Range 0-0 must return a readable allow-origin AND a
   content-range (whose total seeds progress). Anything else falls to the relay. */
async function probeDirect(url, { signal }) {
  // Referer-gated CDNs 403 a bare browser probe on sight and probe bursts trip
  // their WAF, so skip the probe and let every byte of those origins ride the
  // referer-carrying relay.
  if (isRefererGated(url)) return { ok: false, total: 0 };
  try {
    const res = await fetch(url, { headers: { range: "bytes=0-0" }, signal });
    if (!res.ok) {
      res.body?.cancel?.().catch?.(() => {});
      return { ok: false, total: 0 };
    }
    const acao = res.headers.get("access-control-allow-origin");
    const allowed =
      acao === "*" || (typeof window !== "undefined" && acao === window.location.origin);
    const match = /bytes\s+0-0\/(\d+)/i.exec(res.headers.get("content-range") || "");
    res.body?.cancel?.().catch?.(() => {});
    if (!allowed || !match) return { ok: false, total: 0 };
    const total = Number(match[1]);
    return { ok: total > 0, total };
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { ok: false, total: 0 };
  }
}

export const downloadService = {
  /** Normalize a resolver `{ ok, source, variants }` payload into the shape
      the sheet consumes (labeled variants, per-variant index). */
  normalizeResolved(data) {
    const variants = (data.variants || []).map((v, index) => ({
      ...v,
      index,
      label: variantLabel(v),
      estimatedBytes: estimateBytes(v.bandwidth, 0),
    }));
    return { source: data.source, variants };
  },

  /** Resolve an allow-listed embed host's URL into the qualities it offers. */
  async resolveDownload(embedUrl, { signal } = {}) {
    const data = await post({ action: "resolve", embedUrl }, { signal });
    return this.normalizeResolved(data);
  },

  /** Resolve the VidSrc (Alt) provider (action "resolvevidsrc") — the only
      third-party provider the downloader scrapes server-side. `season`/`episode`
      only matter for TV and default to whatever VidSrc serves. */
  async resolveVidsrc({ type, id, season, episode }, { signal } = {}) {
    const kind = type === "tv" ? "tv" : "movie";
    const body = { action: "resolvevidsrc", type: kind, id: String(id || "") };
    if (kind === "tv") {
      if (season != null) body.season = String(season);
      if (episode != null) body.episode = String(episode);
    }
    const data = await post(body, { signal });
    const resolved = this.normalizeResolved(data);
    logInfo("download", `Resolved ${resolved.variants.length} downloadable variant(s) via VidSrc (Alt).`, {
      type: kind,
      id,
      season: season ?? null,
      episode: episode ?? null,
      variants: resolved.variants.map((v) => v.label),
    });
    return resolved;
  },

  /** Resolve the VidCore provider (Server 5, action "resolvevidcore"); same
      contract as resolveVidsrc. */
  async resolveVidcore({ type, id, season, episode }, { signal } = {}) {
    const kind = type === "tv" ? "tv" : "movie";
    const body = { action: "resolvevidcore", type: kind, id: String(id || "") };
    if (kind === "tv") {
      if (season != null) body.season = String(season);
      if (episode != null) body.episode = String(episode);
    }
    const data = await post(body, { signal });
    const resolved = this.normalizeResolved(data);
    logInfo("download", `Resolved ${resolved.variants.length} downloadable variant(s) via VidCore.`, {
      type: kind,
      id,
      season: season ?? null,
      episode: episode ?? null,
      variants: resolved.variants.map((v) => v.label),
    });
    return resolved;
  },

  /** Fetch a raw m3u8 through the relay — the server supplies the owning player's
      referer, which a browser fetch cannot send. Throws DownloadUnavailableError
      with the relay's real code. */
  async fetchPlaylistText(playlistUrl, refUrl, { signal } = {}) {
    const text = await post({ action: "playlist", playlistUrl, refUrl }, { signal, as: "text" });
    logDebug("download", `Relayed playlist text (${text.length} chars).`, { playlistUrl });
    return text;
  },

  /** Expand a chosen variant into a concrete segment list. */
  async buildManifest(source, variant, { signal } = {}) {
    const refUrl = source?.refUrl || source?.url;
    const data = await post(
      {
        action: "manifest",
        playlistUrl: variant.uri,
        refUrl,
      },
      { signal },
    );
    logDebug("download", `Manifest: ${data.count} segment(s), kind=${data.kind}.`, {
      duration: data.duration,
    });
    return data;
  },

  /**
   * Open the native Save-As picker. MUST be called synchronously from the click
   * handler (browsers drop user activation across awaits). Null when the API or
   * gesture is unavailable; AbortError when the viewer cancels.
   */
  async pickSaveTarget(filename) {
    if (typeof window === "undefined" || !window.showSaveFilePicker) return null;
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename });
      return await handle.createWritable();
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      logWarn("download", "Save picker unavailable — falling back to in-memory download.", {
        message: error?.message,
      });
      return null;
    }
  },

  /**
   * Fetch every segment and persist the file.
   * @param {FileSystemWritableFileStream|null} writable - from pickSaveTarget
   * @returns {{bytes:number, filename:string, method:'fs'|'blob'}}
   */
  async saveStream({
    manifest,
    source,
    baseName,
    writable = null,
    // "browser" forces the in-memory <a download> path even when a writable exists
    // — the modal's "Save to browser Downloads" toggle.
    mode,
    onProgress,
    // Estimated total (bandwidth × duration) so progress `ratio` runs off
    // bytes / totalBytes in real time instead of snapping one segment at a time.
    totalBytes: targetBytes = 0,
    signal,
    pause,
  }) {
    const kind = manifest.kind || KIND_FMP4;
    const extension = kind === "ts" ? "ts" : "mp4";
    const filename = `${safeFileName(baseName)}.${extension}`;
    const liveSegments = manifest.segments || [];
    const liveInitUrl = manifest.initUrl || null;
    const liveRefUrl = source?.refUrl || source?.url;

    let writer = writable;
    let memoryChunks = null;
    let method = writer ? "fs" : "blob";
    // Browser-download mode never opens a save picker: buffer in memory and
    // hand the file to the browser's own download manager (Ctrl+J).
    if (mode === "browser") {
      writer = null;
      method = "blob";
    }
    let bytes = 0;

    // Throughput is measured where bytes ARRIVE, not where they are flushed: with
    // SEGMENT_CONCURRENCY in flight a whole window can be written in milliseconds,
    // so a delta between _write events reads like RAM speed while the connection
    // fed that buffer over seconds. Sample arrival time + bytes.
    const RATE_WINDOW_MS = 3000;
    let received = 0;
    const rateSamples = [];
    const stamp = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const noteReceived = (chunk) => {
      if (!chunk || chunk.length === 0) return;
      received += chunk.length;
      const t = stamp();
      rateSamples.push({ t, b: received });
      // Keep at least the two most recent samples so an active-but-sluggish
      // connection (slow chunks > window apart) still reports a real rate.
      while (rateSamples.length > 2 && t - rateSamples[0].t > RATE_WINDOW_MS) rateSamples.shift();
    };
    const networkSpeed = () => {
      if (rateSamples.length < 2) return 0;
      const first = rateSamples[0];
      const last = rateSamples[rateSamples.length - 1];
      const dt = (last.t - first.t) / 1000;
      if (dt <= 0) return 0;
      return Math.round((last.b - first.b) / dt);
    };

    // Incremental disk writes — a long movie must not sit in RAM.
    if (mode !== "browser" && !writer && !manifest.direct) {
      try {
        writer = await this.pickSaveTarget(filename);
        if (writer) method = "fs";
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        writer = null;
      }
    }
    if (!writer) memoryChunks = [];

    const write = async (chunk) => {
      if (!chunk || chunk.length === 0) return;
      bytes += chunk.length;
      if (writer) await writer.write(chunk);
      else memoryChunks.push(chunk);
      // Every chunk that reaches the file also advances the progress readout.
      kickProgress();
    };

    // Live byte-level progress: the segment-boundary report() below is precise but
    // sparse (a whole-file stream calls it ONCE at the end), so this throttled
    // reporter is what keeps the "x / y MB" counter moving.
    const PROGRESS_TICK_MS = 250;
    let progressTimer = null;
    let lastDone = 0;
    let lastTotal = 0;
    const progressRatio = (done, total) => {
      if (targetBytes) return Math.min(1, bytes / targetBytes);
      return total ? done / total : 0;
    };
    const reportLive = () => {
      onProgress?.({
        done: lastDone,
        total: lastTotal,
        ratio: progressRatio(lastDone, lastTotal),
        bytes,
        bytesLabel: formatBytes(bytes),
        speed: networkSpeed(),
      });
    };
    const kickProgress = () => {
      if (progressTimer) return;
      progressTimer = setTimeout(() => {
        progressTimer = null;
        reportLive();
      }, PROGRESS_TICK_MS);
    };
    const stopProgress = () => {
      if (progressTimer) {
        clearTimeout(progressTimer);
        progressTimer = null;
      }
    };

    const report = (done) => {
      const total = liveSegments.length;
      lastDone = done;
      lastTotal = total;
      onProgress?.({
        done,
        total,
        ratio: progressRatio(done, total),
        bytes,
        bytesLabel: formatBytes(bytes),
        speed: networkSpeed(),
      });
    };

    /* Relay one segment as Range chunks, stopping when the server's x-streamly-more
       header says the file ended; each chunk is handed to `onChunk`. */
    const relayRange = async (url, onChunk) => {
      let start = 0;
      for (;;) {
        await pause?.waitIfPaused({ signal });
        if (signal?.aborted) {
          const err = new Error("Aborted");
          err.name = "AbortError";
          throw err;
        }
        const { bytes: chunk, more } = await post(
          { action: "segment", url, range: { start, max: CHUNK_MAX }, refUrl: liveRefUrl },
          { signal, as: "buffer" },
        );
        if (!chunk || chunk.length === 0) break;
        noteReceived(chunk);
        await onChunk(chunk);
        if (!more) break;
        start += chunk.length;
      }
    };

    /* Direct: the CDN allowed CORS + Range, so one request, no relay hop. Any
       hiccup drops back to the relay for the REST of the file (bytes already
       written stay where they are). The probe is per-origin and cached. */
    const probeCache = new Map();
    let directEnabled = true;
    const fetchSegmentDirect = async (url, onChunk) => {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Direct segment fetch failed (${res.status})`);
      // Stream the body so huge direct segments are written incrementally
      // (never buffered whole in RAM).
      if (res.body && typeof res.body.getReader === "function") {
        const reader = res.body.getReader();
        for (;;) {
          await pause?.waitIfPaused({ signal });
          if (signal?.aborted) {
            const err = new Error("Aborted");
            err.name = "AbortError";
            throw err;
          }
          const { done, value } = await reader.read();
          if (done) break;
          noteReceived(value);
          await onChunk(new Uint8Array(value));
        }
        return;
      }
      const ab = await res.arrayBuffer();
      const chunk = new Uint8Array(ab);
      if (chunk.length === 0) throw new Error("Direct segment fetch returned no bytes");
      noteReceived(chunk);
      await onChunk(chunk);
    };

    /* Fetch one whole segment and emit its chunks (direct in a single request, else
       relayed in 3.5MB Range chunks). `emit` is optional: when provided (single
       whole-file segments) they stream straight to the writer so a long movie never
       sits in RAM; when omitted they are collected and returned. Pure — never
       touches the shared writer — so many can run concurrently. */
    const fetchSegmentBytes = async (index, emit = null) => {
      const url = liveSegments[index];
      if (!url) throw new DownloadUnavailableError("Server offered no stream.", "no-source");
      const collect = emit || (async () => {});
      if (directEnabled) {
        let origin = null;
        try {
          origin = new URL(url).origin;
        } catch {
          origin = null;
        }
        // Cache the probe PROMISE per origin, not just the result, so two
        // concurrent workers probing the same CDN share one request.
        let probePromise = origin ? probeCache.get(origin) : undefined;
        if (!probePromise) {
          probePromise = probeDirect(url, { signal });
          if (origin) probeCache.set(origin, probePromise);
        }
        const probe = await probePromise;
        if (probe.ok) {
          try {
            await fetchSegmentDirect(url, collect);
            return;
          } catch (error) {
            if (error?.name === "AbortError") throw error;
            logWarn("download", "Direct segment fetch failed — falling back to relay.", {
              message: error?.message,
            });
            directEnabled = false;
          }
        }
        await relayRange(url, collect);
        return;
      }
      await relayRange(url, collect);
    };

    try {
      if (liveInitUrl) {
        await relayRange(liveInitUrl, write);
      }

      report(0);
      /* Single whole-file segment (manifest.direct): stream it straight to the
         writer — a long movie must not sit in RAM. No concurrency needed. */
      if (liveSegments.length === 1) {
        await fetchSegmentBytes(0, write);
        report(1);
      } else {
        /* Segment writes to one file MUST be in order but the fetches can overlap:
           buffer each result and flush only when its turn comes (an out-of-order
           segment waits for the one before it), which turns a round-trip-bound
           pipeline into one that uses the connection's full bandwidth. */
        const SEGMENTS = liveSegments.length;
        let nextToFetch = 0;
        let nextToWrite = 0;
        const buffered = new Map();
        // Serializes ordered writes: only one flush runs at a time.
        let flushes = Promise.resolve();

        const flushReady = async () => {
          while (buffered.has(nextToWrite)) {
            const chunks = buffered.get(nextToWrite);
            for (const chunk of chunks) await write(chunk);
            buffered.delete(nextToWrite);
            nextToWrite += 1;
            report(nextToWrite);
          }
        };
        const enqueueFlush = () => {
          flushes = flushes.then(flushReady);
          return flushes;
        };

        /* HLS segments are small (seconds of video), so buffering a window of
           them is a sane trade-off; whole-file direct segments never reach here. */
        const worker = async () => {
          for (;;) {
            if (signal?.aborted) {
              const err = new Error("Aborted");
              err.name = "AbortError";
              throw err;
            }
            await pause?.waitIfPaused({ signal });
            const index = nextToFetch;
            nextToFetch += 1;
            if (index >= SEGMENTS) return;
            const chunks = [];
            await fetchSegmentBytes(index, async (chunk) => {
              if (chunk?.length) chunks.push(chunk);
            });
            buffered.set(index, chunks);
            await enqueueFlush();
          }
        };

        await Promise.all(Array.from({ length: Math.min(SEGMENT_CONCURRENCY, SEGMENTS) }, worker));
        await flushes;
      }

      if (writer) {
        stopProgress();
        await writer.close();
        writer = null;
        logInfo("download", "Saved via File System Access API.", { filename, bytes: formatBytes(bytes) });
        return { bytes, filename, method };
      }

      // Blob fallback — assemble and trigger a browser download.
      stopProgress();
      const blob = new Blob(memoryChunks, {
        type: kind === "ts" ? "video/mp2t" : "video/mp4",
      });
      memoryChunks = null;
      triggerBlobDownload(blob, filename);
      logInfo("download", "Saved via Blob download fallback.", { filename, bytes: formatBytes(bytes) });
      method = "blob";
      return { bytes, filename, method };
    } catch (error) {
      stopProgress();
      try {
        if (writer) await writer.abort();
      } catch {
        // ignore cleanup failure
      }
      if (error?.name === "AbortError") {
        logInfo("download", "Download cancelled by user.", { filename });
      } else {
        logError("download", "Download failed.", error, { filename, done: bytes });
      }
      throw error;
    }
  },
};

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the browser has had a tick to start the save.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export default downloadService;