// src/components/NativePlayerView.jsx — the app's player, opened by the hero /
// episode Play buttons. Resolves VidCore-first → VidSrc via downloadService and
// plays through hls.js (manifest relay + direct-segment loader). Custom transport
// only: no native <video controls>.
// Quality lives in the Audio & Subtitles dialog (Netflix has no quality menu), and
// touch devices get a stacked settings sheet instead of the desktop chrome.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Captions,
  Check,
  ListVideo,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Ratio,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { NetflixVolumeHUD, NetflixBrightnessHUD, NetflixAspectHUD, NetflixSeekHUD } from "./player";
import Hls from "hls.js";
import { downloadService } from "../api/downloadService";
import { variantLabel } from "../utils/downloadQuality";
import { createStreamlyLoader, probeSourcePlayable } from "../api/nativeHlsLoader";
import { SubtitleFetcher } from "../api/subtitleFetcher";
import { logWarn } from "../utils/debugLogger";
import { SubtitleEngine } from "../utils/subtitleEngine";
import { readStoredNumber } from "../utils/storedNumber";
import useContainerSize from "../hooks/useContainerSize";
import { hudMetrics } from "../constants/playerUi";

// A source can fail fragments forever without ever going fatal (VidCore's
// vidzen: playlist 200, segments 429 on repeat) — so fail over ourselves.
const MAX_CONSECUTIVE_FRAG_FAILURES = 4;

const NETFLIX_RED = "#E50914";
const HIDE_DELAY_MS = 3000;
const SKIP_SECONDS = 10;
// Netflix "Up Next" auto-play countdown for a TV episode's next installment.
const UP_NEXT_MS = 15000;
// Netflix resume gate: how long the "Left off at…" card waits before auto-resume.
const RESUME_WAIT_SECONDS = 8;
// Forward-buffer policy (YouTube-style). The byte cap is scaled to the top
// rendition's bitrate: a FIXED 60MB cap idled the pipe before 4K could get
// ahead (~20Mbps burns 60MB in ~24s), which is why 4K never buffered. The
// buffer is the viewer's MSE, not our function's RAM, and the total relayed
// bytes per title are unchanged. Failfast is separate: the frag-failure
// counter/step-down fire on LOAD events, independent of depth.
const BUFFER_DEPTH_SECONDS = 120;
const MIN_BUFFER_SIZE = 60 * 1000 * 1000; // hls.js default floor
const MAX_BUFFER_SIZE = 240 * 1000 * 1000; // hard ceiling: ~2min of 4K@16Mbps, ~10min of 1080p
// Underflow guard: you cannot "buffer more" when a rendition outruns the pipe.
// YouTube's answer is to step quality DOWN; we drop one rung after a sustained
// shortfall so the buffer refills faster than it drains.
const BUFFER_FLOOR_SECONDS = 18;
const BUFFER_UNDERFLOOR_MS = 8000;
// Cap the WATCHED back buffer (hls.js defaults to Infinity — a 2h movie would
// pin ~7GB of browser RAM). hls.js trims the rest, like Netflix.
const BACK_BUFFER_SECONDS = 60;
// ABR seed: hls.js starts its bandwidth estimate at 1Mbps, so Auto would climb
// the ladder one relay round-trip at a time (a visible "loading" per rung).
// 10Mbps starts Auto mid-ladder; the floor step-down still guards a bad pipe.
const INITIAL_BW_BITS = 10 * 1000 * 1000;
const VOLUME_STORAGE_KEY = "streamly-native-volume";
const MUTED_STORAGE_KEY = "streamly-native-muted";
const BRIGHTNESS_STORAGE_KEY = "streamly-native-brightness";
/* One-time brightness clear: an old gesture build (inverted drag sign) could
   park brightness very low, and the v1 fix shipped with a broken unset-read
   (`Number(null) === 0` passed the isFinite guard) that floored every viewer
   to BRIGHTNESS_MIN. Cleared exactly once; a later deliberate low choice
   persists like any other. */
const BRIGHTNESS_RESET_FLAG = "streamly-native-brightness-reset-v2";
const ASPECT_STORAGE_KEY = "streamly-native-aspect";
const BRIGHTNESS_MIN = 0.25;
const BRIGHTNESS_MAX = 1.75;
const HUD_MS = 1100;
// Aspect menu = Fit / Fill / Zoom → ASPECT_RATIOS indices 0/1/2 + object-fit.
const ASPECT_INDEXES = [0, 1, 2];
const ASPECT_FIT = { 0: "contain", 1: "fill", 2: "cover" };

// Touch-first devices (hover-less, coarse pointer) get bigger tap targets,
// double-tap seek zones, safe-area padding, a centered play glyph and a stacked
// settings panel; mouse/trackpad keeps the desktop chrome.
const IS_TOUCH =
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(hover: none), (pointer: coarse)").matches;
const BTN_SIZE = IS_TOUCH ? 44 : 40;
// Netflix top bar: 16px on desktop; safe-area inset on touch devices.
const SAFE_TOP = IS_TOUCH ? "calc(16px + env(safe-area-inset-top, 0px))" : "16px";
// Netflix bottom chrome: 24px on desktop; safe-area inset on touch devices.
const SAFE_BOTTOM = IS_TOUCH ? "calc(20px + env(safe-area-inset-bottom, 0px))" : "24px";

// Skip Intro (TV only). Netflix knows intro boundaries from studio metadata; we
// don't, so the pill uses an opt-in per-title table with a conservative default.
// Like Netflix it is visible ONLY while the head sits inside [0, end + grace].
// Episodes shorter than the floor never get the guess.
const SKIP_INTRO_OVERRIDES = {
  // tmdbId: { endSeconds: 90 } — drop confirmed boundaries in here
};
const SKIP_INTRO_DEFAULT_END = 90; // seconds — typical cold-open + title card
const SKIP_INTRO_MIN_EPISODE_SECONDS = 15 * 60; // only guess for >= 15 min eps
const SKIP_INTRO_GRACE = 10; // keep the pill a few seconds past the end

/* Plain white circular icon button (Netflix transport glyphs). */
function IconBtn({ label, onClick, children, active, disabled }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onClick?.(e);
      }}
      style={{
        width: BTN_SIZE,
        height: BTN_SIZE,
        borderRadius: "50%",
        border: "none",
        background: "transparent",
        color: disabled ? "rgba(255,255,255,0.35)" : active ? NETFLIX_RED : "#fff",
        cursor: disabled ? "not-allowed" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

/* One selectable row in the Audio & Subtitles / Episodes panels. */
function DialogRow({ selected, onClick, title, sub, disabled }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "10px 0",
        minHeight: 44,
        borderRadius: 0,
        border: "none",
        background: "transparent",
        color: selected ? "#fff" : "rgba(255,255,255,0.82)",
        fontWeight: selected ? 700 : 400,
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 15,
        transition: "background 0.15s",
      }}
    >
      <span style={{ width: 22, display: "flex", alignItems: "center", flexShrink: 0 }}>
        {selected ? <Check size={16} color={NETFLIX_RED} /> : null}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {title}
        </span>
        {sub ? (
          <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{sub}</span>
        ) : null}
      </span>
    </button>
  );
}

const SOURCES = [
  // Streaming backends are relayed HLS providers, VidCore first (its probe is
  // direct-first, so a blocked CDN falls through quickly). NetMirror (net27.cc)
  // was removed: its video layer is per-IP 429-gated behind a Cloudflare
  // challenge. CineSrc went with its Chrome mint service — no serverless function
  // can mint fingerprint-bound tokens.
  { key: "vidcore", label: "VidCore (native)", resolve: (a, o) => downloadService.resolveVidcore(a, o) },
  { key: "vidsrc", label: "VidSrc (native)", resolve: (a, o) => downloadService.resolveVidsrc(a, o) },
];

// One auto-retry per source: a fresh open often fails on the FIRST attempt
// (cold function, warm-up 429s, a rate-flaky catalogue returning nothing) and
// succeeds on the retry. Terminal "no-source" answers are not retried.
const SOURCE_RETRIES = 1;
const SOURCE_RETRY_BACKOFF_MS = [800];

const PARSE_TIMEOUT_MS = 75000;


function fmtTime(s) {
  const v = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const r = v % 60;
  // Netflix style: m:ss under an hour, h:mm:ss above (156:22 -> 2:36:22).
  return (h > 0 ? `${h}:` : "") + (h > 0 ? String(m).padStart(2, "0") : `${m}`) + `:${String(r).padStart(2, "0")}`;
}

// Canonical quality label + order: feeds list their ladders in any order, so
// the menu always reads low → high (480p → 720p → 1080p → 2K → 4K) regardless.
// Resolution + verified-only tags (HDR/SDR/60fps), no bitrate, no transport notes.
function qualityLabelFor(v) {
  if (!v?.height) return "Auto";
  return variantLabel(v);
}

