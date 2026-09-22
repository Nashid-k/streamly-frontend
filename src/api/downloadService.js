// src/api/downloadService.js — client half of the browser-only download flow.
//
// Flow (all through the stateless /api/downloadify Vercel function):
//   1. resolveDownload(embedUrl)          -> real HLS ladder for that server
//      (a "vidsrc://" embed URL is routed to the VidSrc provider action)
//   2. buildManifest(source, variant)     -> concrete segment URL list
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
//
// Saving mirrors a normal browser download: where the File System Access API
// exists we write each chunk straight to the chosen file (so a 2 GB movie
// never lives in RAM); otherwise we assemble a Blob and click an <a download>.
// Cancellation is an AbortController; progress is segment-count based.

import {
  KIND_FMP4,
  estimateBytes,
  formatBytes,
  safeFileName,
  variantLabel,
} from "../utils/downloadQuality.js";
import { logDebug, logError, logInfo, logWarn } from "../utils/debugLogger.js";

const ENDPOINT = "/api/downloadify";
const CHUNK_MAX = 3.5 * 1024 * 1024;

export class DownloadUnavailableError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "DownloadUnavailableError";
    this.code = code || "unavailable";
  }
}

/* VidSrc: the download modal passes a download-only marker URL
   (vidsrc://movie/{tmdb} | vidsrc://tv/{tmdb}?s=&e=). Translate it into the
   resolver's "resolvevidsrc" action so we never hand the marker to an iframe. */
function vidsrcBodyFromUrl(embedUrl) {
  const u = new URL(embedUrl);
  const isTv = u.hostname === "tv";
  const body = {
    action: "resolvevidsrc",
    type: isTv ? "tv" : "movie",
    id: u.pathname.replace(/^\//, ""),
  };
  if (u.searchParams.get("s")) body.season = u.searchParams.get("s");
  if (u.searchParams.get("e")) body.episode = u.searchParams.get("e");
  return body;
}

function isVidsrcUrl(embedUrl) {
  return typeof embedUrl === "string" && embedUrl.toLowerCase().startsWith("vidsrc://");
}

async function post(body, { signal, as = "json" } = {}) {
  let response;
  try {
    response = await fetch(ENDPOINT, {
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
      throw new DownloadUnavailableError(`Segment request failed (${response.status}).`, "http");
    }
    const ab = await response.arrayBuffer();
    const more = response.headers.get("x-streamly-more") === "1";
    return { bytes: new Uint8Array(ab), more };
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
  /** Resolve a server's embed URL into the qualities it actually offers. */
  async resolveDownload(embedUrl, { signal } = {}) {
    let data;
    if (isVidsrcUrl(embedUrl)) {
      let body;
      try {
        body = vidsrcBodyFromUrl(embedUrl);
      } catch {
        throw new DownloadUnavailableError("Malformed VidSrc URL (expected vidsrc://movie/{id} or vidsrc://tv/{id}?s=&e=).", "bad-url");
      }
      data = await post(body, { signal });
    } else {
      data = await post({ action: "resolve", embedUrl }, { signal });
    }
    const variants = (data.variants || []).map((v, index) => ({
      ...v,
      index,
      label: variantLabel(v),
      estimatedBytes: estimateBytes(v.bandwidth, 0),
    }));
    logInfo("download", `Resolved ${variants.length} downloadable variant(s).`, {
      embedUrl,
      provider: data.serverName || null,
      variants: variants.map((v) => v.label),
    });
    return { source: data.source, variants };
  },

  /** Expand a chosen variant into a concrete segment list. */
  async buildManifest(source, variant, { signal } = {}) {
    const data = await post(
      {
        action: "manifest",
        playlistUrl: variant.uri,
        refUrl: source?.refUrl || source?.url,
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
    onProgress,
    signal,
  }) {
    const kind = manifest.kind || KIND_FMP4;
    const extension = kind === "ts" ? "ts" : "mp4";
    const filename = `${safeFileName(baseName)}.${extension}`;
    const segments = manifest.segments || [];
    const refUrl = source?.refUrl || source?.url;

    let writer = writable;
    let memoryChunks = null;
    let method = writer ? "fs" : "blob";
    let bytes = 0;

    // Incremental disk writes — a long movie must not sit in RAM.
    if (!writer && !manifest.direct) {
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
    };

    const report = (done) => {
      onProgress?.({
        done,
        total: segments.length,
        ratio: segments.length ? done / segments.length : 0,
        bytes,
        bytesLabel: formatBytes(bytes),
      });
    };

    /* Relay: Range-chunked stream of one segment through /api/downloadify,
       stopping when the server's x-streamly-more header says the file ended. */
    const relayRange = async (url) => {
      let start = 0;
      for (;;) {
        const { bytes: chunk, more } = await post(
          { action: "segment", url, range: { start, max: CHUNK_MAX }, refUrl },
          { signal, as: "buffer" },
        );
        if (!chunk || chunk.length === 0) break;
        await write(chunk);
        if (!more) break;
        start += chunk.length;
      }
    };

    /* Direct: the CDN allowed CORS + Range, so pull the segment straight from
       the browser. Any hiccup drops us back to the relay for the REST of the
       file (bytes already written stay exactly where they belong). */
    let directEnabled = true;
    const fetchSegmentDirect = async (url, total) => {
      let offset = 0;
      while (offset < total) {
        const end = Math.min(offset + CHUNK_MAX, total) - 1;
        const res = await fetch(url, { headers: { range: `bytes=${offset}-${end}` }, signal });
        if (!res.ok) throw new Error(`Direct segment fetch failed (${res.status})`);
        const ab = await res.arrayBuffer();
        const chunk = new Uint8Array(ab);
        if (chunk.length === 0) break;
        await write(chunk);
        offset += chunk.length;
      }
    };

    const fetchOne = async (url) => {
      if (directEnabled) {
        const probe = await probeDirect(url, { signal });
        if (probe.ok) {
          try {
            await fetchSegmentDirect(url, probe.total);
            return;
          } catch (error) {
            if (error?.name === "AbortError") throw error;
            logWarn("download", "Direct segment fetch failed — falling back to relay.", {
              message: error?.message,
            });
            directEnabled = false;
          }
        }
      }
      await relayRange(url);
    };

    try {
      if (manifest.initUrl) {
        await relayRange(manifest.initUrl);
      }

      report(0);
      for (let i = 0; i < segments.length; i += 1) {
        await fetchOne(segments[i]);
        report(i + 1);
      }

      if (writer) {
        await writer.close();
        writer = null;
        logInfo("download", "Saved via File System Access API.", { filename, bytes: formatBytes(bytes) });
        return { bytes, filename, method };
      }

      // Blob fallback — assemble and trigger a browser download.
      const blob = new Blob(memoryChunks, {
        type: kind === "ts" ? "video/mp2t" : "video/mp4",
      });
      memoryChunks = null;
      triggerBlobDownload(blob, filename);
      logInfo("download", "Saved via Blob download fallback.", { filename, bytes: formatBytes(bytes) });
      method = "blob";
      return { bytes, filename, method };
    } catch (error) {
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