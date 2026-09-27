/* Stream resolution for the Android app.
 *
 * The resolvers are NOT bundled into the app: they live in the deployed Vercel
 * project (api/downloadify.js) because they scrape third-party embeds
 * server-side. The app therefore talks to that deployment - DEPLOYED_API_BASE in
 * src/config.ts is baked into the build, so a released APK is usable with no
 * setup - and calls it exactly like the web build does
 * (src/api/downloadService.js -> resolveVidcore / resolveVidsrc).
 *
 * The returned manifest URL needs a Referer, so it goes to
 * src/api/relay.ts, which hands ExoPlayer the upstream URL plus that Referer and
 * keeps the Cloudflare-relay rewrite as a fallback.
 *
 * React Native's fetch has no CORS layer, so the cross-origin POST is fine. */

import { getConfig, REQUEST_TIMEOUT_MS } from "../config";
import { playbackHeaders, preparePlaybackSource, probeDirect } from "./relay";
import { logError, logInfo, logWarn } from "../utils/logger";

const RESOLVE_TIMEOUT_MS = 20_000;

export interface ResolvedSource {
  source: { url?: string; refUrl?: string; multiLevelMaster?: boolean } | null;
  variants: { uri: string; height: number; bandwidth: number; label: string }[];
}

export interface PlaybackTarget {
  uri: string;
  headers: Record<string, string>;
  qualityLabel: string;
  resolver: "vidcore" | "vidsrc";
  refUrl: string | null;
  via: "direct" | "relay";
}

function label(height: number, bandwidth: number, index: number): string {
  if (height) return `${height}p`;
  if (bandwidth) return `${Math.round(bandwidth / 1000)} kbps`;
  return `Source ${index + 1}`;
}

function normalize(data: any): ResolvedSource {
  const variants = (data?.variants || [])
    .filter((v: any) => !!v?.uri)
    .map((v: any, index: number) => ({
      uri: String(v.uri),
      height: Number(v.height) || 0,
      bandwidth: Number(v.bandwidth) || 0,
      label: label(Number(v.height) || 0, Number(v.bandwidth) || 0, index),
    }));
  return { source: data?.source || null, variants };
}

