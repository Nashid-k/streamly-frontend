// src/api/nativeHlsLoader.js — hls.js transport for the native player.
//
//   · Playlists go through the relay: the server fetches with the owning
//     player's referer, which referer-gated m3u8s 403 on a bare browser fetch.
//   · Fragments go DIRECT when the segment host allows CORS + Range (probe
//     cached per origin), else through the relay.
//   · Referer-gated hosts are NEVER poked direct: the CDN 403s the app referer
//     and a burst of probes trips its WAF — that is what made tall renditions
//     "play a few seconds, then endless loading". The relay carries the real
//     referer, so those hosts go straight there.
//   · Vercel-free rule: direct is free, relayed bytes are not — try direct
//     first, park throttling origins (401/403/429) on relay-only cooldown, and
//     log relay streaks so burn is never silent.
//   · hls.js resolves relative playlist URLs against the URL we report, so
//     playlist loads always answer with the ORIGINAL upstream URL.
//
// `getRefUrl` lets a mid-session re-resolution pick up a new refUrl; it stays
// fixed per source attempt.

import { logDebug, logWarn } from "../utils/debugLogger.js";
import { parseMasterPlaylist, parseMediaPlaylist } from "../utils/downloadQuality.js";
import { getCueBoundaries } from "../utils/hlsCueTags.js";
import { deriveSliceMore, relayProxyConfig } from "./relayProxy.js";

const ENDPOINT = "/api/downloadify";
// Every relay chunk is a fresh serverless round trip, so latency is weighed
// once per chunk. 3.5MB balances latency against the 4.5MB Vercel response
// cap, and the parallel range fan-out below collapses a fragment to ~one relay
// latency — that is what lets 1080p/4K survive a serverless leg. The Cloudflare
// proxy relay (relayProxy.js) is preferred when configured: one request, whole
// fragment, no serverless cap.
const FRAG_CHUNK_MAX = Math.floor(3.5 * 1024 * 1024);

/* Active relay endpoint + slice + protocol, read lazily so tests can stub the
   env. mode "proxy" = the Cloudflare worker (GET ?url= + Range, whole-fragment
   60MB slices). mode "json" = Vercel /api/downloadify (POST {action,...},
   slices capped at FRAG_CHUNK_MAX by its 4.5MB body cap). */
function relayConfig() {
  const proxy = relayProxyConfig();
  return proxy
    ? { base: proxy.base, slice: proxy.slice, mode: "proxy" }
    : { base: ENDPOINT, slice: FRAG_CHUNK_MAX, mode: "json" };
}

// Default per-load watchdog when hls.js passes no config.timeout: a tolerant
// ceiling for a 3.5MB relayed slice, firing before a hang looks permanent.
const DEFAULT_LOAD_TIMEOUT_MS = 20 * 1000;
// How long a throttled origin stays relay-only: long enough to ride out a WAF
// burst, short enough to re-probe direct while the title still plays.
const DIRECT_BLOCK_MS = 5 * 60 * 1000;
// Relay streaks to log (1 = first fallback, then every 25) so Vercel burn stays
// observable instead of silent.
const RELAY_LOG_EVERY = 25;

const probeCache = new Map();
// origin -> timestamp (ms) until which direct fetches are skipped.
const directBlockedUntil = new Map();

/* Hosts whose CDN gates on the owning player's referer (VidCore family): a bare
   browser fetch 403s and a probe burst trips their WAF. Relay-only by
   construction — the relay supplies the referer. */
/* VidCore rotates its segment CDN, and every host seen so far gates on the
   owning player's referer (rotation-4 hosts gate on the browser's Origin —
   verified live: bare probe with an Origin header 403s, header-less 206s —
   which still burns a doomed direct probe + risks a WAF trip). Keep this list
   current when a new family 403s.
   Rotation-5 (`cleartrail.top`, movie + TV segments) is deliberately NOT here:
   verified live it serves `ACAO: *` + `206` on a BARE range probe, direct and
   through the relay alike, so gating it would push free direct bytes onto the
   relay/Vercel for nothing. Re-probe before ever adding a rotation-5+ host. */
const REFERER_GATED_HOST_SUFFIXES = [
  "quietridge.top",
  "palehive.top",
  "grandpearl.top",
  "wisehive.top",
  "hypergate.top",
  "echogate.top",
  "cybergate.top",
  "lightgrove.top",
];

