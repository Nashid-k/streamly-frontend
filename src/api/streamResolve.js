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

/* Resolve-payload cache with IN-FLIGHT coalescing. The payload's variant/audio
   URLs are marker URLs that re-mint server-side on every playlist load, so they
   are replayable and safe to reuse — which is exactly what the provider's own
   client does (`staleTime: Infinity` per server). Caching the PROMISE (not the
   settled value) means a Servers-menu prefetch and the player's own resolve for
   the same row collapse onto ONE network request instead of racing, which is
   what makes a server SWITCH start near-instantly: the target was already being
   resolved while the previous frame was still on screen.

   Failure deletes the entry, and every retry/failover path passes `bypass:true`
   so a payload the probe just proved dead is never served twice. The TTL bounds
   staleness if a delivery host changes state mid-session. */
const RESOLVE_TTL_MS = 5 * 60 * 1000;
const RESOLVE_CACHE_MAX = 60;
const resolveCache = new Map(); // key -> { at, promise }

function zxcResolveKey({ type, id, season, episode, server, auto, prefer }) {
  const kind = type === "tv" ? "tv" : "movie";
  const mode = prefer ? `prefer:${prefer}` : auto ? "auto" : `server:${server || ""}`;
  return [kind, id, season || "", episode || "", mode].join("|");
}

/* Does a FRESH cached payload exist for this request? Lets a prefetch skip rows
   that are already warm instead of re-asking (dedupe is otherwise implicit: a
   second resolve just returns the cached promise). */
export function hasFreshResolve(args) {
  const entry = resolveCache.get(zxcResolveKey(args));
  return Boolean(entry && Date.now() - entry.at < RESOLVE_TTL_MS);
}

export function clearZxcResolveCacheForTests() {
  resolveCache.clear();
}

/* Whether this DEPLOYMENT can serve native ZXC playback — true only when the
   server has a relay configured (its egress is otherwise WAF-blocked; see
   server/net.js). Cached for the session: it is a deployment property, not a
   per-title one. A failure (static hosting, function down) resolves to
   `{ zxcNative:false }` instead of throwing — the caller only needs a yes/no to
   pick an engine, and the fallback is the provider embed, not an error. */
let capabilitiesPromise = null;
export function getZxcCapabilities() {
  if (!capabilitiesPromise) {
    capabilitiesPromise = post({ action: "capabilities" })
      .then((data) => ({ zxcNative: Boolean(data?.zxcNative) }))
      .catch(() => ({ zxcNative: false }));
  }
  return capabilitiesPromise;
}

export function clearZxcCapabilitiesCacheForTests() {
  capabilitiesPromise = null;
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
      pass their own ladder through.

      `bypass:true` skips the cache READ (used by the token-refresh retry and
      the player's source retries, so a payload a probe just proved dead is not
      served again); a successful result is still written. Prefetch callers get
      the coalesced promise for free. */
  resolveZxc({ type, id, season, episode, server, auto, prefer }, { signal, bypass } = {}) {
    const kind = type === "tv" ? "tv" : "movie";
    const key = zxcResolveKey({ type: kind, id, season, episode, server, auto, prefer });
    if (!bypass) {
      const hit = resolveCache.get(key);
      if (hit && Date.now() - hit.at < RESOLVE_TTL_MS) return hit.promise;
      if (hit) resolveCache.delete(key);
    }

    const run = (async () => {
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
    })();

    // A failed resolve must not stay cached, or the next attempt would replay
    // the same error; the catch also marks the shared promise as handled so a
    // fire-and-forget prefetch cannot raise an unhandled rejection.
    run.catch(() => {
      const current = resolveCache.get(key);
      if (current && current.promise === run) resolveCache.delete(key);
    });
    resolveCache.set(key, { at: Date.now(), promise: run });
    while (resolveCache.size > RESOLVE_CACHE_MAX) {
      resolveCache.delete(resolveCache.keys().next().value);
    }
    return run;
  },
};

export default streamResolve;
