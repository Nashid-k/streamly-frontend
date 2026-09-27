/* Stream resolution for the Android app.
 *
 * The resolvers are NOT bundled into the app: they live in the deployed Vercel
 * project (api/downloadify.js) because they scrape third-party embeds
 * server-side. The app therefore needs EXPO_PUBLIC_API_BASE pointing at that
 * deployment, and calls it exactly like the web build does
 * (src/api/downloadService.js -> resolveVidcore / resolveVidsrc).
 *
 * React Native's fetch has no CORS layer, so cross-origin POSTs to the deployed
 * function are fine. The returned manifest URL is handed to the relay
 * (src/api/relay.ts) which produces a local playlist ExoPlayer can open. */

import { getConfig, REQUEST_TIMEOUT_MS } from "../config";
import { preparePlaybackSource } from "./relay";
import { logError, logInfo, logWarn } from "../utils/logger";

const RESOLVE_TIMEOUT_MS = 20_000;

export interface ResolvedSource {
  source: { url?: string; refUrl?: string; multiLevelMaster?: boolean } | null;
  variants: { uri: string; height: number; bandwidth: number; label: string }[];
}

export interface PlaybackTarget {
  uri: string;
  qualityLabel: string;
  resolver: "vidcore" | "vidsrc";
  refUrl: string | null;
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
      "No stream resolver configured. Open Settings and enter your deployed Streamly URL " +
        "(e.g. https://your-app.vercel.app) - the app calls its /api/downloadify endpoint.",
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
 * VidSrc, mirroring the fallback chain in src/components/NativePlayerView.jsx. */
export async function resolveBest(
  type: string,
  id: string,
  season?: number,
  episode?: number,
): Promise<ResolvedSource> {
  try {
    const primary = await resolveVidcore(type, id, season, episode);
    if (primary.variants.length) return primary;
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
  return resolveVidsrc(type, id, season, episode);
}

/* Full pipeline: resolve -> pick the highest rendition -> relay it into a local
 * playlist. This is the only entry point the player screen needs. */
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
  const variant = resolved.variants[0];
  const uri = await preparePlaybackSource(variant.uri);
  return {
    uri,
    qualityLabel: variant.label,
    resolver: "vidcore",
    refUrl: resolved.source?.refUrl || resolved.source?.url || null,
  };
}

export { REQUEST_TIMEOUT_MS };
