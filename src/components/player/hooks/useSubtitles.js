/* Subtitles: the track list, the picked track, the cues, and the overlay line.

   Three things here were each a silent-failure bug, so they move as one unit
   rather than leaving the engine behind:

   - A pick that fails must SAY so. A refused download (a relay without the UA
     injection) or a caption file with no parseable lines used to flip the pane
     back to "Off" with no reason, so `subtitleError` keeps the actionable half
     on screen until the next pick or a title change.
   - Every failure path must also CLEAR the engine cues. Leaving the engine
     populated with the previous track's lines renders the wrong language under
     "Off".
   - A newer pick wins. The download is async, so `token` (not a boolean) guards
     every write: a slow first pick must not overwrite the second, and the
     render-time cue read in `onTime` must not resurrect a cancelled track.

   The list is loaded once per title with no imdbId gate — the fetcher falls
   back to a title search, so a title whose external_ids lookup failed still
   gets a list instead of an empty pane. */

import { useCallback, useEffect, useRef, useState } from "react";
import { SubtitleFetcher } from "../../../api/subtitleFetcher";
import { SubtitleEngine } from "../../../utils/subtitleEngine";
import { readStoredNumber } from "../../../utils/storedNumber";
import { logWarn } from "../../../utils/debugLogger";
import { findSubtitleTrack } from "../../../constants/settings";

const SUB_SIZE_STORAGE_KEY = "streamly-native-sub-size";
const SUB_BG_STORAGE_KEY = "streamly-native-sub-bg";
const rememberedKey = (id) => `streamly-native-subtitle-${id}`;

/**
 * @param {object} input
 * @param {{ current: HTMLVideoElement | null }} input.videoRef
 * @param {string|number} input.id title id (the per-title memory key).
 * @param {"movie"|"tv"} input.type
 * @param {string} [input.imdbId]
 * @param {string} [input.title]
 * @param {object|null} input.prefs optional preferences (auto subtitles).
 * @param {"streamly"|"embed"} [input.mode] playback mode; the provider embed
 *   renders its own subtitles, so our search/download must not run there.
 */