export function isRefererGated(url) {
  let hostname = null;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return REFERER_GATED_HOST_SUFFIXES.some((sfx) => hostname === sfx || hostname.endsWith(`.${sfx}`));
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/* Direct path open for this URL? False while the origin sits on throttle
   cooldown (or the URL is unparseable) — go straight to the relay. */
function isDirectBlocked(url) {
  // Referer-gated hosts are permanently direct-blocked: a bare browser probe
  // is a guaranteed 403 AND risks tripping the CDN's WAF for the session.
  if (isRefererGated(url)) return true;
  const origin = originOf(url);
  if (!origin) return true;
  const until = directBlockedUntil.get(origin);
  if (!until) return false;
  if (until > Date.now()) return true;
  directBlockedUntil.delete(origin);
  return false;
}

/* Direct-CORS probe per segment origin: Range 0-0 must return a readable
   allow-origin AND a content-range. Cached as a promise so concurrent fragment
   loads share one probe. */
export async function probeDirectOrigin(url, { signal } = {}) {
  let origin = null;
  try {
    origin = new URL(url).origin;
  } catch {
    return { ok: false };
  }
  // A parked origin is answered from the cooldown, not the network. Callers
  // already check isDirectBlocked before probing, but parking has to be
  // authoritative here too — otherwise a caller that forgets the check (or a
  // cache cleared mid-session) pays the doomed request again, which is the
  // exact cost this cooldown exists to remove.
  if (isDirectBlocked(url)) return { ok: false, status: 0, reason: "origin parked on relay-only cooldown" };
  if (!probeCache.has(origin)) {
    probeCache.set(
      origin,
      (async () => {
        try {
          const res = await fetch(url, { headers: { range: "bytes=0-0" }, signal });
          // A 401/403/429 on a bare one-byte probe is a GATE, not a blip: the
          // origin wants the owning player's referer, or it is throttling us.
          // Either way a direct browser fetch can never succeed here, so park
          // the origin on relay-only cooldown NOW instead of re-paying a doomed
          // probe on every fragment for the next few minutes.
          //
          // This is why REFERER_GATED_HOST_SUFFIXES kept needing extending:
          // VidCore rotates its segment CDN to fresh hosts, and a fresh host
          // 403s a bare fetch until it is listed. Verified live against
          // `v1.streamsitegp.workers.dev` (the host vidzen.fun now redirects
          // to): 403 with NO access-control-allow-origin at all, so the
          // browser reports an opaque CORS failure and the loader falls
          // through to the relay having learned nothing. Parking on the
          // status is general, so the next rotation needs no code change.
          if (res.status === 401 || res.status === 403 || res.status === 429) {
            directBlockedUntil.set(origin, Date.now() + DIRECT_BLOCK_MS);
            logWarn("native", "Direct probe refused — origin parked relay-only for 5 min.", {
              origin,
              status: res.status,
            });
            return { ok: false, status: res.status, reason: `probe ${res.status}` };
          }
          const acao = res.headers.get("access-control-allow-origin");
          const allowed =
            acao === "*" || (typeof window !== "undefined" && acao === window.location.origin);
          const match = /bytes\s+0-0\/(\d+)/i.exec(res.headers.get("content-range") || "");
          res.body?.cancel?.().catch?.(() => {});
          return { ok: Boolean(allowed && match), status: res.status };
        } catch (error) {
          // An AbortError means the OWNING load was cancelled (failover, watchdog,
          // seek/title switch). Caching "not direct" would ride the relay for the rest of
          // the session even though the CDN serves CORS — drop the entry so the next load
          // re-probes with its own live signal.
          if (error?.name === "AbortError") probeCache.delete(origin);
          return { ok: false };
        }
      })(),
    );
  }
  return probeCache.get(origin);
}

export function clearProbeCache() {
  probeCache.clear();
}

/* Playlist text memo. The playability probe fetches the entry playlist (and, for a
   master, its first media playlist) through the relay, validates it, then THROWS THE
   TEXT AWAY. hls.js then calls loadSource on the same URL and the loader re-fetches
   that exact playlist — a second serverless round trip for bytes we already hold. On
   Vercel Hobby that is a cold start per duplicate, and the function concurrency cap
   serialises them, so a relay-only title start paid up to three wasted fetches
   (entry playlist, media playlist, then the real load).

   Memoising the validated text removes the duplicate entirely: the probe warms it and
   the loader consumes it. Keyed by URL AND refUrl because a referer-gated host serves
   different manifests per referer, and TTL-capped so a seek, reload or token rotation
   can never be served a stale segment list. */
const PLAYLIST_MEMO_TTL_MS = 30_000;
const PLAYLIST_MEMO_MAX = 12;
const playlistMemo = new Map();

function playlistMemoKey(url, refUrl) {
  return `${refUrl || ""}|${url}`;
}

function memoPlaylist(url, refUrl, text) {
  if (!text || !text.includes("#EXTM3U")) return;
  // VOD ONLY. A live playlist keeps one URL and mutates in place, so serving a
  // memoized copy would freeze its segment window and stall live edge updates.
  // A VOD manifest is immutable for the lifetime of the token that named it, which
  // is exactly the case the probe/load duplicate wastes a round trip on.
  if (!text.includes("#EXT-X-ENDLIST")) return;
  // Re-insert so the Map's insertion order doubles as LRU order.
  playlistMemo.delete(playlistMemoKey(url, refUrl));
  playlistMemo.set(playlistMemoKey(url, refUrl), { text, at: Date.now() });
  while (playlistMemo.size > PLAYLIST_MEMO_MAX) {
    const oldest = playlistMemo.keys().next().value;
    if (oldest === undefined) break;
    playlistMemo.delete(oldest);
  }
}

function takeMemoPlaylist(url, refUrl) {
  const key = playlistMemoKey(url, refUrl);
  const hit = playlistMemo.get(key);
  if (!hit) return null;
  playlistMemo.delete(key);
  if (Date.now() - hit.at > PLAYLIST_MEMO_TTL_MS) return null;
  return hit.text;
}

export function clearPlaylistMemo() {
  playlistMemo.clear();
}

export function clearDirectBlocks() {
  directBlockedUntil.clear();
}

/* One-off thumbnail relay: pull a byte range of a segment/init through the same
   transport playback uses (Cloudflare proxy first, Vercel function fallback)
   and hand it back as a Blob for MSE append. The scrubber preview's off-screen
   decoder feeds on this — bytes flow exactly like a relayed fragment, so
   referer-gated CDNs work there too. */
export async function relaySegmentBlob(url, refUrl, start, max, { signal } = {}) {
  const response = await postDownloadify(
    { action: "segment", url, refUrl, range: { start, max } },
    { signal },
  );
  await throwIfRelayError(response, "Preview segment request failed");
  return response.blob();
}

/* Playability probe: confirm ONE real media byte flows before the player commits
   a screen. A resolver can return a perfect-looking ladder whose segments never
   arrive (vidzen: playlist 200 + duration, segments 429 forever), which plays
   as a black screen with a known duration and no error. Returns {ok, via,
   reason}; follows the entry URL through a master playlist when needed. */
async function relayPlaylistText(url, refUrl, signal) {
  const response = await postDownloadify({ action: "playlist", playlistUrl: url, refUrl }, { signal });
  await throwIfRelayError(response, "Playlist request failed");
  const text = await response.text();
  memoPlaylist(url, refUrl, text);
  return text;
}

export async function probeSourcePlayable(entryUrl, refUrl, { signal } = {}) {
  try {
    let base = entryUrl;
    let text = await relayPlaylistText(base, refUrl, signal);
    if (!text || !text.includes("#EXTM3U")) return { ok: false, reason: "not a playlist" };
    if (text.includes("#EXT-X-STREAM-INF")) {
      const levels = parseMasterPlaylist(text, base);
      const first = (levels || []).find((v) => v?.uri);
      if (!first) return { ok: false, reason: "master has no levels" };
      base = first.uri;
      text = await relayPlaylistText(base, refUrl, signal);
    }
    const media = parseMediaPlaylist(text, base);
    const target = media?.segments?.[0]?.url || media?.initUrl;
    if (!target) return { ok: false, reason: "playlist has no segments" };
    // 1) direct byte sip (1 byte Range — cheap, and exactly the path playback uses
    //    first). Referer-gated hosts skip it: their CDN 403s a bare app-referer
    //    probe and probe bursts are what trip the WAF. The manifest host may be
    //    gated while the segment host is new (or vice versa) — check both the entry
    //    URL and the sip target.
    //
    // This used to run its OWN inline fetch instead of probeDirectOrigin, which
    // meant two probe implementations that could disagree: the shared one learned
    // a segment origin was gated, and this one still paid a doomed probe for it on
    // every title load. It now shares the cache and the cooldown, and also
    // honours isDirectBlocked so an origin parked mid-session is skipped outright.
    if (!isRefererGated(target) && !isRefererGated(base) && !isDirectBlocked(target)) {
      try {
        const sip = await probeDirectOrigin(target, { signal });
        // A direct pull sends NO range header (see directFragment), so a plain 2xx
        // is the real "would direct work" answer. The stricter ACAO+content-range
        // pair in the probe is right for RELAY decisions but would wrongly reject a
        // host that plays fine directly without supporting range.
        if (sip.ok || (sip.status >= 200 && sip.status < 300)) {
          return { ok: true, via: "direct" };
        }
      } catch {
        // fall through to the relay sip below
      }
      if (signal?.aborted) throw new Error("Aborted");
    }
    // 2) relay byte sip (4KB through downloadify — server IP + referer).
    try {
      const res = await postDownloadify(
        { action: "segment", url: target, refUrl, range: { start: 0, max: 4095 } },
        { signal },
      );
      if (res.ok) return { ok: true, via: "relay" };
      return { ok: false, reason: `relay refused (${res.status})` };
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      return { ok: false, reason: error?.code || error?.message || "relay failed" };
    }
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    return { ok: false, reason: error?.message || "probe failed" };
  }
}

async function postDownloadify(body, { signal } = {}) {
  const { base, slice, mode } = relayConfig();
  // A proxy whole-fragment call that falls back to the Vercel function MUST
  // re-slice at FRAG_CHUNK_MAX or the 4.5MB body cap breaks mid-flight.
  const candidates =
    mode === "json"
      ? [{ base, slice, mode }]
      : [
          { base, slice, mode: "proxy" },
          { base: ENDPOINT, slice: FRAG_CHUNK_MAX, mode: "json" },
        ];
  const isTransport = body.action === "segment" || body.action === "playlist";
  // A transport call without a URL would hit the worker as ?url=undefined — a
  // guaranteed 500 + CORS noise. Fail HERE with a real error so the caller's
  // retry/failover logic runs instead of the browser's opaque fetch failure.
  if (isTransport && !body.url && !body.playlistUrl) {
    throw new Error("relay: missing target URL (source had no playable URL)");
  }
  // Only fragment pulls send a Range slice; playlists are small full-text GETs.
  const isSegment = body.action === "segment";
  const start = Math.max(0, Math.floor(Number(body.range?.start) || 0));
  // The proxy can carry the owning player's referer (?referer= upstream), which
  // is what lets it serve referer-gated CDNs whole-fragment instead of taxing
  // Vercel.
  const referer = body.refUrl ? String(body.refUrl) : "";
  let lastError;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    // Fragments carry `url`, playlists carry `playlistUrl`. Picking the wrong one
    // asked the worker for `?url=undefined`, whose 200 landing page came back as a
    // "playlist" and killed every source at the playability probe.
    const target = isSegment ? body.url : body.playlistUrl;
    const request =
      candidate.mode === "proxy"
        ? {
            // The worker is a GET ?url= passthrough for BOTH fragments (Range-forwarding)
            // and playlists (plain GET), carrying our referer in ?referer= — which keeps
            // every manifest reload off Vercel Hobby, where a cold-start playlist call
            // reads exactly like endless "loading" (hls.js refreshes the level playlist
            // on a rolling basis while the buffer refills).
            url: `${candidate.base}?url=${encodeURIComponent(target)}${
              referer ? `&referer=${encodeURIComponent(referer)}` : ""
            }`,
            init: {
              method: "GET",
              // The proxy forwards Range to the origin and is capped only by the origin
              // (no 4.5MB serverless cap).
              headers: isSegment ? { range: `bytes=${start}-${start + candidate.slice - 1}` } : undefined,
              signal,
            },
          }
        : {
            url: candidate.base,
            init: {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(isSegment ? { ...body, range: { start, max: candidate.slice } } : body),
              signal,
            },
          };
    try {
      const res = await fetch(request.url, request.init);
      if (isSegment) {
        // A non-ok proxy reply (down/broken deploy) falls through to the Vercel
        // function; the LAST candidate's error is the one that surfaces.
        if (res.ok || index === candidates.length - 1) return res;
        lastError = res;
        await res.body?.cancel?.().catch?.(() => {});
        continue;
      }
      // A 200 is NOT proof of a playlist: the worker answers a bad ?url= with its
      // landing page, and a CDN WAF block can arrive as 200 HTML. Either body used
      // to reach the caller as a "playlist" — the player then reported "not a
      // playlist" and failed every source while downloads kept working. Playlists
      // are small text, so buffer it and accept only a real #EXTM3U.
      const text = await res.text();
      if (text.includes("#EXTM3U") || index === candidates.length - 1) {
        const status = res.status >= 200 && res.status <= 599 ? res.status : 502;
        return new Response(text, {
          status,
          headers: {
            "content-type": res.headers?.get?.("content-type") || "application/vnd.apple.mpegurl",
          },
        });
      }
      lastError = res;
    } catch (error) {
      lastError = error;
      if (index === candidates.length - 1) throw error;
    }
  }
  throw lastError ?? new Error("relay unavailable");
}

