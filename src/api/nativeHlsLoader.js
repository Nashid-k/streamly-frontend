// src/api/nativeHlsLoader.js — hls.js transport for the native-playback prototype.
//
// Design (proven by the audit, 2026-09-25):
//   · Manifest/level/audio playlists go through the downloadify `playlist`
//     action: the server fetches with the owning player's referer (VidCore's
//     moon.quietridge.top m3u8s 403 a bare browser fetch) and hands back text.
//     Playlists are kilobytes — negligible serverless cost.
//   · Media fragments go DIRECT from the browser when the segment host allows
//     CORS + Range (VidCore's paperorbit.top/quietnexus.top: `*`, +206), and
//     fall back to the downloadify `segment` range-relay otherwise (VidSrc's
//     pchrelay hosts). The per-origin probe result is cached per page load.
//   · VERCEL-FREE RULE: direct costs us nothing; every relayed byte costs
//     bandwidth + invocations. So direct is always tried first, a throttling
//     origin (401/403/429) is put on relay-only cooldown instead of being
//     re-poked on every fragment, and relay streaks are logged so serverless
//     burn stays visible instead of silent.
//   · hls.js resolves relative playlist URLs against the manifest URL we
//     report, so the loader always answers playlist loads with the ORIGINAL
//     upstream URL (never the relay endpoint).
//
// The class factory takes `getRefUrl` (the current source's refUrl) because
// token rotation (CineSrc) may swap it mid-session; the prototype keeps it
// fixed per source attempt.

import { logDebug, logWarn } from "../utils/debugLogger.js";
import { parseMasterPlaylist, parseMediaPlaylist } from "../utils/downloadQuality.js";

const ENDPOINT = "/api/downloadify";
// Every relay chunk is a fresh serverless round trip, so latency is weighed
// once per chunk. 1MB slices made slow CDNs stall on multi-MB ts segments
// (plays 5-10s, then endless loading). 3.5MB balances latency vs the 4.5MB
// Vercel response cap and keeps most fragments to 1-2 round trips.
const FRAG_CHUNK_MAX = Math.floor(3.5 * 1024 * 1024);
// Default per-load watchdog when hls.js passes no config.timeout. 20s is a
// tolerant ceiling for a 3.5MB relayed slice through Vercel while still
// firing before a user perceives a permanent hang.
const DEFAULT_LOAD_TIMEOUT_MS = 20 * 1000;
// A throttled origin stays relay-only this long — long enough to ride out a
// WAF burst, short enough to re-probe direct while the title still plays.
const DIRECT_BLOCK_MS = 5 * 60 * 1000;
// Log relay usage at these streak lengths (1 = first fallback, then every 25)
// so Vercel burn is observable in the console, never silent.
const RELAY_LOG_EVERY = 25;

const probeCache = new Map();
// origin -> timestamp (ms) until which direct fetches are skipped.
const directBlockedUntil = new Map();

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/* Direct path open for this URL? False when the origin is on throttle
   cooldown (or the URL is unparseable) — the caller goes straight to the
   relay without spending a doomed direct attempt. */
export function isDirectBlocked(url) {
  const origin = originOf(url);
  if (!origin) return true;
  const until = directBlockedUntil.get(origin);
  if (!until) return false;
  if (until > Date.now()) return true;
  directBlockedUntil.delete(origin);
  return false;
}

/* Direct-CORS probe per segment origin: Range 0-0 must come back with an
   allow-origin we can read AND a content-range (seekable). Cached as a
   promise so concurrent fragment loads share one probe. */
