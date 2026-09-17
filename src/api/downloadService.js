// src/api/downloadService.js — client half of the browser-only download flow.
//
// Flow (all through the stateless /api/downloadify Vercel function):
//   1. resolveDownload(embedUrl)          -> real HLS ladder for that server
//   2. buildManifest(source, variant)     -> concrete segment URL list
//   3. saveStream(...)                    -> fetch segments in batches and
//                                            write them to disk incrementally
//
// Saving mirrors a normal browser download: where the File System Access API
// exists we write each batch straight to the chosen file (so a 2 GB movie
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
const EMBED_ENDPOINT = "/api/tmdb-embed";
const SEGMENTS_PER_BATCH = 6;

export class DownloadUnavailableError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "DownloadUnavailableError";
    this.code = code || "unavailable";
  }
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

  // On plain static hosting the SPA catch-all answers with index.html.
  const contentType = response.headers.get("content-type") || "";
  if (as === "buffer") {
    if (!response.ok) {
      throw new DownloadUnavailableError(`Segment request failed (${response.status}).`, "http");
    }
    const ab = await response.arrayBuffer();
    return new Uint8Array(ab);
  }

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

export const downloadService = {
  /** Resolve a server's embed URL into the qualities it actually offers. */
  async resolveDownload(embedUrl, { signal } = {}) {
    const data = await post({ action: "resolve", embedUrl }, { signal });
    const variants = (data.variants || []).map((v, index) => ({
      ...v,
      index,
      label: variantLabel(v),
      estimatedBytes: estimateBytes(v.bandwidth, 0),
    }));
    logInfo("download", `Resolved ${variants.length} downloadable variant(s).`, {
      embedUrl,
      variants: variants.map((v) => v.label),
    });
    return { source: data.source, variants };
  },

  /** Resolve direct MP4 downloads from TMDB-Embed API (self-hosted providers). */
  async resolveDirectDownload(tmdbId, type = "movie", season = null, episode = null, { signal } = {}) {
    try {
      let url;
      if (type === "movie") {
        url = `${EMBED_ENDPOINT}/movie/${tmdbId}`;
      } else {
        url = `${EMBED_ENDPOINT}/tv/${tmdbId}/${season}/${episode}`;
      }

      const response = await fetch(url, {
        headers: { "content-type": "application/json" },
        signal,
      });

      if (!response.ok) {
        const error = new Error(`TMDB-Embed API failed (${response.status})`);
        error.status = response.status;
        throw error;
      }

      const data = await response.json();

      if (!data.ok) {
        throw new DownloadUnavailableError(data.error || "No downloads available", data.code);
      }

      const downloads = (data.downloads || []).map((dl, index) => ({
        ...dl,
        index,
        label: dl.quality || "Unknown",
        estimatedBytes: 0, // Direct files don't have bandwidth estimates
        direct: true,
      }));

      logInfo("download", `Resolved ${downloads.length} direct download(s) from TMDB-Embed API.`, {
        tmdbId,
        type,
        season,
        episode,
        downloads: downloads.map((d) => d.label),
      });

      return { source: { kind: "direct", url: null }, variants: downloads };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      logError("download", "TMDB-Embed API request failed", error, {
        tmdbId,
        type,
        season,
        episode,
      });
      throw new DownloadUnavailableError(
        "Direct download service unavailable. Using HLS fallback.",
        "embed-api-failed",
      );
    }
  },

  /** Expand a chosen variant into a concrete segment list. */
  async buildManifest(source, variant, { signal } = {}) {
    if (variant?.direct) {
      return { kind: KIND_FMP4, direct: true, initUrl: null, segments: [variant.uri], duration: 0, count: 1 };
    }
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
   * @returns {{bytes:number, filename:string, method:'fs'|'blob'|'direct'}}
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

    try {
      if (manifest.initUrl) {
        const initChunk = await post(
          { action: "segment", urls: [manifest.initUrl], refUrl },
          { signal, as: "buffer" },
        );
        await write(initChunk);
      }

      report(0);
      for (let i = 0; i < segments.length; i += SEGMENTS_PER_BATCH) {
        const batch = segments.slice(i, i + SEGMENTS_PER_BATCH);
        const chunk = await post(
          { action: "segment", urls: batch, refUrl },
          { signal, as: "buffer" },
        );
        await write(chunk);
        report(Math.min(i + batch.length, segments.length));
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
