import { useCallback, useEffect, useRef, useState } from "react";
import { SubtitleFetcher } from "../../../../api/subtitleFetcher";
import { SubtitleEngine } from "../../../../utils/subtitleEngine";
import { logInfo, logWarn } from "../../../../utils/debugLogger";

const SUB_SCOPE = "player.v2.subtitles";

/**
 * Subtitle track selection and the active cue (task.md 6.4's subtitle half, pulled
 * forward so 3.18-3.23 have a real node to style).
 *
 * ── Why this exists separately from `usePlayerControls` ────────────────────────
 * Everything `usePlayerControls` does is a viewer-driven action against the
 * element and resolves immediately. Subtitles are a REMOTE RESOURCE: a language
 * list that may be empty, a download that may fail, a parse that may yield
 * nothing. Folding that into the controls hook would make seek and volume
 * untestable without mocking a subtitle service, so the two concerns stay apart.
 *
 * ── The token, and why the checks repeat it ───────────────────────────────────
 * The legacy guards every `setState` behind `token === subtitleTokenRef.current`,
 * which is right and easy to get subtly wrong: a pick that is superseded mid
 * download must not clear the NEW pick, and a failure from an OLD pick must not
 * report itself against the current one. A token is the smallest thing that makes
 * "is this still the answer" answerable at every step.
 *
 * ── Nothing here is fatal ─────────────────────────────────────────────────────
 * Every failure mode ends in `subtitleError` — a line for the pane to show — and
 * never in a thrown error or a stuck "loading" state. A viewer whose subtitle
 * download failed is still watching a video, and a player that tears itself down
 * over a caption file is worse than one that says the caption did not arrive.
 */
