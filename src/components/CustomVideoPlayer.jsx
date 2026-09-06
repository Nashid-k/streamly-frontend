import React, { useEffect, useState, useRef, useCallback } from "react";
import { VideoSourceAdapter } from "../api/videoSourceAdapter";
import { PlatformAdapter } from "../api/platformAdapter";
import { movieService } from "../api/movieService";
import {
  Play, Pause, Volume1, Volume2, VolumeX, Maximize, Minimize,
  Settings, AlertCircle, Check, RotateCcw, RotateCw,
  SkipForward, FastForward, Rewind,
  Keyboard, X, Upload, Captions, Film, Link, Repeat, AudioLines,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SubtitleEngine } from "../utils/subtitleEngine";

const getNumericId = (s) => {
  if (!s) return null;
  const m = s.toString().match(/\d+/);
  return m ? m[0] : null;
};

/* Parse a WebVTT thumbnail sprite file into tile descriptors.
   Format:
     WEBVTT
     00:00:00.000 --> 00:00:10.000
     https://host/sprite.jpg#xywh=0,0,320,180     */
const parseThumbnailVTT = (vttText) => {
  const tiles = [];
  const lines = vttText.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    const m = line.match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{1,3})/);
    if (m) {
      const toNum = (h, min, s, ms) => (h || 0) * 3600 + +min * 60 + +s + +ms / 1000;
      const start = toNum(m[1], m[2], m[3], m[4]);
      const end = toNum(m[5], m[6], m[7], m[8]);
      const imgLine = (lines[i + 1] || "").trim();
      if (imgLine) {
        const hashIdx = imgLine.lastIndexOf("#");
        const url = hashIdx > 0 ? imgLine.slice(0, hashIdx) : imgLine;
        const params = hashIdx > 0 ? imgLine.slice(hashIdx + 1) : "";
        const xywh = params.match(/xywh=(\d+),(\d+),(\d+),(\d+)/);
        const tile = { start, end, url };
        if (xywh) {
          tile.x = +xywh[1]; tile.y = +xywh[2]; tile.w = +xywh[3]; tile.h = +xywh[4];
        } else {
          tile.x = 0; tile.y = 0; tile.w = 320; tile.h = 180;
        }
        tiles.push(tile);
      }
      i += 2;
    } else {
      i++;
    }
  }
  return tiles;
};

const STREAM_SERVICE_URL = import.meta.env.VITE_STREAM_SERVICE_URL || "";

/* Route cross-origin CDN URLs through the stream-service CORS proxy */
const proxyUrl = (u) => {
  if (!u || !STREAM_SERVICE_URL) return u;
  if (String(u).startsWith(STREAM_SERVICE_URL)) return u;
  return `${STREAM_SERVICE_URL}/api/proxy?url=${encodeURIComponent(u)}`;
};

const ASPECT_RATIOS = [
  { name: "Fit (16:9)", scale: 1 },
  { name: "Crop 16:10", scale: 1.111 },
  { name: "Crop 2.35:1", scale: 1.322 },
  { name: "Crop 2.39:1", scale: 1.344 },
  { name: "Crop 4:3", scale: 1.333 },
  { name: "Extra Zoom", scale: 1.18 },
];

/* Frame glyph dimensions [w, h] per aspect index — drawn in the aspect HUD
   so the shape visibly morphs as the user cycles through ratios.
   These are proportional to the actual crop scales so the glyph resembles
   what the viewer sees (wider = more cropped, taller = 4:3). */
const AR_GLYPH = [
  [44, 25], // Fit (16:9)       — 1.78:1
  [42, 25], // Crop 16:10       — 1.60:1
  [50, 21], // Crop 2.35:1      — 2.35:1
  [50, 21], // Crop 2.39:1      — 2.39:1
  [34, 26], // Crop 4:3         — 1.33:1
  [46, 25], // Extra Zoom       — 1.84:1 (zoomed 16:9)
];

const KEYBOARD_SHORTCUTS = [
  { key: "Space / K", action: "Play / Pause" },
  { key: "F", action: "Fullscreen" },
  { key: "M", action: "Mute" },
  { key: "→ / L", action: "Forward 10s" },
  { key: "← / J", action: "Rewind 10s" },
  { key: "↑↓", action: "Volume" },
  { key: "A", action: "Aspect Ratio" },
  { key: "?", action: "Shortcuts" },
];

const LOADING_TIPS_DESKTOP = [
  { text: "Double-tap center for fullscreen", icon: Keyboard },
  { text: "Arrow keys to seek 10 seconds", icon: Keyboard },
  { text: "Scroll to adjust volume", icon: Keyboard },
  { text: "Press ? for all shortcuts", icon: Keyboard },
  { text: "Right-click for more options", icon: Settings },
];
const LOADING_TIPS_TOUCH = [
  { text: "Double-tap sides to seek 10s", icon: Keyboard },
  { text: "Swipe right side for volume", icon: Volume2 },
  { text: "Swipe left side for brightness", icon: Volume2 },
  { text: "Pinch to enter fullscreen", icon: Maximize },
  { text: "Tap center to play / pause", icon: Play },
];

/* ═══ Apple Design Language ═══════════════════════════════════════
   Inspired by Apple TV+ player — circular arcs, frosted glass,
   SF Pro typography, spring-physics animations, minimal chrome.
   ════════════════════════════════════════════════════════════════ */

/* Spring presets (Apple-style physics) */
const SPRING = { type: "spring", stiffness: 400, damping: 30, mass: 0.8 };
const SPRING_FAST = { type: "spring", stiffness: 600, damping: 35 };
const SPRING_SNAPPY = { type: "spring", stiffness: 500, damping: 28 };

/* Responsive design tokens — scale with viewport, never break */
const R = {
  /* Sizes scale via vmin so they work on phones through ultrawide */
  btnSmall: 'clamp(24px, 4vw, 34px)',
  btnMedium: 'clamp(32px, 5vw, 42px)',
  btnPlay: 'clamp(36px, 6vw, 46px)',
  /* Arc HUD sizes */
  arcSmall: 32,
  arcVolume: 'clamp(36px, 6vw, 48px)',
  arcSeek: 'clamp(48px, 8vw, 68px)',
  arcLoading: 'clamp(44px, 8vw, 60px)',
  /* Panel widths */
  panelSettings: 'clamp(240px, 40vw, 300px)',
  panelSubtitles: 'clamp(220px, 38vw, 280px)',
  panelShortcuts: 'clamp(240px, 42vw, 300px)',
  /* Fonts */
  fontTiny: 'clamp(8px, 1.5vw, 10px)',
  fontSmall: 'clamp(10px, 1.8vw, 12px)',
  fontMedium: 'clamp(11px, 2vw, 14px)',
  fontLarge: 'clamp(13px, 2.5vw, 16px)',
  fontHero: 'clamp(1.1rem, 3.5vw, 2.2rem)',
  /* Padding */
  padTiny: 'clamp(4px, 1vw, 8px)',
  padSmall: 'clamp(6px, 1.2vw, 12px)',
  padMedium: 'clamp(8px, 1.5vw, 16px)',
  padLarge: 'clamp(12px, 2vw, 24px)',
  /* Border radius */
  radiusSmall: 'clamp(6px, 1.2vw, 10px)',
  radiusMedium: 'clamp(8px, 1.5vw, 14px)',
  radiusPill: 100,
  /* Container */
  controlRowPad: 'clamp(4px, 1vw, 14px)',
  progressBarPad: 'clamp(8px, 2vw, 20px)',
  /* HUD center-top offset — clears the toast/error pill (top ≈ 12–16px)
     while staying inside the player container, even in fullscreen */
  hudCenterTop: 'clamp(44px, 8vw, 68px)',
};

/* Circular Arc Component — the core Apple TV+ motif
   Used for: volume HUD, seek indicators, loading, up-next countdown */
const ArcRing = ({ progress = 0, size = 48, strokeWidth = 3, color = "#fff", bgColor = "rgba(255,255,255,0.08)", glowColor, children, className, responsive }) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(progress, 1)));
  return (
    <div style={{ position: "relative", width: responsive || size, height: responsive || size, flexShrink: 0 }} className={className}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bgColor} strokeWidth={strokeWidth} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>
      {glowColor && (
        <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)", filter: `blur(4px)`, opacity: 0.5 }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="transparent" strokeWidth={strokeWidth} />
          <circle
            cx={size/2} cy={size/2} r={r} fill="none"
            stroke={glowColor} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
        </svg>
      )}
      {children && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          /* Counter-rotate so children stay upright despite SVG rotation */
          transform: "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
};

