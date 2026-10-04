// src/api/downloadService.js — client half of the native playback resolvers.
//
// The native player resolves each server's stream through the same-origin
// Vercel function api/downloadify.js (media bytes ride that function and the
// optional Cloudflare relay, wired in nativeHlsLoader.js). This module owns
// the RESOLVE contract: one method per server, every one normalizing to
// `{ source, variants, audioTracks }` so the player treats providers uniformly.
//
// The browser download (save-to-disk) flow was removed — buildManifest /
// saveStream / pickSaveTarget / the pause gate are gone. The resolve methods
// and normalizeResolved stay because playback depends on them.

import { estimateBytes, variantLabel } from "../utils/downloadQuality.js";
import { logError, logInfo } from "../utils/debugLogger.js";

const ENDPOINT = "/api/downloadify";

export class DownloadUnavailableError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "DownloadUnavailableError";
    this.code = code || "unavailable";
  }
}

/* Resolve-envelope POST (JSON in, JSON out). Media byte transport lives in
   the player's own loader, not here. */
async function post(body, { signal } = {}) {
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
      "Stream resolver unreachable. Playback needs the deployed app (Vercel).",
      "offline",
    );
  }

  // On plain static hosting the SPA catch-all answers with index.html.
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new DownloadUnavailableError(
      "Stream resolver returned a non-JSON response — the serverless function isn't running.",
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
  /** Normalize a resolver `{ ok, source, variants }` payload into the shape
      the player consumes (labeled variants, per-variant index). Sibling-URL
      dub tracks (ZXC Centaurus `audioTracks`) ride through untouched — the
      native player's Audio menu consumes them. */
  normalizeResolved(data) {
    const variants = (data.variants || [])
      .filter((v) => !!v.uri)
      .map((v, index) => ({
        ...v,
        index,
        label: variantLabel(v),
        estimatedBytes: estimateBytes(v.bandwidth, 0),
      }));
    const audioTracks = Array.isArray(data.audioTracks)
      ? data.audioTracks.filter((t) => t?.uri && t?.label).map((t) => ({ label: String(t.label), uri: String(t.uri) }))
      : [];
    return { source: data.source, variants, audioTracks };
  },

  /** Resolve one of the four ZXC/VIDSTUCK servers (action "resolvezxc"). The
      `server` arg picks the row (andromeda | centaurus | atlas | meow), so
      every server stays individually selectable instead of racing to a winner.
      DASH servers come back as a transcoded multi-level master plus sibling-URL
      `audioTracks` (Centaurus dubs); HLS servers pass their own ladder through. */
  async resolveZxc({ type, id, season, episode, server }, { signal } = {}) {
    const kind = type === "tv" ? "tv" : "movie";
    const body = { action: "resolvezxc", type: kind, id: String(id || ""), server: String(server || "") };
    if (kind === "tv") {
      if (season != null) body.season = String(season);
      if (episode != null) body.episode = String(episode);
    }
    const data = await post(body, { signal });
    const resolved = this.normalizeResolved(data);
    logInfo(
      "download",
      `Resolved ${resolved.variants.length} variant(s) via ZXC ${server}` +
        (resolved.audioTracks.length ? ` with ${resolved.audioTracks.length} audio track(s).` : "."),
      {
        type: kind,
        id,
        server,
        season: season ?? null,
        episode: episode ?? null,
        variants: resolved.variants.map((v) => v.label),
        audioTracks: resolved.audioTracks.map((t) => t.label),
      },
    );
    return resolved;
  },
};

export default downloadService;
