// src/api/downloadService.js — client half of the browser-only download flow.
//
// Flow (all through the stateless /api/downloadify Vercel function):
//   1. resolveVidsrc({type,id,season?,episode?}) -> VidSrc (Alt) HLS ladder
//      resolveVidcore({type,id,season?,episode?}) -> VidCore (Server 5) ladder.
//      Both are fully serverless — their catalogues list direct HLS ladders
//      (incl. 4K) — and return the same shape so the modal can fan out over
//      either source.
//   2. buildManifest(source, variant)          -> concrete segment URL list
//   3. saveStream(...)                    -> fetch segments in bounded Range
//                                            chunks and write them to disk
//
// Byte transport changed for a reason: Vercel caps a function's response at
// 4.5MB, so the old "batch N segments in one POST" design crashed with 413 on
// the first 1080p movie. Segments are now pulled ONE at a time, each as a
// sequence of ≤ ~3.5MB Range chunks; the server's `x-streamly-more` header
// tells us when the piece ended. Where a CDN honestly supports CORS + Range
// the browser downloads those segments DIRECTLY (zero serverless bandwidth);
// everything else rides the relay. Both paths go to the same writable.
// When VITE_STREAMLY_RELAY_URL points at the Cloudflare worker (see
// relayProxy.js) those relayed bytes go through it FIRST — a whole segment can
// arrive in one request (no 4.5MB cap) with zero Vercel Hobby egress — and
// fall back to /api/downloadify automatically.
//
// Saving mirrors a normal browser download: where the File System Access API
// exists we write each chunk straight to the chosen file (so a 2 GB movie
// never lives in RAM); otherwise we assemble a Blob and click an <a download>.
// Cancellation is an AbortController; a PauseController (below) pauses the
// fetch loops without killing the save; progress is segment-count based.

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

/* Pause gate shared by the download modal and the /downloads page. One
   instance rides each download: the page's Pause/Resume buttons flip the
   gate, and saveStream's fetch loops await waitIfPaused() between network
   requests — so a pause stops pulling bytes without burying the file or
   losing what's on disk. Aborts still interrupt a paused gate (the wait
   races against the signal), so Cancel always lands, even mid-pause. */
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

/* Raw transport (segment bytes, playlist text) relay. Proxy-first when
   configured, /api/downloadify as the automatic fallback — and re-sliced at
   CHUNK_MAX for the Vercel leg so its 4.5MB body cap is never breached mid-file
   (the proxy's own slice can be a whole segment). Non-transport actions never
   reach here; resolution/manifest JSON still needs the serverless function
   (it parses upstreams — the proxy is a dumb pipe). */