/* The relay's JSON error envelope ({ok:false, code, error}) carries the real
   code — surface it so the player can tell an expired token from a dead CDN. */
async function throwIfRelayError(response, fallback) {
  if (response.ok) return;
  let code = "http";
  let message = `${fallback} (${response.status})`;
  try {
    const text = await response.text();
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.ok === false) {
      if (parsed.code) code = parsed.code;
      if (parsed.error) message = parsed.error;
    }
  } catch {
    // Non-JSON error body — keep the generic message/code.
  }
  const error = new Error(message);
  error.code = code;
  throw error;
}

export function createStreamlyLoader({ getRefUrl, onDirectPath, onRelayPath, onCueBoundaries } = {}) {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  /* Distinct from AbortError so a watchdog win is tellable from a player abort:
       hls.js routes this into fragLoadTimeout (its own retry/backoff policy). */
  function timeoutError(message) {
    const error = new Error(message);
    error.name = "TimeoutError";
    return error;
  }

  /* hls.js handlers WRITE into the stats object we hand them (playlist-loader sets
       stats.parsing.start), so it must carry the full LoadStats shape — flat
       fields PLUS the loading/parsing/buffering sub-objects, or hls throws
       "Cannot set properties of undefined". */
  const finishStats = (trequest, loaded) => {
    const end = now();
    return {
      trequest,
      tfirst: end,
      tload: end,
      loaded,
      total: loaded,
      retry: 0,
      chunkCount: 0,
      bwEstimate: 0,
      aborted: false,
      loading: { start: trequest, first: end, end },
      parsing: { start: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 },
    };
  };

  return class StreamlyLoader {
    constructor() {
      this.aborted = false;
      this.controller = null;
      this._timeoutTimer = null;
      this.trequest = 0;
      // hls.js grabs this reference directly (fragment-loader assigns
      // frag.stats = loader.stats), so it must ALWAYS be a full LoadStats-shaped
      // object — never undefined.
      this.stats = finishStats(0, 0);
      // Consecutive fragments served through the relay. Reset by any direct success.
      this.relayStreak = 0;
    }

    destroy() {
      this.abort();
    }

    abort() {
      this.aborted = true;
      this.resetTimer();
      try {
        this.controller?.abort();
      } catch {
        // controller already settled — nothing to cancel
      }
    }

    load(context, config, callbacks) {
      this.context = context;
      this.callbacks = callbacks;
      // A loader instance is REUSED across retries/fragments, so start each load
      // un-aborted with a fresh cancel handle or one abort() poisons the rest.
      this.aborted = false;
      // One controller per LOAD, shared by every sub-request (playlist, probe, direct
      // stream, relay chunks) so watchdog/abort cancel the whole pull at once.
      this.controller = new AbortController();
      this.trequest = now();
      // One live object for the whole load: hls.js keeps the reference and reads
      // loaded/total off the progress calls, so mutate in place — never replace it.
      this.stats = finishStats(this.trequest, 0);
      this.firstByteSeen = false;
      this.resetTimer();

      // hls.js expects onTimeout (→ its own retry/failover) when a load hangs; a
      // never-resolving fetch would spin forever — the core of the "plays 5-10s, then
      // endless loading" bug. Race the load against a watchdog that aborts and
      // settles.
      const timeoutMs = config?.timeout || DEFAULT_LOAD_TIMEOUT_MS;
      const runPromise = this.run();
      runPromise.catch(() => {
        // The watchdog usually wins, so this rejects first; the loser must not surface
        // as an unhandled rejection.
      });
      const watchdog = new Promise((resolve, reject) => {
        this._timeoutTimer = setTimeout(() => {
          this._timeoutTimer = null;
          try {
            this.controller?.abort();
          } catch {
            // controller already settled — nothing to cancel
          }
          reject(timeoutError(`load timed out after ${Math.round(timeoutMs)}ms`));
        }, timeoutMs);
      });

      Promise.race([runPromise, watchdog]).then(
        (data) => {
          this.resetTimer();
          if (this.aborted) return;
          const end = now();
          const loaded = data?.byteLength ?? data?.length ?? 0;
          this.stats.loaded = loaded;
          this.stats.total = loaded;
          this.stats.tload = end;
          this.stats.loading.end = end;
          if (!this.firstByteSeen) {
            this.stats.tfirst = end;
            this.stats.loading.first = end;
          }
          callbacks.onSuccess({ url: context.url, data }, this.stats, context);
        },
        (error) => {
          this.resetTimer();
          if (this.aborted) return;
          // Watchdog win: hand it to hls.js — its retry config drives fragLoadTimeout
          // → backoff / ABR step-down.
          if (error?.name === "TimeoutError") {
            callbacks.onTimeout(this.stats, context, null);
            return;
          }
          if (error?.name === "AbortError") return;
          // Pass the relay's real code in the text (hls.js forwards only {code, text} and
          // builds its own "HTTP Error 0 <text>"). The player parses the [relay:<code>]
          // tag to tell an expired token (re-resolve + resume) from a dead CDN (fail
          // over).
          const relayTag =
            error && error.code && error.code !== "http" ? `[relay:${error.code}] ` : "";
          callbacks.onError(
            { code: 0, text: `${relayTag}${error?.message || "load failed"}` },
            context,
            null,
            finishStats(this.trequest, 0),
          );
        },
      );
    }

    resetTimer() {
      if (this._timeoutTimer) {
        clearTimeout(this._timeoutTimer);
        this._timeoutTimer = null;
      }
    }

    signal() {
      // Sub-requests share the load's controller so watchdog/abort cancel the whole
      // pull at once.
      return this.controller?.signal;
    }

    async run() {
      const { url } = this.context;
      // hls.js marks media/audio-init requests with `frag`; everything else
      // (manifest/level/audioTrack/subtitleTrack) is a playlist fetch.
      if (this.context.frag) return this.loadFragment(url);
      return this.loadPlaylist(url);
    }

    /* Feed hls.js progress callbacks as bytes arrive (bandwidth estimator +
       progressive MSE appends), mutating the live stats object in place.
       callbacks.onProgress is optional. */
    progress(chunk, total) {
      if (!chunk || chunk.length === 0) return;
      if (!this.firstByteSeen) {
        this.firstByteSeen = true;
        const t = now();
        this.stats.tfirst = t;
        this.stats.loading.first = t;
      }
      this.stats.loaded += chunk.length;
      if (Number.isFinite(total) && total > 0) this.stats.total = total;
      try {
        this.callbacks?.onProgress?.(this.stats, this.context, chunk, null);
      } catch {
        // a throwing progress listener must never kill the load
      }
    }

    async loadPlaylist(url) {
      const refUrl = getRefUrl?.();
      // The playability probe already pulled this exact manifest through the relay a
      // moment ago. Serve that copy instead of paying a second serverless round trip
      // for a byte-identical playlist.
      const memoized = takeMemoPlaylist(url, refUrl);
      if (memoized) {
        this.reportCues(memoized, url);
        return memoized;
      }
      const response = await postDownloadify(
        { action: "playlist", playlistUrl: url, refUrl },
        { signal: this.signal() },
      );
      await throwIfRelayError(response, "Playlist request failed");
      const text = await response.text();
      if (!text || !text.includes("#EXTM3U")) {
        throw new Error("Upstream did not return a playlist");
      }
      memoPlaylist(url, refUrl, text);
      this.reportCues(text, url);
      return text;
    }

    /* A manifest that states its own cue boundaries beats the player's 90s intro
       guess. No provider is known to emit them, so this also REPORTS the answer for
       every source it sees — which is the only way to learn whether any of them do.
       Logged at warn level on purpose: logDebug is gated behind a debug flag, so a
       debug-level note would be invisible in the one place the answer is needed. */
    reportCues(text, url) {
      // A MASTER playlist carries variants, never cues. Reporting it would burn the
      // one-shot flag and leave the media playlist — where the tags actually live —
      // unchecked, which is exactly the source shape most titles use.
      if (!text.includes("#EXT-X-STREAM-INF") && this.cueChecked) return;
      const isMaster = text.includes("#EXT-X-STREAM-INF");
      if (isMaster) return;
      this.cueChecked = true;
      const bounds = getCueBoundaries(text);
      if (bounds) {
        logWarn("native", "Manifest carries cue tags — using real skip boundaries.", {
          url: String(url).slice(0, 80),
          ...bounds,
        });
      } else {
        logWarn("native", "No cue tags in manifest — skip windows stay estimated.", {
          url: String(url).slice(0, 80),
        });
      }
      try {
        onCueBoundaries?.(bounds || null);
      } catch {
        // a throwing listener must never kill a playlist load
      }
    }

    async loadFragment(url) {
      const signal = this.signal();
      // Throttle-cooldown origins skip direct entirely — no probe, no doomed attempt
      // — straight to the relay, which also stops us re-poking a WAF burst.
      if (!isDirectBlocked(url)) {
        let probe = { ok: false };
        try {
          probe = await probeDirectOrigin(url, { signal });
        } catch {
          probe = { ok: false };
        }
        if (this.aborted) throw new Error("Aborted");
        if (probe.ok) {
          try {
            const data = await this.directFragment(url, signal);
            const origin = originOf(url);
            if (origin) directBlockedUntil.delete(origin);
            this.relayStreak = 0;
            onDirectPath?.();
            return data;
          } catch (error) {
            if (error?.name === "AbortError" || this.aborted) throw error;
            // The server said no (401/403/429): park this origin on relay-only cooldown
            // instead of failing one fragment at a time. Other errors (blip, CSP, offline)
            // stay direct-first — they fail fast and may clear on their own.
            const status = error?.status;
            if (status === 401 || status === 403 || status === 429) {
              const origin = originOf(url);
              if (origin) {
                directBlockedUntil.set(origin, Date.now() + DIRECT_BLOCK_MS);
                logWarn("native", "Direct path throttled — relay-only for 5 min.", {
                  origin,
                  status,
                });
              }
            } else {
              // A CDN that passed the probe but fails the pull for another reason (rotated
              // token, reset connection) still falls back to the relay below.
              logWarn("native", "Direct fragment fetch failed — falling back to relay.", {
                message: error?.message,
              });
            }
          }
        }
      }
      return this.relayFragment(url, signal);
    }

    /* Direct pull, streamed so progress fires while bytes are still arriving
       (TTFB-to-first-append, not whole-segment latency). */
    async directFragment(url, signal) {
      const res = await fetch(url, { signal });
      if (!res.ok) {
        const error = new Error(`Direct fragment fetch failed (${res.status})`);
        error.status = res.status;
        throw error;
      }
      const total = Number(res.headers.get("content-length") || 0) || 0;
      if (res.body && typeof res.body.getReader === "function") {
        const reader = res.body.getReader();
        const chunks = [];
        let size = 0;
        for (;;) {
          if (this.aborted) {
            try {
              await reader.cancel();
            } catch {
              // reader already closed
            }
            throw new Error("Aborted");
          }
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = value ? new Uint8Array(value) : null;
          if (chunk?.length) {
            chunks.push(chunk);
            size += chunk.length;
            this.progress(chunk, total);
          }
        }
        if (size === 0) throw new Error("Direct fragment fetch returned no bytes");
        const out = new Uint8Array(size);
        let off = 0;
        for (const c of chunks) {
          out.set(c, off);
          off += c.length;
        }
        return out.buffer;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length === 0) throw new Error("Direct fragment fetch returned no bytes");
      this.progress(buf, total || buf.length);
      return buf.buffer;
    }

    /* Relay one fragment with parallel range chunking. Chunk 0 is fetched alone: its
       exact byte count seeds the fan-out stride. When every returned slice is full
       (the uniform case — e.g. a worker serving one whole fragment) the remaining
       ranges run CONCURRENTLY and are handed to hls.js strictly in byte order,
       collapsing per-fragment wall-clock from N×relay-latency to ~one relay
       latency, which is what lets tall (1080p/4K) fragments survive the serverless
       leg. A short chunk 0 (a CDN capping mid-file) cannot seed uniform strides, so
       that fragment falls back to the serial chain. Abort settles every in-flight
       range, and each chunk is an independent upstream Range fetch, so concurrency
       is safe. */
    async relayFragment(url, signal) {
      const refUrl = getRefUrl?.();
      const { slice } = relayConfig();
      const relayChunk = async (start) => {
        const response = await postDownloadify(
          { action: "segment", url, refUrl, range: { start } },
          { signal },
        );
        await throwIfRelayError(response, "Segment request failed");
        const buf = new Uint8Array(await response.arrayBuffer());
        return { buf, more: deriveSliceMore(response, buf.length, slice) };
      };
      const finish = (chunks) => {
        const total = chunks.reduce((n, c) => n + c.length, 0);
        const out = new Uint8Array(total);
        let off = 0;
        for (const c of chunks) {
          out.set(c, off);
          off += c.length;
        }
        this.relayStreak = (this.relayStreak || 0) + 1;
        if (this.relayStreak === 1 || this.relayStreak % RELAY_LOG_EVERY === 0) {
          logWarn("native", `${this.relayStreak} consecutive fragment(s) via Vercel relay — direct path unavailable.`, {
            url: String(url).slice(0, 80),
          });
        } else {
          logDebug("native", `Relayed fragment (${total} bytes).`, { url: String(url).slice(0, 80) });
        }
        // One relayed FRAGMENT landed (not one chunk): tell the player so it can count
        // a real streak and steer tall renditions when relay can't keep feeding them.
        onRelayPath?.();
        return out.buffer;
      };

      const first = await relayChunk(0);
      if (this.aborted) throw new Error("Aborted");
      if (!first.more) {
        if (first.buf.length === 0) throw new Error("Relay returned no bytes");
        this.progress(first.buf, 0);
        return finish([first.buf]);
      }
      if (first.buf.length !== slice) {
        const serial = [first.buf];
        this.progress(first.buf, 0);
        let start = first.buf.length;
        for (;;) {
          if (this.aborted) throw new Error("Aborted");
          const next = await relayChunk(start);
          if (next.buf.length === 0) break;
          serial.push(next.buf);
          start += next.buf.length;
          this.progress(next.buf, 0);
          if (!next.more) break;
        }
        return finish(serial);
      }

      // Uniform-full-chunk path: parallel fan-out, in-order emission. The remaining
      // ranges run in WINDOWS of CONCURRENCY: a window issues its slices, emits each
      // in order, and launches the next window only once the whole window has settled
      // (bounded request count — pumping per settle overshoots the tail before the
      // EOF marker lands) while hls.js still appends slices as they arrive.
      const CONCURRENCY = 4;
      const emitted = [first.buf]; // parts 0..N handed to hls.js in order
      const parts = new Map(); // index -> bytes (1-based; index sits at stride*slice)
      let nextIndex = 1;
      let eofIndex = 0; // highest index where the stream declared EOF
      let firstError = null; // a chunk that failed for any reason other than abort
      const emitAll = () => {
        while (!this.aborted) {
          const idx = emitted.length;
          const ready = parts.get(idx);
          if (!ready) break;
          parts.delete(idx);
          this.progress(ready, 0);
          emitted.push(ready);
        }
      };
      const issueSingle = async (idx) => {
        try {
          const { buf, more } = await relayChunk(idx * slice);
          if (this.aborted) return;
          parts.set(idx, buf); // a 0-length slice is a valid EOF marker part
          if (!more) {
            eofIndex = Math.max(eofIndex, idx);
          } else if (buf.length === 0 || buf.length < slice) {
            // Short slice that still claims "more": the guessed strides are desynced (relay
            // caps at slice, so a mid-file short slice means we can't trust offsets) — treat
            // it as the tail.
            eofIndex = Math.max(eofIndex, idx);
          }
        } catch (error) {
          // Stop the fan-out, but DO NOT let this degrade into a short read: returning
          // the bytes collected so far would hand hls.js a TRUNCATED fragment as a
          // success, which appends a corrupt segment (decode error / stutter) instead
          // of retrying a fragment that may well succeed. Abort is the owning load's
          // call and settles on its own; anything else fails this load.
          if (this.aborted) return;
          if (!firstError) firstError = error;
          eofIndex = Math.max(eofIndex, idx);
        } finally {
          emitAll();
        }
      };
      const runWindow = async () => {
        const window = [];
        for (let i = 0; i < CONCURRENCY; i += 1) {
          const idx = nextIndex++;
          window.push(issueSingle(idx));
        }
        await Promise.all(window);
        emitAll();
        if (this.aborted) throw new Error("Aborted");
        if (firstError) throw firstError;
        if (!eofIndex) await runWindow();
      };
      await runWindow();
      return finish(emitted);
    }
  };
}