export default function usePlayerSubtitles({ imdbId, title, currentTime } = {}) {
  const [languages, setLanguages] = useState([]);
  const [track, setTrack] = useState(null);
  const [cue, setCue] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  /* Bumped whenever the engine's cue list is REPLACED, so the active-cue effect
   * re-resolves.
   *
   * Without it the cue never appears at all: `select` sets `track` first and
   * loads cues afterwards, so the effect runs while the engine is still empty,
   * finds nothing, and neither of its dependencies changes again — the download
   * resolving is not a dependency of anything. The cue then stays blank until the
   * viewer happened to seek. The legacy sidestepped this by calling
   * `applySubtitleCue` imperatively after `setCues`. */
  const [cueRevision, setCueRevision] = useState(0);

  /* The engine holds the parsed cues and owns the active-cue lookup. A ref, not
   * state: the cues are a large array and re-rendering the shell on every cue
   * swap would drag the whole transport with it. Only `cue` — one string — is
   * state. */
  const engineRef = useRef(null);
  const tokenRef = useRef(0);

  const engine = () => {
    if (!engineRef.current) engineRef.current = new SubtitleEngine();
    return engineRef.current;
  };

  /* ── The language list, once per title ──────────────────────────────────────
   * No `imdbId` gate: the fetcher falls back to a title search on its own, so a
   * title whose `external_ids` lookup failed still gets a list instead of a
   * silently empty pane. A miss is an empty array, which is a real state the pane
   * can render — not an error. */
  useEffect(() => {
    let cancelled = false;
    tokenRef.current += 1;
    const token = tokenRef.current;

    SubtitleFetcher.searchAvailableSubtitles(imdbId, title)
      .then((list) => {
        if (cancelled || token !== tokenRef.current) return;
        setLanguages(Array.isArray(list) ? list : []);
      })
      .catch((err) => {
        if (cancelled || token !== tokenRef.current) return;
        logWarn(SUB_SCOPE, "subtitle language list failed", err);
        setLanguages([]);
      });

    return () => {
      cancelled = true;
    };
  }, [imdbId, title]);

  /**
   * Choose a track, or pass null for Off.
   *
   * "Off" is not merely "hide the text": it clears the cues, so a later seek back
   * into the same range cannot resurrect a cue from a track the viewer turned off.
   */
  const select = useCallback(async (entry) => {
    const token = ++tokenRef.current;

    if (!entry) {
      engineRef.current?.setCues([]);
      setTrack(null);
      setCue(null);
      setError(null);
      setLoading(false);
      return;
    }

    setTrack(entry);
    setCue(null);
    setError(null);
    setLoading(true);

    try {
      const text = await SubtitleFetcher.downloadAndDecompress(entry.downloadLink);
      /* A newer pick, or a title change, landed while this was downloading. */
      if (token !== tokenRef.current) return;

      if (!text) {
        /* The fetcher already logged the precise leg and status; the pane keeps
         * the actionable half on screen, because `note()` is a no-op stub and
         * without this a refused download fails SILENTLY — the pick flips back to
         * Off with no visible reason. */
        setLoading(false);
        setTrack(null);
        setError(
          "Subtitle download failed — try another language. If every language fails, the Cloudflare relay is serving without the OpenSubtitles update.",
        );
        return;
      }

      /* SRT first, then VTT. A file that parses as both is an SRT wearing a VTT
       * header, and the SRT reading is the correct one. */
      const srt = SubtitleEngine.parseSRT(text);
      const cues = srt.length ? srt : SubtitleEngine.parseVTT(text);

      if (!cues.length) {
        /* The fetcher already refuses non-subtitle bodies, so reaching here is a
         * real caption file with zero parseable lines. Leaving the track
         * "enabled" with nothing to render is the state this prevents: the picker
         * would show a language that never produces text. */
        setLoading(false);
        setTrack(null);
        engineRef.current?.setCues([]);
        setError("This subtitle file had no readable lines — pick another language.");
        return;
      }

      engine().setCues(cues);
      setCueRevision((n) => n + 1);
      setLoading(false);
      logInfo(SUB_SCOPE, `subtitles -> ${entry.language} (${cues.length} lines)`);
    } catch (err) {
      if (token !== tokenRef.current) return;
      logWarn(SUB_SCOPE, "subtitle download threw", err);
      setLoading(false);
      setTrack(null);
      setError("Subtitle download failed — try another language.");
    }
  }, []);

  /* Drop the active cue when the title changes. Without this, closing one title
   * and opening the next shows the previous title's last line over the new
   * video until its own cues load. */
  const titleKey = `${imdbId || ""}|${title || ""}`;
  useEffect(() => {
    tokenRef.current += 1;
    engineRef.current?.setCues([]);
    setTrack(null);
    setCue(null);
    setError(null);
    setLoading(false);
  }, [titleKey]);

  /* ── The active cue, resolved from `currentTime` ────────────────────────────
   * Driven by the shell's existing `currentTime` rather than a `timeupdate`
   * subscription of its own. Two reasons, and the second is the important one:
   * `timeupdate` fires roughly four times a second, which is fine for a cue that
   * changes every few seconds and wasteful for one that does not; but more to the
   * point, a second clock in the player is a second thing to keep in step with
   * seeking, and a cue that lags a seek by up to 250ms is visibly wrong.
   *
   * Keyed on `currentTime`, so the engine's binary search runs on each tick and
   * the returned cue object is what React compares.
   */
  useEffect(() => {
    if (!track) {
      setCue(null);
      return;
    }
    const t = Number(currentTime);
    if (!Number.isFinite(t)) return;
    /* The TEXT, not the cue object. The engine's `getActiveCue` returns
     * `{ start, end, text }`, and the cue node renders its `text` directly — a cue
     * object in this state is not a slow render, it is React throwing "objects are
     * not valid as a React child" and taking the player's DOM down.
     *
     * Comparing the string is also what makes this effect cheap: two cues in a row
     * with identical text (which happens — a speaker repeating themselves) do not
     * re-render, and a re-render per `timeupdate` would drag the transport with
     * it. */
    const text = engine().getActiveCue(t)?.text ?? null;
    setCue((prev) => (prev === text ? prev : text));
  }, [currentTime, track, cueRevision]);

  return {
    languages,
    track,
    cue: track ? cue : null,
    error,
    loading,
    select,
  };
}