export default function useSubtitles({ videoRef, id, type, imdbId, title, prefs, mode = "streamly" }) {
  const [subtitleLanguages, setSubtitleLanguages] = useState([]); // [{language, languageId, downloadLink}]
  const [subtitleEnabled, setSubtitleEnabled] = useState(false);
  const [activeSubtitle, setActiveSubtitle] = useState(null); // current cue line or null
  const [currentSubtitle, setCurrentSubtitle] = useState(null); // the selected track object
  const [isFetchingSubtitles, setIsFetchingSubtitles] = useState(false);
  const [subtitleError, setSubtitleError] = useState(null);
  /* Subtitle STYLING: size 0=S/1=M/2=L/3=XL, background 0=none/1=shadow/2=box/3=outline.
     Presentation only — persisted separately from the track choice. */
  const [subtitleSize, setSubtitleSize] = useState(() =>
    readStoredNumber(SUB_SIZE_STORAGE_KEY, { min: 0, max: 3, fallback: 1 }),
  );
  const [subtitleBg, setSubtitleBg] = useState(() =>
    readStoredNumber(SUB_BG_STORAGE_KEY, { min: 0, max: 3, fallback: 1 }),
  );

  const subtitleEngineRef = useRef(null);
  const subtitleEnabledRef = useRef(false); // mirrors state, read inside onTime
  const subtitleCueRef = useRef(null); // last rendered cue text
  const subtitleTokenRef = useRef(0); // download race guard (last pick wins)

  // Render-time sync: the mirror is a consequence of the state, not of every
  // setter remembering to write it (that class of bug silenced subtitles once).
  subtitleEnabledRef.current = subtitleEnabled;

  const applySubtitleCue = useCallback((text) => {
    subtitleCueRef.current = text;
    setActiveSubtitle(text);
  }, []);

  const selectSubtitle = async (entry) => {
    if (!entry) {
      subtitleEnabledRef.current = false;
      subtitleEngineRef.current?.setCues([]);
      setSubtitleEnabled(false);
      setCurrentSubtitle(null);
      setSubtitleError(null);
      applySubtitleCue(null);
      return;
    }
    subtitleTokenRef.current += 1;
    const token = subtitleTokenRef.current;
    setSubtitleEnabled(true);
    subtitleEnabledRef.current = true;
    setCurrentSubtitle(entry);
    setSubtitleError(null);
    applySubtitleCue(null);
    try {
      window.localStorage.setItem(rememberedKey(id), entry.languageId || entry.language);
    } catch {
      // storage full/blocked — subtitle still works this session
    }
    try {
      const text = await SubtitleFetcher.downloadAndDecompress(entry.downloadLink);
      if (token !== subtitleTokenRef.current) return; // a newer pick superseded this
      if (!text) {
        if (token === subtitleTokenRef.current) {
          subtitleEnabledRef.current = false;
          setSubtitleEnabled(false);
          setCurrentSubtitle(null);
          // The fetcher logs the precise leg/status to the console; the pane
          // keeps the actionable half on screen.
          setSubtitleError(
            "Subtitle download failed — try another language. If every language fails, the Cloudflare relay is serving without the OpenSubtitles update (redeploy the worker snippet from .env.example).",
          );
        }
        return;
      }
      const parsed = SubtitleEngine.parseSRT(text);
      const cues = parsed.length ? parsed : SubtitleEngine.parseVTT(text);
      if (!cues.length) {
        // The fetcher already refuses non-subtitle bodies, so reaching here
        // means a real caption file with zero parseable lines — never leave
        // the track "enabled" with nothing to render.
        if (token === subtitleTokenRef.current) {
          subtitleEnabledRef.current = false;
          setSubtitleEnabled(false);
          setCurrentSubtitle(null);
          subtitleEngineRef.current?.setCues([]);
          applySubtitleCue(null);
          setSubtitleError("This subtitle file had no readable lines — pick another language.");
        }
        return;
      }
      const engine = subtitleEngineRef.current || (subtitleEngineRef.current = new SubtitleEngine());
      engine.setCues(cues);
      if (token === subtitleTokenRef.current) {
        const cue = engine.getActiveCue(videoRef.current?.currentTime || 0);
        applySubtitleCue(cue?.text || null);
        setSubtitleError(null);
      }
    } catch {
      if (token === subtitleTokenRef.current) {
        subtitleEnabledRef.current = false;
        setSubtitleEnabled(false);
        setCurrentSubtitle(null);
        setSubtitleError("Subtitle download failed — try another language.");
      }
    }
  };

  /* Load the language list once per title; remember the last choice per title
     id, then fall back to the viewer's auto-subtitle preference. An explicit
     past pick always wins over the preference. */
  useEffect(() => {
    /* Embed mode is the provider's own player: it renders its own captions, so
       our language search (and any auto-selection download) would be a wasted
       request running behind a cross-origin iframe. Switching back re-runs this
       effect because `mode` is a dependency. */
    if (mode === "embed") {
      setIsFetchingSubtitles(false);
      return undefined;
    }
    let cancelled = false;
    subtitleTokenRef.current += 1;
    subtitleEnabledRef.current = false;
    subtitleEngineRef.current?.setCues([]);
    setSubtitleLanguages([]);
    setSubtitleEnabled(false);
    setCurrentSubtitle(null);
    setSubtitleError(null);
    applySubtitleCue(null);
    setIsFetchingSubtitles(true);
    SubtitleFetcher.searchAvailableSubtitles(imdbId, title || "")
      .then((langs) => {
        if (cancelled) return;
        const list = langs || [];
        setSubtitleLanguages(list);
        let remembered = null;
        try {
          remembered = window.localStorage.getItem(rememberedKey(id));
        } catch {
          // storage unavailable — no auto restore
        }
        if (remembered) {
          const match =
            list.find((l) => l.languageId === remembered) ||
            list.find((l) => l.language === remembered);
          if (match) {
            selectSubtitle(match);
            return;
          }
        }
        /* Auto Subtitles: "Automatically select subtitles in your preferred
           language when available". The Settings toggle existed and nothing
           read it, so a viewer who asked for this got no subtitles until they
           opened the panel and picked a language by hand. */
        if (prefs?.autoSubtitles) {
          const preferred = findSubtitleTrack(list, prefs?.defaultLanguage);
          if (preferred) selectSubtitle(preferred);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setSubtitleError("Subtitle search failed — try again later.");
        logWarn("player", "subtitle search failed", { message: error?.message || String(error) });
      })
      .finally(() => {
        if (!cancelled) setIsFetchingSubtitles(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, imdbId, mode]);

  /* Subtitle styling persists across visits. */
  useEffect(() => {
    try {
      window.localStorage.setItem(SUB_SIZE_STORAGE_KEY, String(subtitleSize));
      window.localStorage.setItem(SUB_BG_STORAGE_KEY, String(subtitleBg));
    } catch {
      // private mode — subtitle styling just won't persist
    }
  }, [subtitleSize, subtitleBg]);

  return {
    subtitleLanguages,
    subtitleEnabled,
    subtitleEnabledRef,
    subtitleEngineRef,
    subtitleCueRef,
    activeSubtitle,
    setActiveSubtitle,
    currentSubtitle,
    isFetchingSubtitles,
    subtitleError,
    subtitleSize,
    setSubtitleSize,
    subtitleBg,
    setSubtitleBg,
    selectSubtitle,
  };
}