/* Apple TV+ style loading arc — clean spinning gradient trail */
const LoadingArc = ({ size = 56, strokeWidth = 2.5, progress = 0 }) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* Static track ring */}
      <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth}
        />
      </svg>
      {/* Spinning gradient arc — Apple TV+ style with fade trail */}
      <motion.svg
        width={size} height={size}
        style={{ position: "absolute", inset: 0 }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
      >
        <defs>
          <linearGradient id="loadArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.6)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0.95)" />
          </linearGradient>
        </defs>
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke="url(#loadArcGrad)" strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circ * 0.25} ${circ * 0.75}`}
        />
      </motion.svg>
      {/* Inner progress ring — fills over time */}
      {progress > 0 && (
        <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id="loadInnerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(255,255,255,0.08)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.25)" />
            </linearGradient>
          </defs>
          <circle
            cx={size/2} cy={size/2} r={r - strokeWidth * 2}
            fill="none" stroke="url(#loadInnerGrad)" strokeWidth={strokeWidth * 0.5}
            strokeDasharray={2 * Math.PI * (r - strokeWidth * 2)}
            strokeDashoffset={2 * Math.PI * (r - strokeWidth * 2) * (1 - progress)}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.16, 1, 0.3, 1)" }}
            transform={`rotate(-90 ${size/2} ${size/2})`}
          />
        </svg>
      )}
    </div>
  );
};

/* hls.js is ~150 KB minified — never import it statically. It is fetched
   lazily the first time a Direct HLS stream actually starts, so iframe-server
   titles, native-HLS (Safari/iOS) playback, and every other page never pay
   for it. Subsequent plays reuse the cached module. */
let hlsModulePromise = null;
const loadHls = () => {
  if (!hlsModulePromise) {
    hlsModulePromise = import("hls.js").then((m) => m.default);
  }
  return hlsModulePromise;
};

/* ═══ Main Player ═══════════════════════════════════════════════ */
/* Detect touch device: has touch screen + no hover = mobile/tablet */
const useIsTouch = () => {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const noHover = window.matchMedia('(hover: none)').matches;
    setIsTouch(hasTouch && noHover);
  }, []);
  return isTouch;
};

/* Upper bound for the in-memory thumbnail frame cache. Buckets are 5s of
   playback, so 600 buckets ≈ 50 minutes — plenty for scrubbing back through
   everything already watched, without letting dataURLs accumulate forever
   during long binges. */
const MAX_THUMBNAIL_BUCKETS = 600;

const CustomVideoPlayer = ({
  movie, season, episode, preferredServerIndex = 0, onServerChange,
  hasNextEpisode, onNextEpisode, onClose, thumbnailUrl, startTime = 0, onProgressUpdate,
}) => {
  /* State */
  const [activeServerIndex, setActiveServerIndex] = useState(preferredServerIndex);
  const activeServerIndexRef = useRef(activeServerIndex);
  useEffect(() => { activeServerIndexRef.current = activeServerIndex; }, [activeServerIndex]);

  const failoverToNextServer = useCallback((msg = "Stream unavailable — trying next server") => {
    setErrorMessage(msg);
    setTimeout(() => {
      setErrorMessage("");
      const ni = (activeServerIndexRef.current + 1) % VideoSourceAdapter.getServers().length;
      setActiveServerIndex(ni);
      onServerChange?.(ni);
    }, 2000);
  }, [onServerChange]);

  const [iframeUrl, setIframeUrl] = useState("");
  const [directStreamUrl, setDirectStreamUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const volumeRef = useRef(1);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);
  const [showVolumeArc, setShowVolumeArc] = useState(false);
  const [showAspectRatioArc, setShowAspectRatioArc] = useState(false);
  const [autoSkipIntro, setAutoSkipIntro] = useState(() => localStorage.getItem("streamly_autoSkip") === "true");
  const [autoPlayNext, setAutoPlayNext] = useState(() => localStorage.getItem("streamly_autoNext") !== "false");
  const [doubleTapRipple, setDoubleTapRipple] = useState(null);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [centerIcon, setCenterIcon] = useState(null);
  const [sideIcon, setSideIcon] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSubtitlesMenu, setShowSubtitlesMenu] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [aspectRatioIndex, setAspectRatioIndex] = useState(0);
  const [toastMessage, setToastMessage] = useState("");
  const [useNativeControls, setUseNativeControls] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverX, setHoverX] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [skipIntroTime, setSkipIntroTime] = useState(null);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const [upNextCountdown, setUpNextCountdown] = useState(15);
  const [, setServerErrorCounts] = useState({});
  const [, setLastServer] = useState(() => localStorage.getItem("streamly_lastserver") || "");
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0 });
  const [isLooping, setIsLooping] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [qualities, setQualities] = useState([]);
  const [currentQuality, setCurrentQuality] = useState(null);
  const [audioTracks, setAudioTracks] = useState([]);
  const [currentAudioTrack, setCurrentAudioTrack] = useState(null);
  const [directStreamProvider, setDirectStreamProvider] = useState(null);
  // Languages advertised by the NetMirror master (shown even before hls.js loads its audio tracks)
  const [streamAudioLanguages, setStreamAudioLanguages] = useState([]);
  const [showPausedInfo, setShowPausedInfo] = useState(false);
  const pausedInfoTimerRef = useRef(null);

  /* Touch gesture state — VLC/MX Player style */
  const [gestureType, setGestureType] = useState(null); // 'brightness' | 'volume' | 'seek'
  const [gestureValue, setGestureValue] = useState(0);
  const [seekDelta, setSeekDelta] = useState(0);
  const gestureStartRef = useRef(null);
  const gestureLockRef = useRef(null); // Lock direction after first significant move
  const gestureHudTimerRef = useRef(null);
  const pinchStartDistRef = useRef(null);
  const pinchStartFullscreenRef = useRef(false);
  const orientationRef = useRef('portrait');

  /* Track orientation */
  useEffect(() => {
    const check = () => {
      orientationRef.current = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  /* Refs */
  const iframeRef = useRef(null);
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const clickTimeoutRef = useRef(null);
  const progressBarRef = useRef(null);
  const progressTrackRef = useRef(null); // the actual bar (inside the padded hit area)
  const targetSeekTimeRef = useRef(null);
  const seekAccumulatorRef = useRef(0);
  const seekTimeoutRef = useRef(null);
  const centerIconTimeoutRef = useRef(null);
  const sideIconTimeoutRef = useRef(null);
  const hasTriggeredNextRef = useRef(false);
  const skipIntroTimeoutRef = useRef(null);
  const upNextIntervalRef = useRef(null);
  const upNextShownRef = useRef(false);
  const lastProgressWriteRef = useRef(0);
  const lastTouchEndRef = useRef(0);
  const centerIconKeyRef = useRef(0);
  const subtitleInputRef = useRef(null);
  const toastTimeoutRef = useRef(null);
  const volumeArcTimerRef = useRef(null);
  const aspectRatioArcTimerRef = useRef(null);
  const volumeBarRef = useRef(null);
  const isDraggingVolumeRef = useRef(false);
  const isLoopingRef = useRef(isLooping);
  useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);

  /* HLS.js instance ref (for Direct server audio/quality switching) */
  const hlsRef = useRef(null);
  const qualitiesMapRef = useRef([]);
  /* Thumbnail preview cache (time -> dataURL) */
  const thumbnailCacheRef = useRef(new Map());
  /* 5s thumbnail capture interval handle (held on a ref so a bundler's
     minifier can't drop the binding while the effect cleanup needs it) */
  const thumbnailIntervalRef = useRef(null);
  /* Netflix-style sprite previews from the CDN's thumbnail VTT */
  const vttTileRef = useRef([]);
  const vttSpriteMetaRef = useRef(new Map());
  const previewThumbTimerRef = useRef(null);
  const seekLongPressRef = useRef(null);
  /* Scrape-free NetMirror preview lookups already attempted (per title) */
  const previewLookupAttemptedRef = useRef(new Set());

  const isTouch = useIsTouch();
  const isCineSrc = iframeUrl.includes("cinesrc.st");
  const isDirectStream = Boolean(directStreamUrl);
  const showCustomUI = (isCineSrc || isDirectStream) && !useNativeControls;

  /* Auto-hide paused info */
  useEffect(() => {
    if (pausedInfoTimerRef.current) clearTimeout(pausedInfoTimerRef.current);
    if (!isPlaying && !isLoading && showCustomUI && hasInitiallyLoaded && duration > 0) {
      pausedInfoTimerRef.current = setTimeout(() => setShowPausedInfo(true), 1500);
    } else {
      setShowPausedInfo(false);
    }
    return () => { if (pausedInfoTimerRef.current) clearTimeout(pausedInfoTimerRef.current); };
  }, [isPlaying, isLoading, showCustomUI, hasInitiallyLoaded, duration]);

  const autoPlayNextRef = useRef(autoPlayNext);
  useEffect(() => { autoPlayNextRef.current = autoPlayNext; }, [autoPlayNext]);
  const isLoadingRef = useRef(isLoading);
  useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);

  const subtitleEngineRef = useRef(new SubtitleEngine());
  const [activeSubtitleCue, setActiveSubtitleCue] = useState(null);
  const [hasSubtitles, setHasSubtitles] = useState(false);
  const hasSubtitlesRef = useRef(false);
  useEffect(() => { hasSubtitlesRef.current = hasSubtitles; }, [hasSubtitles]);
  const [availableSubtitleLangs, setAvailableSubtitleLangs] = useState([]);
  const [isFetchingSubtitles, setIsFetchingSubtitles] = useState(false);
  const [subtitleEnabled, setSubtitleEnabled] = useState(false);
  const [subtitleFileName, setSubtitleFileName] = useState("");

  const isTvContent = movie?.isSeries || String(movie?.id || "").startsWith("tmdb-tv-");

  useEffect(() => {
    hasTriggeredNextRef.current = false;
    upNextShownRef.current = false;
    setShowUpNext(false);
    setSkipIntroTime(null);
    setShowSkipIntro(false);
    setUpNextCountdown(15);
    setHasInitiallyLoaded(false);
  }, [movie?.id, season, episode]);

  // Reset next-episode trigger on mount (player opened) and on unmount (player closed)
  useEffect(() => {
    hasTriggeredNextRef.current = false;
    upNextShownRef.current = false;
  }, []);

  useEffect(() => { setActiveServerIndex(preferredServerIndex); }, [preferredServerIndex]);

  useEffect(() => {
    const sv = localStorage.getItem("streamly_volume");
    const sm = localStorage.getItem("streamly_muted");
    if (sv !== null) setVolume(parseFloat(sv));
    if (sm === "true") setIsMuted(true);
  }, []);

  useEffect(() => {
    const h = () => setIsFullscreen(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener("fullscreenchange", h);
    document.addEventListener("webkitfullscreenchange", h);
    return () => {
      document.removeEventListener("fullscreenchange", h);
      document.removeEventListener("webkitfullscreenchange", h);
    };
  }, []);

  const contentSignatureRef = useRef("");
  const genKeyRef = useRef("");
  const [dynamicTips, setDynamicTips] = useState(LOADING_TIPS_DESKTOP);

  useEffect(() => {
    if (!isLoading && !hasInitiallyLoaded) setHasInitiallyLoaded(true);
  }, [isLoading, hasInitiallyLoaded]);

  /* Animate loading progress bar while waiting */
  useEffect(() => {
    if (!isLoading) { setLoadProgress(0); return; }
    setLoadProgress(0.05);
    const steps = [
      { t: 800, v: 0.25 },
      { t: 2000, v: 0.55 },
      { t: 5000, v: 0.75 },
      { t: 10000, v: 0.88 },
      { t: 18000, v: 0.95 },
    ];
    const timers = steps.map(({ t, v }) => setTimeout(() => setLoadProgress(v), t));
    return () => timers.forEach(clearTimeout);
  }, [isLoading]);

  useEffect(() => {
    if (movie?.id) {
      movieService.getSimilarMovies(movie.id, movie.platform || "tmdb").then((data) => {
        if (data?.length > 0) {
          const recs = data.slice(0, 3).map((m) => ({ text: m.title || m.name, icon: Film }));
          const baseTips = isTouch ? LOADING_TIPS_TOUCH : LOADING_TIPS_DESKTOP;
          const s = [...baseTips, ...recs];
          for (let i = s.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [s[i], s[j]] = [s[j], s[i]];
          }
          setDynamicTips(s);
        }
      }).catch(() => {});
    }
  }, [movie, isTouch]);

  /* Switch tips when device type is known */
  useEffect(() => {
    const baseTips = isTouch ? LOADING_TIPS_TOUCH : LOADING_TIPS_DESKTOP;
    setDynamicTips((prev) => {
      /* Only update if we're still on the default tips (not enriched with recs) */
      const isDefault = prev.length <= 5 && prev.every(t => LOADING_TIPS_DESKTOP.includes(t) || LOADING_TIPS_TOUCH.includes(t));
      return isDefault ? baseTips : prev;
    });
  }, [isTouch]);

  useEffect(() => {
    if (!hasInitiallyLoaded) {
      const iv = setInterval(() => setCurrentTipIndex((p) => (p + 1) % dynamicTips.length), 4000);
      return () => clearInterval(iv);
    }
  }, [hasInitiallyLoaded, dynamicTips.length]);

  /* Block popup ads from CineSrc iframe — only override while player is active */
  useEffect(() => {
    if (!isCineSrc || !showCustomUI) return;
    const origOpen = window.open;
    // Only block popups that look like ads (no opener, from iframe context)
    window.open = (url, target, features) => {
      // Allow popups with explicit features (OAuth, share dialogs, etc.)
      if (features) return origOpen(url, target, features);
      // Block blank popups likely from ad scripts
      return null;
    };
    return () => { window.open = origOpen; };
  }, [isCineSrc, showCustomUI]);

  /* Cleanup ALL timers on unmount to prevent memory leaks */
  useEffect(() => {
    return () => {
      [controlsTimeoutRef, clickTimeoutRef, seekTimeoutRef,
       centerIconTimeoutRef, sideIconTimeoutRef, skipIntroTimeoutRef,
       toastTimeoutRef, volumeArcTimerRef, aspectRatioArcTimerRef,
       gestureHudTimerRef, previewThumbTimerRef].forEach(r => { if (r.current) clearTimeout(r.current); });
      if (upNextIntervalRef.current) clearInterval(upNextIntervalRef.current);
      if (seekLongPressRef.current) clearInterval(seekLongPressRef.current);
    };
  }, []);

  const startTimeRef = useRef(startTime);
  useEffect(() => { startTimeRef.current = startTime; }, [startTime]);

  /* URL Generation */
  useEffect(() => {
    let watchdogTimer;
    let cancelled = false;
    const gen = async () => {
      setIsLoading(true);
      setHasInitiallyLoaded(false);
      setDirectStreamUrl("");
      let imdbId = movie.imdbId || movie.imdb_id || movie.external_ids?.imdb_id;
      const tid = getNumericId(movie.id);
      if (!tid) { setIsLoading(false); setErrorMessage("No valid content ID."); return; }
      if (!imdbId && activeServerIndex !== 0) {
        try {
          const e = await movieService.getExternalIds(movie.id);
          if (e?.imdb_id) imdbId = e.imdb_id;
        } catch {}
      }
      const isTv = movie?.isSeries || String(movie?.id || "").startsWith("tmdb-tv-");
      // Reload guard: this effect also re-runs on identity-only changes (the
      // caller passes an inline onServerChange + a re-normalized movie object,
      // so every refetch/focus re-render bumps the deps). Only (re)load when
      // the CONTENT or the SERVER actually changed — otherwise the iframe
      // remounts mid-playback, re-fetching the stream from scratch.
      const key = `${tid}|${isTv ? `${season}e${episode}` : "m"}|s${activeServerIndex}`;
      if (genKeyRef.current === key) {
        setIsLoading(false);
        return;
      }
      genKeyRef.current = key;
      const sig = `${tid}-${isTv ? season : "m"}-${isTv ? episode : "m"}`;
      const isNew = contentSignatureRef.current !== sig;
      contentSignatureRef.current = sig;
      if (isNew) { setCurrentTime(0); setDuration(0); setBuffered(0); targetSeekTimeRef.current = null; }
      if (isNew) thumbnailCacheRef.current.clear(); // Drop frames captured for the previous title
      previewLookupAttemptedRef.current = new Set(); // allow a fresh preview lookup per title
      vttTileRef.current = [];
      vttSpriteMetaRef.current = new Map();

      /* NetMirror server — CORS-open multi-audio HLS. Resolved by title via the
         stream service (its JSON lookups carry no CORS headers), then the master
         plays directly — no proxy needed for the m3u8 or its segments. */
      if (VideoSourceAdapter.isNetMirrorServer(activeServerIndex)) {
        setIframeUrl("");
        try {
          const streamData = await VideoSourceAdapter.fetchNetMirrorStream(
            movie?.title || movie?.name,
            String(movie?.id || "").startsWith("tmdb-tv-") ? "tv" : "movie"
          );
          if (!cancelled) {
            setDirectStreamUrl(streamData.streamUrl);
            setDirectStreamProvider("netmirror");
            setStreamAudioLanguages(streamData.audioLanguages || []);
            // Pre-load the English (or first available) SRT caption track
            const subs = streamData.subtitles || [];
            if (subs.length > 0) {
              const en = subs.find(s => /^(en|eng|en-US|en-GB)$/i.test(s.label) || /english/i.test(s.label)) || subs[0];
              try {
                const subUrl = en.url || en;
                const subRes = await fetch(proxyUrl(subUrl));
                if (subRes.ok) {
                  const subText = await subRes.text();
                  const parsed = (String(subUrl).includes(".vtt") || subText.trim().startsWith("WEBVTT"))
                    ? SubtitleEngine.parseVTT(subText)
                    : SubtitleEngine.parseSRT(subText);
                  if (parsed.length > 0) {
                    subtitleEngineRef.current.setCues(parsed);
                    setHasSubtitles(true);
                    setSubtitleEnabled(true);
                    setSubtitleFileName(`Auto (${en.label || "English"})`);
                  }
                }
              } catch {}
            }
            // Load the thumbnail sprite sheet (VTT) for Netflix-style previews
            if (streamData.thumbnails?.length > 0) {
              setupThumbnailVTT(streamData.thumbnails[0]);
            } else {
              requestPreviews(`${tid}-nm`, movie?.title || movie?.name, String(movie?.id || "").startsWith("tmdb-tv-") ? "tv" : "movie");
            }
            setIsLoading(false);
          }
        } catch (extractErr) {
          if (!cancelled) {
            setStreamAudioLanguages([]);
            failoverToNextServer(
              extractErr?.streamUnavailable
                ? "NetMirror is temporarily down, switching server..."
                : "NetMirror unavailable, switching server..."
            );
          }
        }
        return;
      }

      /* Direct streaming server — fetch m3u8 via stream service */
      if (VideoSourceAdapter.isDirectServer(activeServerIndex)) {
        setIframeUrl("");
        try {
          const streamData = await VideoSourceAdapter.fetchDirectStreamUrl(
            tid, isTv ? "tv" : "movie", isTv ? season : null, isTv ? episode : null
          );
          if (!cancelled) {
            setDirectStreamUrl(streamData.streamUrl);
            setDirectStreamProvider(streamData.provider || 'direct');
            // Auto-load subtitles from Direct server if available
            if (streamData.subtitles?.length > 0) {
              try {
                let subUrl = streamData.subtitles[0];
                // If it's a search URL, fetch the subtitle list first
                if (subUrl.includes('search?id=')) {
                  const subRes = await fetch(proxyUrl(subUrl));
                  if (subRes.ok) {
                    const subs = await subRes.json();
                    if (subs?.length > 0) subUrl = subs[0].url;
                  }
                }
                const subRes = await fetch(proxyUrl(subUrl));
                if (subRes.ok) {
                  const subText = await subRes.text();
                  const parsed = subUrl.includes('.vtt') || subText.trim().startsWith("WEBVTT")
                    ? SubtitleEngine.parseVTT(subText)
                    : SubtitleEngine.parseSRT(subText);
                  if (parsed.length > 0) {
                    subtitleEngineRef.current.setCues(parsed);
                    setHasSubtitles(true);
                    setSubtitleEnabled(true);
                    setSubtitleFileName("Auto (English)");
                  }
                }
              } catch {}
            }
            // Load thumbnail sprite sheet (VTT) for Netflix-style previews
            if (streamData.thumbnails?.length > 0) {
              setupThumbnailVTT(streamData.thumbnails[0]);
            } else {
              requestPreviews(`${tid}-dir`, movie?.title || movie?.name, isTv ? "tv" : "movie");
            }
            setIsLoading(false);
          }
        } catch (extractErr) {
          if (!cancelled) {
            // Session-key-protected streams (CineSrc "thunder") can't be played as
            // a direct m3u8 — jump straight to CineSrc's native iframe (Server 1),
            // which plays them, instead of showing an error then failing over.
            if (extractErr?.requiresIframe) {
              setErrorMessage("This title streams through CineSrc's player");
              setTimeout(() => {
                if (cancelled) return;
                setErrorMessage("");
                const servers = VideoSourceAdapter.getServers();
                const cinesrcIndex = servers.findIndex((_, i) => !VideoSourceAdapter.isDirectServer(i));
                const ni = cinesrcIndex >= 0 ? cinesrcIndex : 1;
                setActiveServerIndex(ni);
                onServerChange?.(ni);
              }, 1200);
            } else {
              // Fail over to the next server on extraction failure
              failoverToNextServer("Direct stream unavailable, switching server...");
            }
          }
        }
        return;
      }

      /* Iframe-based servers */
      let url = VideoSourceAdapter.getStreamUrl(activeServerIndex, tid, isTv ? season : null, isTv ? episode : null, imdbId, movie.title);
      const isCineServer = url.includes("cinesrc.st");
      if (isCineServer) {
        if (!isNew && currentTime > 0 && !targetSeekTimeRef.current) url += `&t=${Math.floor(currentTime)}&continueprompt=false`;
        else if (isNew && startTimeRef.current > 0) url += `&t=${Math.floor(startTimeRef.current)}&continueprompt=false`;
      }
      setIframeUrl(url);
      /* Iframe servers hand us no thumbnail sprite — supply one scrape-free from
         NetMirror's HTTP preview track so hover shows frames across the timeline */
      requestPreviews(`${tid}-frame-${activeServerIndex}`, movie?.title || movie?.name, isTv ? "tv" : "movie");
      const watchdogDelay = isCineServer ? 20000 : 12000;
      watchdogTimer = setTimeout(() => {
        setIsLoading((prev) => {
          if (prev) {
            setServerErrorCounts((errs) => {
              const si = activeServerIndexRef.current;
              const nc = (errs[si] || 0) + 1;
              if (nc >= 2) {
                setErrorMessage(`Server ${si + 1} timed out`);
                setTimeout(() => {
                  setErrorMessage("");
                  const ni = (si + 1) % VideoSourceAdapter.getServers().length;
                  setActiveServerIndex(ni);
                  onServerChange?.(ni);
                }, 2000);
              } else {
                setErrorMessage("Retrying...");
                setTimeout(() => setErrorMessage(""), 3000);
              }
              return { ...errs, [si]: nc };
            });
            return false;
          }
          return prev;
        });
      }, watchdogDelay);
    };
    gen();
    return () => { cancelled = true; if (watchdogTimer) clearTimeout(watchdogTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentTime/onServerChange/setupThumbnailVTT are read but must NOT drive reloads: currentTime changes every timeupdate and would re-init the whole stream, and adding the others would churn the session on every parent render.
  }, [activeServerIndex, movie, season, episode, useNativeControls, failoverToNextServer]);

  const sendCommand = useCallback((c, a = []) => {
    try {
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: "cinesrc:command", command: c, args: a }, "https://cinesrc.st");
      }
    } catch { /* iframe cross-origin */ }
  }, []);

  /* Load the CDN's thumbnail sprite VTT and pre-warm sprite sheet metadata.
     Gives Netflix-style previews across the ENTIRE timeline, not just the
     parts already played (the on-the-fly frame captures can't reach ahead).
     Also handles a plain-image storyboard track (no sprite VTT) as one
     full-range tile so at least a still shows on hover. */
  const setupThumbnailVTT = useCallback(async (vttUrl) => {
    try {
      const fullUrl = /^https?:/.test(vttUrl) ? vttUrl : `https:${vttUrl}`;
      // A bare image URL (no VTT) → single tile spanning the whole timeline
      if (/\.(jpe?g|png|webp|avif|gif)(\?|#|$)/i.test(fullUrl)) {
        vttTileRef.current = [{ start: 0, end: Infinity, url: fullUrl, x: 0, y: 0, w: 0, h: 0, full: true }];
        return;
      }
      const res = await fetch(proxyUrl(fullUrl), { priority: 'low' });
      if (!res.ok) return;
      const text = await res.text();
      const tiles = parseThumbnailVTT(text);
      if (tiles.length === 0) return;
      vttTileRef.current = tiles;
      // Proactively cache sprite sheet dimensions so hover tiles render instantly
      const spriteURLs = [...new Set(tiles.map(t => t.url))];
      spriteURLs.forEach((rawUrl) => {
        const img = new Image();
        img.onload = () => vttSpriteMetaRef.current.set(rawUrl, { w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => {};
        img.src = proxyUrl(rawUrl);
      });
    } catch { /* thumbnail VTT optional */ }
  }, []);

  /* Scrape-free hover preview supply: when the active source didn't provide a
     thumbnail sprite (iframe servers never do), fetch NetMirror's preview track
     over plain HTTP — no Playwright, no scraping. Runs once per title, in the
     background, and fails silently if NetMirror has no entry or is unreachable. */
  const ensureNetmirrorPreview = useCallback(async (title, type) => {
    try {
      const { thumbnails } = await VideoSourceAdapter.fetchNetMirrorThumbnails(title, type);
      if (thumbnails.length > 0 && vttTileRef.current.length === 0) {
        setupThumbnailVTT(thumbnails[0]);
      }
    } catch { /* optional — previews degrade to the timer pill */ }
  }, [setupThumbnailVTT]);

  /* Background preview lookup for a title key — fires once, never blocks init */
  const requestPreviews = useCallback((titleKey, title, type) => {
    if (previewLookupAttemptedRef.current.has(titleKey)) return;
    previewLookupAttemptedRef.current.add(titleKey);
    ensureNetmirrorPreview(title, type);
  }, [ensureNetmirrorPreview]);

  /* HLS.js — direct stream playback. hls.js itself is lazy-loaded above;
     Safari/iOS (native HLS) and unmounts during the load are handled so we
     never fetch the module unless a desktop Direct stream is really playing. */
  useEffect(() => {
    if (!directStreamUrl || !videoRef.current) return;

    const video = videoRef.current;
    let hls = null;
    let cancelled = false;
    let cleanup = null;

    const attachPlayer = (Hls) => {
      setDuration(0);
      setCurrentTime(0);
      setBuffered(0);

      const handleLoadedMetadata = () => {
        setHasInitiallyLoaded(true);
        setDuration(video.duration || 0);
        if (startTimeRef.current > 0 && !targetSeekTimeRef.current) {
          video.currentTime = Math.min(startTimeRef.current, video.duration - 1);
        }
      };
      video.addEventListener('loadedmetadata', handleLoadedMetadata);

      const handleTimeUpdate = () => {
        const t = video.currentTime;
        const target = targetSeekTimeRef.current;
        if (target != null) {
          // A programmatic seek is pending (bar click / keyboard / buttons).
          // While the stream buffers toward the target the element can still
          // report stale pre-seek positions — ignore frames far from the
          // requested spot so the bar/loader never jump past where the user
          // clicked. Accept + clear the marker once playback reaches it.
          if (Math.abs(t - target) > 1.2) {
            setDuration(video.duration || 0);
            return;
          }
          targetSeekTimeRef.current = null; // reached the target
        }
        setCurrentTime(t);
        setDuration(video.duration || 0);
        if (hasSubtitlesRef.current) {
          const cue = subtitleEngineRef.current.getActiveCue(t);
          setActiveSubtitleCue((p) => p?.start === cue?.start && p?.end === cue?.end ? p : cue);
        }
        // Debounce progress writes to Firestore — max once per 10 seconds
        const now = Date.now();
        if (now - lastProgressWriteRef.current > 10000) {
          lastProgressWriteRef.current = now;
          onProgressUpdate?.(t, video.duration);
        }
      };
      video.addEventListener('timeupdate', handleTimeUpdate);

      const handleProgress = () => {
        if (video.buffered.length > 0) {
          setBuffered(video.buffered.end(video.buffered.length - 1));
        }
      };
      video.addEventListener('progress', handleProgress);

      const handlePlay = () => setIsPlaying(true);
      const handlePause = () => setIsPlaying(false);
      const handleWaiting = () => setIsLoading(true);
      const handlePlaying = () => {
        setIsLoading(false);
        // Playback really resumed — drop any leftover seek marker and realign
        // the UI to the element's actual position so it can't lag the stream.
        if (targetSeekTimeRef.current != null) {
          targetSeekTimeRef.current = null;
          setCurrentTime(video.currentTime);
        }
      };
      const handleCanPlay = () => setIsLoading(false);
      const handleSeeking = () => { /* loading is surfaced via 'waiting' */ };
      const handleSeeked = () => {
        targetSeekTimeRef.current = null;
        setIsLoading(false);
      };
      const handleEnded = () => {
        setIsPlaying(false);
        startUpNextCountdown();
      };
      const handleError = () => setErrorMessage("Playback error");

      video.addEventListener('play', handlePlay);
      video.addEventListener('pause', handlePause);
      video.addEventListener('waiting', handleWaiting);
      video.addEventListener('playing', handlePlaying);
      video.addEventListener('canplay', handleCanPlay);
      video.addEventListener('seeking', handleSeeking);
      video.addEventListener('seeked', handleSeeked);
      video.addEventListener('ended', handleEnded);
      video.addEventListener('error', handleError);

      if (Hls && Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, startPosition: startTimeRef.current || -1 });
        hlsRef.current = hls;
        hls.loadSource(directStreamUrl);
        hls.attachMedia(video);

        /* Audio tracks */
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, (_, { audioTracks: tracks }) => {
          const mapped = tracks.map((t, i) => ({ id: t.id ?? i, name: t.name || t.lang || `Track ${i + 1}`, language: t.lang || '' }));
          setAudioTracks(mapped);
        });
        hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, (_, { id }) => {
          setCurrentAudioTrack({ id, name: `Track ${id + 1}` });
        });

        /* Quality levels */
        hls.on(Hls.Events.LEVELS_UPDATED, (_, { levels }) => {
          const mapped = levels.map((l, i) => ({ id: i, name: l.height ? `${l.height}p` : `Level ${i}`, height: l.height || 0, bitrate: l.bitrate || 0 }));
          setQualities(mapped);
          qualitiesMapRef.current = mapped;
        });
        hls.on(Hls.Events.LEVEL_SWITCHED, (_, { level }) => {
          const q = level === -1
            ? { id: -1, name: 'Auto' }
            : (qualitiesMapRef.current[level] || { id: level, name: undefined });
          setCurrentQuality(q);
          // Watchdog: after a level switch, ensure video buffers actually advance.
          // On slow fMP4 CDNs a forced switch can leave video frozen while audio
          // keeps playing — recover by nudging the fragment loader.
          if (level !== -1) {
            const h = hlsRef.current;
            const start = Date.now();
            const lastPos = video.currentTime || 0;
            const stallTimer = setInterval(() => {
              if (!h) { clearInterval(stallTimer); return; }
              const advanced = (video.currentTime || 0) - lastPos;
              const bufferedOk = video.buffered.length > 0 && video.buffered.end(video.buffered.length - 1) > lastPos;
              if (advanced > 1.5 || bufferedOk) {
                clearInterval(stallTimer);
                return;
              }
              if (Date.now() - start > 5000) {
                clearInterval(stallTimer);
                if (!video.paused && video.readyState < 3) {
                  h.startLoad(video.currentTime || 0);
                }
              }
            }, 1200);
          }
        });

        /* Thumbnail capture — draw video frame every 5s for preview.
           These only cover the already-watched timeline; the CDN thumbnail
           VTT (when present) provides full Netflix-style coverage. */
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = 160; thumbCanvas.height = 90;
        const thumbCtx = thumbCanvas.getContext('2d');
        thumbnailIntervalRef.current = setInterval(() => {
          if (video.paused || video.ended || !video.videoWidth) return;
          try {
            thumbCtx.drawImage(video, 0, 0, 160, 90);
            const bucket = Math.floor(video.currentTime / 5) * 5;
            // Cap the in-memory frame cache (dataURLs). Once past the limit,
            // drop the OLDEST bucket (Map preserves insertion order, and buckets
            // are inserted chronologically while playing forward).
            if (thumbnailCacheRef.current.size >= MAX_THUMBNAIL_BUCKETS) {
              const oldest = thumbnailCacheRef.current.keys().next().value;
              if (oldest !== undefined) thumbnailCacheRef.current.delete(oldest);
            }
            thumbnailCacheRef.current.set(bucket, thumbCanvas.toDataURL('image/jpeg', 0.5));
          } catch {}
        }, 5000);

        hls.on(Hls.Events.MANIFEST_PARSED, (_, { levels: lvls }) => {
          setHasInitiallyLoaded(true);
          setIsLoading(false);
          video.play().catch(() => {});
          /* Set auto-quality as default */
          if (lvls?.length > 1) {
            const mapped = lvls.map((l, i) => ({ id: i, name: l.height ? `${l.height}p` : `Level ${i}`, height: l.height || 0, bitrate: l.bitrate || 0 }));
            setQualities(mapped);
            qualitiesMapRef.current = mapped;
          }
        });
        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                // Lisbon provider streams need a CineSrc session + lack CORS,
                // so they can't play directly — fail over to an iframe server.
                if (data.response?.code === 404) {
                  setIsLoading(false);
                  failoverToNextServer("Direct stream unavailable, switching server...");
                } else {
                  // Preserve playback position so a transient hiccup doesn't reset to 0
                  const pos = video.currentTime || 0;
                  setTimeout(() => hls?.startLoad(pos), 3000);
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                hls?.recoverMediaError();
                // Re-arm any lost buffer position after recovery so the
                // "video stuck, audio playing" state doesn't persist
                setTimeout(() => {
                  if (video.currentTime > 0 && video.readyState < 3) {
                    hls?.startLoad(video.currentTime);
                  }
                }, 800);
                break;
              default:
                setIsLoading(false);
                failoverToNextServer("Direct stream unavailable, switching server...");
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = directStreamUrl;
        setHasInitiallyLoaded(true);
      }

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
        video.removeEventListener('timeupdate', handleTimeUpdate);
        video.removeEventListener('progress', handleProgress);
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('waiting', handleWaiting);
        video.removeEventListener('playing', handlePlaying);
        video.removeEventListener('canplay', handleCanPlay);
        video.removeEventListener('seeking', handleSeeking);
        video.removeEventListener('seeked', handleSeeked);
        video.removeEventListener('ended', handleEnded);
        video.removeEventListener('error', handleError);
        if (thumbnailIntervalRef.current) clearInterval(thumbnailIntervalRef.current);
        thumbnailIntervalRef.current = null;
        hlsRef.current = null;
        if (hls) { hls.destroy(); hls = null; }
      };
    };

    const supportsNativeHls =
      typeof video.canPlayType === "function" &&
      video.canPlayType("application/vnd.apple.mpegurl");

    (async () => {
      try {
        // Native HLS (Safari/iOS): no hls.js module needed at all.
        if (supportsNativeHls) {
          if (!cancelled && videoRef.current) cleanup = attachPlayer(null);
          return;
        }
        const Hls = await loadHls();
        if (cancelled || !videoRef.current || !directStreamUrl) return; // changed while loading
        cleanup = attachPlayer(Hls);
      } catch {
        if (!cancelled) setErrorMessage("Failed to load the player engine.");
      }
    })();

    return () => {
      cancelled = true;
      if (cleanup) { cleanup(); cleanup = null; }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onProgressUpdate (inline parent prop) and startUpNextCountdown must not re-attach the HLS/video session on every parent render; the attach is intentionally keyed to stream + server only.
  }, [directStreamUrl, failoverToNextServer]);

  /* Up Next */
  const startUpNextCountdown = useCallback(() => {
    if (upNextShownRef.current || !hasNextEpisode) return;
    upNextShownRef.current = true;
    setShowUpNext(true);
    if (autoPlayNextRef.current) {
      setUpNextCountdown(15);
      let c = 15;
      upNextIntervalRef.current = setInterval(() => {
        c -= 1;
        setUpNextCountdown(c);
        if (c <= 0) {
          clearInterval(upNextIntervalRef.current);
          setShowUpNext(false);
          if (!hasTriggeredNextRef.current) {
            hasTriggeredNextRef.current = true;
            onNextEpisode?.();
          }
        }
      }, 1000);
    } else {
      setUpNextCountdown(null);
    }
  }, [hasNextEpisode, onNextEpisode]);

  const dismissUpNext = useCallback(() => {
    clearInterval(upNextIntervalRef.current);
    setShowUpNext(false);
  }, []);

  useEffect(() => () => clearInterval(upNextIntervalRef.current), []);

  /* PostMessage Listener */
  useEffect(() => {
    if (!isCineSrc) return;
    const h = (ev) => {
      try {
        if (ev.origin !== "https://cinesrc.st" || !ev.data || typeof ev.data !== "object") return;
        let t, d;
        try { ({ type: t, ...d } = ev.data); } catch { return; }
        switch (t) {
          case "cinesrc:ready":
            sendCommand("setVolume", [isMutedRef.current ? 0 : volumeRef.current]);
            sendCommand("setPlaybackRate", [playbackRate]);
            sendCommand("getCurrentTime");
            sendCommand("getDuration");
            sendCommand("getVolume");
            sendCommand("getPaused");
            sendCommand("getPlaybackRate");
            break;
          case "cinesrc:response":
            switch (d.command) {
              case "getCurrentTime": if (d.result != null && !targetSeekTimeRef.current) setCurrentTime(d.result); break;
              case "getDuration": if (d.result) setDuration(d.result); break;
              case "getVolume": if (d.result != null) setVolume(d.result); break;
              case "getPaused": if (d.result != null) setIsPlaying(!d.result); break;
              case "getPlaybackRate": if (d.result != null) setPlaybackRate(d.result); break;
              case "getAudioTracks": case "getTracks": case "getAudio": if (d.result) setAudioTracks(d.result); break;
              case "getQualities": case "getLevels": case "getResolutions": if (d.result) setQualities(d.result); break;
              case "getCurrentQuality": case "getCurrentLevel": case "getCurrentResolution": case "getQuality": if (d.result != null) setCurrentQuality(d.result); break;
              case "getCurrentAudioTrack": case "getCurrentTrack": if (d.result != null) setCurrentAudioTrack(d.result); break;
              default: break;
            }
            break;
          case "cinesrc:loadedmetadata": if (d.duration) setDuration(d.duration); break;
          case "cinesrc:waiting": setIsLoading(true); break;
          case "cinesrc:seeking": setIsLoading(true); break;
          case "cinesrc:seeked": targetSeekTimeRef.current = null; setIsLoading(false); break;
          case "cinesrc:playing": setIsLoading(false); setIsPlaying(true); setServerErrorCounts({}); break;
          case "cinesrc:progress": if (d.buffered !== undefined) setBuffered(d.buffered); break;
          case "cinesrc:timeupdate":
            if (isLoadingRef.current) setIsLoading(false);
            if (!isScrubbing && !targetSeekTimeRef.current) {
              setCurrentTime(d.currentTime);
              // Debounce progress writes to Firestore — max once per 10 seconds
              const now = Date.now();
              if (now - lastProgressWriteRef.current > 10000) {
                lastProgressWriteRef.current = now;
                onProgressUpdate?.(d.currentTime, d.duration);
              }
              if (hasSubtitlesRef.current) {
                const cue = subtitleEngineRef.current.getActiveCue(d.currentTime);
                setActiveSubtitleCue((p) => p?.start === cue?.start && p?.end === cue?.end ? p : cue);
              }
            }
            if (d.duration) setDuration(d.duration);
            if (d.buffered !== undefined) setBuffered(d.buffered);
            if (!isScrubbing) setIsLoading(false);
            if (d.duration > 0 && d.currentTime >= d.duration - 30 && hasNextEpisode && !upNextShownRef.current && !isLoopingRef.current) startUpNextCountdown();
            if (d.duration > 0 && d.currentTime >= d.duration - 1 && hasNextEpisode && onNextEpisode && !hasTriggeredNextRef.current && !isLoopingRef.current) {
              hasTriggeredNextRef.current = true;
              clearInterval(upNextIntervalRef.current);
              setShowUpNext(false);
              onNextEpisode();
            }
            break;
          case "cinesrc:ended":
            if (isLoopingRef.current) { sendCommand("seek", [0]); return; }
            if (hasNextEpisode && !hasTriggeredNextRef.current) {
              hasTriggeredNextRef.current = true;
              clearInterval(upNextIntervalRef.current);
              setShowUpNext(false);
              onNextEpisode();
            }
            break;
          case "cinesrc:nextepisode":
            if (!d.internalNavigation && onNextEpisode && !hasTriggeredNextRef.current) {
              hasTriggeredNextRef.current = true;
              onNextEpisode();
            }
            break;
          case "cinesrc:skipintro":
            if (d.time != null) {
              if (autoSkipIntro) {
                sendCommand("seek", [d.time]);
                showToast("Intro skipped");
              } else {
                setSkipIntroTime(d.time);
                setShowSkipIntro(true);
                clearTimeout(skipIntroTimeoutRef.current);
                skipIntroTimeoutRef.current = setTimeout(() => setShowSkipIntro(false), 12000);
              }
            }
            break;
          case "cinesrc:sourceused":
            if (d.sourceId) {
              setActiveSourceId(d.sourceId);
              localStorage.setItem("streamly_lastserver", d.sourceId);
              setLastServer(d.sourceId);
            }
            break;
          case "cinesrc:play": setIsLoading(false); setIsPlaying(true); setServerErrorCounts({}); break;
          case "cinesrc:pause": setIsPlaying(false); if (!isScrubbing) setIsLoading(false); break;
          case "cinesrc:ratechange": setPlaybackRate(d.playbackRate); break;
          case "cinesrc:volumechange":
            if (d.volume !== undefined) setVolume(d.volume);
            if (d.muted !== undefined) setIsMuted(d.muted);
            break;
          case "cinesrc:close":
            if (onClose) onClose();
            else window.history.back();
            break;
          case "cinesrc:error":
            setIsLoading(false);
            const errType = d.error?.type || d.error?.details || 'unknown';
            if (errType === 'networkError' || errType === 'levelLoadTimeOut') break;
            const ei = activeServerIndexRef.current;
            setServerErrorCounts((p) => {
              const nc = (p[ei] || 0) + 1;
              if (nc >= 2) {
                setErrorMessage("Stream unavailable — trying next server");
                setTimeout(() => {
                  setErrorMessage("");
                  const ni = (ei + 1) % VideoSourceAdapter.getServers().length;
                  setActiveServerIndex(ni);
                  onServerChange?.(ni);
                }, 2500);
              } else {
                setErrorMessage("Retrying...");
                setTimeout(() => setErrorMessage(""), 3000);
              }
              return { ...p, [ei]: nc };
            });
            break;
          default: break;
        }
      } catch { /* DataCloneError etc */ }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onServerChange/autoSkipIntro/showToast/onClose are read inside the listener but the listener is keyed to playback state; re-adding it when these parent-provided callbacks change would churn message handling on unrelated re-renders.
  }, [isCineSrc, isScrubbing, playbackRate, sendCommand, hasNextEpisode, onNextEpisode, activeServerIndex, startUpNextCountdown, onProgressUpdate]);

  /* Actions */
  const triggerCenterIcon = useCallback((type) => {
    centerIconKeyRef.current += 1;
    setCenterIcon({ type });
    if (centerIconTimeoutRef.current) clearTimeout(centerIconTimeoutRef.current);
    centerIconTimeoutRef.current = setTimeout(() => setCenterIcon(null), 700);
  }, []);

  const triggerSideIcon = useCallback((type, text) => {
    setSideIcon({ type, text });
    if (sideIconTimeoutRef.current) clearTimeout(sideIconTimeoutRef.current);
    sideIconTimeoutRef.current = setTimeout(() => setSideIcon(null), 700);
  }, []);

  const togglePlay = useCallback((e) => {
    if (e) e.stopPropagation();
    if (isDirectStream) {
      const v = videoRef.current;
      if (!v) return;
      if (v.paused) {
        v.play().catch(() => {});
        setIsPlaying(true);
        if (showCustomUI) triggerCenterIcon("play");
        setShowPausedInfo(false);
      } else {
        v.pause();
        setIsPlaying(false);
        if (showCustomUI) triggerCenterIcon("pause");
      }
      return;
    }
    if (isPlaying) {
      sendCommand("pause");
      setIsPlaying(false);
      if (showCustomUI) triggerCenterIcon("pause");
    } else {
      sendCommand("play");
      setIsPlaying(true);
      if (showCustomUI) triggerCenterIcon("play");
      setShowPausedInfo(false);
    }
  }, [isPlaying, isDirectStream, sendCommand, triggerCenterIcon, showCustomUI]);

  const changeVolume = useCallback((nv) => {
    const v = Math.max(0, Math.min(nv, 1));
    setVolume(v);
    localStorage.setItem("streamly_volume", v.toString());
    if (isDirectStream && videoRef.current) {
      videoRef.current.volume = v;
      if (v > 0) videoRef.current.muted = false;
    } else {
      sendCommand("setVolume", [v]);
    }
    if (v > 0 && isMuted) {
      setIsMuted(false);
      localStorage.setItem("streamly_muted", "false");
    }
    /* Show the circular arc volume HUD */
    setShowVolumeArc(true);
    if (volumeArcTimerRef.current) clearTimeout(volumeArcTimerRef.current);
    volumeArcTimerRef.current = setTimeout(() => setShowVolumeArc(false), 1200);
  }, [isMuted, isDirectStream, sendCommand]);

  const toggleMute = useCallback((e) => {
    if (e) e.stopPropagation();
    const n = !isMuted;
    setIsMuted(n);
    localStorage.setItem("streamly_muted", n.toString());
    if (isDirectStream && videoRef.current) {
      videoRef.current.muted = n;
    } else {
      if (n) {
        sendCommand("setVolume", [0]);
      } else {
        const restoreVol = volume <= 0 ? 0.7 : volume;
        if (volume <= 0) {
          setVolume(restoreVol);
          localStorage.setItem("streamly_volume", restoreVol.toString());
        }
        sendCommand("setVolume", [restoreVol]);
      }
    }
    setShowVolumeArc(true);
    if (volumeArcTimerRef.current) clearTimeout(volumeArcTimerRef.current);
    volumeArcTimerRef.current = setTimeout(() => setShowVolumeArc(false), 1200);
  }, [isMuted, volume, isDirectStream, sendCommand]);

  const seekRelative = useCallback((s) => {
    const base = targetSeekTimeRef.current ?? currentTime;
    const nt = Math.max(0, Math.min(base + s, duration || Infinity));
    targetSeekTimeRef.current = nt;
    setCurrentTime(nt);
    if (isDirectStream && videoRef.current) {
      videoRef.current.currentTime = nt;
    } else {
      sendCommand("seek", [nt]);
    }
    seekAccumulatorRef.current += s;
    const a = seekAccumulatorRef.current;
    if (a > 0) triggerSideIcon("forward", `+${a}s`);
    else if (a < 0) triggerSideIcon("backward", `${a}s`);
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => { seekAccumulatorRef.current = 0; }, 1000);
  }, [currentTime, duration, isDirectStream, sendCommand, triggerSideIcon]);

  const showToast = useCallback((msg) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
  }, []);

  const handleSubtitleUpload = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setSubtitleFileName(f.name);
    const r = new FileReader();
    r.onload = (ev) => {
      const t = ev.target.result;
      let p = [];
      if (f.name.endsWith(".srt")) p = SubtitleEngine.parseSRT(t);
      else if (f.name.endsWith(".vtt")) p = SubtitleEngine.parseVTT(t);
      if (p.length > 0) {
        subtitleEngineRef.current.setCues(p);
        setHasSubtitles(true);
        setSubtitleEnabled(true);
        showToast("Subtitles loaded");
      } else showToast("Parse failed");
    };
    r.readAsText(f);
    e.target.value = null;
  };

  const fetchAvailableSubtitles = useCallback(async (silent = false) => {
    const imdbId = movie.imdbId || movie.imdb_id || movie.external_ids?.imdb_id;
    const fq = movie.title ? `${movie.title} ${movie.releaseYear || ""}`.trim() : "";
    if (!imdbId && !fq) return;
    setIsFetchingSubtitles(true);
    if (!silent) showToast("Searching subtitles...");
    try {
      const { SubtitleFetcher } = await import("../api/subtitleFetcher");
      const langs = await SubtitleFetcher.searchAvailableSubtitles(imdbId, fq);
      if (langs.length) {
        setAvailableSubtitleLangs(langs);
        if (!silent) showToast(`Found ${langs.length} languages`);
      } else if (!silent) showToast("No subtitles found");
    } catch {
      if (!silent) showToast("Search failed");
    } finally { setIsFetchingSubtitles(false); }
  }, [movie.imdbId, movie.imdb_id, movie.external_ids, movie.title, movie.releaseYear, showToast]);

  useEffect(() => { fetchAvailableSubtitles(true); }, [fetchAvailableSubtitles, season, episode]);

  const handleSubtitleLanguageSelect = async (link) => {
    if (!link) return;
    const lo = availableSubtitleLangs.find((l) => l.downloadLink === link);
    if (!lo) return;
    showToast(`Downloading ${lo.language}...`);
    setIsFetchingSubtitles(true);
    try {
      const { SubtitleFetcher } = await import("../api/subtitleFetcher");
      const txt = await SubtitleFetcher.downloadAndDecompress(link);
      if (txt) {
        const p = SubtitleEngine.parseSRT(txt);
        if (p.length) {
          subtitleEngineRef.current.setCues(p);
          setHasSubtitles(true);
          setSubtitleEnabled(true);
          setSubtitleFileName(`Auto (${lo.language})`);
          showToast(`${lo.language} loaded!`);
        } else showToast("Empty file");
      } else showToast("Download failed");
    } catch { showToast("Error"); }
    finally { setIsFetchingSubtitles(false); }
  };

  const toggleFullscreen = useCallback((e) => {
    if (e) e.stopPropagation();
    const el = containerRef.current;
    if (!isFullscreen) {
      /* Try native fullscreen API */
      const r = el?.requestFullscreen?.() || el?.webkitRequestFullscreen?.();
      /* If promise exists (modern browsers), handle orientation on resolve */
      if (r && typeof r.then === 'function') {
        r.then(() => {
          /* Rotate to landscape on mobile after entering fullscreen */
          if (isTouch && screen.orientation?.lock) {
            screen.orientation.lock('landscape').catch(() => {});
          }
        }).catch(() => {
          /* Fullscreen failed — try Orientation API fallback for iOS */
          if (isTouch && screen.orientation?.lock) {
            screen.orientation.lock('landscape').catch(() => {});
          }
        });
      } else if (isTouch && screen.orientation?.lock) {
        screen.orientation.lock('landscape').catch(() => {});
      }
    } else {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      if (screen.orientation?.unlock) screen.orientation.unlock();
    }
  }, [isFullscreen, isTouch]);

  const fmt = (t) => {
    if (!t || isNaN(t)) return "0:00";
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    return h > 0
      ? `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`
      : `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  /* Progress Bar */
  const handleProgressScrub = useCallback((e) => {
    // Measure against the actual TRACK — the outer element has horizontal
    // padding, so this makes the seek land exactly where the pointer is.
    const el = progressTrackRef.current || progressBarRef.current;
    if (!el || !duration) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - r.left, r.width));
    const nt = (x / r.width) * duration;
    setCurrentTime(nt);
    targetSeekTimeRef.current = nt;
    if (isDirectStream && videoRef.current) {
      videoRef.current.currentTime = nt;
    } else {
      sendCommand("seek", [nt]);
    }
  }, [duration, isDirectStream, sendCommand]);

  const handleProgressHover = useCallback((e) => {
    const outer = progressBarRef.current;
    const trackEl = progressTrackRef.current;
    if (!outer || !trackEl || !duration) return;
    // Time is derived from the real track; the tooltip is positioned at the
    // pointer inside the padded hit area (clamped so it never leaves the screen).
    const r = trackEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - r.left, r.width));
    setHoverTime((x / r.width) * duration);
    const outerR = outer.getBoundingClientRect();
    const tooltipX = Math.max(outerR.left + 90, Math.min(e.clientX, outerR.right - 90));
    setHoverX(tooltipX - outerR.left);
  }, [duration]);

  const onProgressMouseDown = (e) => {
    e.stopPropagation();
    setIsScrubbing(true);
    handleProgressScrub(e);
  };

  useEffect(() => {
    if (!isScrubbing) return;
    const mm = (e) => handleProgressScrub(e);
    const mu = () => setIsScrubbing(false);
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
    };
  }, [isScrubbing, handleProgressScrub]);

  /* Keyboard */
  useEffect(() => {
    if (!isCineSrc && !isDirectStream) return;
    const h = (e) => {
      if (document.activeElement?.tagName === "input" || e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "f": e.preventDefault(); toggleFullscreen(); break;
        case "m": e.preventDefault(); toggleMute(); break;
        case "arrowright": case "l": case ">": case ".": e.preventDefault(); seekRelative(10); break;
        case "arrowleft": case "j": case "<": case ",": e.preventDefault(); seekRelative(-10); break;
        case "arrowup": e.preventDefault(); changeVolume(volumeRef.current + 0.1); break;
        case "arrowdown": e.preventDefault(); changeVolume(volumeRef.current - 0.1); break;
        case "a": e.preventDefault(); setAspectRatioIndex((p) => (p + 1) % ASPECT_RATIOS.length); setShowAspectRatioArc(true); if (aspectRatioArcTimerRef.current) clearTimeout(aspectRatioArcTimerRef.current); aspectRatioArcTimerRef.current = setTimeout(() => setShowAspectRatioArc(false), 1200); break;
        case "?": e.preventDefault(); setShowShortcuts((p) => !p); break;
        case "escape": setShowShortcuts(false); setShowSettings(false); setShowSubtitlesMenu(false); setShowAudioMenu(false); break;
        default: break;
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isCineSrc, isDirectStream, togglePlay, toggleFullscreen, toggleMute, seekRelative, changeVolume]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !showCustomUI) return;
    const h = (e) => {
      if (showSettings || showSubtitlesMenu || showAudioMenu || showShortcuts) return;
      e.preventDefault();
      changeVolume(volumeRef.current + (e.deltaY < 0 ? 0.05 : -0.05));
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [showCustomUI, changeVolume, showSettings, showSubtitlesMenu, showAudioMenu, showShortcuts]);

  /* ═══ Touch Gestures — VLC/MX Player Style ═══════════════════════════════
     LEFT 30%:   swipe ↑↓ = brightness
     CENTER 40%: swipe ←→ = seek, double-tap = play/pause
     RIGHT 30%:  swipe ↑↓ = volume
     ══════════════════════════════════════════════════════════════════════ */
  const handleTouchStart = useCallback((e) => {
    if (!isTouch || !showCustomUI) return;
    /* Pinch detection: two fingers */
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartFullscreenRef.current = isFullscreen;
      gestureStartRef.current = null;
      return;
    }
    /* Single finger: record start position */
    const touch = e.touches[0];
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return;
    const relX = (touch.clientX - r.left) / r.width;
    gestureStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
      relX,
      zone: relX < 0.3 ? 'left' : relX > 0.7 ? 'right' : 'center',
    };
    gestureLockRef.current = null;
  }, [isTouch, showCustomUI, isFullscreen]);

  const handleTouchMove = useCallback((e) => {
    if (!isTouch || !showCustomUI) return;
    /* Pinch to fullscreen */
    if (e.touches.length === 2 && pinchStartDistRef.current) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchStartDistRef.current;
      if (ratio > 1.15 && !pinchStartFullscreenRef.current) {
        toggleFullscreen();
        pinchStartDistRef.current = null;
      }
      if (ratio < 0.85 && pinchStartFullscreenRef.current) {
        toggleFullscreen();
        pinchStartDistRef.current = null;
      }
      return;
    }
    if (!gestureStartRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - gestureStartRef.current.x;
    const dy = gestureStartRef.current.y - touch.clientY; /* positive = up */
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return;
    /* Lock gesture direction after 15px of movement */
    if (!gestureLockRef.current && (absDx > 15 || absDy > 15)) {
      if (absDx > absDy) {
        gestureLockRef.current = 'horizontal'; /* seek */
      } else {
        gestureLockRef.current = 'vertical'; /* brightness or volume */
      }
    }
    if (!gestureLockRef.current) return;
    e.preventDefault(); /* Prevent scrolling */
    if (gestureLockRef.current === 'vertical') {
      const zone = gestureStartRef.current.zone;
      const sensitivity = r.height * 0.35;
      const pct = Math.max(-1, Math.min(1, dy / sensitivity));
      if (zone === 'right') {
        /* Volume */
        const newVol = Math.max(0, Math.min(1, volume + pct * 0.5));
        setVolume(newVol);
        localStorage.setItem('streamly_volume', newVol.toString());
        sendCommand('setVolume', [newVol]);
        if (newVol > 0 && isMuted) {
          setIsMuted(false);
          localStorage.setItem('streamly_muted', 'false');
        }
        setGestureType('volume');
        setGestureValue(newVol);
      } else if (zone === 'left') {
        /* Brightness */
        const newBright = Math.max(0.2, Math.min(1.5, brightness + pct * 0.3));
        setBrightness(newBright);
        setGestureType('brightness');
        setGestureValue(newBright / 1.5);
      }
    } else if (gestureLockRef.current === 'horizontal') {
      /* Seek — swipe right = forward, left = backward */
      const seekSensitivity = r.width * 0.3;
      const seekAmount = (dx / seekSensitivity) * 30; /* 30s per 30% screen width */
      setGestureType('seek');
      setSeekDelta(seekAmount);
    }
    if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
    gestureHudTimerRef.current = setTimeout(() => {
      setGestureType(null);
      setSeekDelta(0);
    }, 800);
  }, [isTouch, showCustomUI, volume, isMuted, brightness, sendCommand, toggleFullscreen]);

  const handleTouchEnd = useCallback((e) => {
    if (gestureLockRef.current === 'horizontal' && gestureStartRef.current) {
      /* Apply seek on release */
      const touch = e.changedTouches[0];
      const dx = touch.clientX - gestureStartRef.current.x;
      const r = containerRef.current?.getBoundingClientRect();
      if (r) {
        const seekSensitivity = r.width * 0.3;
        const seekAmount = (dx / seekSensitivity) * 30;
        if (Math.abs(seekAmount) > 2) seekRelative(Math.round(seekAmount));
      }
    }
    gestureStartRef.current = null;
    gestureLockRef.current = null;
    pinchStartDistRef.current = null;
    if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
    gestureHudTimerRef.current = setTimeout(() => {
      setGestureType(null);
      setSeekDelta(0);
    }, 600);
  }, [seekRelative]);

  /* Auto-hide controls — longer on touch (5s), always show when paused */
  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying && !showSettings && !showSubtitlesMenu && !showAudioMenu && !isLoading && !isScrubbing) {
      const hideDelay = isTouch ? 5000 : 3000;
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), hideDelay);
    }
  }, [isPlaying, showSettings, showSubtitlesMenu, showAudioMenu, isLoading, isScrubbing, isTouch]);

  /* Touch double-tap to seek — uses touchend with preventDefault to block browser zoom */
  const lastTapRef = useRef(0);
  const handleTouchOverlay = useCallback((e) => {
    if (isLoading) return;
    const now = Date.now();
    lastTouchEndRef.current = now; // Prevent onClick from double-firing
    const tapGap = now - lastTapRef.current;
    lastTapRef.current = now;
    if (tapGap < 300 && tapGap > 0) {
      e.preventDefault();
      const touch = e.changedTouches[0];
      const r = containerRef.current.getBoundingClientRect();
      const pct = (touch.clientX - r.left) / r.width;
      if (pct < 0.35) {
        seekRelative(-10);
        setDoubleTapRipple({ side: "left", id: now });
        setTimeout(() => setDoubleTapRipple(null), 500);
      } else if (pct > 0.65) {
        seekRelative(10);
        setDoubleTapRipple({ side: "right", id: now });
        setTimeout(() => setDoubleTapRipple(null), 500);
      } else {
        togglePlay();
      }
    } else {
      /* Single tap: toggle controls visibility */
      setShowControls((p) => !p);
    }
  }, [isLoading, seekRelative, togglePlay]);  const pp = duration > 0 ? Math.max(0, Math.min((currentTime / duration) * 100, 100)) : 0;
  const bp = duration > 0 ? Math.max(0, Math.min((buffered / duration) * 100, 100)) : 0;
  /* On mobile portrait: controls always visible. On landscape: auto-hide */
  const isPortrait = orientationRef.current === 'portrait';
  const controlsVisible = isTouch && isPortrait ? true : (showControls || !isPlaying || isScrubbing);
  const effVolume = isMuted ? 0 : volume;

  /* ═══════════════════════════════════════════════════════════════
     RENDER — Apple TV+ inspired player
     ══════════════════════════════════════════════════════════════ */
  return (
    <div
      ref={containerRef}
      style={{
        position: isFullscreen ? 'fixed' : 'relative', width: '100%',
        aspectRatio: isFullscreen ? undefined : '16/9',
        height: isFullscreen ? '100dvh' : 'auto',
        maxHeight: isFullscreen ? '100dvh' : 'min(calc(100vh - 120px), 80vw)',
        background: '#000',
        borderRadius: isFullscreen ? 0 : 12,
        inset: isFullscreen ? '0' : undefined,
        zIndex: isFullscreen ? 9999 : undefined,
        overflow: 'hidden',
        cursor: controlsVisible || !showCustomUI ? 'default' : 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
        WebkitTouchCallout: 'none',
        /* Safe area insets — applied as margin on the iframe, not padding on container */
        '--sat': isFullscreen ? 'env(safe-area-inset-top, 0px)' : '0px',
        '--sab': isFullscreen ? 'env(safe-area-inset-bottom, 0px)' : '0px',
        '--sal': isFullscreen ? 'env(safe-area-inset-left, 0px)' : '0px',
        '--sar': isFullscreen ? 'env(safe-area-inset-right, 0px)' : '0px',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (isPlaying && !showSettings && !showSubtitlesMenu && !showAudioMenu && !isLoading && !isScrubbing)
          setShowControls(false);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onContextMenu={(e) => {
        if (!showCustomUI) return;
        e.preventDefault();
        const r = containerRef.current.getBoundingClientRect();
        setContextMenu({
          show: true,
          x: Math.min(e.clientX - r.left, r.width - 200),
          y: Math.min(e.clientY - r.top, r.height - 260),
        });
      }}
    >
      {/* DIRECT STREAM — native <video> with HLS.js */}
      {isDirectStream && directStreamUrl && (
        <video
          ref={videoRef}
          style={{
            width: '100%', height: '100%', border: 'none', background: '#000',
            objectFit: 'contain',
            pointerEvents: 'none',
            opacity: hasInitiallyLoaded ? 1 : 0,
            transition: 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: brightness !== 1 ? `brightness(${brightness})` : undefined,
            marginTop: 'var(--sat)',
            marginBottom: 'var(--sab)',
            marginLeft: 'var(--sal)',
            marginRight: 'var(--sar)',
            transform: ASPECT_RATIOS[aspectRatioIndex].scale !== 1
              ? `scale(${ASPECT_RATIOS[aspectRatioIndex].scale})` : 'none',
            transformOrigin: 'center center',
          }}
          crossOrigin="anonymous"
          playsInline
        />
      )}

      {/* IFRAME */}
      {!isDirectStream && iframeUrl && (
        <iframe
          ref={iframeRef}
          key={`iframe-${activeServerIndex}-${useNativeControls}`}
          src={iframeUrl}
          style={{
            width: '100%', height: '100%', border: 'none', background: '#000', overflow: 'visible',
            pointerEvents: isCineSrc ? 'auto' : (showCustomUI ? 'none' : 'auto'),
            opacity: hasInitiallyLoaded ? 1 : 0,
            transition: 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: brightness !== 1 ? `brightness(${brightness})` : undefined,
            /* Safe area margins on the iframe itself */
            marginTop: 'var(--sat)',
            marginBottom: 'var(--sab)',
            marginLeft: 'var(--sal)',
            marginRight: 'var(--sar)',
            /* Aspect ratio: use object-fit instead of transform to respect safe areas */
            objectFit: 'contain',
            transform: ASPECT_RATIOS[aspectRatioIndex].scale !== 1
              ? `scale(${ASPECT_RATIOS[aspectRatioIndex].scale})` : 'none',
            transformOrigin: 'center center',
          }}
          allow="autoplay; fullscreen; picture-in-picture"
          onLoad={() => {
            if (isCineSrc) {
              /* Do NOT set isLoading=false here — wait for cinesrc:playing
                 so CineSrc's own spinner stays hidden behind our overlay */
            } else {
              setIsLoading(false);
              setServerErrorCounts({}); // Reset error count on successful load
            }
          }}
        />
      )}

      {/* CineSrc interaction overlay — handles mouse (desktop) and touch (mobile) */}
      {showCustomUI && (isCineSrc || isDirectStream) && (
        <div
          onMouseMove={handleMouseMove}
          onClick={(e) => {
            e.stopPropagation();
            // Skip if a touch just handled this (prevents double-fire on mobile)
            if (Date.now() - lastTouchEndRef.current < 300) return;
            // Desktop: click to play/pause, double-click to seek/fullscreen
            if (clickTimeoutRef.current) {
              clearTimeout(clickTimeoutRef.current);
              clickTimeoutRef.current = null;
              const r = containerRef.current.getBoundingClientRect();
              const pct = (e.clientX - r.left) / r.width;
              if (pct < 0.3) {
                seekRelative(-10);
                setDoubleTapRipple({ side: "left", id: Date.now() });
                setTimeout(() => setDoubleTapRipple(null), 500);
              } else if (pct > 0.7) {
                seekRelative(10);
                setDoubleTapRipple({ side: "right", id: Date.now() });
                setTimeout(() => setDoubleTapRipple(null), 500);
              } else {
                toggleFullscreen();
              }
            } else {
              clickTimeoutRef.current = setTimeout(() => {
                clickTimeoutRef.current = null;
                togglePlay();
              }, 250);
            }
          }}
          onTouchEnd={handleTouchOverlay}
          style={{ position: "absolute", inset: 0, zIndex: 9, cursor: controlsVisible ? "default" : "none" }}
        />
      )}

      {/* Subtitles */}
      {showCustomUI && subtitleEnabled && hasSubtitles && activeSubtitleCue && (
        <div style={{
          position: "absolute", bottom: controlsVisible ? "clamp(60px, 12vw, 100px)" : "clamp(20px, 4vw, 36px)",
          left: 0, right: 0, display: "flex", justifyContent: "center",
          pointerEvents: "none", zIndex: 15,
          transition: "bottom 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}>
          <div style={{
            color: "#fff", padding: `${R.padSmall} ${R.padLarge}`,
            fontSize: "clamp(15px, 2.5vw, 26px)", lineHeight: 1.4, fontWeight: 500,
            textShadow: "0 1px 8px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.8)",
            textAlign: "center", maxWidth: "85%", whiteSpace: "pre-wrap",
            background: "rgba(0,0,0,0.5)", borderRadius: 6,
            backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
          }}>
            {activeSubtitleCue.text}
          </div>
        </div>
      )}

      {/* Bottom vignette */}
      {showCustomUI && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 11, pointerEvents: "none",
          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.4) 15%, transparent 35%)",
          transition: "opacity 0.4s", opacity: controlsVisible ? 1 : 0,
        }} />
      )}

      {/* ═══ CENTER PLAY/PAUSE ═══════════════════════════════════ */}
      <AnimatePresence>
        {showCustomUI && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: controlsVisible ? 0 : (isPlaying ? 0 : 0.8) }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute", inset: 0, zIndex: 13,
              display: "flex", alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}
          >
            <AnimatePresence mode="wait">
              {centerIcon ? (
                <motion.div
                  key={centerIcon.type + centerIconKeyRef.current}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.5 }}
                  transition={SPRING_SNAPPY}
                  style={{
                    width: "clamp(56px, 10vw, 76px)", height: "clamp(56px, 10vw, 76px)", borderRadius: "50%",
                    background: "rgba(0,0,0,0.35)", backdropFilter: "blur(24px)",
                    WebkitBackdropFilter: "blur(24px)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {/* Expanding arc ring — the Apple motif */}
                  <motion.div
                    initial={{ opacity: 0.6, scale: 0.8 }}
                    animate={{ opacity: 0, scale: 2.2 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    style={{ position: "absolute", inset: -2 }}
                  >
                    <svg width="76" height="76" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="38" cy="38" r="34" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2" strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 34 * 0.25} ${2 * Math.PI * 34 * 0.75}`} />
                    </svg>
                  </motion.div>
                  {centerIcon.type === "play"
                    ? <Play size={30} fill="#fff" color="#fff" style={{ marginLeft: 3 }} />
                    : <Pause size={30} fill="#fff" color="#fff" />}
                </motion.div>
              ) : !isPlaying && !controlsVisible ? (
                <motion.div
                  key="big-play"
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 0.6, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={SPRING}
                  style={{
                    width: "clamp(52px, 9vw, 68px)", height: "clamp(52px, 9vw, 68px)", borderRadius: "50%",
                    background: "rgba(0,0,0,0.35)", backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <Play size={26} fill="#fff" color="#fff" style={{ marginLeft: 2 }} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ PAUSED INFO OVERLAY ═════════════════════════════════ */}
      <AnimatePresence>
        {showPausedInfo && showCustomUI && !isPlaying && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute", inset: 0, zIndex: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.65)", backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              pointerEvents: "none",
            }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={{
                display: "flex", gap: "clamp(20px, 4vw, 36px)",
                alignItems: "center", maxWidth: "min(640px, 88%)", padding: `0 ${R.padLarge}`,
              }}
            >
              {(movie?.posterUrl || thumbnailUrl) && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  style={{
                    width: "clamp(80px, 14vw, 150px)", aspectRatio: "2/3",
                    borderRadius: 12, overflow: "hidden", flexShrink: 0,
                    boxShadow: "0 24px 64px rgba(0,0,0,0.85)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <img
                    src={movie?.posterUrl || thumbnailUrl}
                    alt="" loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </motion.div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)", marginBottom: 10 }}>
                  <div style={{
                    width: "clamp(22px, 4vw, 28px)", height: "clamp(22px, 4vw, 28px)", borderRadius: "50%",
                    background: "rgba(255,255,255,0.06)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}>
                    <Pause size={12} fill="rgba(255,255,255,0.8)" color="rgba(255,255,255,0.8)" />
                  </div>
                  <span style={{
                    color: "rgba(255,255,255,0.5)", fontSize: R.fontTiny, fontWeight: 700,
                    letterSpacing: "2.5px", textTransform: "uppercase",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  }}>Paused</span>
                </div>
                {movie?.logoUrl ? (
                  <img
                    src={movie.logoUrl} alt={movie?.title}
                    style={{
                      maxHeight: "clamp(40px, 8vw, 72px)", width: "auto",
                      maxWidth: "min(380px, 72vw)", objectFit: "contain",
                      filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.95))",
                      marginBottom: 8,
                    }}
                    onError={(e) => {
                      const img = e.target;
                      img.style.display = 'none';
                      if (img.nextSibling) img.nextSibling.style.display = 'block';
                    }}
                  />
                ) : null}
                <div style={{
                  color: "#fff", fontWeight: 800,
                  fontSize: "clamp(1.3rem, 3.2vw, 2.2rem)", lineHeight: 1.05,
                  marginBottom: 8, letterSpacing: "-0.03em",
                  display: movie?.logoUrl ? 'none' : 'block',
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                }}>
                  {movie?.title || movie?.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)", marginBottom: 12, flexWrap: "wrap" }}>
                  {movie?.releaseYear && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: R.fontLarge, fontWeight: 600, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>{movie.releaseYear}</span>}
                  {movie?.imdbRating > 0 && <span style={{ color: "#FBBF24", fontSize: R.fontLarge, fontWeight: 700 }}>★ {movie.imdbRating}</span>}
                  {isTvContent && season && <span style={{ color: "rgba(255,255,255,0.7)", fontSize: R.fontLarge, fontWeight: 700, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>S{season} E{episode}</span>}
                  {movie?.duration && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: R.fontLarge, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>{movie.duration}</span>}
                  {movie?.genres?.slice(0, 3).map((g, i) => (
                    <span key={i} style={{ color: "rgba(255,255,255,0.4)", fontSize: R.fontSmall, fontWeight: 600, background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 6, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>{g}</span>
                  ))}
                </div>
                {(movie?.longDescription || movie?.description || movie?.overview) && (
                  <div style={{
                    color: "rgba(255,255,255,0.55)", fontSize: "clamp(0.8rem, 1.4vw, 0.95rem)",
                    lineHeight: 1.65, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>
                    {movie?.longDescription || movie?.description || movie?.overview}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading — Apple TV+ style: blurred poster backdrop + arc spinner */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{
              position: "absolute", inset: 0, zIndex: 5,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {/* Blurred poster backdrop — Apple TV+ style */}
            {thumbnailUrl ? (
              <div style={{
                position: "absolute", inset: -40,
                backgroundImage: `url(${thumbnailUrl})`,
                backgroundSize: "cover", backgroundPosition: "center",
                filter: "blur(30px) brightness(0.25) saturate(1.2)",
                transform: "scale(1.1)",
              }} />
            ) : (
              <div style={{
                position: "absolute", inset: 0,
                background: "radial-gradient(ellipse at 50% 40%, #0a0a0f 0%, #000 70%)",
              }} />
            )}
            {/* Dark vignette overlay for text readability */}
            <div style={{
              position: "absolute", inset: 0,
              background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.65) 100%)",
            }} />
            {/* Content layer */}
            <div style={{
              position: "relative", zIndex: 1,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: "clamp(12px, 3vw, 20px)",
              padding: "0 20px",
            }}>
              <LoadingArc size={56} strokeWidth={2.5} progress={loadProgress} />
              {!hasInitiallyLoaded && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  style={{ textAlign: "center" }}
                >
                  <div style={{
                    color: "#fff", fontSize: "clamp(1rem, 2.5vw, 1.5rem)", fontWeight: 700, marginBottom: 6,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                    letterSpacing: "-0.02em",
                    textShadow: "0 2px 12px rgba(0,0,0,0.5)",
                  }}>
                    {movie?.title || movie?.name || "Loading"}
                  </div>
                  {isTvContent && season && (
                    <div style={{
                      color: "rgba(255,255,255,0.5)", fontSize: R.fontMedium, fontWeight: 600,
                      marginBottom: 8,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}>
                      Season {season} · Episode {episode}
                    </div>
                  )}
                  <motion.div
                    key={currentTipIndex}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.3 }}
                    style={{
                      color: "rgba(255,255,255,0.3)", fontSize: R.fontSmall, fontWeight: 500,
                      letterSpacing: "0.3px",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}
                  >
                    {dynamicTips[currentTipIndex]?.text}
                  </motion.div>
                  {/* Thin progress bar */}
                  <div style={{
                    marginTop: 12, width: "clamp(100px, 30vw, 180px)", height: 2,
                    background: "rgba(255,255,255,0.06)", borderRadius: 1,
                    overflow: "hidden",
                  }}>
                    <motion.div
                      animate={{ width: `${loadProgress * 100}%` }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      style={{
                        height: "100%", borderRadius: 1,
                        background: "linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.4))",
                      }}
                    />
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error pill */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{
              position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
              background: "rgba(255,69,58,0.85)", color: "#fff",
              padding: `${R.padSmall} clamp(10px, 2vw, 16px)`, borderRadius: 100,
              backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
              display: "flex", alignItems: "center", gap: "clamp(4px, 1vw, 6px)",
              zIndex: 60, fontWeight: 600, fontSize: R.fontSmall,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
            }}
          >
            <AlertCircle size={12} /> {errorMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -5, x: "-50%" }}
            style={{
              position: "absolute", top: 16, left: "50%",
              background: "rgba(28,28,30,0.78)", color: "#fff",
              padding: `${R.padSmall} clamp(10px, 2vw, 16px)`, borderRadius: 100,
              backdropFilter: "blur(40px) saturate(180%)",
              WebkitBackdropFilter: "blur(40px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.08)",
              zIndex: 62, fontWeight: 600, fontSize: R.fontSmall, pointerEvents: "none",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
            }}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ VOLUME HUD — center-top pill: state icon + segmented meter ═══ */}
      <AnimatePresence>
        {showVolumeArc && (
          <motion.div
            key="volume-hud"
            initial={{ opacity: 0, y: -18, scale: 0.94, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, y: -10, scale: 0.97, x: "-50%" }}
            transition={SPRING_SNAPPY}
            style={{
              position: "absolute", left: "50%",
              top: R.hudCenterTop,
              zIndex: 65, pointerEvents: "none",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "rgba(12,12,14,0.78)",
              backdropFilter: "blur(24px) saturate(160%)",
              WebkitBackdropFilter: "blur(24px) saturate(160%)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 999,
              padding: "8px 14px",
              boxShadow: "0 12px 44px rgba(0,0,0,0.55), inset 0 0.5px 0 rgba(255,255,255,0.08)",
            }}>
              {/* State icon — swaps between muted / low / high */}
              <motion.span
                key={isMuted || volume === 0 ? "muted" : effVolume <= 0.33 ? "low" : "high"}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={SPRING_FAST}
                style={{ display: "flex", alignItems: "center" }}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX size={17} color="#ff453a" strokeWidth={2.2} />
                ) : effVolume <= 0.33 ? (
                  <Volume1 size={17} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
                ) : (
                  <Volume2 size={17} color="#fff" strokeWidth={2.2} />
                )}
              </motion.span>

              {/* Segmented meter — reads instantly, iOS-lock-screen style */}
              <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                {Array.from({ length: 16 }).map((_, i) => {
                  const on = effVolume > 0 && i < Math.round(effVolume * 16);
                  const muted = isMuted || volume === 0;
                  return (
                    <motion.div
                      key={i}
                      animate={{
                        backgroundColor: on
                          ? muted
                            ? "rgba(255,69,58,0.95)"
                            : "rgba(255,255,255,0.95)"
                          : "rgba(255,255,255,0.14)",
                      }}
                      transition={{ duration: 0.1 }}
                      style={{ width: 4, height: 13, borderRadius: 2 }}
                    />
                  );
                })}
              </div>

              {/* Label */}
              <motion.span
                key={isMuted || volume === 0 ? "muted" : Math.round(effVolume * 100)}
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={SPRING_FAST}
                style={{
                  color: isMuted || volume === 0 ? "#ff453a" : "rgba(255,255,255,0.92)",
                  fontSize: R.fontSmall, fontWeight: 700,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.02em",
                  minWidth: 44,
                }}
              >
                {isMuted || volume === 0 ? "Muted" : `${Math.round(effVolume * 100)}%`}
              </motion.span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ ASPECT RATIO HUD — crop-frame glyph morphing + halo ring + staggered labels ═══ */}
      <AnimatePresence>
        {showAspectRatioArc && (
          <motion.div
            key="aspect-hud"
            initial={{ opacity: 0, y: -18, scale: 0.88, x: "-50%" }}
            animate={{ opacity: 1, y: 0, scale: 1, x: "-50%" }}
            exit={{ opacity: 0, y: -6, scale: 0.92, x: "-50%" }}
            transition={SPRING_SNAPPY}
            style={{
              position: "absolute", left: "50%",
              top: R.hudCenterTop,
              zIndex: 65, pointerEvents: "none",
            }}
          >
            {/* layout → the pill resizes with a spring as the label + glyph change */}
            <motion.div
              layout
              transition={{ type: "spring", stiffness: 380, damping: 34, mass: 0.9 }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                background: "rgba(12,12,14,0.78)",
                backdropFilter: "blur(24px) saturate(160%)",
                WebkitBackdropFilter: "blur(24px) saturate(160%)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 999,
                padding: "9px 16px",
                boxShadow:
                  "0 16px 48px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.04), inset 0 0.5px 0 rgba(255,255,255,0.14)",
              }}
            >
              {/* ── Glyph stage ── */}
              <div style={{
                position: "relative", width: 56, height: 56, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {/* Frosted backdrop disc */}
                <div style={{
                  position: "absolute", inset: 0, borderRadius: "50%",
                  background: "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.02) 70%)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }} />
                {/* Expanding halo ring — replays on every ratio change (Apple motif) */}
                <motion.div
                  key={aspectRatioIndex}
                  initial={{ scale: 0.7, opacity: 0.6 }}
                  animate={{ scale: 1.8, opacity: 0 }}
                  transition={{ duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    position: "absolute", width: 44, height: 44, borderRadius: "50%",
                    border: "1.5px solid rgba(255,255,255,0.35)",
                  }}
                />
                {/* The morphing crop frame — springy overshoot as it changes shape */}
                <motion.div
                  initial={false}
                  animate={{
                    width: AR_GLYPH[aspectRatioIndex][0],
                    height: AR_GLYPH[aspectRatioIndex][1],
                  }}
                  transition={{ type: "spring", stiffness: 430, damping: 24, mass: 0.9 }}
                  style={{
                    position: "relative", zIndex: 1, flexShrink: 0,
                    borderRadius: 3, overflow: "hidden",
                    border: "1.5px solid rgba(255,255,255,0.92)",
                    background:
                      "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 100%)",
                    boxShadow: "0 0 16px rgba(255,255,255,0.22), inset 0 0 12px rgba(255,255,255,0.06)",
                  }}
                >
                  {/* Light sweep across the frame — replays on every change */}
                  <motion.div
                    key={aspectRatioIndex}
                    initial={{ x: "-85%", opacity: 0 }}
                    animate={{ x: "85%", opacity: [0, 0.85, 0] }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    style={{
                      position: "absolute", top: 0, bottom: 0, width: "55%",
                      background: "linear-gradient(100deg, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
                    }}
                  />
                </motion.div>
                {/* Corner crop brackets — re-grip on every change */}
                <motion.div
                  key={aspectRatioIndex}
                  initial={{ opacity: 0, scale: 1.25 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.08, type: "spring", stiffness: 500, damping: 32 }}
                  style={{ position: "absolute", inset: 0, zIndex: 2 }}
                >
                  <div style={{ position: "absolute", top: -2, left: -2, width: 9, height: 9, borderTop: "2px solid rgba(255,255,255,0.85)", borderLeft: "2px solid rgba(255,255,255,0.85)", borderTopLeftRadius: 2 }} />
                  <div style={{ position: "absolute", top: -2, right: -2, width: 9, height: 9, borderTop: "2px solid rgba(255,255,255,0.85)", borderRight: "2px solid rgba(255,255,255,0.85)", borderTopRightRadius: 2 }} />
                  <div style={{ position: "absolute", bottom: -2, left: -2, width: 9, height: 9, borderBottom: "2px solid rgba(255,255,255,0.85)", borderLeft: "2px solid rgba(255,255,255,0.85)", borderBottomLeftRadius: 2 }} />
                  <div style={{ position: "absolute", bottom: -2, right: -2, width: 9, height: 9, borderBottom: "2px solid rgba(255,255,255,0.85)", borderRight: "2px solid rgba(255,255,255,0.85)", borderBottomRightRadius: 2 }} />
                </motion.div>
              </div>

              {/* ── Label block ── */}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {/* Name — blur-to-crisp rise, replaying on each change */}
                <motion.span
                  key={aspectRatioIndex}
                  initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={SPRING_SNAPPY}
                  style={{
                    color: "#fff", fontSize: R.fontSmall, fontWeight: 700, lineHeight: 1.2,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  {ASPECT_RATIOS[aspectRatioIndex].name}
                </motion.span>
                {/* Segmented position track — sleek dot progression */}
                <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
                  {ASPECT_RATIOS.map((_, i) => (
                    <motion.i
                      key={i}
                      animate={{
                        width: i === aspectRatioIndex ? 7 : 4,
                        height: 3.5,
                        backgroundColor: i <= aspectRatioIndex
                          ? "rgba(255,255,255,0.95)"
                          : "rgba(255,255,255,0.18)",
                      }}
                      transition={{ type: "spring", stiffness: 600, damping: 32 }}
                      style={{ display: "block", borderRadius: 2 }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ TOUCH GESTURE HUDS — VLC/MX Player Style ═══════════════════════ */}
      {/* Brightness vertical bar — left edge */}
      <AnimatePresence>
        {gestureType === 'brightness' && isTouch && (
          <motion.div
            key="brightness-bar"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={SPRING_SNAPPY}
            style={{
              position: 'absolute', left: 'clamp(12px, 3vw, 20px)',
              top: '15%', bottom: '15%', width: 36,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              zIndex: 65, pointerEvents: 'none',
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              borderRadius: 18, border: '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}>
            {/* Track */}
            <div style={{
              position: 'relative', width: 4, height: '70%',
              background: 'rgba(255,255,255,0.08)', borderRadius: 2,
            }}>
              {/* Fill */}
              <motion.div
                animate={{ height: `${gestureValue * 100}%` }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: '#FBBF24', borderRadius: 2,
                }}
              />
              {/* Thumb */}
              <motion.div
                animate={{ bottom: `${gestureValue * 100}%` }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                style={{
                  position: 'absolute', left: '50%',
                  transform: 'translate(-50%, 50%)',
                  width: 10, height: 10, borderRadius: '50%',
                  background: '#FBBF24',
                  boxShadow: '0 0 8px rgba(251,191,36,0.5)',
                }}
              />
            </div>
            {/* Sun icon at bottom */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" strokeLinecap="round" style={{ marginTop: 6 }}>
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/>
              <line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/>
              <line x1="21" y1="12" x2="23" y2="12"/>
            </svg>
            <span style={{ color: '#FBBF24', fontSize: 9, fontWeight: 700, marginTop: 2,
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round(brightness * 100)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Volume vertical bar — right edge */}
      <AnimatePresence>
        {gestureType === 'volume' && isTouch && (
          <motion.div
            key="volume-bar"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={SPRING_SNAPPY}
            style={{
              position: 'absolute', right: 'clamp(12px, 3vw, 20px)',
              top: '15%', bottom: '15%', width: 36,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              zIndex: 65, pointerEvents: 'none',
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              borderRadius: 18, border: '1px solid rgba(255,255,255,0.06)',
              overflow: 'hidden',
            }}>
            {/* Track */}
            <div style={{
              position: 'relative', width: 4, height: '70%',
              background: 'rgba(255,255,255,0.08)', borderRadius: 2,
            }}>
              <motion.div
                animate={{ height: `${gestureValue * 100}%` }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: (isMuted || volume === 0) ? '#ff453a' : '#fff',
                  borderRadius: 2,
                }}
              />
              <motion.div
                animate={{ bottom: `${gestureValue * 100}%` }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                style={{
                  position: 'absolute', left: '50%',
                  transform: 'translate(-50%, 50%)',
                  width: 10, height: 10, borderRadius: '50%',
                  background: (isMuted || volume === 0) ? '#ff453a' : '#fff',
                  boxShadow: '0 0 8px rgba(0,0,0,0.5)',
                }}
              />
            </div>
            {/* Speaker icon at bottom */}
            <motion.div
              key={isMuted || volume === 0 ? 'off' : 'on'}
              initial={{ scale: 0.5 }} animate={{ scale: 1 }}
              transition={SPRING_FAST}
              style={{ marginTop: 6 }}
            >
              {isMuted || volume === 0 ? (
                <VolumeX size={14} color="#ff453a" strokeWidth={2} />
              ) : (
                <Volume2 size={14} color="#fff" strokeWidth={2} />
              )}
            </motion.div>
            <span style={{ color: (isMuted || volume === 0) ? '#ff453a' : '#fff', fontSize: 9, fontWeight: 700, marginTop: 2,
              fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', fontVariantNumeric: 'tabular-nums' }}>
              {Math.round((isMuted ? 0 : volume) * 100)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seek indicator — center */}
      <AnimatePresence>
        {gestureType === 'seek' && isTouch && (
          <motion.div
            key="seek-indicator"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={SPRING_SNAPPY}
            style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 65, pointerEvents: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              borderRadius: 14, padding: '12px 20px',
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {seekDelta > 0 ? (
                <FastForward size={16} color="#fff" strokeWidth={2} />
              ) : (
                <Rewind size={16} color="#fff" strokeWidth={2} />
              )}
              <span style={{ color: '#fff', fontSize: 16, fontWeight: 700,
                fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
                fontVariantNumeric: 'tabular-nums' }}>
                {seekDelta > 0 ? '+' : ''}{Math.round(seekDelta)}s
              </span>
            </div>
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 600 }}>
              {fmt(Math.max(0, currentTime + seekDelta))} / {fmt(duration)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SHORTCUTS OVERLAY ═══════════════════════════════════ */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setShowShortcuts(false)}
            style={{
              position: "absolute", inset: 0, zIndex: 70,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={SPRING}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: "rgba(18,18,20,0.95)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: R.radiusMedium, padding: `${R.padLarge} clamp(16px, 3vw, 26px)`, width: R.panelShortcuts,
                color: "#fff", boxShadow: "0 40px 80px rgba(0,0,0,0.8)",
                backdropFilter: "blur(40px)", WebkitBackdropFilter: "blur(40px)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <span style={{
                  fontWeight: 700, fontSize: R.fontLarge,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                }}>Shortcuts</span>
                <button onClick={() => setShowShortcuts(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", display: "flex" }}>
                  <X size={14} />
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {KEYBOARD_SHORTCUTS.map(({ key, action }) => (
                  <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{
                      color: "rgba(255,255,255,0.5)", fontSize: R.fontMedium,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}>{action}</span>
                    <span style={{
                      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)",
                      padding: "3px 10px", borderRadius: 6,
                      fontFamily: "SF Mono, Menlo, monospace",
                      fontWeight: 700, fontSize: R.fontTiny, color: "rgba(255,255,255,0.7)",
                    }}>
                      {key}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SEEK INDICATORS — Circular arc motif ════════════════ */}
      <div style={{ position: "absolute", inset: 0, zIndex: 12, pointerEvents: "none", display: "flex", alignItems: "center" }}>
        {/* Left — rewind */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "30%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AnimatePresence>
            {sideIcon?.type === "backward" && (
              <motion.div
                key="bwd"
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.4 }}
                transition={SPRING_SNAPPY}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
              >
                <div style={{ position: "relative" }}>
                  <motion.div
                    initial={{ rotate: 0 }}
                    animate={{ rotate: [0, -360] }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <ArcRing
                      progress={0.4}
                      size={64} responsive="clamp(48px, 8vw, 68px)" strokeWidth={2.5}
                      color="rgba(255,255,255,0.8)"
                      bgColor="rgba(255,255,255,0.04)"
                      glowColor="rgba(255,255,255,0.12)"
                    >
                      <motion.div
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1, ...SPRING_SNAPPY }}
                      >
                        <Rewind size={22} color="#fff" strokeWidth={2} />
                      </motion.div>
                    </ArcRing>
                  </motion.div>
                </div>
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, ...SPRING_FAST }}
                  style={{
                    fontSize: R.fontMedium, fontWeight: 700, color: "#fff",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    textShadow: "0 1px 12px rgba(0,0,0,0.9)",
                    fontVariantNumeric: "tabular-nums",
                  }}>{sideIcon.text}</motion.span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Right — forward */}
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "30%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AnimatePresence>
            {sideIcon?.type === "forward" && (
              <motion.div
                key="fwd"
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.4 }}
                transition={SPRING_SNAPPY}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}
              >
                <div style={{ position: "relative" }}>
                  <motion.div
                    initial={{ rotate: 0 }}
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <ArcRing
                      progress={0.4}
                      size={64} responsive="clamp(48px, 8vw, 68px)" strokeWidth={2.5}
                      color="rgba(255,255,255,0.8)"
                      bgColor="rgba(255,255,255,0.04)"
                      glowColor="rgba(255,255,255,0.12)"
                    >
                      <motion.div
                        initial={{ scale: 0.4, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.1, ...SPRING_SNAPPY }}
                      >
                        <FastForward size={22} color="#fff" strokeWidth={2} />
                      </motion.div>
                    </ArcRing>
                  </motion.div>
                </div>
                <motion.span
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15, ...SPRING_FAST }}
                  style={{
                    fontSize: R.fontMedium, fontWeight: 700, color: "#fff",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    textShadow: "0 1px 12px rgba(0,0,0,0.9)",
                    fontVariantNumeric: "tabular-nums",
                  }}>{sideIcon.text}</motion.span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Double-tap ripple */}
      <div style={{ position: "absolute", inset: 0, zIndex: 11, pointerEvents: "none" }}>
        <AnimatePresence>
          {doubleTapRipple && (
            <motion.div
              key={doubleTapRipple.id}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              style={{
                position: "absolute",
                [doubleTapRipple.side]: 0,
                width: "40%", height: "100%",
                background: `radial-gradient(ellipse at ${doubleTapRipple.side} center, rgba(255,255,255,0.04) 0%, transparent 70%)`,
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ═══ BOTTOM CONTROLS ═════════════════════════════════════ */}
      <AnimatePresence>
        {showCustomUI && controlsVisible && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20, pointerEvents: "none" }}
          >
            {/* Skip Intro / Up Next */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", padding: `0 ${R.progressBarPad}`, marginBottom: 8, pointerEvents: "none" }}>
              <div style={{ pointerEvents: "auto" }}>
                <AnimatePresence>
                  {showSkipIntro && skipIntroTime != null && (
                    <motion.button
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      transition={SPRING}
                      onClick={(e) => { e.stopPropagation(); sendCommand("seek", [skipIntroTime]); setShowSkipIntro(false); }}
                      style={{
                        background: "rgba(28,28,30,0.7)", color: "#fff",
                        border: "1px solid rgba(255,255,255,0.08)",
                        padding: `${R.padMedium} ${R.padMedium}`, borderRadius: 100, cursor: "pointer",
                        fontWeight: 700, backdropFilter: "blur(24px)",
                        WebkitBackdropFilter: "blur(24px)",
                        display: "flex", alignItems: "center", gap: "clamp(4px, 1vw, 6px)", fontSize: R.fontMedium,
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                      }}
                    >
                      <FastForward size={13} fill="rgba(255,255,255,0.7)" color="rgba(255,255,255,0.7)" /> Skip Intro
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "clamp(4px, 1vw, 6px)", pointerEvents: "auto" }}>
                <AnimatePresence>
                  {showUpNext && hasNextEpisode && (
                    <motion.div
                      initial={{ opacity: 0, x: 14 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={SPRING}
                      style={{
                        background: "rgba(28,28,30,0.7)", border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 12, padding: `${R.padMedium} ${R.padSmall}`,
                        display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)",
                        backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.35)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>Up Next</div>
                        <div style={{ fontSize: R.fontMedium, color: "#fff", fontWeight: 700, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>Ep {(episode || 0) + 1}</div>
                      </div>
                      {/* Countdown arc */}
                      <ArcRing progress={upNextCountdown / 15} size={32} strokeWidth={2} color="rgba(255,255,255,0.8)" bgColor="rgba(255,255,255,0.06)">
                        <span style={{ fontSize: R.fontTiny, fontWeight: 800, color: "#fff", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>{upNextCountdown}</span>
                      </ArcRing>
                      <button onClick={(e) => { e.stopPropagation(); dismissUpNext(); }}
                        style={{
                          background: "rgba(255,255,255,0.04)", border: "none", color: "rgba(255,255,255,0.4)",
                          cursor: "pointer", width: 22, height: 22, borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        <X size={10} />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
                {hasNextEpisode && (
                  <button onClick={(e) => { e.stopPropagation(); onNextEpisode?.(); }}
                    style={{
                      background: "rgba(255,255,255,0.12)", color: "#fff", border: "1px solid rgba(255,255,255,0.08)",
                      padding: `${R.padSmall} ${R.padMedium}`, borderRadius: 100, cursor: "pointer",
                      fontWeight: 700, display: "flex", alignItems: "center", gap: "clamp(3px, 0.8vw, 5px)", fontSize: R.fontSmall,
                      backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}
                  >
                    Next <SkipForward size={12} fill="currentColor" />
                  </button>
                )}
              </div>
            </div>

            {/* ═══ PROGRESS BAR ═══════════════════════════════════ */}
            <div
              ref={progressBarRef}
              onMouseDown={onProgressMouseDown}
              onMouseMove={handleProgressHover}
              onMouseLeave={() => setHoverTime(null)}
              onTouchStart={(e) => {
                e.stopPropagation();
                setIsScrubbing(true);
                const touch = e.touches[0];
                handleProgressScrub({ clientX: touch.clientX });
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
                const touch = e.touches[0];
                handleProgressScrub({ clientX: touch.clientX });
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                setIsScrubbing(false);
              }}
              style={{
                position: "relative", height: isTouch ? 44 : 32, display: "flex",
                alignItems: "center", cursor: "pointer",
                padding: `0 ${R.progressBarPad}`, pointerEvents: "auto",
              }}
            >
              {/* Hover time tooltip with preview thumbnail */}
              <AnimatePresence>
                {hoverTime != null && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.95 }}
                    transition={SPRING_FAST}
                    style={{
                      position: "absolute", bottom: 28,
                      left: `${hoverX}px`, transform: "translateX(-50%)",
                      pointerEvents: "none",
                    }}
                  >
                    {(() => {
                      /* Resolve a preview for hoverTime:
                         1. CDN thumbnail sprite tile (full-timeline, Netflix-style)
                         2. Live-captured frame (already-watched regions)
                         3. No preview — just the time pill */
                      const tile = vttTileRef.current.find((t) => hoverTime >= t.start && hoverTime <= t.end)
                        || null;
                      const bucket = Math.floor(hoverTime / 5) * 5;
                      const thumbUrl = thumbnailCacheRef.current.get(bucket)
                        || thumbnailCacheRef.current.get(bucket - 5)
                        || thumbnailCacheRef.current.get(bucket + 5)
                        || thumbnailCacheRef.current.get(bucket - 10)
                        || thumbnailCacheRef.current.get(bucket + 10)
                        || null;
                      const TILE_W = 170;
                      const TILE_H = 96;
                      return (
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                          {tile && (
                            <div style={{
                              width: TILE_W, height: TILE_H,
                              borderRadius: R.radiusSmall, overflow: "hidden",
                              border: "2px solid rgba(255,255,255,0.15)",
                              boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
                              background: "rgba(0,0,0,0.4)", position: "relative",
                            }}>
                              {tile.full ? (
                                <img
                                  src={proxyUrl(tile.url)}
                                  alt=""
                                  draggable={false}
                                  style={{
                                    width: "100%", height: "100%",
                                    objectFit: "cover", display: "block",
                                    pointerEvents: "none", userSelect: "none",
                                  }}
                                />
                              ) : (
                                <img
                                  src={proxyUrl(tile.url)}
                                  alt=""
                                  draggable={false}
                                  style={{
                                    position: "absolute", top: 0, left: 0,
                                    display: "block",
                                    maxWidth: "none",
                                    width: "auto", height: "auto",
                                    transform: `translate(${-tile.x}px, ${-tile.y}px) scale(${TILE_W / tile.w})`,
                                    transformOrigin: "0 0",
                                    pointerEvents: "none",
                                    userSelect: "none",
                                  }}
                                />
                              )}
                            </div>
                          )}
                          {!tile && thumbUrl && (
                            <div style={{
                              width: TILE_W, height: TILE_H,
                              borderRadius: R.radiusSmall, overflow: "hidden",
                              border: "2px solid rgba(255,255,255,0.15)",
                              boxShadow: "0 6px 24px rgba(0,0,0,0.6)",
                              background: "rgba(0,0,0,0.4)",
                            }}>
                              <img src={thumbUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            </div>
                          )}
                          <div style={{
                            background: "rgba(28,28,30,0.92)",
                            backdropFilter: "blur(24px) saturate(160%)",
                            WebkitBackdropFilter: "blur(24px) saturate(160%)",
                            color: "#fff",
                            padding: `4px ${R.padSmall}`, borderRadius: R.radiusSmall,
                            fontSize: R.fontSmall, fontWeight: 700, letterSpacing: "0.5px",
                            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                            fontVariantNumeric: "tabular-nums",
                            border: "1px solid rgba(255,255,255,0.08)",
                            boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                            whiteSpace: "nowrap",
                          }}>
                            {fmt(hoverTime)}
                          </div>
                        </div>
                      );
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Track */}
              <div
                ref={progressTrackRef}
                style={{
                position: isFullscreen ? "fixed" : "relative", width: "100%",
                height: hoverTime != null || isScrubbing ? 5 : 3,
                background: "rgba(255,255,255,0.12)",
                borderRadius: 3,
                transition: "height 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
              }}>
                {/* Buffered — drawn only AHEAD of the playhead so it can never
                    extend past a scrubbed/clicked position. */}
                {duration > 0 && bp > pp && <div style={{
                  position: "absolute", inset: 0,
                  left: `${Math.min(pp, 100)}%`,
                  width: `${Math.min(bp - pp, 100 - pp)}%`,
                  background: "rgba(255,255,255,0.14)", borderRadius: 3,
                  transition: "width 0.3s ease",
                }} />}
                {duration > 0 && <div style={{
                  position: "absolute", inset: 0, width: `${Math.min(pp, 100)}%`,
                  background: "rgba(255,255,255,0.85)",
                  borderRadius: 3,
                  boxShadow: "0 0 6px rgba(255,255,255,0.15)",
                  transition: isScrubbing ? "none" : "width 0.1s linear",
                }} />}
                {/* Scrubber dot */}
                {duration > 0 && !(currentTime === 0 && !isPlaying && !isScrubbing) && (
                  <motion.div
                    animate={{
                      left: `${Math.max(0, Math.min(pp, 100))}%`,
                      width: hoverTime != null || isScrubbing ? 14 : 0,
                      height: hoverTime != null || isScrubbing ? 14 : 0,
                      opacity: hoverTime != null || isScrubbing ? 1 : 0,
                    }}
                    transition={SPRING}
                    style={{
                      position: "absolute", top: "50%",
                      transform: "translate(-50%, -50%)",
                      borderRadius: "50%",
                      background: "#fff",
                      boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
                      cursor: "grab", pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            </div>

            {/* TITLE ROW */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: `${R.padTiny} ${R.progressBarPad} 2px`, pointerEvents: "none", gap: "clamp(8px, 2vw, 12px)",
            }}>
              <span style={{
                color: "rgba(255,255,255,0.4)", fontSize: R.fontSmall, fontWeight: 600,
                fontFamily: "SF Mono, Menlo, monospace",
                fontVariantNumeric: "tabular-nums", letterSpacing: "0.3px",
                flexShrink: 0,
              }}>
                {fmt(currentTime)} / {fmt(duration)}
              </span>
              <div style={{
                display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)",
                minWidth: 0, flex: 1, justifyContent: "center",
              }}>
                <span style={{
                  color: "rgba(255,255,255,0.85)", fontSize: "clamp(13px, 1.5vw, 15px)",
                  fontWeight: 700, letterSpacing: "-0.01em",
                  textShadow: "0 1px 10px rgba(0,0,0,0.9), 0 0 24px rgba(0,0,0,0.5)",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  maxWidth: "min(320px, 44vw)",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                }}>
                  {movie?.title || movie?.name}
                </span>
                {isTvContent && season && (
                  <span style={{
                    color: "rgba(255,255,255,0.6)", fontSize: "clamp(10px, 1.2vw, 12px)",
                    fontWeight: 700, letterSpacing: "0.3px",
                    background: "rgba(255,255,255,0.06)",
                    padding: "3px 10px", borderRadius: 100,
                    border: "1px solid rgba(255,255,255,0.06)",
                    whiteSpace: "nowrap", flexShrink: 0,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  }}>
                    S{season} E{episode}
                  </span>
                )}
                {movie?.releaseYear && (
                  <span style={{
                    color: "rgba(255,255,255,0.35)", fontSize: R.fontSmall, fontWeight: 600,
                    flexShrink: 0, letterSpacing: "0.3px",
                    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                  }}>{movie.releaseYear}</span>
                )}
                {/* Direct stream provider badge (branded for NetMirror multi-audio) */}
                {isDirectStream && directStreamProvider === "netmirror" ? (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    color: "#fff", fontSize: "10px", fontWeight: 700,
                    background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
                    padding: "3px 8px", borderRadius: 100, flexShrink: 0, letterSpacing: "0.5px",
                    border: "1px solid rgba(255,255,255,0.14)",
                    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                    textTransform: "uppercase",
                  }}>
                    {(() => {
                      const src = movie?.source || (movie?.availablePlatforms && movie.availablePlatforms[0]);
                      const icon = src ? PlatformAdapter.getIconUrl(src) : "";
                      return icon ? (
                        <img
                          src={icon}
                          alt=""
                          style={{ height: 13, width: 13, objectFit: "contain", borderRadius: 2, flexShrink: 0 }}
                        />
                      ) : null;
                    })()}
                    <span>{streamAudioLanguages.length > 0 ? `${streamAudioLanguages.length}-Audio` : "NetMirror"}</span>
                    {streamAudioLanguages.length > 0 && (
                      <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 500, textTransform: "none" }}>
                        {streamAudioLanguages.slice(0, 4).map(l => l.language || l.name).filter(Boolean).join(" / ")}
                        {streamAudioLanguages.length > 4 ? " +" : ""}
                      </span>
                    )}
                  </span>
                ) : isDirectStream && directStreamProvider ? (
                  <span style={{
                    color: "rgba(0,200,120,0.7)", fontSize: "10px", fontWeight: 700,
                    background: "rgba(0,200,120,0.08)", padding: "2px 7px",
                    borderRadius: 100, flexShrink: 0, letterSpacing: "0.5px",
                    border: "1px solid rgba(0,200,120,0.12)",
                    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                    textTransform: "uppercase",
                  }}>{directStreamProvider}</span>
                ) : null}
              </div>
              <div style={{ flexShrink: 0, minWidth: "clamp(50px, 10vw, 70px)" }} />
            </div>

            {/* ═══ CONTROL ROW ════════════════════════════════════ */}
            <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `${R.controlRowPad} ${R.padMedium} ${R.padMedium}`, pointerEvents: "auto" }}>
              {/* Left: Play + Seek + Volume */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <motion.button
                  onClick={togglePlay}
                  whileHover={{ scale: 1.08 }}
                  whileTap={{ scale: 0.88 }}
                  transition={SPRING}
                  style={{
                    background: "rgba(255,255,255,0.12)", border: "none", color: "#fff",
                    cursor: "pointer", width: R.btnMedium, height: R.btnMedium, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
                  }}
                >
                  {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />}
                </motion.button>
                <motion.button onClick={(e) => { e.stopPropagation(); seekRelative(-10); }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    seekLongPressRef.current = setInterval(() => seekRelative(-10), 300);
                  }}
                  onPointerUp={() => { clearInterval(seekLongPressRef.current); seekLongPressRef.current = null; }}
                  onPointerLeave={() => { clearInterval(seekLongPressRef.current); seekLongPressRef.current = null; }}
                  whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
                  transition={SPRING}
                  style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", width: R.btnSmall, height: R.btnSmall, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <RotateCcw size={15} />
                </motion.button>
                <motion.button onClick={(e) => { e.stopPropagation(); seekRelative(10); }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    seekLongPressRef.current = setInterval(() => seekRelative(10), 300);
                  }}
                  onPointerUp={() => { clearInterval(seekLongPressRef.current); seekLongPressRef.current = null; }}
                  onPointerLeave={() => { clearInterval(seekLongPressRef.current); seekLongPressRef.current = null; }}
                  whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
                  transition={SPRING}
                  style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", width: R.btnSmall, height: R.btnSmall, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <RotateCw size={15} />
                </motion.button>
                {/* Volume with expand-on-hover bar */}
                <div
                  onMouseEnter={() => setIsVolumeHovered(true)}
                  onMouseLeave={() => setIsVolumeHovered(false)}
                  onTouchStart={(e) => { e.stopPropagation(); setIsVolumeHovered(!isVolumeHovered); }}
                  style={{ display: "flex", alignItems: "center", gap: 0, position: "relative" }}
                >
                  <motion.button onClick={toggleMute}
                    whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
                    transition={SPRING}
                    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", width: R.btnSmall, height: R.btnSmall, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <AnimatePresence mode="wait">
                      <motion.div key={isMuted || volume === 0 ? "off" : "on"}
                        initial={{ scale: 0.5, opacity: 0, rotate: -20 }}
                        animate={{ scale: 1, opacity: 1, rotate: 0 }}
                        exit={{ scale: 0.5, opacity: 0, rotate: 20 }}
                        transition={SPRING_FAST}
                      >
                        {isMuted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
                      </motion.div>
                    </AnimatePresence>
                  </motion.button>
                  {/* Volume bar: always visible on touch, hover-expand on desktop */}
                  <motion.div
                    initial={false}
                    animate={{ width: (isTouch && isVolumeHovered) || (!isTouch && isVolumeHovered) ? 64 : isTouch ? 48 : 0, opacity: (isTouch && isVolumeHovered) || (!isTouch && isVolumeHovered) || (isTouch && controlsVisible) ? 1 : 0 }}
                    transition={SPRING}
                    style={{ overflow: "hidden", position: "relative", height: 24, display: "flex", alignItems: "center" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      ref={volumeBarRef}
                      style={{
                        width: "clamp(44px, 8vw, 56px)", height: 4, borderRadius: 2,
                        background: "rgba(255,255,255,0.1)", position: "relative",
                        cursor: "pointer",
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation(); e.preventDefault();
                        isDraggingVolumeRef.current = true;
                        const r = e.currentTarget.getBoundingClientRect();
                        const x = Math.max(0, Math.min(e.clientX - r.left, r.width));
                        changeVolume(x / r.width);
                        const mm = (ev) => {
                          if (!isDraggingVolumeRef.current || !volumeBarRef.current) return;
                          const rr = volumeBarRef.current.getBoundingClientRect();
                          const xx = Math.max(0, Math.min(ev.clientX - rr.left, rr.width));
                          changeVolume(xx / rr.width);
                        };
                        const mu = () => {
                          isDraggingVolumeRef.current = false;
                          window.removeEventListener("mousemove", mm);
                          window.removeEventListener("mouseup", mu);
                        };
                        window.addEventListener("mousemove", mm);
                        window.addEventListener("mouseup", mu);
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation(); e.preventDefault();
                        isDraggingVolumeRef.current = true;
                        const touch = e.touches[0];
                        const r = e.currentTarget.getBoundingClientRect();
                        const x = Math.max(0, Math.min(touch.clientX - r.left, r.width));
                        changeVolume(x / r.width);
                      }}
                      onTouchMove={(e) => {
                        if (!isDraggingVolumeRef.current || !volumeBarRef.current) return;
                        const touch = e.touches[0];
                        const r = volumeBarRef.current.getBoundingClientRect();
                        const x = Math.max(0, Math.min(touch.clientX - r.left, r.width));
                        changeVolume(x / r.width);
                      }}
                      onTouchEnd={() => { isDraggingVolumeRef.current = false; }}
                    >
                      <div style={{
                        position: "absolute", left: 0, top: 0, bottom: 0,
                        width: `${effVolume * 100}%`,
                        background: "rgba(255,255,255,0.8)",
                        borderRadius: 2,
                        transition: isDraggingVolumeRef.current ? "none" : "width 0.1s ease",
                      }} />
                      <div style={{
                        position: "absolute", top: "50%",
                        left: `${effVolume * 100}%`,
                        transform: "translate(-50%, -50%)",
                        width: 10, height: 10, borderRadius: "50%",
                        background: "#fff",
                        boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                        transition: isDraggingVolumeRef.current ? "none" : "left 0.1s ease",
                      }} />
                    </div>
                  </motion.div>
                </div>
              </div>

              {/* Right: Subtitles + Shortcuts + Settings + Fullscreen */}
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="file" accept=".srt,.vtt" ref={subtitleInputRef} onChange={handleSubtitleUpload} style={{ display: "none" }} />
                <motion.button onClick={(e) => { e.stopPropagation(); setShowSubtitlesMenu(!showSubtitlesMenu); setShowSettings(false); }}
                  whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
                  transition={SPRING}
                  style={{
                    background: subtitleEnabled || showSubtitlesMenu ? "rgba(255,255,255,0.08)" : "transparent",
                    border: subtitleEnabled || showSubtitlesMenu ? "1px solid rgba(255,255,255,0.08)" : "none",
                    color: subtitleEnabled || showSubtitlesMenu ? "#fff" : "rgba(255,255,255,0.6)",
                    cursor: "pointer", width: R.btnSmall, height: R.btnSmall, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative",
                  }}
                >
                  <Captions size={15} />
                  {subtitleEnabled && <div style={{ position: "absolute", top: 4, right: 4, width: "clamp(3px, 0.5vw, 4px)", height: "clamp(3px, 0.5vw, 4px)", background: "#fff", borderRadius: "50%" }} />}
                </motion.button>
                {/* Audio track button — only show when multiple audio tracks exist */}
                {audioTracks?.length > 1 && (
                  <motion.button onClick={(e) => { e.stopPropagation(); setShowAudioMenu(!showAudioMenu); setShowSettings(false); setShowSubtitlesMenu(false); }}
                    whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
                    transition={SPRING}
                    style={{
                      background: showAudioMenu ? "rgba(255,255,255,0.08)" : "transparent",
                      border: showAudioMenu ? "1px solid rgba(255,255,255,0.08)" : "none",
                      color: showAudioMenu ? "#fff" : "rgba(255,255,255,0.6)",
                      cursor: "pointer", width: R.btnSmall, height: R.btnSmall, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      position: "relative",
                    }}
                  >
                    <AudioLines size={15} />
                  </motion.button>
                )}
                <motion.button onClick={(e) => {
                    e.stopPropagation();
                    setAspectRatioIndex((p) => (p + 1) % ASPECT_RATIOS.length);
                    setShowAspectRatioArc(true);
                    if (aspectRatioArcTimerRef.current) clearTimeout(aspectRatioArcTimerRef.current);
                    aspectRatioArcTimerRef.current = setTimeout(() => setShowAspectRatioArc(false), 1200);
                  }}
                    whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
                    transition={SPRING}
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(255,255,255,0.06)",
                      color: "rgba(255,255,255,0.6)",
                      cursor: "pointer", width: R.btnSmall, height: R.btnSmall, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      position: "relative",
                    }}
                  >
                    <Maximize size={14} />
                    <span style={{
                      position: "absolute", bottom: -1, right: -1,
                      fontSize: "7px", fontWeight: 800, color: "rgba(255,255,255,0.5)",
                      lineHeight: 1, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                    }}>{aspectRatioIndex + 1}</span>
                  </motion.button>
                <motion.button onClick={(e) => {
                    e.stopPropagation();
                    setShowSettings(!showSettings); setShowSubtitlesMenu(false);
                    // On-demand audio track sync (AUDIO_TRACKS_UPDATED may fire
                    // before the settings panel ever opens)
                    if (!showSettings && isDirectStream && hlsRef.current) {
                      try {
                        const h = hlsRef.current;
                        if (h.audioTracks && h.audioTracks.length > 0 && audioTracks.length === 0) {
                          const mapped = h.audioTracks.map((t, i) => ({ id: t.id ?? i, name: t.name || t.lang || `Track ${i + 1}`, language: t.lang || '' }));
                          setAudioTracks(mapped);
                        }
                      } catch {}
                    }
                  }}
                  whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
                  transition={SPRING}
                  style={{
                    background: showSettings ? "rgba(255,255,255,0.08)" : "transparent",
                    border: showSettings ? "1px solid rgba(255,255,255,0.08)" : "none",
                    color: showSettings ? "#fff" : "rgba(255,255,255,0.6)",
                    cursor: "pointer", width: R.btnSmall, height: R.btnSmall, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <motion.div animate={{ rotate: showSettings ? 90 : 0 }} transition={SPRING}>
                    <Settings size={15} />
                  </motion.div>
                </motion.button>
                {/* Picture-in-Picture */}
                {isDirectStream && videoRef.current && 'pictureInPictureEnabled' in document && (
                  <motion.button onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      if (document.pictureInPictureElement) await document.exitPictureInPicture();
                      else if (videoRef.current) await videoRef.current.requestPictureInPicture();
                    } catch {}
                  }}
                    whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
                    transition={SPRING}
                    style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", width: R.btnSmall, height: R.btnSmall, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    <Maximize size={15} style={{ transform: "scale(0.8) translate(-1px, 1px)" }} />
                  </motion.button>
                )}
                <motion.button onClick={toggleFullscreen}
                  whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.88 }}
                  transition={SPRING}
                  style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", width: R.btnSmall, height: R.btnSmall, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SETTINGS PANEL ═════════════════════════════════════ */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", bottom: "clamp(40px, 8vw, 60px)", right: "clamp(8px, 2vw, 16px)", zIndex: 50,
              width: R.panelSettings, maxHeight: "50vh",
              background: "rgba(18,18,20,0.88)",
              backdropFilter: "blur(40px) saturate(180%)",
              WebkitBackdropFilter: "blur(40px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: R.radiusMedium, padding: `${R.padMedium} ${R.padMedium}`, color: "#fff",
              overflowY: "auto",
              boxShadow: "0 16px 56px rgba(0,0,0,0.6), inset 0 0.5px 0 rgba(255,255,255,0.04)",
            }}
          >
            {/* Speed */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Playback Speed</div>
              <div style={{ display: "flex", gap: "clamp(4px, 1vw, 6px)", flexWrap: "wrap" }}>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <motion.button key={r} onClick={() => { sendCommand("setPlaybackRate", [r]); setPlaybackRate(r); setShowSettings(false); }}
                    whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
                    transition={SPRING}
                    style={{
                      background: playbackRate === r ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.02)",
                      color: playbackRate === r ? "#fff" : "rgba(255,255,255,0.5)",
                      border: playbackRate === r ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.04)",
                      padding: `${R.padSmall} ${R.padSmall}`, borderRadius: 100, cursor: "pointer",
                      fontSize: R.fontSmall, fontWeight: 700,
                      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                    }}
                  >
                    {r}x
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Quality */}
            {qualities?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Quality</div>
                <div style={{ display: "flex", gap: "clamp(4px, 1vw, 6px)", flexWrap: "wrap" }}>
                  <motion.button onClick={() => {
                    if (isDirectStream && hlsRef.current) {
                      const h = hlsRef.current;
                      // Smooth switch: nextLevel waits for a fragment boundary so
                      // video doesn't freeze while audio continues.
                      h.nextLevel = -1;
                      // Force an earlier boundary for snappy feedback
                      h.startLoad(videoRef.current?.currentTime || 0);
                    }
                    else { sendCommand("setQuality", [-1]); }
                    setCurrentQuality({ id: -1, name: 'Auto' }); setShowSettings(false);
                  }}
                    whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} transition={SPRING}
                    style={{
                      background: (currentQuality?.id === -1 || (!currentQuality && qualities.length > 1)) ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.02)",
                      color: (currentQuality?.id === -1 || (!currentQuality && qualities.length > 1)) ? "#fff" : "rgba(255,255,255,0.5)",
                      border: (currentQuality?.id === -1) ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.04)",
                      padding: `${R.padSmall} ${R.padSmall}`, borderRadius: 100, cursor: "pointer", fontSize: R.fontSmall, fontWeight: 700,
                      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                    }}
                  >Auto</motion.button>
                  {qualities.map((q) => (
                    <motion.button key={q.id} onClick={() => {
                      if (isDirectStream && hlsRef.current) {
                        const h = hlsRef.current;
                        // Forced, but position-preserving switch. We keep the
                        // current playback time so an init-segment refetch never
                        // sends the viewer back to 0.
                        const pos = videoRef.current?.currentTime || 0;
                        h.nextLevel = q.id;
                        // Nudge so it applies at the next fragment quickly
                        h.startLoad(pos);
                        // UI shows the target immediately; LEVEL_SWITCHED will
                        // confirm with the real id/name.
                      }
                      else { sendCommand("setQuality", [q.id]); }
                      setCurrentQuality(q); setShowSettings(false);
                    }}
                      whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} transition={SPRING}
                      style={{
                        background: (currentQuality?.id === q.id) ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.02)",
                        color: (currentQuality?.id === q.id) ? "#fff" : "rgba(255,255,255,0.5)",
                        border: (currentQuality?.id === q.id) ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(255,255,255,0.04)",
                        padding: `${R.padSmall} ${R.padSmall}`, borderRadius: 100, cursor: "pointer", fontSize: R.fontSmall, fontWeight: 700,
                        fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                      }}
                    >
                      {q.name || q.height + "p" || q.id}
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Audio */}
            {audioTracks?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Audio</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {audioTracks.map((t, i) => (
                    <button key={i} onClick={() => {
                      if (isDirectStream && hlsRef.current) { hlsRef.current.audioTrack = t.id ?? i; }
                      else { sendCommand("setAudioTrack", [t.id || i]); }
                      setCurrentAudioTrack(t); setShowSettings(false);
                    }}
                      style={{
                        background: (currentAudioTrack?.id === t.id) ? "rgba(255,255,255,0.06)" : "transparent",
                        color: (currentAudioTrack?.id === t.id) ? "#fff" : "rgba(255,255,255,0.5)",
                        border: "none", padding: `${R.padSmall} ${R.padSmall}`, borderRadius: 10,
                        cursor: "pointer", fontSize: R.fontMedium, fontWeight: 600, textAlign: "left",
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                      }}
                    >
                      {t.name || t.language || `Track ${i + 1}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Aspect Ratio */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Aspect Ratio</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {ASPECT_RATIOS.map((ar, i) => (
                  <button key={ar.name} onClick={() => { setAspectRatioIndex(i); setShowSettings(false); setShowAspectRatioArc(true); if (aspectRatioArcTimerRef.current) clearTimeout(aspectRatioArcTimerRef.current); aspectRatioArcTimerRef.current = setTimeout(() => setShowAspectRatioArc(false), 1200); }}
                    style={{
                      background: aspectRatioIndex === i ? "rgba(255,255,255,0.06)" : "transparent",
                      color: aspectRatioIndex === i ? "#fff" : "rgba(255,255,255,0.5)",
                      border: aspectRatioIndex === i ? "1px solid rgba(255,255,255,0.08)" : "none",
                      padding: `${R.padSmall} ${R.padSmall}`, borderRadius: 10, cursor: "pointer",
                      fontSize: R.fontMedium, fontWeight: 600, display: "flex", justifyContent: "space-between",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}
                  >
                    {ar.name} {aspectRatioIndex === i && <Check size={11} strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Automations */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Automations</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { label: "Auto-Skip Intro", val: autoSkipIntro, set: setAutoSkipIntro, key: "streamly_autoSkip" },
                  ...(movie?.isSeries ? [{ label: "Auto-Play Next", val: autoPlayNext, set: setAutoPlayNext, key: "streamly_autoNext" }] : []),
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: R.fontMedium, fontWeight: 600, color: "rgba(255,255,255,0.6)", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>{item.label}</span>
                    <div onClick={() => { const v = !item.val; item.set(v); localStorage.setItem(item.key, String(v)); }}
                      style={{
                        width: isTouch ? 44 : 36, height: isTouch ? 24 : 20,
                        background: item.val ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.1)",
                        borderRadius: 100, position: "relative", cursor: "pointer",
                        transition: "background 0.25s",
                      }}
                    >
                      <div style={{
                        width: isTouch ? 20 : 16, height: isTouch ? 20 : 16, background: item.val ? "#000" : "rgba(255,255,255,0.6)", borderRadius: "50%",
                        position: "absolute", top: 2,
                        left: item.val ? (isTouch ? 22 : 18) : 2,
                        transition: "left 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.25s",
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: "rgba(255,255,255,0.04)", margin: "12px 0" }} />
            <button onClick={(e) => { e.stopPropagation(); setUseNativeControls(true); setShowSettings(false); }}
              style={{
                width: "100%", background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.7)",
                border: "1px solid rgba(255,255,255,0.06)", padding: 10, borderRadius: 12,
                cursor: "pointer", fontSize: R.fontMedium, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center", gap: "clamp(4px, 1vw, 6px)",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              }}
            >
              <Captions size={13} /> Native Audio
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SUBTITLES PANEL ═════════════════════════════════════ */}
      <AnimatePresence>
        {showSubtitlesMenu && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", bottom: "clamp(40px, 8vw, 60px)", right: "clamp(36px, 8vw, 56px)", zIndex: 50,
              width: R.panelSubtitles, maxHeight: "45vh",
              background: "rgba(18,18,20,0.88)",
              backdropFilter: "blur(40px) saturate(180%)",
              WebkitBackdropFilter: "blur(40px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: R.radiusMedium, padding: `${R.padMedium} ${R.padMedium}`, color: "#fff",
              overflowY: "auto",
              boxShadow: "0 16px 56px rgba(0,0,0,0.6), inset 0 0.5px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Subtitles</span>
              <div onClick={(e) => { e.stopPropagation(); setSubtitleEnabled(!subtitleEnabled); }}
                style={{
                  width: isTouch ? 44 : 36, height: isTouch ? 24 : 20,
                  background: subtitleEnabled ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.1)",
                  borderRadius: 100, position: "relative", cursor: "pointer",
                  transition: "background 0.25s",
                }}
              >
                <div style={{
                  width: isTouch ? 20 : 16, height: isTouch ? 20 : 16, background: subtitleEnabled ? "#000" : "rgba(255,255,255,0.6)", borderRadius: "50%",
                  position: "absolute", top: 2,
                  left: subtitleEnabled ? (isTouch ? 22 : 18) : 2,
                  transition: "left 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.25s",
                }} />
              </div>
            </div>
            <div data-scrollable="true" style={{
              background: "rgba(255,255,255,0.02)", padding: 8, borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.04)", maxHeight: 140,
              overflowY: "auto", marginBottom: 12,
            }}>
              {availableSubtitleLangs.length > 0 ? (
                availableSubtitleLangs.map((l, i) => (
                  <button key={i} onClick={() => { handleSubtitleLanguageSelect(l.downloadLink); setShowSubtitlesMenu(false); }}
                    style={{
                      display: "block", width: "100%", background: "transparent",
                      color: "rgba(255,255,255,0.75)", border: "none",
                      padding: `${R.padMedium} ${R.padSmall}`, borderRadius: 8, cursor: "pointer",
                      fontSize: R.fontMedium, fontWeight: 600, textAlign: "left", transition: "background 0.12s",
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    {l.language}
                  </button>
                ))
              ) : (
                <div style={{ fontSize: R.fontSmall, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: 12, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
                  {isFetchingSubtitles ? "Searching..." : "No subtitles found"}
                </div>
              )}
            </div>
            <button onClick={(e) => { e.stopPropagation(); subtitleInputRef.current?.click(); setShowSubtitlesMenu(false); }}
              style={{
                width: "100%", background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.7)",
                border: "1px dashed rgba(255,255,255,0.08)", padding: 12, borderRadius: 12,
                cursor: "pointer", fontSize: R.fontMedium, fontWeight: 600,
                display: "flex", alignItems: "center", justifyContent: "center", gap: "clamp(4px, 1vw, 6px)",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              }}
            >
              <Upload size={12} /> {subtitleFileName || "Upload (.srt)"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ AUDIO TRACKS PANEL ═══════════════════════════════════ */}
      <AnimatePresence>
        {showAudioMenu && audioTracks?.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={SPRING}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", bottom: "clamp(40px, 8vw, 60px)", right: "clamp(68px, 14vw, 96px)", zIndex: 50,
              width: R.panelSubtitles, maxHeight: "40vh",
              background: "rgba(18,18,20,0.88)",
              backdropFilter: "blur(40px) saturate(180%)",
              WebkitBackdropFilter: "blur(40px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: R.radiusMedium, padding: `${R.padMedium} ${R.padMedium}`, color: "#fff",
              overflowY: "auto",
              boxShadow: "0 16px 56px rgba(0,0,0,0.6), inset 0 0.5px 0 rgba(255,255,255,0.04)",
            }}
          >
            <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 12, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Audio Track</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {audioTracks.map((t, i) => (
                <button key={i} onClick={() => {
                  if (isDirectStream && hlsRef.current) { hlsRef.current.audioTrack = t.id ?? i; }
                  else { sendCommand("setAudioTrack", [t.id || i]); }
                  setCurrentAudioTrack(t); setShowAudioMenu(false);
                }}
                  style={{
                    width: "100%", background: (currentAudioTrack?.id === t.id) ? "rgba(255,255,255,0.06)" : "transparent",
                    color: (currentAudioTrack?.id === t.id) ? "#fff" : "rgba(255,255,255,0.6)",
                    border: "none", padding: `${R.padSmall} ${R.padSmall}`, borderRadius: 10,
                    cursor: "pointer", fontSize: R.fontMedium, fontWeight: 600, textAlign: "left",
                    display: "flex", alignItems: "center", gap: 8,
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  }}
                >
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: (currentAudioTrack?.id === t.id) ? "#fff" : "transparent",
                    border: "1px solid rgba(255,255,255,0.3)",
                    flexShrink: 0,
                  }} />
                  {t.name || t.language || `Track ${i + 1}`}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTEXT MENU */}
      <AnimatePresence>
        {contextMenu.show && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.1 }}
            style={{
              position: "absolute", left: contextMenu.x, top: contextMenu.y, zIndex: 100,
              background: "rgba(12,12,14,0.94)", backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12,
              padding: "4px 0", minWidth: "clamp(140px, 30vw, 180px)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.6)", pointerEvents: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            {[
              { icon: <Link size={12} />, label: "Copy URL", action: () => { navigator.clipboard.writeText(window.location.href); setContextMenu({ show: false, x: 0, y: 0 }); showToast("Copied"); } },
              { icon: <Repeat size={12} color={isLooping ? "#fff" : undefined} />, label: isLooping ? "Loop On" : "Loop Off", action: () => { setIsLooping(!isLooping); setContextMenu({ show: false, x: 0, y: 0 }); } },
              ...(movie?.posterUrl ? [{ icon: <Film size={12} />, label: "Open Poster", action: () => { window.open(movie.posterUrl, "_blank"); setContextMenu({ show: false, x: 0, y: 0 }); } }] : []),
              { icon: <Keyboard size={12} />, label: "Shortcuts", action: () => { setShowShortcuts(true); setContextMenu({ show: false, x: 0, y: 0 }); } },
            ].map(({ icon, label, action }, i) => (
              <button key={i} onClick={action}
                style={{
                  display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)", width: "100%",
                  background: "transparent", border: "none", color: "rgba(255,255,255,0.8)",
                  padding: `${isTouch ? "12px" : "8px"} 14px`, cursor: "pointer", fontSize: R.fontMedium, fontWeight: 600,
                  textAlign: "left", transition: "background 0.1s",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              >
                {icon} {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CustomVideoPlayer;
