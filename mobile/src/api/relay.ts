/* HLS relay for ExoPlayer.
 *
 * Why this exists: the resolver hands back manifest URLs on hosts that reject
 * requests without a browser-ish Referer/User-Agent (and some reject requests
 * carrying a browser Origin). ExoPlayer in react-native-video cannot be given
 * per-request headers for every segment it fetches, and a master playlist also
 * points at variants/segments/keys that would each need rewriting anyway. The
 * web build solves this with the same Cloudflare worker
 * (src/api/relayProxy.js + src/api/nativeHlsLoader.js): a GET passthrough that
 * injects the required headers and forwards Range requests.
 *
 * So the app does the same thing, one layer up:
 *   1. pull the manifest through the worker,
 *   2. follow the master -> variant if needed,
 *   3. rewrite every URI (segments, variant, EXT-X-KEY) to a worker URL,
 *   4. write the result to a local .m3u8 and hand ExoPlayer a file:// URL.
 * The player then only ever talks to the local file and the worker. */

import { File, Paths } from "expo-file-system";

import { getConfig } from "../config";
import { logDebug, logError, logWarn } from "../utils/logger";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_VARIANT_DEPTH = 2;

const writerCache = new Set<string>();
const MAX_CACHED_PLAYLISTS = 24;

export function relayUrl(target: string): string {
  // Read per call so a relay changed in Settings takes effect immediately.
  return `${getConfig().relayUrl}?url=${encodeURIComponent(target)}`;
}

async function fetchText(url: string, label: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const err = new Error(`${label} returned ${res.status} via relay.`);
      logError("relay", `Failed to fetch ${label}`, err, { status: res.status, url });
      throw err;
    }
    const body = await res.text();
    logDebug("relay", `Fetched ${label} (${body.length} bytes) via relay.`, { url });
    return body;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      const err = new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS}ms.`);
      logError("relay", `Timeout fetching ${label}`, err, { url });
      throw err;
    }
    logError("relay", `Network error fetching ${label} (offline or worker down?)`, error, { url });
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

/* Turns a resolver manifest URL into something ExoPlayer can open. Returns the
 * relayed original URL for non-HLS sources. */
export async function preparePlaybackSource(manifestUrl: string): Promise<string> {
  const { body, base } = await resolveManifest(manifestUrl, 0);
  if (!body) return relayUrl(manifestUrl);
  const rewritten = rewriteUris(body, base);
  const uri = writePlaylist(playlistName(manifestUrl), rewritten);
  logDebug("relay", "Prepared local playlist for ExoPlayer.", { source: manifestUrl, uri });
  return uri;
}
