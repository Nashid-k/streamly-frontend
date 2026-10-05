/* Provider skip boundaries (ZXC/vidstuck `/backend/intro`), fetched at playback
   time through our own serverless function.

   Why this exists next to SkipDB (`skipBoundarySource.js`): upstream measures
   intro/outro per ENCODE for the exact streams we play (verified live: GoT
   S1E1 intro 437→531s + outro, Breaking Bad S1E1 outro), so where SkipDB has
   no record this is real data instead of the 90s/150s guess. It is TV-only in
   practice — upstream needs season+episode and answers nulls for movies —
   so movies short-circuit to a miss without spending the call.

   Why it goes through `/api/stream` (`zxcintro` action) instead of direct:
   the endpoint sends no `Access-Control-Allow-Origin`, so a browser fetch is
   CORS-dead; server-side it is one plain GET with the vidstuck `Origin`
   (no mint needed — verified live).

   Miss contract mirrors SkipDB: null on ANY problem (no ids, network, null
   record, malformed JSON) so the caller always falls back. Never throws. */

import { logDebug, logWarn } from "../utils/debugLogger.js";

const ENDPOINT = "/api/stream";
/* Short on purpose, same reasoning as SkipDB's: this refines a window the
   viewer can already skip. */
const REQUEST_TIMEOUT_MS = 4000;

const isFiniteNum = (n) => typeof n === "number" && Number.isFinite(n);

/**
 * Fetch provider boundaries for one playback.
 * @returns {Promise<{introEndSeconds: number, creditsStartSeconds: number|null, confidence: number|null}|null>}
 */
export async function fetchZxcIntroBounds({ imdbId, tmdbId, season, episode, signal } = {}) {
  if (!/^tt\d{4,12}$/.test(String(imdbId || "")) || !/^\d{1,12}$/.test(String(tmdbId || ""))) return null;
  const s = Number(season);
  const e = Number(episode);
  // TV-only: upstream has no movie records (season+episode are mandatory
  // params there), and SkipDB already covers movies.
  if (!Number.isInteger(s) || s <= 0 || !Number.isInteger(e) || e <= 0) return null;

  const own = new AbortController();
  const onOuterAbort = () => own.abort();
  signal?.addEventListener?.("abort", onOuterAbort, { once: true });
  const timer = setTimeout(() => own.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "zxcintro",
        imdbId,
        tmdbId: String(tmdbId),
        season: String(s),
        episode: String(e),
      }),
      signal: own.signal,
    });
    if (!res.ok) {
      logWarn("skip", `ZXC intro lookup returned ${res.status} — keeping other sources.`);
      return null;
    }
    const data = await res.json().catch(() => null);
    const intro = Number(data?.introEndSeconds);
    const credits = Number(data?.creditsStartSeconds);
    const hasIntro = isFiniteNum(intro) && intro > 0;
    const hasCredits = isFiniteNum(credits) && credits >= 0;
    if (!hasIntro && !hasCredits) return null;
    const bounds = {
      introEndSeconds: hasIntro ? intro : 0,
      creditsStartSeconds: hasCredits ? credits : null,
      confidence: isFiniteNum(Number(data?.confidence)) ? Number(data.confidence) : null,
    };
    logDebug("skip", "Provider supplied real skip boundaries.", { imdbId, ...bounds });
    return bounds;
  } catch (error) {
    if (error?.name !== "AbortError") {
      logWarn("skip", "ZXC intro lookup failed — keeping other sources.", {
        imdbId,
        error: error?.message || String(error),
      });
    }
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.("abort", onOuterAbort);
  }
}
