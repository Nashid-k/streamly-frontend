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
import { runtimeSettings, type QualityPreference } from "../store/settings";
import { numericId } from "./tmdb";
import { playbackHeaders, preparePlaybackSource, probeDirect, relayIsKnownBad } from "./relay";
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
  /* Every rendition the resolver offered, so the player can switch quality
   * without re-resolving. Sorted tallest-first for the menu. */
  qualities: { uri: string; label: string; height: number }[];
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

/* The resolver payload, and the one place that has ever broken playback.
 *
 * The app stores ids as "movie-27205" / "tv-1399" - that is the FROZEN id contract
 * shared with the web build, so the same title and the same My List entry mean the
 * same thing in both clients. The resolver is a different system with a stricter
 * contract: api/downloadify.js:270 and :385 validate the id with /^\d{1,12}$/ and
 * answer 400 `bad-id` for anything else. So the prefixed id has to be unwrapped
 * here, at the boundary.
 *
 * This was the bug behind "this title will not play - resolver failed (400)" in
 * the shipped APK: `type: "movie", id: "movie-27205"` 400s in 626ms, while
 * `type: "movie", id: "27205"` returns 4 variants. The web build was unaffected
 * because it holds the bare TMDB id. The previous smoke test missed it for the
 * same reason - it built the request itself instead of using this function - so
 * the builder is exported and pinned by tests now. */
export function resolverPayload(
  action: string,
  type: string | undefined,
  id: string,
  season?: number,
  episode?: number,
): Record<string, unknown> {
  const numeric = numericId(id);
  if (!numeric) {
    throw new Error(
      `"${id}" is not a Streamly title id (expected movie-<id> or tv-<id>), so the ` +
        "resolver cannot be asked for it.",
    );
  }
  /* The id prefix is the more reliable signal: a deep link (streamly://play/:id)
   * arrives with no type at all, and a TV title asked for as a movie resolves to
   * the wrong thing rather than failing. */
  const kind = String(id).startsWith("tv-") ? "tv" : type === "tv" ? "tv" : "movie";
  const body: Record<string, unknown> = { action, type: kind, id: numeric };
  if (kind === "tv") {
    /* The resolver needs BOTH or it answers no-source, and a series Play button
     * with no episode list yet still has to do something sensible. */
    body.season = String(season ?? 1);
    body.episode = String(episode ?? 1);
  }
  return body;
}

export async function resolveVidcore(
  type: string,
  id: string,
  season?: number,
  episode?: number,
): Promise<ResolvedSource> {
  const data = await post(resolverPayload("resolvevidcore", type, id, season, episode));
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
  const data = await post(resolverPayload("resolvevidsrc", type, id, season, episode));
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
 * or below the cap. "auto" caps at 1080p - opening a 2160p variant needs ~16 Mbps
 * sustained and stalls on ordinary mobile data, which is exactly the "buffering
 * forever" first impression this app must not have. A user-chosen cap (1080/720/
 * 480 from Settings › Default quality) replaces the 1080 ceiling. */
const SMOOTH_MAX_HEIGHT = 1080;

function pickForPreference(
  variants: ResolvedSource["variants"],
  preference: QualityPreference,
): ResolvedSource["variants"][number] {
  const cap = preference === "auto" ? SMOOTH_MAX_HEIGHT : Number(preference);
  const atOrBelow = variants.filter((v) => v.height > 0 && v.height <= cap);
  const pool = atOrBelow.length ? atOrBelow : variants;
  return pool.reduce((best, v) => {
    if (!best) return v;
    if (v.height && best.height) return v.height > best.height ? v : best;
    return v.bandwidth > best.bandwidth ? v : best;
  }, pool[0]);
}

/* Exported for the player's quality menu - the app's own smooth-start rule is
 * also how the initial pick is labelled. */
export function pickSmooth(variants: ResolvedSource["variants"]): ResolvedSource["variants"][number] {
  const atOrBelow = variants.filter((v) => v.height > 0 && v.height <= SMOOTH_MAX_HEIGHT);
  const pool = atOrBelow.length ? atOrBelow : variants;
  return pool.reduce((best, v) => {
    if (!best) return v;
    if (v.height && best.height) return v.height > best.height ? v : best;
    return v.bandwidth > best.bandwidth ? v : best;
  }, pool[0]);
}

/* Full pipeline: resolve -> the user's quality cap (Settings) -> direct-with-
 * Referer, falling back to the relayed local playlist when the direct host
 * refuses. This is the only entry point the player screen needs. */
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

  const variant = pickForPreference(resolved.variants, runtimeSettings().defaultQuality);
  const refUrl = resolved.source?.refUrl || null;
  const headers = playbackHeaders(refUrl);
  const resolver = resolved.provider;
  /* Quality menu: every rendition, tallest first, labelled the way the resolver
   * labelled it. The initial pick is marked in PlayerScreen via qualityLabel. */
  const qualities = [...resolved.variants]
    .sort((a, b) => (b.height || 0) - (a.height || 0))
    .map((v) => ({ uri: v.uri, label: v.label, height: v.height }));

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
      qualities,
    };
  }

  logWarn("streams", "Direct playback refused; falling back to the relay-rewritten playlist.", {
    type,
    id,
    source: variant.uri,
  });
  /* Only route left. If the relay was already found to be answering with a 403, say
   * that plainly instead of making the user watch one more dead round trip per
   * attempt before reading the same conclusion. */
  if (relayIsKnownBad()) {
    const err = new Error(
      "The source host refused this stream and the backup relay is not reachable either. " +
        "Nothing on the device can fix that - try again later.",
    );
    logError("streams", "Both playback routes are unusable.", err, { type, id, source: variant.uri });
    throw err;
  }
  const uri = await preparePlaybackSource(variant.uri);
  return {
    uri,
    headers,
    qualityLabel: variant.label,
    resolver,
    refUrl,
    via: "relay",
    qualities,
  };
}

export { REQUEST_TIMEOUT_MS };