async function post(body: Record<string, unknown>): Promise<any> {
  // Read per call: Settings can be edited while the app is running.
  const { apiBase, hasResolver } = getConfig();
  if (!hasResolver) {
    const err = new Error(
      "No stream resolver configured. This build has no Streamly deployment to call - " +
        "set one under Settings > Advanced (the official APK ships with one).",
    );
    logError("streams", "Refusing to resolve a stream without a deployed resolver.", err, { body });
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase}/api/downloadify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      const err = new Error(`Resolver ${body.action} failed (${res.status}). ${detail.slice(0, 200)}`);
      logError("streams", `Resolver ${body.action} returned ${res.status}`, err, { body, status: res.status });
      throw err;
    }
    return await res.json();
  } catch (error: any) {
    if (error?.name === "AbortError") {
      const err = new Error(`Resolver ${body.action} timed out after ${RESOLVE_TIMEOUT_MS}ms.`);
      logError("streams", `Resolver ${body.action} timed out`, err, { body });
      throw err;
    }
    if (String(error?.message || "").startsWith("Resolver ")) throw error;
    logError("streams", `Resolver ${body.action} unreachable (offline or wrong API base?)`, error, {
      body,
      apiBase: getConfig().apiBase,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function resolverBody(action: string, type: string, id: string, season?: number, episode?: number) {
  const kind = type === "tv" ? "tv" : "movie";
  const body: Record<string, unknown> = { action, type: kind, id: String(id) };
  if (kind === "tv") {
    if (season != null) body.season = String(season);
    if (episode != null) body.episode = String(episode);
  }
  return body;
}

export async function resolveVidcore(
  type: string,
  id: string,
  season?: number,
  episode?: number,
): Promise<ResolvedSource> {
  const data = await post(resolverBody("resolvevidcore", type, id, season, episode));
  const resolved = normalize(data);
  logInfo("streams", `VidCore returned ${resolved.variants.length} variant(s).`, {
    type,
    id,
    season,
    episode,
    variants: resolved.variants.map((v) => v.label),
  });
  return resolved;
}

export async function resolveVidsrc(
  type: string,
  id: string,
  season?: number,
  episode?: number,
): Promise<ResolvedSource> {
  const data = await post(resolverBody("resolvevidsrc", type, id, season, episode));
  const resolved = normalize(data);
  logInfo("streams", `VidSrc returned ${resolved.variants.length} variant(s).`, {
    type,
    id,
    season,
    episode,
    variants: resolved.variants.map((v) => v.label),
  });
  return resolved;
}

/* Tries VidCore first (primary provider on the web build) and falls back to
 * VidSrc, mirroring the fallback chain in src/components/NativePlayerView.jsx.
 * The winning provider is reported, because a title that only VidSrc can serve is
 * worth seeing in the log next to a real playback failure. */
export async function resolveBest(
  type: string,
  id: string,
  season?: number,
  episode?: number,
): Promise<ResolvedSource & { provider: "vidcore" | "vidsrc" }> {
  try {
    const primary = await resolveVidcore(type, id, season, episode);
    if (primary.variants.length) return { ...primary, provider: "vidcore" };
    logWarn("streams", "VidCore returned no variants; trying VidSrc.", { type, id, season, episode });
  } catch (error) {
    logWarn("streams", "VidCore failed; trying VidSrc.", {
      type,
      id,
      season,
      episode,
      message: String((error as Error)?.message || error),
    });
  }
  return { ...(await resolveVidsrc(type, id, season, episode)), provider: "vidsrc" };
}

/* Smooth start, same rule as the web build's pickSmooth: the tallest rendition at
 * or below 1080p. Opening a 2160p variant needs ~16 Mbps sustained and stalls on
 * ordinary mobile data, which is exactly the "buffering forever" first impression
 * this app must not have. */
const SMOOTH_MAX_HEIGHT = 1080;

function pickSmooth(variants: ResolvedSource["variants"]): ResolvedSource["variants"][number] {
  const atOrBelow = variants.filter((v) => v.height > 0 && v.height <= SMOOTH_MAX_HEIGHT);
  const pool = atOrBelow.length ? atOrBelow : variants;
  return pool.reduce((best, v) => {
    if (!best) return v;
    if (v.height && best.height) return v.height > best.height ? v : best;
    return v.bandwidth > best.bandwidth ? v : best;
  }, pool[0]);
}

/* Full pipeline: resolve -> smooth start -> direct-with-Referer, falling back to
 * the relayed local playlist when the direct host refuses. This is the only entry
 * point the player screen needs. */
export async function resolvePlayback(
  type: string,
  id: string,
  season?: number,
  episode?: number,
): Promise<PlaybackTarget> {
  const resolved = await resolveBest(type, id, season, episode);
  if (!resolved.variants.length) {
    const err = new Error(
      "No playable source found for this title. The provider may be down or the title unindexed.",
    );
    logError("streams", "Resolver succeeded but returned zero variants.", err, { type, id, season, episode });
    throw err;
  }

  const variant = pickSmooth(resolved.variants);
  const refUrl = resolved.source?.refUrl || null;
  const headers = playbackHeaders(refUrl);
  const resolver = resolved.provider;

  if (await probeDirect(variant.uri, refUrl)) {
    logInfo("streams", "Playing direct from the source host with a Referer.", {
      type,
      id,
      quality: variant.label,
      hasRefUrl: Boolean(refUrl),
    });
    return {
      uri: variant.uri,
      headers,
      qualityLabel: variant.label,
      resolver,
      refUrl,
      via: "direct",
    };
  }

  logWarn("streams", "Direct playback refused; falling back to the relay-rewritten playlist.", {
    type,
    id,
    source: variant.uri,
  });
  const uri = await preparePlaybackSource(variant.uri);
  return {
    uri,
    headers,
    qualityLabel: variant.label,
    resolver,
    refUrl,
    via: "relay",
  };
}

export { REQUEST_TIMEOUT_MS };
