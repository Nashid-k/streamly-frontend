/* Playback sources for ExoPlayer.
 *
 * Live-measured facts (scripts/smoke-mobile-config.mjs pins all of them):
 *   - the resolver hands back manifest URLs on hosts that REFUSE a request
 *     without a browser-ish Referer (a bare fetch gets 403; the same fetch with
 *     `Referer: https://vidcore.io/` gets a real 188 KB #EXTM3U), and
 *   - react-native-video passes `source.headers` into ExoPlayer's data-source
 *     factory, so those headers reach the manifest AND every segment/key load.
 *
 * So the PRIMARY path is direct: give ExoPlayer the upstream URL plus the
 * resolver's `source.refUrl` as a Referer. No worker, no rewriting, no local
 * file, one less hop - and it is the only path that does not depend on someone
 * else's Cloudflare project staying up.
 *
 * The relay rewrite below is the FALLBACK for the hosts that need every URI
 * rewritten (or that refuse the header approach entirely): pull the manifest
 * through the worker, rewrite segments/variants/EXT-X-KEY to worker URLs and
 * hand ExoPlayer a local file:// playlist. */

import { File, Paths } from "expo-file-system";

import { getConfig } from "../config";
import { logDebug, logError, logInfo, logWarn } from "../utils/logger";

const REQUEST_TIMEOUT_MS = 15_000;
const PROBE_TIMEOUT_MS = 10_000;
const MAX_VARIANT_DEPTH = 2;
const PROBE_MAX_BYTES = 512 * 1024;

/* The relay is a FALLBACK, and the deployment it points at is not this repo's to
 * fix. Today it answers every request with a Cloudflare 403 page, which is fast -
 * but "fast failure on every single play" still means every play waits for a route
 * that cannot work. So a failed relay fetch parks the route for a few minutes: the
 * next play goes straight to the error the user needs to see, and a relay that
 * starts working again is picked up on its own after the window closes. */
const RELAY_UNHEALTHY_MS = 5 * 60_000;
const RELAY_HEALTHY_MS = 10 * 60_000;
let relayHealthyUntil = 0;

export function relayIsKnownBad(): boolean {
  return Date.now() < relayHealthyUntil;
}

function noteRelayFailure(status?: number) {
  relayHealthyUntil = Date.now() + RELAY_UNHEALTHY_MS;
  logWarn("relay", `Relay marked unusable for ${RELAY_UNHEALTHY_MS / 1000}s.`, { status });
}

/* The player sends this UA as well as the Referer: a few hosts reject okhttp's
 * default outright, and nothing objects to a normal Chrome string. */
export const PLAYBACK_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36";

const writerCache = new Set<string>();
const MAX_CACHED_PLAYLISTS = 24;

export function relayUrl(target: string): string {
  // Read per call so a relay changed in Settings takes effect immediately.
  return `${getConfig().relayUrl}?url=${encodeURIComponent(target)}`;
}

/* The headers ExoPlayer must send for `refUrl` to be honoured. */
export function playbackHeaders(refUrl?: string | null): Record<string, string> {
  const headers: Record<string, string> = { "User-Agent": PLAYBACK_USER_AGENT };
  if (refUrl) headers.Referer = refUrl;
  return headers;
}

/* Proves the direct path before the player commits to it: one bounded GET of the
 * manifest with the Referer attached. Without this a refused source looks like a
 * black screen inside ExoPlayer; with it the app can fall back (or say why). */
