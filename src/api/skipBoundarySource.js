/* Real skip boundaries from SkipDB, fetched at playback time.
   ── What this is ───────────────────────────────────────────────────────────
   `SKIP_INTRO_OVERRIDES` is a hand-typed table, which is hardcoding with extra
   steps: it covers nothing until someone types it in, and it goes stale. This
   module fetches real, community-contributed boundaries instead, so coverage
   grows without a single line changing here.

   SkipDB (https://skipdb.tv) is open data — ODbL 1.0, published so it cannot be
   locked away — with a read API that needs no key and sends
   `Access-Control-Allow-Origin: *`, so the browser calls it directly and this
   costs no serverless invocations on our side.

   ── The three response shapes, all verified live ───────────────────────────
   TV with data:
     {"segments":{"intro":{"start_ms":229500,"end_ms":246500,...},
                  "outro":{"start_ms":3434000,"end_ms":3500000,...}, ...}}
   Movie, outro only:  {"segments":{"intro":null, "outro":{...}}}
   A MISS:             {"segments":{"intro":null,"outro":null,...}}  ← HTTP 200!

   The miss is the trap: there is no 404 to catch. "No data" is a 200 full of
   nulls, so every accessor treats a null/absent segment as a miss and the
   caller falls back to the existing estimate.

   ── What it will never do ──────────────────────────────────────────────────
   Block playback. The player renders and seeks on its own estimates, and this
   arrives after and REFINES them. A slow or dead SkipDB must cost nothing but a
   console line. */

import { logDebug, logWarn } from "../utils/debugLogger.js";

const API_BASE = "https://api.skipdb.tv/api/segments";
/* Attribution the ODbL data licence asks for, surfaced in the player's info so
   the data's origin travels with it. */
export const SKIP_DATA_CREDIT = { name: "SkipDB", url: "https://skipdb.tv" };
/* Short on purpose: this refines a window the viewer can already skip. Waiting
   longer to be more accurate is a bad trade. */
const REQUEST_TIMEOUT_MS = 2500;

/* key → boundaries. Cached for the session; a miss is cached too, so a title
   with no data costs exactly one request per playback, not one per render. */
const cache = new Map();
/* In-flight promises, so a re-render mid-request cannot start a second one. */
const inFlight = new Map();

const isFiniteNum = (n) => typeof n === "number" && Number.isFinite(n);

function msToSeconds(value) {
  const n = Number(value);
  return isFiniteNum(n) && n > 0 ? n / 1000 : 0;
}

/* The two boundaries come from OPPOSITE ends of their segment, and getting this
   wrong is silent rather than loud:
     - an intro is SKIPPED PAST, so the viewer lands on its END  (end_ms)
     - credits are skipped FROM their beginning, so the pill APPEARS at their
       START (start_ms)
   Using end_ms for credits would hide the button until the credits were already
   over — which is exactly when it stops being useful. */
function introEndSeconds(segment) {
  if (!segment || typeof segment !== "object") return 0;
  /* A start with no end still tells us roughly where the intro finishes, so this
     one may fall back. */
  return msToSeconds(segment.end_ms) || msToSeconds(segment.start_ms);
}

function creditsStartSeconds(segment) {
  if (!segment || typeof segment !== "object") return 0;
  /* No `end_ms` fallback, deliberately — and this is the opposite of the intro
     accessor above. The comment above says using end_ms for credits "would hide
     the button until the credits were already over"; falling back to it when
     start_ms is missing did exactly that, so a half-populated outro silently
     moved the Skip Credits pill to the END of the credits. Absent start_ms means
     this segment says nothing useful about where the credits begin. */
  return msToSeconds(segment.start_ms);
}

function keyFor({ imdbId, season, episode }) {
  if (!imdbId) return null;
  const s = Number(season);
  const e = Number(episode);
  // A movie has no season/episode; asking for S1E1 of one is a different record.
  if (Number.isInteger(s) && s > 0 && Number.isInteger(e) && e > 0) {
    return `${imdbId}|${s}|${e}`;
  }
  return `${imdbId}|movie`;
}

/**
 * Fetch boundaries for one playback. Resolves null on ANY problem — no key, no
 * network, no data, malformed JSON — so a caller can always fall back.
 * @returns {Promise<{introEndSeconds: number, creditsStartSeconds: number|null, confidence: number|null}|null>}
 */
export async function fetchSkipBoundaries({ imdbId, season, episode, signal } = {}) {
  const key = keyFor({ imdbId, season, episode });
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  if (inFlight.has(key)) return inFlight.get(key);

  const url = new URL(API_BASE);
  url.searchParams.set("imdb_id", imdbId);
  const s = Number(season);
  const e = Number(episode);
  if (Number.isInteger(s) && s > 0 && Number.isInteger(e) && e > 0) {
    url.searchParams.set("season", String(s));
    url.searchParams.set("episode", String(e));
  }

  const own = new AbortController();
  const onOuterAbort = () => own.abort();
  signal?.addEventListener?.("abort", onOuterAbort, { once: true });
  const timer = setTimeout(() => own.abort(), REQUEST_TIMEOUT_MS);

  const request = (async () => {
    try {
      const res = await fetch(url.toString(), { signal: own.signal });
      if (!res.ok) {
        // 404/429 are the realistic ones. Never surfaced to the viewer.
        logWarn("skip", `SkipDB returned ${res.status} — keeping estimated windows.`);
        return null;
      }
      const data = await res.json();
      const intro = introEndSeconds(data?.segments?.intro);
      const introStart = msToSeconds(data?.segments?.intro?.start_ms) || 0;
      const credits = creditsStartSeconds(data?.segments?.outro) || null;
      const creditsEnd = msToSeconds(data?.segments?.outro?.end_ms) || null;
      if (!intro && !credits) {
        // A 200 full of nulls is a miss, not an error. Cache it so the next
        // playback of this title does not ask again.
        cache.set(key, null);
        return null;
      }
      const bounds = {
        introStartSeconds: introStart,
        introEndSeconds: intro,
        creditsEndSeconds: creditsEnd,
        creditsStartSeconds: credits,
        confidence: isFiniteNum(data?.segments?.intro?.confidence)
          ? data.segments.intro.confidence
          : null,
      };
      cache.set(key, bounds);
      logDebug("skip", "SkipDB supplied real skip boundaries.", { imdbId, ...bounds });
      return bounds;
    } catch (error) {
      // A timeout, an offline device or a blocked request all land here. The
      // player already has estimates, so this is a log line, not a failure.
      if (error?.name !== "AbortError") {
        logWarn("skip", "SkipDB lookup failed — keeping estimated windows.", {
          imdbId,
          error: error?.message || String(error),
        });
      }
      return null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onOuterAbort);
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}

/** Session-cached lookup, for a title already fetched. Null when never asked. */
export function getCachedSkipBoundaries({ imdbId, season, episode } = {}) {
  const key = keyFor({ imdbId, season, episode });
  return key ? cache.get(key) ?? null : null;
}

/** Test seam + a "cover a title locally" escape hatch. */
export function __setSkipBoundariesForTest(key, value) {
  if (value === null) cache.delete(key);
  else cache.set(key, value);
}

export function clearSkipBoundaryCache() {
  cache.clear();
  inFlight.clear();
}
