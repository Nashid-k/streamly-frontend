import { useEffect, useState } from "react";
import { fetchSkipBoundaries } from "../../../../api/skipBoundarySource";
import { logWarn } from "../../../../utils/debugLogger";

const SKIP_SCOPE = "player.v2.boundaries";

/**
 * Measured chapter/credits boundaries for this title (task.md 3.16).
 *
 * ── Why the dataset and not the manifest ──────────────────────────────────────
 * There are two measured sources upstream. The legacy gets BOTH: the SkipDB dataset
 * by IMDb id, and the provider's own cue tags, the latter read out of raw media
 * playlist text by a custom loader (`createStreamlyLoader`'s `onCueBoundaries`).
 *
 * V2's hls.js path installs no custom loader — it is a plain `new Hls(HLS_CONFIG)`
 * with the engine's own loader. hls.js's `LevelLoadedData` exposes PARSED
 * `details` and the `networkDetails` response, not the raw playlist text, and the
 * cue tags (`#EXT-X-CUE-OUT`) are not fields hls.js retains. Reading them would mean
 * reaching into `networkDetails.responseText`, which is not a stable contract across
 * hls.js's XHR and fetch transports.
 *
 * So this hook fetches the dataset only. That is a REAL source — human-measured
 * boundaries for this exact title and episode — not a heuristic, so the ticks it
 * feeds satisfy 3.16's own rule. Cue-tag ingestion stays unimplemented rather than
 * faked; it needs a loader decision that belongs with the transport, not with a
 * ticks feature. Until then a provider that emits cue tags gets no tick from V2,
 * which is a missing feature, not a false one.
 *
 * ── Never awaited ─────────────────────────────────────────────────────────────
 * The fetch starts AFTER first paint and the player is fully usable without it: a
 * title with no SkipDB entry simply never gets ticks. Deliberately not awaited and
 * not on the critical path, because a slow boundary lookup must not delay playback.
 *
 * @returns {object|null} `{ introEndSeconds, creditsStartSeconds, source }` or null
 */
export default function useSkipBoundaries({ imdbId, type, season, episode } = {}) {
  /* The lookup key is the whole identity of the answer, not just the imdb id: a
   * movie and a series can share one, and season/episode are what make two
   * episodes of a series different questions. Carrying it alongside the result
   * lets the reset be DERIVED during render instead of being an effect that
   * clears state — which is a second render, and a frame where the previous
   * episode's marks are still on the bar while the effect runs. */
  const key = imdbId
    ? [imdbId, type, type === "tv" ? season : "", type === "tv" ? episode : ""].join("|")
    : "";
  const [found, setFound] = useState({ key: "", bounds: null });

  useEffect(() => {
    /* An absent imdbId simply means no lookup — no request, no log. */
    if (!key) return undefined;

    const controller = new AbortController();
    let alive = true;

    fetchSkipBoundaries({
      imdbId,
      season: type === "tv" ? season : undefined,
      episode: type === "tv" ? episode : undefined,
      signal: controller.signal,
    })
      .then((bounds) => {
        if (!alive || !bounds) return;
        /* Stamp the source so `boundariesAreMeasured` can tell this apart from the
         * player's 90s estimate. Without it the record is refused and no tick is
         * drawn — which is the safe direction to fail. */
        setFound({ key, bounds: { ...bounds, source: "dataset" } });
      })
      .catch((error) => {
        /* A lookup miss is never surfaced to the viewer. `fetchSkipBoundaries`
         * already logs 404/429; this catches transport aborts and shape surprises. */
        logWarn(SKIP_SCOPE, "skip boundary lookup failed", error);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [key, imdbId, type, season, episode]);

  /* A record from another title is not an answer for this one, whatever order the
   * two renders happened in. */
  return found.key === key && key ? found.bounds : null;
}