export async function probeDirect(manifestUrl: string, refUrl?: string | null): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(manifestUrl, {
      method: "GET",
      headers: { ...playbackHeaders(refUrl), Range: "bytes=0-65535" },
      signal: controller.signal,
    });
    if (!res.ok) {
      logWarn("relay", `Direct source refused the manifest (${res.status}); will fall back to the relay.`, {
        manifestUrl,
        hasRefUrl: Boolean(refUrl),
      });
      return false;
    }
    const body = await res.text();
    const looksLikeMedia = body.includes("#EXTM3U") || body.length > 0;
    logInfo("relay", `Direct source reachable (${res.status}, ${body.length} bytes).`, {
      manifestUrl,
      hasRefUrl: Boolean(refUrl),
      isPlaylist: body.includes("#EXTM3U"),
    });
    if (!looksLikeMedia) return false;
    if (body.length >= PROBE_MAX_BYTES && !body.includes("#EXTM3U")) {
      logWarn("relay", "Direct probe returned a large non-playlist body; treating as unusable.", { manifestUrl });
      return false;
    }
    return true;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      logWarn("relay", `Direct probe timed out after ${PROBE_TIMEOUT_MS}ms; will fall back to the relay.`, { manifestUrl });
      return false;
    }
    logWarn("relay", "Direct probe failed (offline or host refused); will fall back to the relay.", {
      manifestUrl,
      message: String(error?.message || error),
    });
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, label: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const err = new Error(`${label} returned ${res.status} via relay.`);
      logError("relay", `Failed to fetch ${label}`, err, { status: res.status, url });
      noteRelayFailure(res.status);
      throw err;
    }
    const body = await res.text();
    /* The worker is answering again, so whatever made it unusable (a deployment
     * that started 403ing, a DNS change) is over. */
    relayHealthyUntil = Date.now() + RELAY_HEALTHY_MS;
    logDebug("relay", `Fetched ${label} (${body.length} bytes) via relay.`, { url });
    return body;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      const err = new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS}ms.`);
      logError("relay", `Timeout fetching ${label}`, err, { url });
      noteRelayFailure();
      throw err;
    }
    logError("relay", `Network error fetching ${label} (offline or worker down?)`, error, { url });
    noteRelayFailure();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function isMaster(manifest: string): boolean {
  return /^#EXT-X-STREAM-INF:/m.test(manifest);
}

function absolute(target: string, base: string): string {
  if (/^https?:\/\//i.test(target)) return target;
  if (target.startsWith("//")) return `https:${target}`;
  try {
    return new URL(target, base).toString();
  } catch {
    logWarn("relay", `Could not resolve ${target} against ${base}; leaving it untouched.`);
    return target;
  }
}

interface Variant {
  uri: string;
  height: number;
  bandwidth: number;
}

/* Picks the best rendition at or below `maxHeight`, falling back to the highest
 * available so a 4K-only source still plays. */
function pickVariant(manifest: string, base: string, maxHeight: number): Variant | null {
  const lines = manifest.split(/\r?\n/);
  const variants: Variant[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const attrs = line.slice("#EXT-X-STREAM-INF:".length);
    const height = Number((/RESOLUTION=\d+x(\d+)/.exec(attrs) || [])[1]) || 0;
    const bandwidth = Number((/BANDWIDTH=(\d+)/.exec(attrs) || [])[1]) || 0;
    for (let j = i + 1; j < lines.length; j += 1) {
      const candidate = lines[j].trim();
      if (!candidate || candidate.startsWith("#")) continue;
      variants.push({ uri: absolute(candidate, base), height, bandwidth });
      break;
    }
  }
  if (!variants.length) return null;
  const atOrBelow = variants.filter((v) => v.height > 0 && v.height <= maxHeight);
  const pool = atOrBelow.length ? atOrBelow : variants;
  return pool.reduce((best, v) => {
    if (!best) return v;
    if (v.height && best.height) return v.height > best.height ? v : best;
    return v.bandwidth > best.bandwidth ? v : best;
  }, null as Variant | null);
}

function rewriteUris(manifest: string, base: string): string {
  return manifest
    .split(/\r?\n/)
    .map((raw) => {
      const line = raw.trim();
      if (!line) return raw;

      // #EXT-X-KEY / #EXT-X-MEDIA / #EXT-X-MAP carry URIs in attributes.
      if (line.startsWith("#")) {
        return raw.replace(/URI="([^"]+)"/g, (_m, uri: string) => `URI="${relayUrl(absolute(uri, base))}"`);
      }

      return relayUrl(absolute(line, base));
    })
    .join("\n");
}

function pruneCache() {
  if (writerCache.size <= MAX_CACHED_PLAYLISTS) return;
  const cacheDir = new File(Paths.cache);
  const victims = Array.from(writerCache).slice(0, writerCache.size - MAX_CACHED_PLAYLISTS);
  for (const name of victims) {
    try {
      const file = new File(cacheDir, name);
      if (file.exists) file.delete();
    } catch (error) {
      logWarn("relay", `Could not delete stale playlist ${name}`, error);
    }
    writerCache.delete(name);
  }
}

function writePlaylist(name: string, body: string): string {
  const file = new File(Paths.cache, name);
  try {
    if (file.exists) file.delete();
    file.create();
  } catch (error) {
    logError("relay", `Could not create playlist file ${name}`, error);
    throw error;
  }
  file.write(body);
  writerCache.add(name);
  pruneCache();
  return file.uri;
}

function playlistName(manifestUrl: string): string {
  let hash = 5381;
  for (let i = 0; i < manifestUrl.length; i += 1) {
    hash = ((hash << 5) + hash + manifestUrl.charCodeAt(i)) >>> 0;
  }
  return `streamly-${hash.toString(16)}.m3u8`;
}

async function resolveManifest(manifestUrl: string, depth: number): Promise<{ body: string; base: string }> {
  const body = await fetchText(relayUrl(manifestUrl), "HLS manifest");
  if (!body.includes("#EXTM3U")) {
    // Not a playlist at all (some sources point straight at an mp4 segment list
    // or a media file). Handing ExoPlayer the relayed URL is still correct.
    logWarn("relay", "Manifest body has no #EXTM3U header; treating as direct media.", { manifestUrl });
    return { body: "", base: manifestUrl };
  }
  if (isMaster(body) && depth < MAX_VARIANT_DEPTH) {
    const variant = pickVariant(body, manifestUrl, 1080);
    if (variant) {
      logDebug("relay", `Master playlist -> variant ${variant.height || "?"}p`, { variant: variant.uri });
      return resolveManifest(variant.uri, depth + 1);
    }
    logWarn("relay", "Master playlist has no variants; using it as a media playlist.", { manifestUrl });
  }
  return { body, base: manifestUrl };
}

/* Relay fallback: turns a resolver manifest URL into a local .m3u8 ExoPlayer can
 * open even when the host needs every URI rewritten. Returns a worker URL for
 * non-HLS sources. */
export async function preparePlaybackSource(manifestUrl: string): Promise<string> {
  const { body, base } = await resolveManifest(manifestUrl, 0);
  if (!body) return relayUrl(manifestUrl);
  const rewritten = rewriteUris(body, base);
  const uri = writePlaylist(playlistName(manifestUrl), rewritten);
  logInfo("relay", "Prepared a relayed local playlist for ExoPlayer.", { source: manifestUrl, uri });
  return uri;
}