export default function NativePlayerView({
  type = "movie",
  id,
  season = 1,
  episode = 1,
  title,
  subtitle,
  // IMDb id ({imdbId}/{imdb_id} from TMDB) for OpenSubtitles lookups; optional.
  imdbId = "",
  episodes = [],
  onSelectEpisode,
  // Netflix-style prev/next episode paging. The parent owns navigation (it can
  // cross season boundaries), so without its canGo*/onGo* we walk `episodes`.
  canGoPrev,
  canGoNext,
  onGoPrev,
  onGoNext,
  onClose,
  // Continue-watching entry for this title/episode ({ timestamp } in s, >0) + progress sink.
  watchedEntry,
  onProgressChange,
  // TMDB original_language — the only language signal the sources give us.
  originalLanguage = "",
}) {
  const videoRef = useRef(null);
  const screenRef = useRef(null);
  // HUD geometry follows the measured frame, not the window: the player is
  // often a phone-width box on a desktop viewport (and vice versa), so vw/vh
  // units and a fixed top percentage both land the overlay in the wrong place.
  const { w: playerW, h: playerH } = useContainerSize(screenRef);
  const hudBox = useMemo(() => hudMetrics(playerW, playerH), [playerW, playerH]);
  const scrubRef = useRef(null);
  const hlsRef = useRef(null);
  const runRef = useRef(0);
  const metaRef = useRef({ variants: [], sourceKey: null, refUrl: null, masterLevels: false });
  const idleTimer = useRef(null);
  const clickTimer = useRef(null);
  // Touch taps: last-tap info for double-tap seek (±10s by screen side) and a
  // flag that swallows the synthetic click after touchend (it would double-toggle).
  const touchTapRef = useRef({ time: 0, side: 0 });
  const singleTapTimer = useRef(null);
  const suppressClickRef = useRef(false);
  // Live views of the play/seek closures for media-session handlers that register once.
  const togglePlayRef = useRef(() => {});
  const seekRelativeRef = useRef(() => {});
  // Pending "drop the hover overlay" deadline; cleared when a NEW scrub starts,
  // or a leftover timer snaps the bar back mid-drag between two gestures.
  const scrubHoverTimer = useRef(null);
  const watchedEntryRef = useRef(watchedEntry);
  watchedEntryRef.current = watchedEntry;
  const lastProgressSaved = useRef(0);
  const resumeHandledKeyRef = useRef(null); // title/episode key that already offered resume
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSelectEpisodeRef = useRef(onSelectEpisode);
  onSelectEpisodeRef.current = onSelectEpisode;
  const onGoPrevRef = useRef(onGoPrev);
  onGoPrevRef.current = onGoPrev;
  const onGoNextRef = useRef(onGoNext);
  onGoNextRef.current = onGoNext;
  // Non-master "Auto" rung: the variant negotiated at settle (smooth start / relay-friendly).
  const autoUriRef = useRef(null);
  const autoUriHeightRef = useRef(null);
  const commitResumeRef = useRef(null); // assigned below, driven by the resume card
  const maybeOfferResumeRef = useRef(() => {}); // reassigned below; called from the run effect
  // Reassigned below; the run effect calls it at runtime to keep its deps honest.
  const pickQualityRef = useRef(null);
  // Rapid quality switches stamp a token and re-check it after every await.
  const switchTokenRef = useRef(0);
  // When the forward buffer first dipped under BUFFER_FLOOR_SECONDS (sustained-shortfall guard).
  const lowBufferRef = useRef({ since: 0, prev: -1 });
  // Subtitle cue text is derived on timeupdate from a SubtitleEngine search; a
  // ref snapshot keeps ticks off the React render path.
  const subtitleEngineRef = useRef(null);
  const subtitleEnabledRef = useRef(false); // mirrors state, read inside onTime
  const subtitleCueRef = useRef(null); // last rendered cue text
  const subtitleTokenRef = useRef(0); // download race guard (last pick wins)
  const hasStartedRef = useRef(false); // true once any frame played this session
  const [status, setStatus] = useState("idle");
  const [qualities, setQualities] = useState([]);
  const [activeUri, setActiveUri] = useState(null);
  const [isMasterMode, setIsMasterMode] = useState(false);
  const [audioTracks, setAudioTracks] = useState([]);
  const [audioIndex, setAudioIndex] = useState(0);
  // TMDB iso_639_1 -> display name, for the film-level original-language line.
  const FILM_LANG = {
    en: "English", te: "Telugu", hi: "Hindi", ta: "Tamil", ml: "Malayalam",
    kn: "Kannada", bn: "Bengali", pa: "Punjabi", mr: "Marathi", gu: "Gujarati",
    es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese",
    ru: "Russian", ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic",
    tr: "Turkish", vi: "Vietnamese", th: "Thai", id: "Indonesian", pl: "Polish",
  };
  const [fatal, setFatal] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  // Netflix "Up Next" card: { number, title } for the next TV episode, or null.
  const [upNext, setUpNext] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Real loader state: true while the screen has nothing new (initial load, stall, seek).
  const [buffering, setBuffering] = useState(true);
  // UI mirror of `buffering` that only turns on after ~700ms of stalled media
  // flow. `buffering` stays honest and immediate for logic (failover, seek,
  // step-down); the SPINNER is what a viewer reads, and Netflix never flashes one
  // on the 200ms hole between ABR level switches.
  const [spinner, setSpinner] = useState(true);
  // Cold open (no frame has EVER rendered) shows the glyph immediately; a
  // paused-but-loaded stream never spins.
  useEffect(() => {
    if (!buffering) {
      setSpinner(false);
      return undefined;
    }
    if (!hasStartedRef.current) {
      setSpinner(true);
      return undefined;
    }
    if (!playing) {
      setSpinner(false);
      return undefined;
    }
    const t = setTimeout(() => setSpinner(true), 700);
    return () => clearTimeout(t);
  }, [buffering, playing]);
  const [bufferedSecs, setBufferedSecs] = useState(0);
  const [bufferedRanges, setBufferedRanges] = useState([]);
  // Master-mode (multi-variant) sources start on ABR auto; picking a level pins it.
  const [autoLevel, setAutoLevel] = useState(true);
  const [manualHeight, setManualHeight] = useState(null);
  // The rendition ABR currently settled on (LEVEL_SWITCHED) — shows the real
  // "now playing" resolution in the quality dialog even while on Auto.
  const [currentHeight, setCurrentHeight] = useState(null);
  // Netflix resume card: { at, left } where `at` is the saved position in s.
  const [resumeOffer, setResumeOffer] = useState(null);
  // Subtitles: OpenSubtitles tracks + SubtitleEngine overlay.
  const [subtitleLanguages, setSubtitleLanguages] = useState([]); // [{language, languageId, downloadLink}]
  const [subtitleEnabled, setSubtitleEnabled] = useState(false);
  const [activeSubtitle, setActiveSubtitle] = useState(null); // current cue line or null
  const [currentSubtitle, setCurrentSubtitle] = useState(null); // the selected track object
  const [isFetchingSubtitles, setIsFetchingSubtitles] = useState(false);
  // Netflix chrome state.
  const [controlsVisible, setControlsVisible] = useState(true);
  const [panel, setPanel] = useState(null); // null | "subs" | "episodes"
  const [volume, setVolume] = useState(() =>
    readStoredNumber(VOLUME_STORAGE_KEY, { min: 0, max: 1, fallback: 1 }),
  );
  const [muted, setMuted] = useState(() => {
    try {
      return window.localStorage.getItem(MUTED_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volHover, setVolHover] = useState(false);
  const [scrubHover, setScrubHover] = useState(null); // 0..1 ratio or null
  const [scrubDragging, setScrubDragging] = useState(false);
  // Netflix-style HUD pill (volume / brightness / aspect) that pops then self-fades.
  const [autoMuted, setAutoMuted] = useState(false); // autoplay-block → muted play + hint
  const [brightness, setBrightness] = useState(() => {
    try {
      if (!window.localStorage.getItem(BRIGHTNESS_RESET_FLAG)) {
        window.localStorage.removeItem(BRIGHTNESS_STORAGE_KEY);
        window.localStorage.setItem(BRIGHTNESS_RESET_FLAG, "1");
      }
    } catch {
      // private mode — the read below answers with the default anyway
    }
    return readStoredNumber(
      BRIGHTNESS_STORAGE_KEY,
      { min: BRIGHTNESS_MIN, max: BRIGHTNESS_MAX, fallback: 1 },
    );
  });
  const [aspectRatioIndex, setAspectRatioIndex] = useState(() => {
    const i = readStoredNumber(ASPECT_STORAGE_KEY, { min: 0, max: 2, fallback: 0 });
    return ASPECT_INDEXES.includes(i) ? i : 0;
  });
  const [hud, setHud] = useState(null); // { kind: "volume"|"brightness"|"aspect", value }
  // Mirror refs: the keyboard + gesture handlers bind once, so they must read current values.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const brightnessRef = useRef(brightness);
  brightnessRef.current = brightness;
  const aspectRef = useRef(aspectRatioIndex);
  aspectRef.current = aspectRatioIndex;
  const hudTimerRef = useRef(null);
  // Touch gesture state for Netflix's vertical drags on the video surface.
  const gestureRef = useRef(null);
  // Fragments flowing via the Vercel relay (0 = all direct). A streak past a
  // couple means the CDN throttled us mid-session — surfaced in the attempt log.
  // The per-session verdict (relay vs direct) drives the quality menu's
  // relay-limited rows and skips a re-probe when it is already known.
  const [transportRelay, setTransportRelay] = useState(false);

  const displayTitle = title || (type === "tv" ? `TV ${id}` : `Movie ${id}`);
  const displaySubtitle = subtitle ?? (type === "tv" ? `S${season}:E${episode}` : "");

  const say = () => {};

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    poke();
    setEnded(false);
    try {
      if (video.paused) {
        // Netflix behavior: play with a pending resume card resumes that point.
        if (resumeOffer) {
          commitResumeRef.current?.(resumeOffer.at);
          return;
        }
        // Netflix behavior: play at the end restarts from the top instead of re-ending.
        if (video.ended) video.currentTime = 0;
        await video.play();
      } else {
        video.pause();
      }
    } catch {
      // Autoplay policy — the big custom button stays visible for a tap.
    }
  };
  togglePlayRef.current = togglePlay;

  const seekTo = (value) => {
    const video = videoRef.current;
    if (!video) return;
    setEnded(false);
    try {
      video.currentTime = Number(value) || 0;
    } catch {
      // live-edge clamp — ignore out-of-range seeks
    }
  };

  const replay = async () => {
    const video = videoRef.current;
    if (!video) return;
    poke();
    try {
      video.currentTime = 0;
    } catch {
    }
    setEnded(false);
    try {
      await video.play();
    } catch {
      // user gesture needed — controls are visible
    }
  };

  const scrubRatioOf = (clientX) => {
    const el = scrubRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    if (!r.width) return 0;
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const onScrubDown = (e) => {
    e.stopPropagation();
    poke();
    if (scrubHoverTimer.current) {
      clearTimeout(scrubHoverTimer.current);
      scrubHoverTimer.current = null;
    }
    if (resumeOffer) setResumeOffer(null); // user grabbed the bar — they pick the spot
    try {
      scrubRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // pointer capture unsupported — drag still works while over the bar
    }
    setScrubDragging(true);
    const ratio = scrubRatioOf(e.clientX);
    setScrubHover(ratio);
    // No seek per pointermove: the bar tracks the drag and the seek commits once on
    // release — seeking on every move makes hls.js cancel in-flight fragments.
  };

  const onScrubMove = (e) => {
    const ratio = scrubRatioOf(e.clientX);
    setScrubHover(ratio);
    if (scrubDragging) {
      poke(); // a long drag must not let the controls autohide mid-drag
    }
  };

  const onScrubUp = () => {
    poke();
    if (scrubDragging) {
      const dur = Number(videoRef.current?.duration);
      const target = (scrubHover ?? 0) * (Number.isFinite(dur) && dur > 0 ? dur : 0);
      seekTo(target);
    }
    setScrubDragging(false);
    // Let the red bar settle on the seek target before dropping the hover overlay.
    scrubHoverTimer.current = window.setTimeout(() => setScrubHover(null), 250);
  };

  // A cancelled gesture (Esc, scroll steal, pointer leaving) must not strand the scrubber.
  const onScrubCancel = () => {
    setScrubDragging(false);
    setScrubHover(null);
    if (scrubHoverTimer.current) {
      clearTimeout(scrubHoverTimer.current);
      scrubHoverTimer.current = null;
    }
  };

  const onScrubLeave = () => {
    if (!scrubDragging) setScrubHover(null);
  };

  const seekRelative = (delta) => {
    const video = videoRef.current;
    if (!video) return;
    poke();
    showHud("seek", delta);
    const dur = Number(video.duration);
    const next = (video.currentTime || 0) + delta;
    try {
      video.currentTime = Number.isFinite(dur) && dur > 0 ? Math.min(Math.max(0, next), dur) : Math.max(0, next);
    } catch {
      // ignore out-of-range seeks
    }
  };
  seekRelativeRef.current = seekRelative;

  /* Netflix resume: when a continue-watching entry exists for this title/
     episode, offer "Left off at …" once per session and auto-resume into the
     saved position after a short countdown. Restart scrubs to 0. */
  const maybeOfferResume = () => {
    const entry = watchedEntryRef.current;
    const video = videoRef.current;
    if (!entry || !video) return;
    const at = Number(entry.timestamp) || 0;
    const dur = Number(video.duration) || 0;
    const key = `${type}:${id}:${season}:${episode}`;
    if (resumeHandledKeyRef.current === key) return;
    if (at <= 0 || (dur > 0 && at >= dur * 0.92)) return; // finished / barely started
    resumeHandledKeyRef.current = key;
    setResumeOffer({ at, left: RESUME_WAIT_SECONDS });
    say(`Resume point ${fmtTime(at)} available.`);
  };
  maybeOfferResumeRef.current = maybeOfferResume;

  const commitResume = (at) => {
    setResumeOffer(null);
    poke();
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = at;
    } catch {
      // live-edge clamp — start where the stream begins
    }
    if (video.paused) {
      video.play().catch(() => {
        // autoplay policy — the big custom play button stays available
      });
    }
    say(`Resumed from ${fmtTime(at)}.`);
  };
  commitResumeRef.current = commitResume;

  const restartFromStart = () => {
    setResumeOffer(null);
    poke();
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = 0;
    } catch {
    }
    if (video.paused) {
      video.play().catch(() => {
        // autoplay policy — the big custom play button stays available
      });
    }
    say("Playing from the beginning.");
  };

  // Progress sink: report every ~5s while playing (>10s in, so a 3s peek never writes).
  useEffect(() => {
    if (!playing || !onProgressChange) return undefined;
    const save = () => {
      const video = videoRef.current;
      if (!video) return;
      const t = video.currentTime || 0;
      if (t <= 10) return;
      const now = Date.now();
      if (now - lastProgressSaved.current < 4000) return;
      lastProgressSaved.current = now;
      onProgressChange(Math.floor(t));
    };
    save();
    const iv = setInterval(save, 1000);
    return () => clearInterval(iv);
  }, [playing, onProgressChange]);

  // Resume countdown: tick seconds-remaining, auto-commit at zero; refs keep the effect cheap.
  useEffect(() => {
    if (!resumeOffer) return undefined;
    // The countdown only runs while playback is actually underway. When autoplay is
    // blocked (or the user pauses mid-card) the ticks freeze and no seek fires —
    // seeking into a paused player would flash "Resuming…" and vanish. Tapping play
    // commits the offer instead (togglePlay).
    const tick = setInterval(() => {
      if (videoRef.current?.paused) return;
      setResumeOffer((o) => (o && o.left > 1 ? { ...o, left: o.left - 1 } : null));
    }, 1000);
    const auto = setTimeout(() => {
      if (!resumeOffer) return;
      if (videoRef.current?.paused) return;
      commitResumeRef.current?.(resumeOffer.at);
    }, resumeOffer.left * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(auto);
    };
  }, [resumeOffer]);

  const showHud = useCallback((kind, value) => {
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    setHud({ kind, value });
    hudTimerRef.current = setTimeout(() => setHud(null), HUD_MS);
  }, []);

  const changeVolume = (delta) => {
    const nv = Math.min(1, Math.max(0, Math.round((volumeRef.current + delta) * 100) / 100));
    setMuted(false);
    setAutoMuted(false);
    setVolume(nv);
    showHud("volume", nv);
    poke();
  };

  const toggleMute = () => {
    const m = !mutedRef.current;
    setMuted(m);
    setAutoMuted(false);
    showHud("volume", m ? 0 : volumeRef.current);
    poke();
  };

  const changeBrightness = (delta) => {
    const nv = Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, Math.round((brightnessRef.current + delta) * 100) / 100));
    setBrightness(nv);
    showHud("brightness", nv);
    poke();
  };

  const cycleAspect = () => {
    const idx = ASPECT_INDEXES.indexOf(aspectRef.current);
    const next = ASPECT_INDEXES[(idx + 1) % ASPECT_INDEXES.length];
    setAspectRatioIndex(next);
    showHud("aspect", next);
    poke();
  };

  const goFullscreen = () => {
    try {
      const video = videoRef.current;
      const el = screenRef.current;
      const rq = (el && (el.requestFullscreen || el.webkitRequestFullscreen)) || null;
      if (rq) {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          const ex = document.exitFullscreen || document.webkitExitFullscreen;
          ex?.call(document)?.catch?.(() => {});
        } else {
          rq.call(el)?.catch?.(() => {});
        }
      } else if (video && video.webkitEnterFullscreen) {
        // iOS Safari: the <video> enters its own native fullscreen (no DOM fullscreen on a div).
        video.webkitEnterFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      // fullscreen unsupported — native video keeps playing inline
    }
    poke();
  };

  // Controls autohide: activity shows them, 3s idle while playing hides them. Paused always shows.
  const poke = useCallback(() => {
    setControlsVisible(true);
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (videoRef.current && !videoRef.current.paused) {
      idleTimer.current = setTimeout(() => setControlsVisible(false), HIDE_DELAY_MS);
    }
  }, []);

  // Single click toggles play, double click toggles fullscreen.
  const handleVideoClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      goFullscreen();
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        togglePlay();
      }, 260);
    }
  };

  // Touch taps land on the video itself (overlay buttons keep their own clicks):
  // single tap = play/pause, a second tap on the SAME half within 350ms = ±10s.
  const handleVideoTouchEnd = (e) => {
    poke();
    suppressClickRef.current = true;
    if (buffering) return;
    // A vertical gesture (volume/brightness drag) just happened — not a tap.
    if (gestureRef.current?.active) {
      gestureRef.current = null;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const t = e.changedTouches && e.changedTouches[0];
    if (!rect.width || !t) return;
    const side = t.clientX < rect.left + rect.width / 2 ? -1 : 1;
    const now = performance.now();
    const prev = touchTapRef.current;
    if (now - prev.time < 350 && prev.side === side) {
      touchTapRef.current = { time: 0, side: 0 };
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      seekRelative(side * SKIP_SECONDS);
      return;
    }
    touchTapRef.current = { time: now, side };
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      togglePlay();
    }, 260);
  };

  // Vertical drag: LEFT half = brightness, RIGHT half = volume. Vertical-only —
  // horizontal movement declares a non-gesture so taps and double-taps survive.
  const handleGestureStart = (e) => {
    if (!IS_TOUCH || buffering) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    gestureRef.current = {
      side: t.clientX < rect.left + rect.width / 2 ? "brightness" : "volume",
      startY: t.clientY,
      lastY: t.clientY,
      active: false,
    };
  };

  const handleGestureMove = (e) => {
    const g = gestureRef.current;
    if (!g) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dy = t.clientY - g.lastY;
    if (!g.active) {
      if (Math.abs(t.clientY - g.startY) < 14) return;
      g.active = true;
      suppressClickRef.current = true;
    }
    if (g.side === "volume") {
      // Netflix sign: drag UP → louder/brightter (clientY falls, so -dy is positive).
      const nv = Math.min(1, Math.max(0, volumeRef.current - dy * 0.008));
      setMuted(false);
      setAutoMuted(false);
      setVolume(nv);
      showHud("volume", nv);
    } else {
      const nb = Math.min(BRIGHTNESS_MAX, Math.max(BRIGHTNESS_MIN, brightnessRef.current - dy * 0.008));
      setBrightness(nb);
      showHud("brightness", nb);
    }
    g.lastY = t.clientY;
    poke();
  };

  /* Custom transport state (no native video controls — play/pause/seek/time/
     fullscreen below are all wired by hand). */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const onPlay = () => {
      hasStartedRef.current = true;
      setPlaying(true);
      setBuffering(false);
      if (navigator.mediaSession) navigator.mediaSession.playbackState = "playing";
    };
    const onPause = () => {
      setPlaying(false);
      if (navigator.mediaSession) navigator.mediaSession.playbackState = "paused";
    };
    const onEnded = () => {
      setPlaying(false);
      setEnded(true);
      poke();
    };
    const bufferedAhead = () => {
      try {
        const b = video.buffered;
        const t = video.currentTime || 0;
        for (let i = 0; i < b.length; i += 1) {
          if (b.start(i) <= t && t <= b.end(i)) return Math.max(0, b.end(i) - t);
        }
      } catch {
        // buffered unreadable (no media yet) — report zero
      }
      return 0;
    };
    const onTime = () => {
      setCurrentTime(video.currentTime || 0);
      setBufferedSecs(Math.round(bufferedAhead()));
      try {
        const ranges = [];
        const b = video.buffered;
        for (let i = 0; i < b.length; i += 1) ranges.push([b.start(i), b.end(i)]);
        setBufferedRanges(ranges);
      } catch {
        // buffered unreadable yet
      }
      // Subtitles: only touch React when the active line changes.
      const engine = subtitleEngineRef.current;
      if (engine && subtitleEnabledRef.current) {
        const cue = engine.getActiveCue(video.currentTime || 0);
        const text = cue?.text || null;
        if (text !== subtitleCueRef.current) {
          subtitleCueRef.current = text;
          setActiveSubtitle(text);
        }
      }
    };
    const onMeta = () => setDuration(video.duration || 0);
    // The element is the honest stall detector: waiting/stalled/seeking = nothing new to show.
    const onWaiting = () => setBuffering(true);
    const onStalled = () => setBuffering(true);
    const onSeeking = () => {
      setBuffering(true);
      // timeupdate does not fire while seeking, so mirror currentTime (which already
      // carries the seek target) or the bar sits at the pre-seek position.
      setCurrentTime(video.currentTime || 0);
    };
    const onSeeked = () => setBuffering(false);
    const onCanPlay = () => setBuffering(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("durationchange", onMeta);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("canplay", onCanPlay);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("durationchange", onMeta);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("canplay", onCanPlay);
    };
  }, []);

  /* Volume applies to the element and persists across visits. autoMuted is the
     transient autoplay-policy mute (Netflix autoplays muted + hints) — it
     overrides until the user taps the "unmute" affordance. */
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      try {
        video.volume = volume;
        video.muted = muted || autoMuted;
      } catch {
        // element not ready — applied on the next change
      }
    }
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
      window.localStorage.setItem(MUTED_STORAGE_KEY, muted ? "1" : "0");
    } catch {
      // private mode — volume just won't persist
    }
  }, [volume, muted, autoMuted]);

  /* Brightness (CSS filter) and aspect ratio persist across visits. */
  useEffect(() => {
    try {
      window.localStorage.setItem(BRIGHTNESS_STORAGE_KEY, String(brightness));
    } catch {
      // private mode — brightness just won't persist
    }
  }, [brightness]);
  useEffect(() => {
    try {
      window.localStorage.setItem(ASPECT_STORAGE_KEY, String(aspectRatioIndex));
    } catch {
      // private mode — aspect just won't persist
    }
  }, [aspectRatioIndex]);

  /* Fullscreen icon follows the real fullscreen state (incl. iOS webkit). */
  useEffect(() => {
    const onFull = () =>
      setIsFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onFull);
    document.addEventListener("webkitfullscreenchange", onFull);
    return () => {
      document.removeEventListener("fullscreenchange", onFull);
      document.removeEventListener("webkitfullscreenchange", onFull);
    };
  }, []);

  /* Media Session (Android/iOS lock screen + hardware buttons): advertise the
     title, reflect play/pause, and answer the 10s-seek buttons. Registered
     once — the handlers call live refs so nothing goes stale. */
  useEffect(() => {
    if (!("mediaSession" in navigator)) return undefined;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: displayTitle,
        artist: displaySubtitle || "Streamly",
        album: "Streamly",
      });
      navigator.mediaSession.setActionHandler("play", () => togglePlayRef.current());
      navigator.mediaSession.setActionHandler("pause", () => {
        try {
          videoRef.current?.pause();
        } catch {
          // element not ready
        }
      });
      navigator.mediaSession.setActionHandler("seekbackward", (d) =>
        seekRelativeRef.current(-(d?.seekOffset || SKIP_SECONDS)),
      );
      navigator.mediaSession.setActionHandler("seekforward", (d) =>
        seekRelativeRef.current(d?.seekOffset || SKIP_SECONDS),
      );
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        const v = videoRef.current;
        if (!v || d?.seekTime == null) return;
        try {
          v.currentTime = d.seekTime;
        } catch {
          // out-of-range seek — clamp handled by the element itself
        }
      });
      return () => {
        try {
          navigator.mediaSession.setActionHandler("play", null);
          navigator.mediaSession.setActionHandler("pause", null);
          navigator.mediaSession.setActionHandler("seekbackward", null);
          navigator.mediaSession.setActionHandler("seekforward", null);
          navigator.mediaSession.setActionHandler("seekto", null);
        } catch {
          // session unavailable
        }
      };
    } catch {
      // MediaMetadata/session unsupported — playback is unaffected
    }
    return undefined;
  }, [displayTitle, displaySubtitle]);

  /* Re-arm the autohide timer whenever play state flips. */
  useEffect(() => {
    poke();
    return () => {
      if (idleTimer.current) {
        clearTimeout(idleTimer.current);
        idleTimer.current = null;
      }
    };
  }, [playing, poke]);

  /* Click-timer cleanup for the single/double-click splitter. */
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
      if (scrubHoverTimer.current) clearTimeout(scrubHoverTimer.current);
    },
    [],
  );

  /* One-off keyframes for the "Up Next" countdown bar (the player is fully
     inline-styled, so the 0%→100% sweep is injected into the head). */
  useEffect(() => {
    const styleId = "streamly-upnext-keyframes";
    if (document.getElementById(styleId)) return undefined;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `@keyframes upNextCountdown { from { transform: scaleX(0); } to { transform: scaleX(1); } }`;
    document.head.appendChild(style);
    return undefined;
  }, []);

  /* Netflix "Up Next": when a TV episode ends and a next one exists, offer a
     countdown card that auto-plays it. Replaying/cancelling tears it down (a
     cancelled card's fired timer is a no-op thanks to the `prev` guard). */
  useEffect(() => {
    if (type !== "tv" || !ended) {
      setUpNext(null);
      return undefined;
    }
    const idx = episodes.findIndex((e) => e.number === episode);
    const next = idx >= 0 ? episodes[idx + 1] : null;
    if (!next) {
      setUpNext(null);
      return undefined;
    }
    setUpNext(next);
    const timer = setTimeout(() => {
      setUpNext((prev) => {
        if (prev) onSelectEpisodeRef.current?.(prev.number);
        return null;
      });
    }, UP_NEXT_MS);
    return () => clearTimeout(timer);
  }, [type, ended, episodes, episode]);

  /* Netflix keyboard map. Space/K play-pause, arrows seek/volume, M mute,
     F fullscreen, Esc closes the dialog first, then the player. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return;
      const tag = String(e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      // Space/Enter on a focused button already clicks it — running our own
      // toggle too would double-fire into a no-op.
      if (tag === "button" && (e.code === "Space" || e.code === "Enter")) return;
      const video = videoRef.current;
      if (!video) return;
      switch (e.code) {
        case "Space":
        case "KeyK":
          e.preventDefault();
          togglePlay();
          break;
        case "KeyJ":
          e.preventDefault();
          seekRelative(-SKIP_SECONDS);
          break;
        case "KeyL":
          e.preventDefault();
          seekRelative(SKIP_SECONDS);
          break;
        case "ArrowLeft":
          e.preventDefault();
          seekRelative(-SKIP_SECONDS);
          break;
        case "ArrowRight":
          e.preventDefault();
          seekRelative(SKIP_SECONDS);
          break;
        case "ArrowUp":
          e.preventDefault();
          if (e.shiftKey) changeBrightness(0.1);
          else changeVolume(0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          if (e.shiftKey) changeBrightness(-0.1);
          else changeVolume(-0.1);
          break;
        case "KeyA":
          e.preventDefault();
          cycleAspect();
          break;
        case "KeyM":
          toggleMute();
          break;
        case "KeyF":
          goFullscreen();
          break;
        case "Escape":
          // In fullscreen the browser consumes Esc to exit it — don't also
          // close the player underneath.
          if (document.fullscreenElement) return;
          if (panel) setPanel(null);
          else onCloseRef.current?.();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // togglePlay/seekRelative/changeVolume/toggleMute/goFullscreen only touch
    // refs + functional setState, so binding once per panel flip is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);


  useEffect(() => {
    if (!Hls.isSupported()) {
      setFatal("This browser has no MediaSource support — native playback cannot run here.");
      return undefined;
    }
    const run = runRef.current + 1;
    runRef.current = run;
    const controller = new AbortController();

    const entryUrlFor = (def, resolved, variant) => {
      // Master sources keep their levels + audio groups on the master, so load the
      // master and let hls.js see them; other sources are per-quality media playlists.
      if (resolved?.source?.multiLevelMaster) return resolved.source?.url;
      return variant?.uri;
    };

    const waitParsed = (hls) =>
      new Promise((resolve, reject) => {
        let settled = false;
        const finish = () => {
          clearTimeout(timer);
          hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
          hls.off(Hls.Events.ERROR, onError);
          controller.signal.removeEventListener("abort", onAbort);
        };
        const timer = setTimeout(() => reject(new Error("Timed out waiting for the playlist")), PARSE_TIMEOUT_MS);
        const onParsed = () => {
          if (settled) return;
          settled = true;
          finish();
          resolve();
        };
        const onError = (_e, data) => {
          if (settled || !data?.fatal) return;
          settled = true;
          finish();
          reject(new Error(data?.details || "hls fatal error"));
        };
        // Abort hygiene: a failover/title switch mid-load used to leave this promise
        // hanging past its 75s timer. Reject immediately on abort.
        const onAbort = () => {
          if (settled) return;
          settled = true;
          finish();
          const error = new Error("Aborted");
          error.name = "AbortError";
          reject(error);
        };
        hls.on(Hls.Events.MANIFEST_PARSED, onParsed);
        hls.on(Hls.Events.ERROR, onError);
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });

    const startLevelFor = (hls) => {
      // Master sources load their master with level selection on AUTO (-1): forcing
      // the top level first is what stalled 4K playback.
      if (!metaRef.current?.masterLevels || !Array.isArray(hls.levels) || hls.levels.length === 0) return;
      hls.currentLevel = -1;
    };

    const attachAudio = (hls) => {
      const tracks = hls.audioTracks || [];
      if (runRef.current !== run) return;
      setAudioTracks(
        tracks.map((t, i) => ({ index: i, name: t.name || t.lang || `Audio ${i + 1}`, lang: t.lang || "" })),
      );
      try {
        setAudioIndex(hls.audioTrack ?? 0);
      } catch {
        setAudioIndex(0);
      }
    };

    (async () => {
      setStatus("resolving");
      setFatal(null);
      setQualities([]);
      setAudioTracks([]);
      setAudioIndex(0);
      setBuffering(true);
      setBufferedSecs(0);
      setBufferedRanges([]);
      setAutoLevel(true);
      setManualHeight(null);
      setCurrentHeight(null);
      setResumeOffer(null);
      setPanel(null);
      setTransportRelay(false);
      autoUriRef.current = null;
      autoUriHeightRef.current = null;
      const args = { type, id, season: type === "tv" ? season : undefined, episode: type === "tv" ? episode : undefined, title };
      const stale = () => runRef.current !== run || controller.signal.aborted;
      const abortPromise = () =>
        new Promise((resolve) => {
          if (controller.signal.aborted) resolve("done");
          else controller.signal.addEventListener("abort", () => resolve("done"), { once: true });
        });
      const sleep = (ms) =>
        new Promise((resolve) => {
          if (controller.signal.aborted) return resolve();
          const timer = setTimeout(() => resolve(), ms);
          controller.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true },
          );
        });
      // A failure that smells like an expired token (VidCore path tokens rotate) is not a dead CDN.
      const isAuthFatal = (detail) =>
        /\[relay:(segment-fetch-failed|manifest-fetch-failed)\]/.test(detail || "") ||
        /failed \((401|403|429)\)/.test(detail || "");
      const pickSmooth = (list) =>
        list.filter((v) => (v.height || 0) > 0 && (v.height || 0) <= 1080).sort((a, b) => (b.height || 0) - (a.height || 0))[0] ||
        list[0];

      // One pass at a source: true = settled (caller stops), false = transient (retryable
      // warm-up/empty/flaky), "off" = terminal (the provider doesn't have this title).
      const runSourceOnce = async (def) => {
        say(`Trying ${def.label}…`);
        let resolved = null;
        try {
          resolved = await def.resolve(args, { signal: controller.signal });
        } catch (error) {
          say(`${def.label}: resolve failed (${error?.code || error?.message}) — next source.`);
          if (error?.code === "no-source") return "off";
          return false;
        }
        let variants = resolved?.variants || [];
        if (variants.length === 0) {
          // Empty is not terminal: the catalogue returns empty lists when rate-flaky.
          say(`${def.label}: no variants (maybe rate-flaky) — retrying/moving on.`);
          return false;
        }
        let liveSource = resolved.source;
        let liveRefUrl = resolved.source?.refUrl || resolved.source?.url;
        // Master sources ship levels + audio groups in ONE url; others are per-rendition.
        const isMaster = Boolean(liveSource?.multiLevelMaster);
        // attempt 0 = initial URLs; attempt 1 = one token-refresh re-resolve.
        let preferHeight = null;
        let resumeTime = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (stale()) return true;
          const pool = preferHeight != null ? variants.filter((v) => (v.height || 0) === preferHeight) : [];
          // Smooth start: open on the tallest rendition ≤1080p (a 4K segment needs
          // ~20Mbps sustained — opening there is what stalled playback after 5-10s).
          let smoothStart = pool[0] || pickSmooth(variants);
          let entryUrl = entryUrlFor(def, { source: liveSource }, smoothStart);
          if (!entryUrl) {
            say(`${def.label}: no playable URL — next source.`);
            return false;
          }
          say(
            `${def.label}: ${variants.length} variant(s), loading ` +
              (isMaster ? "master (ABR auto)…" : `${smoothStart?.height || "?"}p (smooth start)…`),
          );
          // Playability gate: prove one real media byte flows before hls.js sees the
          // source, or a perfect ladder over dead segments plays as a black screen.
          say(`${def.label}: probing one media byte…`);
          let probe = { ok: false, reason: "probe error" };
          try {
            probe = await probeSourcePlayable(entryUrl, liveRefUrl, { signal: controller.signal });
          } catch (error) {
            if (error?.name === "AbortError" || stale()) return true;
            probe = { ok: false, reason: error?.message || "probe error" };
          }
          if (stale()) return true;
          if (!probe.ok) {
            say(`${def.label}: segments unreachable (${probe.reason}) — next source.`);
            return false;
          }
          say(`${def.label}: segments flow via ${probe.via}.`);
          setTransportRelay(probe?.via === "relay");
          // Relay delivery is latency-bound (fresh serverless round trip per chunk), so
          // a relay start reopens at the tallest ≤720p; the direct path keeps ≤1080p.
          if (!isMaster && probe.via === "relay" && (smoothStart?.height || 0) > 720) {
            const relayFriendly = variants
              .filter((v) => (v.height || 0) > 0 && (v.height || 0) <= 720)
              .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
            if (relayFriendly && relayFriendly.uri !== smoothStart?.uri) {
              say(`${def.label}: relay path — smooth-starting at ${relayFriendly.height || "?"}p (≤720p)…`);
              smoothStart = relayFriendly;
              entryUrl = entryUrlFor(def, { source: liveSource }, smoothStart);
            }
          }
          try {
            hlsRef.current?.destroy();
          } catch {
            // previous instance already gone
          }
          // Byte cap scaled so the top rendition we serve can get BUFFER_DEPTH_SECONDS ahead.
          const topBps = variants.reduce((m, v) => Math.max(m, Number(v.bandwidth) || 0), 0) || 8 * 1000 * 1000;
          const maxBufferSize = Math.min(
            MAX_BUFFER_SIZE,
            Math.max(MIN_BUFFER_SIZE, Math.ceil((topBps / 8) * BUFFER_DEPTH_SECONDS)),
          );
          const bufferDepthSecs = Math.round(Math.floor(maxBufferSize / Math.max(1, topBps / 8)));
          say(`Buffer: up to ~${bufferDepthSecs}s (~${Math.round(maxBufferSize / 1024 / 1024)}MB) ahead.`);
          // Start-conservative, pick-liberal: fragments come through the Vercel relay with
          // parallel range chunking, so a manual tall pick may try and the buffer-floor
          // step-down negotiates back down. We do NOT yank a user's 4K/1080p pick (every
          // source is relay-only on the free tier; banning tall rungs bans everything).
          // Startup stays ≤720p over relay; master sources self-adjust.
          const hls = new Hls({
            loader: createStreamlyLoader({
              getRefUrl: () => liveRefUrl,
              onRelayPath: () => {
                setTransportRelay(true);
              },
              onDirectPath: () => {
                setTransportRelay(false);
              },
            }),
            // ABR + progressive MSE appends: chunks hit the screen while the segment is
            // still arriving. The back buffer stays small so device RAM stays bounded.
            abrEnabled: true,
            progressive: true,
            maxBufferLength: BUFFER_DEPTH_SECONDS,
            maxBufferSize,
            backBufferLength: BACK_BUFFER_SECONDS,
            // Auto starts mid-ladder (INITIAL_BW_BITS) so quality doesn't climb rung-by-rung.
            initialBandwidthEstimate: INITIAL_BW_BITS,
            // Judge ABR by MEASURED bytes/sec, not the advertised bitrate (relayed sources
            // lie), and never exceed the rendered size — a small window doesn't need 1080p
            // and every rung saved off the relay is one fewer stall.
            abrMaxWithRealBitrate: true,
            capLevelToPlayerSize: true,
          });
          hlsRef.current = hls;
          let lastFatalDetail = "";
          let resolveFatal = null;
          const fatalLater = new Promise((resolve) => {
            resolveFatal = resolve;
          });
          const reportFatal = (data) => {
            const frag = data?.frag;
            lastFatalDetail =
              `${data?.details || "error"}` +
              (data?.error?.message ? ` (${data.error.message})` : "") +
              (frag ? ` [sn ${frag.sn ?? "?"} ${String(frag.url || "").slice(0, 90)}]` : "");
            say(`${def.label}: fatal ${lastFatalDetail} — next source.`);
            logWarn("native", `${def.label} fatal during playback`, {
              details: data?.details,
              message: data?.error?.message,
              fragSn: frag?.sn ?? null,
            });
            // A dead source should show its evidence, not a bare spinner.
                      };
          const failOver = () => {
            try {
              hls.destroy();
            } catch {
              // already torn down
            }
            resolveFatal?.();
          };
          // Non-fatal fragment failures never reach the attempt log, yet a loop of them IS
          // the black screen (vidzen 429s) — count them and fail over ourselves.
          let consecFragFails = 0;
          hls.on(Hls.Events.FRAG_BUFFERED, () => {
            consecFragFails = 0;
          });
          hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => {
            setCurrentHeight(data?.height ?? null);
          });
          hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => attachAudio(hls));
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (!data?.fatal) {
              if (
                data?.details === "fragLoadError" ||
                data?.details === "fragLoadTimeout" ||
                data?.details === "levelLoadError"
              ) {
                consecFragFails += 1;
                // Multi-level sources step down early so hls.js's own retry has a chance instead
                // of re-burning the same doomed fragment. Only in PURE AUTO (manualLevel -1):
                // a pinned rung goes straight to failover.
                const isPureAuto =
                  Number.isInteger(hls.manualLevel) && hls.manualLevel < 0;
                const autoRung = hls.autoLevel ?? -1;
                const canStepDown =
                  Array.isArray(hls.levels) &&
                  hls.levels.length > 1 &&
                  isPureAuto &&
                  Number.isInteger(autoRung) &&
                  autoRung > 0;
                if (consecFragFails >= 2 && canStepDown) {
                  hls.currentLevel = autoRung - 1;
                  consecFragFails = 0;
                  say(`${def.label}: downshifting to level ${autoRung - 1} (${data.details})…`);
                                  } else if (consecFragFails >= MAX_CONSECUTIVE_FRAG_FAILURES) {
                  reportFatal({ ...data, fatal: true, details: `${data.details} (×${consecFragFails} consecutive — giving up)` });
                  failOver();
                } else {
                  say(`${def.label}: segment retry ${consecFragFails} (${data.details})…`);
                }
              }
              return;
            }
            reportFatal(data);
            failOver();
          });
          try {
            hls.loadSource(entryUrl);
            hls.attachMedia(videoRef.current);
            await waitParsed(hls);
          } catch (error) {
            say(`${def.label}: ${error?.message || "load failed"} — next source.`);
            try {
              hls.destroy();
            } catch {
              // already torn down
            }
            return false;
          }
          if (stale()) return true;
          metaRef.current = {
            variants,
            sourceKey: def.key,
            refUrl: liveRefUrl,
            masterLevels: isMaster,
          };
          startLevelFor(hls);
          setQualities(
            variants
              .slice()
              .sort((a, b) => (a.height || 0) - (b.height || 0))
              .map((v) => ({
                uri: v.uri,
                height: v.height || 0,
                label: qualityLabelFor(v),
              })),
          );
          setIsMasterMode(isMaster);
          setActiveUri(isMaster ? null : smoothStart?.uri || null);
          // Remember the rung the player negotiated (non-master "Auto").
          autoUriRef.current = isMaster ? null : smoothStart?.uri || null;
          autoUriHeightRef.current = isMaster ? null : smoothStart?.height ?? null;
          attachAudio(hls);
          setStatus(`playing via ${def.label}`);
          say(`${def.label}: PLAYING (${isMaster ? "ABR auto" : `${smoothStart?.height || "?"}p`}).`);
          if (resumeTime != null) {
            try {
              videoRef.current.currentTime = resumeTime;
            } catch {
            }
            resumeTime = null;
          }
          try {
            await videoRef.current?.play();
          } catch {
            // Muted autoplay is allowed, an unmuted play() outside a user-activation window
            // is not: try unmuted, else play muted + hint at "Tap to unmute".
            try {
              videoRef.current.muted = true;
              setAutoMuted(true);
              await videoRef.current.play();
            } catch {
              say("Autoplay blocked — tap the custom play button.");
            }
          }
          // Non-master sources are single-rendition: their current height is fixed.
          if (!isMaster) setCurrentHeight(smoothStart?.height ?? null);
          // Netflix resume gate: first real playback for this title/episode.
          maybeOfferResumeRef.current();
          // A fatal error AFTER playback started either refreshes tokens in place (same
          // source/quality, resume position) or moves on — never a dead "playing" screen.
          const parked = await Promise.race([fatalLater.then(() => "fatal"), abortPromise()]);
          if (parked === "done") return true;
          if (attempt === 0 && isAuthFatal(lastFatalDetail) && !stale()) {
            const savedT = videoRef.current?.currentTime || 0;
            say(`${def.label}: token may have expired — re-resolving…`);
            let fresh = null;
            try {
              fresh = await def.resolve(args, { signal: controller.signal });
            } catch {
              fresh = null;
            }
            const freshVariants = fresh?.variants || [];
            if (fresh && freshVariants.length > 0) {
              preferHeight = smoothStart?.height ?? null;
              resumeTime = savedT;
              variants = freshVariants;
              liveSource = fresh.source;
              liveRefUrl = fresh.source?.refUrl || fresh.source?.url;
              say(`${def.label}: fresh tokens minted — resuming…`);
              continue;
            }
            say(`${def.label}: re-resolve failed — next source.`);
          }
          return false;
        }
        return false;
      };

      const runSource = async (def) => {
        for (let retry = 0; ; retry += 1) {
          if (stale()) return true;
          if (retry > 0) {
            if (retry > SOURCE_RETRIES) return false;
            say(`${def.label}: transient failure — auto-retry ${retry}/${SOURCE_RETRIES}…`);
            await sleep(SOURCE_RETRY_BACKOFF_MS[retry - 1] ?? 1200);
            if (stale()) return true;
          }
          const outcome = await runSourceOnce(def);
          if (outcome === true) return true;
          if (outcome === "off") return false;
        }
      };

      for (const def of SOURCES) {
        if (stale()) return;
        if (await runSource(def)) return;
      }
      if (stale()) return;
      setStatus("error");
      setFatal("No native source resolved this title (all sources came up empty).");
      say("All sources exhausted.");
    })();

    return () => {
      controller.abort();
      try {
        hlsRef.current?.destroy();
      } catch {
        // already torn down
      }
      hlsRef.current = null;
      try {
        videoRef.current?.removeAttribute?.("src");
      } catch {
        // element already detached
      }
    };
  }, [type, id, season, episode, title]);

  const pickQuality = async (uri, height, opts = {}) => {
    const hls = hlsRef.current;
    if (!videoRef.current) return;
    if (!hls) return;
    const t = videoRef.current.currentTime || 0;
    const wasPaused = videoRef.current.paused;
    // A manual rung pick leaves Auto; the Auto row stays highlighted as the active mode.
    if (!opts.auto) setAutoLevel(false);
    say(`Switching to ${height || "?"}p…`);
    setBuffering(true);
    poke();
    try {
      if (metaRef.current?.masterLevels && Array.isArray(hls.levels) && hls.levels.length > 0) {
        let best = 0;
        hls.levels.forEach((lvl, i) => {
          if (Math.abs((lvl.height || 0) - (height || 0)) < Math.abs((hls.levels[best].height || 0) - (height || 0))) best = i;
        });
        hls.currentLevel = best;
        setAutoLevel(false);
        // Pin the dialog highlight to the level ACTUALLY selected (row height can differ a few px).
        setManualHeight(hls.levels[best]?.height || height || null);
        setActiveUri(null);
        say(`Level -> ${hls.levels[best]?.height || "?"}p (pinned).`);
        return;
      }
      const myId = (switchTokenRef.current += 1);
      // Pre-warm the swap: probe the TARGET while the current level still plays (warms
      // the CDN edge and proves the route). With parallel range chunking a tall pick
      // may try; the floor step-down negotiates back down.
      let chosenUri = uri;
      let chosenHeight = height;
      let warm = transportRelay ? { ok: true, via: "relay" } : null;
      const refUrl = metaRef.current?.refUrl;
      try {
        if (!warm) warm = await probeSourcePlayable(uri, refUrl);
        if (switchTokenRef.current !== myId) return;
        if (!warm.ok) {
          say(`Quality ${height || "?"}p: target unreachable (${warm.reason || "probe failed"}) — keeping current.`);
          setBuffering(false);
          setControlsVisible(true);
          return;
        }
      } catch {
        // probe hiccup (abort, timeout) — fall through to the requested uri
      }
      if (chosenUri === activeUri) {
        say(`Already playing ${chosenHeight || "?"}p — no reload.`);
        setBuffering(false);
        setControlsVisible(true);
        return;
      }
      hls.loadSource(chosenUri);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("switch timed out")), 30000);
        const onFatal = (_e, data) => {
          if (data?.fatal) reject(new Error(data?.details || "playlist switch failed"));
        };
        const done = () => {
          clearTimeout(timer);
          hls.off(Hls.Events.MANIFEST_PARSED, done);
          hls.off(Hls.Events.ERROR, onFatal);
          resolve();
        };
        hls.on(Hls.Events.MANIFEST_PARSED, done);
        hls.on(Hls.Events.ERROR, onFatal);
      });
      if (switchTokenRef.current !== myId) return;
      const video = videoRef.current;
      try {
        video.currentTime = t;
      } catch {
      }
      // Reproduce "a paused switch feels instant": a fresh play() with zero buffered data
      // drops straight back to `waiting`, so wait for the first media bytes (bounded)
      // before resuming.
      if (!wasPaused && video && (video.readyState ?? 0) < 3) {
        await Promise.race([
          new Promise((resolve) => {
            const ok = () => {
              cleanup();
              resolve();
            };
            const cleanup = () => {
              video.removeEventListener("canplay", ok);
              video.removeEventListener("loadeddata", ok);
            };
            video.addEventListener("canplay", ok);
            video.addEventListener("loadeddata", ok);
          }),
          new Promise((r2) => setTimeout(r2, 4000)),
        ]);
      }
      if (switchTokenRef.current !== myId) return;
      if (!wasPaused) {
        try {
          await videoRef.current.play();
        } catch {
          // user gesture needed — custom transport is present
        }
      }
      setActiveUri(chosenUri);
      say(`Switched to ${chosenHeight || "?"}p.`);
    } catch (error) {
      say(`Switch failed: ${error?.message || "unknown"}.`);
      // A failed switch must never leave the buffering spinner stuck (the runSource
      // ERROR handler's failover re-drives its own spinner).
      setBuffering(false);
    }
  };
  pickQualityRef.current = pickQuality;

  // YouTube's anti-stall rule: when the pipe can't refill faster than a segment
  // plays, drop one rung once the forward buffer sits under BUFFER_FLOOR_SECONDS
  // for a sustained stretch without refilling. Auto-level only.
  useEffect(() => {
    const st = lowBufferRef.current;
    if (status !== "playing" || buffering) {
      st.since = 0;
      st.prev = bufferedSecs;
      return;
    }
    if (bufferedSecs < BUFFER_FLOOR_SECONDS) {
      if (!st.since) {
        st.since = Date.now();
        st.prev = bufferedSecs;
      }
      const refilling = bufferedSecs > st.prev + 1;
      st.prev = bufferedSecs;
      if (refilling || Date.now() - st.since < BUFFER_UNDERFLOOR_MS) return;
      st.since = 0;
      if (metaRef.current?.masterLevels) return;
      const curH = currentHeight || 0;
      const rungs = qualities
        .filter((q) => (q.height || 0) > 0 && (q.height || 0) < curH)
        .sort((a, b) => (b.height || 0) - (a.height || 0));
      const target = rungs[0];
      if (!target || activeUri === target.uri) return;
      say(`Buffer holds <${BUFFER_FLOOR_SECONDS}s — stepping down to ${target.height || "?"}p so it refills (keeps playing).`);
            st.prev = bufferedSecs;
      pickQualityRef.current?.(target.uri, target.height)?.catch?.(() => {});
      return;
    }
    st.since = 0;
    st.prev = bufferedSecs;
  }, [bufferedSecs, status, buffering, currentHeight, qualities, activeUri]);

  const pickAudio = (index) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.audioTrack = index;
    setAudioIndex(index);
    poke();
    say(`Audio -> ${audioTracks[index]?.name || index}.`);
  };

  /* Subtitles: OpenSubtitles track list for THIS title (mirrors
     CustomVideoPlayer). Selected line is downloaded+decompressed, parsed into a
     SubtitleEngine, and the active cue overlaid on the frame. */
  const applySubtitleCue = (text) => {
    subtitleCueRef.current = text;
    setActiveSubtitle(text);
  };

  const selectSubtitle = async (entry) => {
    if (!entry) {
      subtitleEnabledRef.current = false;
      subtitleEngineRef.current?.setCues([]);
      setSubtitleEnabled(false);
      setCurrentSubtitle(null);
      applySubtitleCue(null);
      return;
    }
    subtitleTokenRef.current += 1;
    const token = subtitleTokenRef.current;
    setSubtitleEnabled(true);
    subtitleEnabledRef.current = true;
    setCurrentSubtitle(entry);
    applySubtitleCue(null);
    try {
      window.localStorage.setItem(
        `streamly-native-subtitle-${id}`,
        entry.languageId || entry.language,
      );
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
          say("Subtitle download failed — try another language.");
        }
        return;
      }
      const parsed = SubtitleEngine.parseSRT(text);
      const cues = parsed.length ? parsed : SubtitleEngine.parseVTT(text);
      const engine = subtitleEngineRef.current || (subtitleEngineRef.current = new SubtitleEngine());
      engine.setCues(cues);
      if (token === subtitleTokenRef.current) {
        const cue = engine.getActiveCue(videoRef.current?.currentTime || 0);
        applySubtitleCue(cue?.text || null);
        say(`Subtitles -> ${entry.language} (${cues.length} lines).`);
      }
    } catch {
      if (token === subtitleTokenRef.current) {
        subtitleEnabledRef.current = false;
        setSubtitleEnabled(false);
        say("Subtitle download failed — try another language.");
      }
    }
  };

  // Load the language list once per title; remember the last choice per title id.
  useEffect(() => {
    let cancelled = false;
    subtitleTokenRef.current += 1;
    subtitleEnabledRef.current = false;
    subtitleEngineRef.current?.setCues([]);
    setSubtitleLanguages([]);
    setSubtitleEnabled(false);
    setCurrentSubtitle(null);
    applySubtitleCue(null);
    if (!imdbId) return undefined;
    setIsFetchingSubtitles(true);
    SubtitleFetcher.searchAvailableSubtitles(imdbId, title || "")
      .then((langs) => {
        if (cancelled) return;
        const list = langs || [];
        setSubtitleLanguages(list);
        let remembered = null;
        try {
          remembered = window.localStorage.getItem(`streamly-native-subtitle-${id}`);
        } catch {
          // storage unavailable — no auto restore
        }
        if (remembered) {
          const match =
            list.find((l) => l.languageId === remembered) ||
            list.find((l) => l.language === remembered);
          if (match) selectSubtitle(match);
        }
      })
      .finally(() => {
        if (!cancelled) setIsFetchingSubtitles(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, type, imdbId]);

  const pickAuto = () => {
    const hls = hlsRef.current;
    const autoUri = autoUriRef.current;
    const autoHeight = autoUriHeightRef.current;
    if (
      isMasterMode &&
      hls &&
      Array.isArray(hls.levels) &&
      hls.levels.length > 0
    ) {
      // Master: hand level selection back to hls.js ABR.
      hls.currentLevel = -1;
      setActiveUri(null);
    } else if (!isMasterMode && autoUri && autoUri !== activeUri) {
      // Non-master "Auto" = the rung negotiated at settle, applied live but never pinned.
      pickQuality(autoUri, autoHeight ?? null, { auto: true });
    }
    setAutoLevel(true);
    setManualHeight(null);
    poke();
    say("Quality -> Auto (adjusts with your connection).");
  };

  // Render-time derivations for the scrubber.
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progressRatio = safeDuration > 0 ? Math.min(1, Math.max(0, currentTime / safeDuration)) : 0;
  // While dragging, the bar follows the pointer, not the frozen playback head.
  const effectiveRatio = scrubDragging ? (scrubHover ?? progressRatio) : progressRatio;
  const hoverRatio = scrubHover ?? (scrubDragging ? progressRatio : null);
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const showEpisodesButton = Array.isArray(episodes) && episodes.length > 0;

  // Episode paging (TV only): the parent's canGo*/onGo* cross seasons; we fall back to walking `episodes`.
  const showEpisodeNav = type === "tv";
  const navIndex = episodes.findIndex((e) => e.number === episode);
  const navPrevNumber = navIndex > 0 ? episodes[navIndex - 1]?.number : null;
  const navNextNumber =
    navIndex >= 0 && navIndex < episodes.length - 1 ? episodes[navIndex + 1]?.number : null;
  const prevDisabled = typeof canGoPrev === "boolean" ? !canGoPrev : navPrevNumber == null;
  const nextDisabled = typeof canGoNext === "boolean" ? !canGoNext : navNextNumber == null;

  const goEpPrev = () => {
    if (prevDisabled) return;
    poke();
    setPanel(null);
    setResumeOffer(null);
    setUpNext(null);
    setBuffering(true);
    if (onGoPrevRef.current) return onGoPrevRef.current();
    if (navPrevNumber != null) onSelectEpisodeRef.current?.(navPrevNumber);
  };
  const goEpNext = () => {
    if (nextDisabled) return;
    poke();
    setPanel(null);
    setResumeOffer(null);
    setUpNext(null);
    setBuffering(true);
    if (onGoNextRef.current) return onGoNextRef.current();
    if (navNextNumber != null) onSelectEpisodeRef.current?.(navNextNumber);
  };

  // Skip-intro window: we have no metadata, so under-claim — the pill shows only
  // inside [0, end + grace] and disappears for good once the head passes it.
  let skipIntroEnd = 0;
  if (type === "tv") {
    const o = SKIP_INTRO_OVERRIDES[id];
    if (o && Number(o.endSeconds) > 0) skipIntroEnd = Number(o.endSeconds);
    else if (safeDuration === 0 || safeDuration >= SKIP_INTRO_MIN_EPISODE_SECONDS)
      skipIntroEnd = SKIP_INTRO_DEFAULT_END;
  }
  const showSkipIntro =
    skipIntroEnd > 0 && !ended && currentTime >= 0 && currentTime <= skipIntroEnd + SKIP_INTRO_GRACE;
  const skipIntroTarget = Math.min(skipIntroEnd, safeDuration > 5 ? safeDuration - 5 : skipIntroEnd);
  const doSkipIntro = () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.currentTime = skipIntroTarget;
    } catch {
    }
    poke();
    try {
      v.play();
    } catch {
      // user gesture needed — custom transport is present
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        ref={screenRef}
        onMouseMove={poke}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background: "#000",
          borderRadius: 0,
          overflow: "hidden",
          cursor: !controlsVisible && playing ? "none" : "default",
          userSelect: "none",
          WebkitUserSelect: "none",
          touchAction: "manipulation",
        }}
      >
        <video
          ref={videoRef}
          playsInline
          onClick={(e) => {
            // The synthetic click after a touch must not toggle play on top of the gesture.
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            handleVideoClick(e);
          }}
          onTouchStart={(e) => {
            // A fresh touch re-arms the click-swallow.
            suppressClickRef.current = false;
            poke();
            handleGestureStart(e);
          }}
          onTouchMove={handleGestureMove}
          onTouchEnd={IS_TOUCH ? handleVideoTouchEnd : undefined}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            objectFit: ASPECT_FIT[aspectRatioIndex] || "contain",
            filter: brightness !== 1 ? `brightness(${brightness})` : undefined,
            // No background on purpose: the screen div paints true black, so the
            // brightness filter sees only the video frame.
            touchAction: "manipulation",
            WebkitUserSelect: "none",
          }}
        />
        {/* Subtitle overlay — active OpenSubtitles line, bottom-anchored above
            the control chrome like CustomVideoPlayer. */}
        {activeSubtitle ? (
          <div
            style={{
              position: "absolute",
              left: "6%",
              right: "6%",
              bottom: "96px",
              textAlign: "center",
              zIndex: 3,
              pointerEvents: "none",
              lineHeight: 1.4,
              fontSize: "clamp(16px, 2.6vw, 26px)",
              fontWeight: 700,
              color: "#fff",
              whiteSpace: "pre-line",
              textShadow: "0 2px 6px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)",
              WebkitTextStroke: "0 0 transparent",
            }}
          >
            {activeSubtitle}
          </div>
        ) : null}
        {/* Top bar: back + debug toggle. */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `${SAFE_TOP} 24px 52px`,
            background: "linear-gradient(180deg, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0) 100%)",
            opacity: controlsVisible ? 1 : 0,
            transition: "opacity 0.3s",
            pointerEvents: controlsVisible ? "auto" : "none",
            zIndex: 4,
          }}
        >
          <IconBtn
            label="Back"
            onClick={() => {
              if (onCloseRef.current) onCloseRef.current();
              else window.history.back();
            }}
          >
            <ArrowLeft size={24} />
          </IconBtn>
        </div>
        {/* Netflix-style Skip Intro pill: top-left, just under the back row,
            present only inside the intro window, seeks just past the credits.
            Stays tappable even with the chrome hidden (Netflix keeps it while
            the intro plays). */}
        {showSkipIntro && (
          <button
            type="button"
            onClick={doSkipIntro}
            aria-label="Skip the opening credits"
            title="Stop the intro, come right back in"
            style={{
              position: "absolute",
              bottom: `calc(${SAFE_BOTTOM} + 96px)`,
              right: 24,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 20px",
              background: "rgba(0,0,0,0.7)",
              color: "#fff",
              border: "2px solid rgba(255,255,255,0.9)",
              borderRadius: 4,
              fontWeight: 700,
              fontSize: 16,
              cursor: "pointer",
              zIndex: 5,
            }}
          >
            <SkipForward size={16} />
            Skip Intro
          </button>
        )}
        {/* Center: red buffering spinner; on touch, a big play glyph whenever the
            stream is simply paused (incl. the autoplay-policy case where a
            cold start can't play without a tap); the replay button at the end
            (Netflix end state). */}
        {spinner && (
          <div
            role="status"
            aria-label="Loading video"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 3,
            }}
          >
            <Loader2 size={48} className="animate-spin" color={NETFLIX_RED} />
          </div>
        )}
        {!buffering && !ended && !playing && status === "playing" && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: IS_TOUCH ? 20 : 28,
              zIndex: 3,
              pointerEvents: "none",
            }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                poke();
                seekRelative(-SKIP_SECONDS);
              }}
              aria-label="Rewind 10 seconds"
              title="Rewind 10 seconds"
              style={{
                position: "relative",
                width: IS_TOUCH ? 66 : 62,
                height: IS_TOUCH ? 66 : 62,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.55)",
                background: "rgba(20,20,20,0.6)",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "auto",
              }}
            >
              <RotateCcw size={26} />
              <span style={{ position: "absolute", fontSize: 9.5, fontWeight: 800, marginTop: 3 }}>10</span>
            </button>
            <button
              type="button"
              onClick={() => {
                poke();
                togglePlayRef.current();
              }}
              aria-label="Play"
              title="Play"
              style={{
                width: 92,
                height: 92,
                borderRadius: "50%",
                border: "none",
                background: "#fff",
                color: "#000",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "auto",
                boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
              }}
            >
              <Play size={40} fill="currentColor" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                poke();
                seekRelative(SKIP_SECONDS);
              }}
              aria-label="Fast forward 10 seconds"
              title="Fast forward 10 seconds"
              style={{
                position: "relative",
                width: IS_TOUCH ? 66 : 62,
                height: IS_TOUCH ? 66 : 62,
                borderRadius: "50%",
                border: "1px solid rgba(255,255,255,0.55)",
                background: "rgba(20,20,20,0.6)",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "auto",
              }}
            >
              <RotateCw size={26} />
              <span style={{ position: "absolute", fontSize: 9.5, fontWeight: 800, marginTop: 3 }}>10</span>
            </button>
          </div>
        )}
        {/* Transient "Tap to unmute" pill (Netflix web) — only when playback
            had to start muted because the autoplay-policy blocked sound. */}
        {autoMuted && playing && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAutoMuted(false);
              setMuted(false);
              poke();
            }}
            aria-label="Play with sound"
            title="Unmute"
            style={{
              position: "absolute",
              bottom: `calc(${SAFE_BOTTOM} + 140px)`,
              left: 24,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px",
              background: "rgba(0,0,0,0.65)",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.55)",
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              zIndex: 6,
            }}
          >
            <VolumeX size={16} color="#E50914" />
            Tap to unmute
          </button>
        )}
        {!buffering && ended && (
          <button
            type="button"
            onClick={replay}
            aria-label="Watch again"
            title="Watch again"
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: 84,
              height: 84,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,0.85)",
              background: "rgba(0,0,0,0.45)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 3,
            }}
          >
            <RotateCcw size={38} />
          </button>
        )}
        {/* Bottom chrome: title, scrubber, transport row. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingTop: IS_TOUCH ? 4 : 8,
            paddingLeft: IS_TOUCH ? 12 : 24,
            paddingRight: IS_TOUCH ? 12 : 24,
            paddingBottom: SAFE_BOTTOM,
            background: "linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 60%, rgba(0,0,0,0) 100%)",
            opacity: controlsVisible ? 1 : 0,
            transition: "opacity 0.3s",
            pointerEvents: controlsVisible ? "auto" : "none",
            zIndex: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: IS_TOUCH ? 4 : 10, minWidth: 0 }}>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: "clamp(16px, 2vw, 22px)",
                  letterSpacing: "-0.01em",
                  lineHeight: 1.1,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {displayTitle}
              </div>
              {displaySubtitle ? (
                <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 500, marginTop: 4 }}>
                  {displaySubtitle}
                </div>
              ) : null}
            </div>
            {/* On touch the transport row stays one line — the clock lives in
                the title row instead. */}
            {IS_TOUCH && (
              <span
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.9)",
                  fontVariantNumeric: "tabular-nums",
                  whiteSpace: "nowrap",
                  alignSelf: "center",
                  marginTop: 1,
                  flexShrink: 0,
                }}
              >
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </span>
            )}
          </div>
          {/* Scrubber: red played · gray buffered · hover knob + time bubble. */}
          <div
            ref={scrubRef}
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.floor(safeDuration)}
            aria-valuenow={Math.floor(currentTime)}
            onPointerDown={onScrubDown}
            onPointerMove={onScrubMove}
            onPointerUp={onScrubUp}
            onPointerCancel={onScrubCancel}
            onPointerLeave={onScrubLeave}
            style={{
              position: "relative",
              height: 36,
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              touchAction: "none",
            }}
          >
            <div
              style={{
                position: "relative",
                height: hoverRatio != null ? 5 : 3,
                width: "100%",
                background: "rgba(255,255,255,0.3)",
                borderRadius: 999,
                transition: "height 0.15s",
              }}
            >
              {safeDuration > 0 &&
                bufferedRanges.map(([s, e], i) =>
                  e > s ? (
                    <div
                      key={i}
                      style={{
                        position: "absolute",
                        top: 0,
                        bottom: 0,
                        left: `${(s / safeDuration) * 100}%`,
                        width: `${((e - s) / safeDuration) * 100}%`,
                        background: "rgba(255,255,255,0.5)",
                        borderRadius: 999,
                      }}
                    />
                  ) : null,
                )}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: `${effectiveRatio * 100}%`,
                  background: NETFLIX_RED,
                  borderRadius: 999,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: `calc(${effectiveRatio * 100}% - ${(hoverRatio != null ? 17 : 13) / 2}px)`,
                  width: hoverRatio != null ? 17 : 13,
                  height: hoverRatio != null ? 17 : 13,
                  borderRadius: "50%",
                  background: NETFLIX_RED,
                  transform: "translateY(-50%)",
                  transition: "width 0.15s, height 0.15s",
                  boxShadow: "0 1px 6px rgba(0,0,0,0.6)",
                }}
              />
            </div>
            {hoverRatio != null && safeDuration > 0 && (
              <div
                style={{
                  position: "absolute",
                  bottom: 28,
                  left: `${Math.min(94, Math.max(6, hoverRatio * 100))}%`,
                  transform: "translateX(-50%)",
                  background: "rgba(0,0,0,0.8)",
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  padding: "4px 8px",
                  borderRadius: 4,
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {fmtTime(hoverRatio * safeDuration)}
              </div>
            )}
          </div>
          {/* Transport row. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
              <IconBtn label={playing ? "Pause" : "Play"} onClick={togglePlay}>
                {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
              </IconBtn>
              {!IS_TOUCH && (
                <>
                  <button
                    type="button"
                    aria-label="Back 10 seconds"
                    title="Back 10 seconds"
                    onClick={(e) => {
                      e.stopPropagation();
                      seekRelative(-SKIP_SECONDS);
                    }}
                    style={{
                      position: "relative",
                      width: BTN_SIZE,
                      height: BTN_SIZE,
                      borderRadius: "50%",
                      border: "none",
                      background: "transparent",
                      color: "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <RotateCcw size={24} />
                    <span style={{ position: "absolute", fontSize: 8.5, fontWeight: 800, marginTop: 3 }}>10</span>
                  </button>
                  <button
                    type="button"
                    aria-label="Forward 10 seconds"
                    title="Forward 10 seconds"
                    onClick={(e) => {
                      e.stopPropagation();
                      seekRelative(SKIP_SECONDS);
                    }}
                    style={{
                      position: "relative",
                      width: BTN_SIZE,
                      height: BTN_SIZE,
                      borderRadius: "50%",
                      border: "none",
                      background: "transparent",
                      color: "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <RotateCw size={24} />
                    <span style={{ position: "absolute", fontSize: 8.5, fontWeight: 800, marginTop: 3 }}>10</span>
                  </button>
                </>
              )}
              <span
                onMouseEnter={() => setVolHover(true)}
                onMouseLeave={() => setVolHover(false)}
                style={{ display: "flex", alignItems: "center" }}
              >
                <IconBtn label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
                  <VolumeIcon size={24} />
                </IconBtn>
                {!IS_TOUCH && volHover && (
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={(e) => {
                      const nv = Number(e.target.value);
                      setMuted(false);
                      setAutoMuted(false);
                      setVolume(nv);
                      showHud("volume", nv);
                      poke();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Volume"
                    className="np-volume-slider" style={{ width: 72, cursor: "pointer", marginLeft: 4 }}
                  />
                )}
              </span>
              {!IS_TOUCH && (
                <span
                  style={{
                    fontSize: 14,
                    color: "rgba(255,255,255,0.9)",
                    fontVariantNumeric: "tabular-nums",
                    marginLeft: 12,
                    whiteSpace: "nowrap",
                  }}
                >
                  {fmtTime(currentTime)} / {fmtTime(duration)}
                </span>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {showEpisodeNav && (
                <>
                  <IconBtn label="Previous episode" disabled={prevDisabled} onClick={goEpPrev}>
                    <SkipBack size={24} />
                  </IconBtn>
                  <IconBtn label="Next episode" disabled={nextDisabled} onClick={goEpNext}>
                    <SkipForward size={24} />
                  </IconBtn>
                </>
              )}
              {showEpisodesButton && (
                <IconBtn
                  label="Episodes"
                  active={panel === "episodes"}
                  onClick={() => {
                    setPanel((p) => (p === "episodes" ? null : "episodes"));
                    poke();
                  }}
                >
                  <ListVideo size={24} />
                </IconBtn>
              )}
              <IconBtn
                label="Audio and subtitles"
                active={panel === "subs"}
                onClick={() => {
                  setPanel((p) => (p === "subs" ? null : "subs"));
                  poke();
                }}
              >
                <Captions size={24} />
              </IconBtn>
              {/* Aspect ratio (Fit / Fill / Zoom). Hidden on touch only when a
                  TV's prev/next + episodes already crowd the rail — keyboard
                  A still cycles there. */}
              {(!IS_TOUCH || !(showEpisodeNav || showEpisodesButton)) && (
                <IconBtn label="Aspect ratio (key A)" onClick={cycleAspect}>
                  <Ratio size={24} />
                </IconBtn>
              )}
              <IconBtn label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={goFullscreen}>
                {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
              </IconBtn>
            </div>
          </div>
        </div>
        {/* Netflix "Left off at …" resume card — auto-resumes after a short wait. */}
        {resumeOffer && !ended && (
          <div
            onClick={(e) => e.stopPropagation()}
            role="complementary"
            aria-label={`Resume from ${fmtTime(resumeOffer.at)}`}
            style={{
              position: "absolute",
              right: 24,
              bottom: IS_TOUCH ? 120 : 100,
              display: "flex",
              alignItems: "center",
              gap: 12,
              background: "rgba(20,20,20,0.97)",
              borderRadius: 4,
              padding: "12px 16px",
              zIndex: 6,
              boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>
                You left off at {fmtTime(resumeOffer.at)}
              </div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>
                {resumeOffer.left > 1
                  ? `Auto-resuming in ${resumeOffer.left}s`
                  : "Resuming…"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => commitResumeRef.current?.(resumeOffer.at)}
              aria-label={`Resume from ${fmtTime(resumeOffer.at)}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 18px",
                background: "#fff",
                color: "#000",
                border: "none",
                borderRadius: 3,
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              <Play size={16} />
              Resume
            </button>
            <button
              type="button"
              onClick={restartFromStart}
              aria-label="Restart from the beginning"
              style={{
                padding: "8px 14px",
                background: "transparent",
                color: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: 3,
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Restart
            </button>
          </div>
        )}

        {/* Netflix "Up Next" post-roll card (TV only). */}
        {upNext && ended && (
          <div
            onClick={(e) => e.stopPropagation()}
            role="complementary"
            aria-label={`Up Next: playing in ${Math.round(UP_NEXT_MS / 1000)} seconds`}
            style={{
              position: "absolute",
              right: 24,
              bottom: IS_TOUCH ? 120 : 100,
              width: "min(260px, 55%)",
              background: "rgba(20,20,20,0.97)",
              borderRadius: 4,
              padding: "14px 16px",
              zIndex: 6,
              boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.18em", color: "rgba(255,255,255,0.55)" }}>
                Up Next
              </span>
              <IconBtn label="Cancel up next" onClick={() => setUpNext(null)}>
                <X size={16} />
              </IconBtn>
            </div>
            <div style={{ marginTop: 6, color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>
              {upNext.title ? `E${upNext.number} · ${upNext.title}` : `Episode ${upNext.number}`}
            </div>
            <div
              style={{
                marginTop: 8,
                height: 3,
                borderRadius: 999,
                background: "rgba(255,255,255,0.18)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${UP_NEXT_MS}ms`,
                  background: NETFLIX_RED,
                  transformOrigin: "left",
                  animation: "upNextCountdown linear both",
                  animationDuration: `${UP_NEXT_MS}ms`,
                }}
              />
            </div>
            <div style={{ marginTop: 6, fontSize: 12.5, color: "rgba(255,255,255,0.6)" }}>
              Playing in {Math.round(UP_NEXT_MS / 1000)} seconds
            </div>
            <button
              type="button"
              onClick={() => onSelectEpisodeRef.current?.(upNext.number)}
              style={{
                marginTop: 10,
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "9px 16px",
                background: "#fff",
                color: "#000",
                border: "none",
                borderRadius: 3,
                fontWeight: 700,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              <Play size={18} />
              Play now
            </button>
          </div>
        )}

        {/* Audio & Subtitles / Episodes panel. */}
        {panel && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              right: 0,
              top: IS_TOUCH ? undefined : 0,
              bottom: 0,
              width:
                panel === "subs"
                  ? IS_TOUCH
                    ? "min(580px, 100%)"
                    : "min(580px, 38%)"
                  : IS_TOUCH
                    ? "min(360px, 100%)"
                    : "min(360px, 28%)",
              maxHeight: IS_TOUCH ? "85%" : "100%",
              height: IS_TOUCH ? undefined : "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              background: "rgba(0,0,0,0.97)",
              borderLeft: IS_TOUCH ? "none" : "1px solid rgba(255,255,255,0.08)",
              borderTop: IS_TOUCH ? "1px solid rgba(255,255,255,0.1)" : "none",
              borderRadius: IS_TOUCH ? "16px 16px 0 0" : 0,
              padding: "16px 0 0",
              zIndex: 5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "0 16px" }}>
              <span style={{ color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>
                {panel === "subs" ? "Audio & Subtitles" : "Episodes"}
              </span>
              <IconBtn label="Close panel" onClick={() => setPanel(null)}>
                <X size={18} />
              </IconBtn>
            </div>
            {/* Each pane scrolls on its own: Audio + Video Quality stay in one
                column (the shared controls), Subtitles in its own — so
                scrolling the quality ladder never scrolls the subtitle list
                past you, and vice versa. */}
            {panel === "subs" ? (
              <div style={{ display: "flex", gap: 16, flexDirection: IS_TOUCH ? "column" : "row", flex: 1, minHeight: 0 }}>
                {/* Left pane: Audio + Video Quality (the feed/play controls). */}
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: "4px 0 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Audio
                  </p>
                  {audioTracks.length > 0 ? (
                    audioTracks.map((a) => (
                      <DialogRow
                        key={a.index}
                        selected={a.index === audioIndex}
                        onClick={() => pickAudio(a.index)}
                        title={a.name}
                        sub={a.lang && a.lang !== a.name ? a.lang : undefined}
                      />
                    ))
                  ) : (
                    // No #EXT-X-MEDIA AUDIO groups: hls.js reports no audioTracks, but the
                    // soundtrack IS playing — surface it as the single track.
                    <>
                      {originalLanguage ? (
                        <p
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: "rgba(255,255,255,0.5)",
                            margin: "2px 0 10px",
                            letterSpacing: "0.02em",
                          }}
                        >
                          Film's original language:{" "}
                          {FILM_LANG[originalLanguage] || (originalLanguage || "").toUpperCase() || "Unknown"}
                        </p>
                      ) : null}
                      <DialogRow
                        key="original"
                        selected
                        title="Original"
                        sub="This source's soundtrack"
                      />
                    </>
                  )}
                  <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: "16px 0 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Video Quality
                  </p>
                  {/* Auto is ALWAYS present — the active mode on every source
                      (master = hls.js ABR; per-rendition sources = the rung the
                      player negotiated at open, smooth-start / relay-friendly). */}
                  <DialogRow
                    selected={autoLevel}
                    onClick={pickAuto}
                    title="Auto"
                    sub={
                      autoLevel && currentHeight != null
                        ? `Now ${currentHeight}p · adjusts with your connection`
                        : "Adjusts with your connection"
                    }
                  />
                  {qualities.map((q, i) => {
                    const selected = isMasterMode
                      ? autoLevel
                        ? currentHeight != null && q.height === currentHeight
                        : manualHeight != null && manualHeight === q.height
                      : !autoLevel && activeUri === q.uri;
                    return (
                      <DialogRow
                        key={`${q.uri}::${i}`}
                        selected={selected}
                        onClick={() => pickQuality(q.uri, q.height)}
                        title={q.label || `${q.height}p`}
                      />
                    );
                  })}
                </div>
                {/* Right pane: Subtitles only — scrolls on its own, independent
                    of the Audio/Quality pane. */}
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: "4px 0 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Subtitles
                  </p>
                  <DialogRow
                    key="off"
                    selected={!subtitleEnabled}
                    onClick={() => selectSubtitle(null)}
                    title="Off"
                  />
                  {isFetchingSubtitles ? (
                    <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)", margin: "6px 0 2px", lineHeight: 1.45 }}>
                      Searching OpenSubtitles…
                    </p>
                  ) : subtitleLanguages.length > 0 ? (
                    subtitleLanguages.map((s) => (
                      <DialogRow
                        key={s.languageId || s.language}
                        selected={
                          subtitleEnabled &&
                          s.languageId === currentSubtitle?.languageId &&
                          s.language === currentSubtitle?.language
                        }
                        onClick={() => selectSubtitle(s)}
                        title={s.language}
                      />
                    ))
                  ) : (
                    <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)", margin: "6px 0 2px", lineHeight: 1.45 }}>
                      No subtitles found for this title on OpenSubtitles.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 0 16px" }}>
                {episodes.map((ep) => (
                  <DialogRow
                    key={ep.number}
                    selected={ep.number === episode}
                    onClick={() => {
                      setResumeOffer(null);
                      setPanel(null);
                      setBuffering(true);
                      onSelectEpisode?.(ep.number);
                    }}
                    title={`E${ep.number}${ep.title ? ` · ${ep.title}` : ""}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
        {/* Netflix HUD overlays: transient volume / brightness / aspect pills
            that pop while a value changes and self-fade, plus the rewind /
            forward badge on its own edge. All geometry comes from hudMetrics
            (the measured frame), so they track the video rather than the
            viewport. Presentational only (pointer-events none). */}
        <AnimatePresence>
          {hud?.kind === "volume" && (
            <NetflixVolumeHUD key="volume" effVolume={volume} isMuted={muted || autoMuted} metrics={hudBox} volume={volume} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {hud?.kind === "brightness" && (
            <NetflixBrightnessHUD key="brightness" brightness={brightness} metrics={hudBox} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {hud?.kind === "aspect" && (
            <NetflixAspectHUD key="aspect" aspectRatioIndex={aspectRatioIndex} metrics={hudBox} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {hud?.kind === "seek" && hud.value < 0 && (
            <NetflixSeekHUD key="seek-back" direction="back" metrics={hudBox} seconds={Math.abs(Math.round(hud.value))} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {hud?.kind === "seek" && hud.value > 0 && (
            <NetflixSeekHUD key="seek-forward" direction="forward" metrics={hudBox} seconds={Math.abs(Math.round(hud.value))} />
          )}
        </AnimatePresence>
      </div>
      {fatal && (
        <p style={{ position: "absolute", bottom: 80, left: 16, right: 16, padding: "12px 16px", borderRadius: 6, background: "rgba(229,9,20,0.12)", border: "1px solid rgba(229,9,20,0.35)", fontSize: 14, zIndex: 7, color: "#fff" }}>
          {fatal}
        </p>
      )}
    </div>
  );
}