export async function probeDirectOrigin(url, { signal } = {}) {
  let origin = null;
  try {
    origin = new URL(url).origin;
  } catch {
    return { ok: false };
  }
  if (!probeCache.has(origin)) {
    probeCache.set(
      origin,
      (async () => {
        try {
          const res = await fetch(url, { headers: { range: "bytes=0-0" }, signal });
          const acao = res.headers.get("access-control-allow-origin");
          const allowed =
            acao === "*" || (typeof window !== "undefined" && acao === window.location.origin);
          const match = /bytes\s+0-0\/(\d+)/i.exec(res.headers.get("content-range") || "");
          res.body?.cancel?.().catch?.(() => {});
          return { ok: Boolean(allowed && match) };
        } catch {
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

export function clearDirectBlocks() {
  directBlockedUntil.clear();
}

/* Playability probe: verify ONE real media byte flows before the player
   commits a screen to this source. A resolver can hand us a perfect-looking
   ladder whose segments never arrive (VidCore's vidzen fallback: playlist 200
   + duration, segments 429 forever) — without this check that plays as a
   black screen with a known duration and no error. Returns { ok, via, reason }.
   Follows the entry URL through a master (CineSrc) when needed. */
async function relayPlaylistText(url, refUrl, signal) {
  const response = await postDownloadify({ action: "playlist", playlistUrl: url, refUrl }, { signal });
  await throwIfRelayError(response, "Playlist request failed");
  return response.text();
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
    // 1) direct byte sip (1 byte Range — cheap, and exactly the path playback
    //    will use first).
    try {
      const res = await fetch(target, { headers: { range: "bytes=0-0" }, signal });
      if (res.ok) {
        res.body?.cancel?.().catch?.(() => {});
        return { ok: true, via: "direct" };
      }
    } catch {
      // fall through to the relay sip below
    }
    if (signal?.aborted) throw new Error("Aborted");
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
  return fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

/* The relay answers failures with its JSON error envelope ({ ok:false, code,
   error }) — surface the real code instead of a generic HTTP error so the
   player can tell an expired token from a dead CDN. */
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

export function createStreamlyLoader({ getRefUrl }) {
  const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  /* Distinct from AbortError so the watchdog win is tellable from a player
     abort: hls.js routes this into fragLoadTimeout (with its own retry /
     backoff policy) instead of a hard error. */
  function timeoutError(message) {
    const error = new Error(message);
    error.name = "TimeoutError";
    return error;
  }

  /* hls.js internal handlers WRITE into the stats object we hand them
     (e.g. playlist-loader sets stats.parsing.start on success), so it must
     carry the full LoadStats shape — flat fields PLUS the loading / parsing /
     buffering sub-objects. A partial object crashes inside hls with
     "Cannot set properties of undefined (setting 'start')". */
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
      // hls.js grabs this reference directly (fragment-loader does
      // `loader.stats.retry = frag.stats.retry; frag.stats = loader.stats`),
      // so it must ALWAYS be a full LoadStats-shaped object — never undefined.
      this.stats = finishStats(0, 0);
      // Consecutive fragments served through the Vercel relay (serverless
      // burn). Reset by any direct success.
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
      // A loader instance is REUSED across retries / the next fragment, so
      // start each load un-aborted with a fresh cancel handle or one abort()
      // would poison every later request.
      this.aborted = false;
      // One controller per LOAD, shared by every sub-request (playlist,
      // probe, direct stream, relay chunks) so the watchdog and abort() cancel
      // the whole fragment pull at once.
      this.controller = new AbortController();
      this.trequest = now();
      // One live object for the whole load: hls.js keeps references to it
      // (frag.stats = loader.stats) and reads loaded/total off the progress
      // calls, so mutate in place — never replace it mid-load.
      this.stats = finishStats(this.trequest, 0);
      this.firstByteSeen = false;
      this.resetTimer();

      // hls.js passes config.timeout and expects onTimeout (→ its own retry /
      // failover) when a load hangs. A fetch that never resolves would
      // otherwise spin the spinner forever — the core of the "plays 5-10s,
      // then endless loading" bug. Race the real load against a watchdog that
      // aborts the controller and settles.
      const timeoutMs = config?.timeout || DEFAULT_LOAD_TIMEOUT_MS;
      const runPromise = this.run();
      runPromise.catch(() => {
        // The watchdog usually wins a hung request, so this one rejects first
        // (AbortError). The loser must not surface as an unhandled rejection.
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
          // Watchdog win: let hls.js handle it (its retry config drives
          // fragLoadTimeout → backoff / ABR step-down in the player).
          if (error?.name === "TimeoutError") {
            callbacks.onTimeout(this.stats, context, null);
            return;
          }
          if (error?.name === "AbortError") return;
          // Pass the relay's real code through in the text (hls.js only
          // forwards {code, text} to its error handlers, and builds its own
          // "HTTP Error 0 <text>" message from them). The player parses the
          // [relay:<code>] tag to tell an expired token (re-resolve + resume)
          // apart from a dead CDN (fail over).
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
      // Sub-requests share the load's controller (created in load()) so the
      // watchdog and abort() cancel the entire fragment pull at once.
      return this.controller?.signal;
    }

    async run() {
      const { url } = this.context;
      // hls.js marks media/audio-init requests with `frag`; everything else
      // (manifest/level/audioTrack/subtitleTrack) is a playlist fetch.
      if (this.context.frag) return this.loadFragment(url);
      return this.loadPlaylist(url);
    }

    /* Feed hls.js progress callbacks as bytes arrive (drives the bandwidth
       estimator + progressive MSE appends). Mutates the live stats object in
       place. callbacks.onProgress is optional (unit tests omit it). */
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
      const response = await postDownloadify(
        { action: "playlist", playlistUrl: url, refUrl },
        { signal: this.signal() },
      );
      await throwIfRelayError(response, "Playlist request failed");
      const text = await response.text();
      if (!text || !text.includes("#EXTM3U")) {
        throw new Error("Upstream did not return a playlist");
      }
      return text;
    }

    async loadFragment(url) {
      const signal = this.signal();
      // Throttle-cooldown origins skip direct entirely: no probe, no doomed
      // attempt — straight to the relay. Keeps playback moving AND keeps us
      // from re-poking a WAF burst on every fragment.
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
            return data;
          } catch (error) {
            if (error?.name === "AbortError" || this.aborted) throw error;
            // The server said no (401/403/429): park this origin on
            // relay-only cooldown instead of failing one fragment at a time.
            // Anything else (network blip, CSP, offline) stays direct-first —
            // those fail fast and may clear on their own.
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
              // A CDN that passed the probe but fails the pull for another
              // reason (rotated token, reset connection) still falls back to
              // the relay below.
              logWarn("native", "Direct fragment fetch failed — falling back to relay.", {
                message: error?.message,
              });
            }
          }
        }
      }
      return this.relayFragment(url, signal);
    }

    /* Direct pull, streamed so progress callbacks fire while the bytes are
       still arriving (TTFB-to-first-append, not whole-segment latency). */
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

    async relayFragment(url, signal) {
      const refUrl = getRefUrl?.();
      const chunks = [];
      let total = 0;
      let start = 0;
      for (;;) {
        if (this.aborted) throw new Error("Aborted");
        const response = await postDownloadify(
          { action: "segment", url, refUrl, range: { start, max: FRAG_CHUNK_MAX } },
          { signal },
        );
        await throwIfRelayError(response, "Segment request failed");
        const buf = new Uint8Array(await response.arrayBuffer());
        if (buf.length === 0) break;
        chunks.push(buf);
        total += buf.length;
        start += buf.length;
        this.progress(buf, 0);
        if (response.headers.get("x-streamly-more") !== "1") break;
      }
      const out = new Uint8Array(total);
      let off = 0;
      for (const c of chunks) {
        out.set(c, off);
        off += c.length;
      }
      // Relay-streak visibility: every relayed byte is Vercel bandwidth +
      // invocations on the free tier. Log the first fallback and every 25th
      // after it so serverless burn is observable, never silent.
      this.relayStreak = (this.relayStreak || 0) + 1;
      if (this.relayStreak === 1 || this.relayStreak % RELAY_LOG_EVERY === 0) {
        logWarn("native", `${this.relayStreak} consecutive fragment(s) via Vercel relay — direct path unavailable.`, {
          url: String(url).slice(0, 80),
        });
      } else {
        logDebug("native", `Relayed fragment (${total} bytes).`, { url: String(url).slice(0, 80) });
      }
      return out.buffer;
    }
  };
}
