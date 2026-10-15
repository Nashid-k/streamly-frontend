// src/api/streamResolve.js — client half of the native playback resolvers.
//
// The native player resolves each server's stream through the same-origin
// Vercel function api/stream.js (media bytes ride that function and the
// optional Cloudflare relay, wired in nativeHlsLoader.js). This module owns
// the RESOLVE contract: one method per server, every one normalizing to
// `{ source, variants, audioTracks }` so the player treats providers uniformly.
//
// Renamed from downloadService.js (2026-10-07): the browser download
// (save-to-disk) flow it once also served was removed — buildManifest /
// saveStream / pickSaveTarget / the pause gate are gone — and the old name
// advertised a feature that no longer exists. The resolve methods and
// normalizeResolved stay because playback depends on them.

import { estimateBytes, variantLabel } from "../utils/hlsPlaylist.js";
import { logError, logInfo } from "../utils/debugLogger.js";

const ENDPOINT = "/api/stream";

export class StreamUnavailableError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "StreamUnavailableError";
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
    logError("stream", "stream request failed (is the function deployed?)", error, {
      action: body?.action,
    });
    throw new StreamUnavailableError(
      "Stream resolver unreachable. Playback needs the deployed app (Vercel).",
      "offline",
    );
  }

  // On plain static hosting the SPA catch-all answers with index.html.
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new StreamUnavailableError(
      "Stream resolver returned a non-JSON response — the serverless function isn't running.",
      "offline",
    );
  }

  const json = await response.json().catch(() => ({}));
  if (!json.ok) {
    throw new StreamUnavailableError(json.error || `Request failed (${response.status}).`, json.code);
  }
  return json;
}

export const streamResolve = {
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

  /** Resolve one of the ZXC/VIDSTUCK servers (action "resolvezxc"). The
      `server` arg picks the row (orion | andromeda | centaurus | atlas | meow),
      so every server stays individually selectable instead of racing to a
      winner. `auto:true` (the no-pick path) instead asks the server to choose
      the healthiest backend and fall through internally — one round trip
      instead of walking every row. `prefer:"<server>"` is a manual pick that is
      allowed to fall THROUGH: the picked backend is tried first and, when it has
      no source, the same request walks the rest — the fast fallback. Either way
      the backend echoes the `server` it actually used, which the player maps
      back onto its row. DASH servers come back as a transcoded multi-level
      master plus sibling-URL `audioTracks` (orion/centaurus dubs); HLS servers
      pass their own ladder through. */
  async resolveZxc({ type, id, season, episode, server, auto, prefer }, { signal } = {}) {
    const kind = type === "tv" ? "tv" : "movie";
    const body = { action: "resolvezxc", type: kind, id: String(id || "") };
    // Serialize exactly one of the three modes: an explicit pick names one
    // server and ONLY that server, `prefer` names one that may fall through to
    // the health-ordered rotation, and `auto` (no name) lets the backend choose.
    if (prefer) {
      body.auto = true;
      body.prefer = String(prefer);
    } else if (auto) {
      body.auto = true;
    } else {
      body.server = String(server || "");
    }
    if (kind === "tv") {
      if (season != null) body.season = String(season);
      if (episode != null) body.episode = String(episode);
    }
    const data = await post(body, { signal });
    const resolved = this.normalizeResolved(data);
    // Which backend actually served this — the automatic path is the reason
    // this must survive normalization.
    resolved.server = data.server;
    logInfo(
      "stream",
      `Resolved ${resolved.variants.length} variant(s) via ZXC ${data.server || prefer || server || "auto"}` +
        (resolved.audioTracks.length ? ` with ${resolved.audioTracks.length} audio track(s).` : "."),
      {
        type: kind,
        id,
        server: prefer || (auto ? null : server),
        auto: !!auto || !!prefer,
        prefer: prefer || null,
        resolvedServer: data.server ?? null,
        season: season ?? null,
        episode: episode ?? null,
        variants: resolved.variants.map((v) => v.label),
        audioTracks: resolved.audioTracks.map((t) => t.label),
      },
    );
    return resolved;
  },
};

export default streamResolve;