async function fetchTransport(body, { signal }) {
  const proxy = relayProxyConfig();
  const candidates = proxy ? [proxy, null] : [null];
  const isSegment = body.action === "segment";
  const start = Math.max(0, Math.floor(Number(body.range?.start) || 0));
  // An upgraded worker forwards ?referer= upstream, which is what lets it
  // serve referer-gated CDNs (VidCore's moon.quietridge.top / palehive.top)
  // instead of 403ing and falling back to the Vercel function on every byte.
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
      // The relay returns 502 { ok:false, code:"segment-fetch-failed" } when the
      // upstream refused a segment. Surface the server's real code instead of a
      // generic "http" so saveStream can tell a real upstream refusal apart
      // from a transient blip.
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
    // Raw-text actions (e.g. `playlist` for native HLS playback): the body is
    // the upstream text, not JSON. Non-OK answers are still the relay's JSON
    // error envelope, so parse those for the real code/message like above.
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

/* Direct-CORS probe: can the browser honestly read this CDN's bytes?
   Returns { ok, total } where total comes from a Range 0-0 content-range.
   We only go direct when the CDN both allows cross-origin reads AND answers
   Range headers — anything else falls through to the relay. */
async function probeDirect(url, { signal }) {
  // Referer-gated CDNs (VidCore's moon.quietridge.top / palehive.top /
  // grandpearl.top / wisehive.top family) 403 a bare browser probe on sight,
  // and a burst of such probes trips their WAF — skip the probe entirely so
  // every byte of these origins goes through the referer-carrying relay.
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

  /** Resolve the VidSrc (Alt) provider — the only third-party provider the
      downloader scrapes server-side (action "resolvevidsrc"). `type` is
      "movie" | "tv"; `season`/`episode` only matter for TV and both default
      to whatever VidSrc serves when omitted. */
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

  /** Resolve the VidCore provider (Server 5 — action "resolvevidcore"). Same
      contract as resolveVidsrc, and equally serverless: vidcore.org's sources
      catalogue serves direct HLS ladders (incl. 4K) with no browser required. */
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

  /** Fetch a raw m3u8 playlist through the relay (server supplies the owning
      player's referer, which a browser fetch cannot send). Used by native HLS
      playback: the MSE player parses levels/audio groups itself from the text.
      Throws DownloadUnavailableError with the relay's real code on failure. */
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
   * Open the native Save-As picker. MUST be called synchronously from the
   * click handler (browsers drop user activation across awaits) — returns a
   * writable stream, or null when the API/gesture isn't available.
   * Throws an AbortError if the viewer cancels the picker.
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
    // "browser" forces the in-memory <a download> path (lands in the browser's
    // own download list) even when a writable is available — used by the modal's
    // "Save to browser Downloads" toggle.
    mode,
    onProgress,
    // Estimated total byte size (bandwidth × duration). When provided, progress
    // `ratio` is derived from bytes / totalBytes so the bar and the "x / y MB"
    // readout move together in REAL time instead of snapping one segment at a
    // time (a whole-file stream would otherwise sit at 0% until it finished).
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

    // Real throughput is measured where bytes ARRIVE from the network (each
    // chunk a segment fetch yields), NOT where they're flushed to disk. With
    // SEGMENT_CONCURRENCY segments in flight, a whole buffer window can be
    // written in a few milliseconds — a delta between _write_ events reads
    // like RAM/disk speed (tens of MB/s), while the connection was actually
    // feeding that buffer over seconds at a normal rate. Sample arrival time
    // and bytes, then report the windowed rate (a download-manager average).
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

    // Live byte-level progress. Segment-boundary report() below is precise but
    // sparse (a whole-file faststart stream calls it ONCE at the end; a slow
    // connection sits inside one segment for many seconds), and the %/bytes UI
    // read those updates — so without this the "x / y MB" counter froze for
    // 5-10s at a time while the speed number (a windowed network average)
    // looked perfectly alive. This throttled reporter fills those gaps.
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

    /* Relay: Range-chunked stream of one segment through /api/downloadify,
       stopping when the server's x-streamly-more header says the file ended.
       Each fetched chunk is handed to `onChunk`. */
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

    /* Direct: the CDN allowed CORS + Range, so pull the segment straight from
       the browser (one request, no relay hop). Any hiccup drops us back to the
       relay for the REST of the file (bytes already written stay exactly where
       they belong). The probe is done per-origin and cached — resolved CDN
       capabilities don't flip between segments of the same stream. */
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

    /* Fetch one whole segment and emit its chunks (direct in a single
       request, else relayed in 3.5MB Range chunk). `emit` is optional: when
       omitted the chunks are collected and returned; when provided (single
       whole-file segments — see manifest.direct) they stream straight to the
       writer so a long movie never sits in RAM. Pure — never touches the
       shared writer — so many of these can run concurrently. */
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
        /* Segment writes to a single file MUST be in order, but the network
           fetches can overlap. Keep a small window of concurrent fetches; each
           result is buffered and flushed to the writer only when its turn comes
           (an out-of-order segment is held until the one before it lands). This
           turns a round-trip-bound pipeline into one that uses all the bandwidth
           the connection offers. */
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

export function triggerBlobDownload(blob, filename) {
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