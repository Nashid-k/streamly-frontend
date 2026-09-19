import { useEffect, useState, useRef, useCallback, useMemo, memo, forwardRef, useImperativeHandle } from "react";
import { VideoSourceAdapter } from "../api/videoSourceAdapter";

import { movieService } from "../api/movieService";
import {
  Play, Pause, Volume1, Volume2, VolumeX, Maximize, Minimize,
  Settings, AlertCircle, Check, WifiOff, RefreshCw,
  SkipForward, FastForward,
  Keyboard, X, Upload, Captions, Film, Link, Repeat,
  ArrowLeft, ChevronLeft, ChevronRight, Lock, Unlock, Sun,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SubtitleEngine } from "../utils/subtitleEngine";
import { logDebug, logWarn, logInfo, logError } from "../utils/debugLogger";
import { usePreferences } from "../context/preferences";
import { PLAYER_SPEEDS } from "./playerUIDef";
import { extractStreamUrl } from "../utils/iframeStreamExtractor.js";


const getNumericId = (s) => {
  if (!s) return null;
  const m = s.toString().match(/\d+/);
  return m ? m[0] : null;
};

const ASPECT_RATIOS = [
  { id: "fit", name: "Fit (Original 16:9)", scale: 1 },
  { id: "fill", name: "Fill Screen (Edge-to-Edge)", scale: 1.25 },
  { id: "zoom", name: "Zoom 1.25x (Punch-Hole Cutout)", scale: 1.25 },
  { id: "cinema", name: "Cinema 2.39:1", scale: 1.344 },
  { id: "crop1610", name: "16:10", scale: 1.111 },
  { id: "stretch", name: "Stretch to Screen", scale: 1 },
];

/* Frame glyph dimensions [w, h] per aspect index — drawn in the aspect HUD
   so the shape visibly morphs as the user cycles through ratios. */
const AR_GLYPH = [
  [44, 25], // Fit (16:9)
  [52, 23], // Fill Screen (Edge-to-Edge)
  [48, 25], // Zoom 1.25x (Punch-Hole Cutout)
  [50, 21], // Cinema 2.39:1
  [42, 25], // 16:10
  [46, 25], // Stretch to Screen
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

const TOUCH_GESTURES = [
  { gesture: "Single Tap", action: "Show / Hide Controls" },
  { gesture: "Double Tap Left / Right", action: "Rewind / Forward 10s" },
  { gesture: "Swipe Left (Up / Down)", action: "Adjust Brightness" },
  { gesture: "Swipe Right (Up / Down)", action: "Adjust Volume" },
  { gesture: "Horizontal Swipe", action: "Seek Timeline" },
  { gesture: "Aspect Button", action: "Change Aspect Ratio" },
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
};

/* Circular Arc Component — the core Apple TV+ motif
   Used for: volume HUD, seek indicators, loading, up-next countdown */
const ArcRing = memo(({ progress = 0, size = 48, strokeWidth = 3, color = "#fff", bgColor = "rgba(255,255,255,0.08)", glowColor, children, className, responsive }) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, Math.min(progress, 1)));
  return (
    <div style={{ position: "relative", width: responsive || size, height: responsive || size, flexShrink: 0 }} className={className}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" strokeWidth={strokeWidth} style={{ stroke: bgColor }} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ stroke: color, transition: "stroke-dashoffset 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}
        />
      </svg>
      {glowColor && (
        <svg width={size} height={size} style={{ position: "absolute", inset: 0, transform: "rotate(-90deg)", filter: `blur(4px)`, opacity: 0.5 }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="transparent" strokeWidth={strokeWidth} />
          <circle
            cx={size/2} cy={size/2} r={r} fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            style={{ stroke: glowColor, transition: "stroke-dashoffset 0.25s cubic-bezier(0.4, 0, 0.2, 1)" }}
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
});

/* ─── NETFLIX-STYLE HUD COMPONENTS ──────────────────────────────────────── */

/* Volume HUD — appears on volume change (desktop). Netflix-style flat
   black pill: speaker icon + slim red fill bar + live %.
   Positioning is done by a full-cover flex wrapper (inset: 0, column,
   top-anchored + horizontally centered) so framer-motion's scale/opacity
   animation can never displace it. All sizes are viewport-relative. */
const NetflixVolumeHUD = memo(function NetflixVolumeHUD({ effVolume, isMuted, volume, top }) {
  const isZero = isMuted || volume === 0;
  const pct = isZero ? 0 : Math.round(effVolume * 100);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={SPRING_SNAPPY}
      style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        paddingTop: top,
        pointerEvents: "none", zIndex: 65,
      }}
    >
      <div style={{
        display: "flex", alignItems: "center",
        gap: "clamp(8px, 1.4vw, 14px)",
        padding: "clamp(8px, 1.6vw, 14px) clamp(12px, 2.4vw, 22px)",
        borderRadius: 8,
        background: "rgba(0,0,0,0.88)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
      }}>
        {isZero ? (
          <VolumeX size={20} color="#E50914" strokeWidth={2.4} />
        ) : pct < 40 ? (
          <Volume1 size={20} color="#fff" strokeWidth={2.4} />
        ) : (
          <Volume2 size={20} color="#fff" strokeWidth={2.4} />
        )}
        <div style={{
          position: "relative",
          width: "clamp(72px, 11vw, 120px)", height: "clamp(3px, 0.6vw, 5px)",
          background: "rgba(255,255,255,0.2)", borderRadius: 1, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "#E50914", borderRadius: 1 }} />
        </div>
        <span style={{
          color: "#fff", fontSize: "clamp(11px, 1.7vw, 15px)", fontWeight: 700,
          minWidth: "clamp(30px, 6vw, 44px)", textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}>{pct}%</span>
      </div>
    </motion.div>
  );
});

/* Brightness HUD — same Netflix pill, sun icon + red fill bar + %. */
const NetflixBrightnessHUD = memo(function NetflixBrightnessHUD({ brightness, top }) {
  const pct = Math.round(brightness * 100);
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={SPRING_SNAPPY}
      style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        paddingTop: top,
        pointerEvents: "none", zIndex: 65,
      }}
    >
      <div style={{
        display: "flex", alignItems: "center",
        gap: "clamp(8px, 1.4vw, 14px)",
        padding: "clamp(8px, 1.6vw, 14px) clamp(12px, 2.4vw, 22px)",
        borderRadius: 8,
        background: "rgba(0,0,0,0.88)",
        border: "1px solid rgba(255,255,255,0.12)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
      }}>
        <Sun size={20} color={pct >= 100 ? "#ffd166" : "#fff"} strokeWidth={2.4} />
        <div style={{
          position: "relative",
          width: "clamp(72px, 11vw, 120px)", height: "clamp(3px, 0.6vw, 5px)",
          background: "rgba(255,255,255,0.2)", borderRadius: 1, overflow: "hidden",
        }}>
          <div style={{ position: "absolute", inset: 0, width: `${Math.min(100, pct)}%`, background: "#E50914", borderRadius: 1 }} />
        </div>
        <span style={{
          color: "#fff", fontSize: "clamp(11px, 1.7vw, 15px)", fontWeight: 700,
          minWidth: "clamp(30px, 6vw, 44px)", textAlign: "right",
          fontVariantNumeric: "tabular-nums",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}>{pct}%</span>
      </div>
    </motion.div>
  );
});

/* Aspect Ratio HUD — live frame glyph morphing with the selected ratio
   (AR_GLYPH) plus the ratio name, in Netflix black/red. Centered. */
const NetflixAspectHUD = memo(function NetflixAspectHUD({ aspectRatioIndex, top }) {
  const ar = ASPECT_RATIOS[aspectRatioIndex] || ASPECT_RATIOS[0];
  const glyph = AR_GLYPH[aspectRatioIndex] || AR_GLYPH[0];
  const [gw, gh] = glyph;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: -6 }}
      transition={SPRING_SNAPPY}
      style={{
        position: "absolute", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "flex-start",
        paddingTop: top,
        pointerEvents: "none", zIndex: 65,
      }}
    >
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        gap: "clamp(6px, 1.2vw, 10px)",
      }}>
        <motion.div
          animate={{ width: gw, height: gh }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
          style={{
            background: "rgba(0,0,0,0.88)", border: "2px solid #E50914",
            borderRadius: 6, boxShadow: "0 0 18px rgba(229,9,20,0.5)",
          }}
        />
        <span style={{
          color: "#fff", fontSize: "clamp(11px, 1.6vw, 14px)", fontWeight: 700,
          background: "rgba(0,0,0,0.88)", borderRadius: 8,
          padding: "clamp(3px, 0.6vw, 5px) clamp(8px, 1.6vw, 14px)",
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          border: "1px solid rgba(255,255,255,0.1)",
          whiteSpace: "nowrap",
          fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
        }}>{ar.name}</span>
      </div>
    </motion.div>
  );
});

/* Netflix-style loading arc — bright red comet ring, the signature
   buffering spinner of the Netflix player. */
const LoadingArc = memo(({ size = 56, strokeWidth = 2.5, progress = 0 }) => {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      {/* Static track ring — faint red */}
      <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke="rgba(229,9,20,0.18)" strokeWidth={strokeWidth}
        />
      </svg>
      {/* Spinning comet arc — solid #E50914 with a red fade trail */}
      <motion.svg
        width={size} height={size}
        style={{ position: "absolute", inset: 0 }}
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }}
      >
        <defs>
          <linearGradient id="loadArcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(229,9,20,0)" />
            <stop offset="55%" stopColor="rgba(229,9,20,0.55)" />
            <stop offset="100%" stopColor="#E50914" />
          </linearGradient>
        </defs>
        <circle
          cx={size/2} cy={size/2} r={r}
          fill="none" stroke="url(#loadArcGrad)" strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circ * 0.28} ${circ * 0.72}`}
        />
      </motion.svg>
      {/* Inner progress ring — red, fills over time */}
      {progress > 0 && (
        <svg width={size} height={size} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <linearGradient id="loadInnerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="rgba(229,9,20,0.15)" />
              <stop offset="100%" stopColor="rgba(229,9,20,0.45)" />
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
});

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

/* Observe the player container size → derive a live HUD scale factor so
   the top-center HUDs stay proportional from phones to 4K monitors. */
const useContainerSize = (ref) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
};

const CustomVideoPlayer = forwardRef(({
  movie, season, episode, preferredServerIndex = 0, onServerChange,
  hasNextEpisode, onNextEpisode, onClose, thumbnailUrl, startTime = 0, onProgressUpdate,
  /* Ordered server list from TitleDetails (user's Settings → Server Order).
     Indices everywhere in this player refer to THIS list. Falls back to the
     static base order when the parent renders without it (tests, reuse). */
  servers: serversProp,
}, ref) => {
  const {
    autoplay,
    setPreference,
    autoSkipIntro,
    seekTime = 10,
    subtitleSize = 100,
    subtitleColor = "#ffffff",
    subtitleFont = "cinejoy",
    autoSubtitles = true,
    defaultLanguage = "en",  } = usePreferences();
  const seekStep = Number(seekTime) || 10;
  const seekStepRef = useRef(seekStep);
  useEffect(() => { seekStepRef.current = seekStep; }, [seekStep]);

  const isTouch = useIsTouch();
  /* Viewport-aware condensation: on phone-width players the control
     row drops low-priority buttons so the clusters never overflow. */
  const [narrow, setNarrow] = useState(() => {
    try {
      return typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(max-width: 720px)").matches
        : false;
    } catch { return false; }
  });
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 720px)");
    const on = () => { try { setNarrow(mq.matches); } catch {} };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    }
    on();
    return undefined;
  }, []);


  /* NOTE: cycleSpeed is defined after sendCommand/playbackRate below —
     defining it here put those bindings in the temporal dead zone and
     crashed the player on every render. */
  /* State */
  const [activeServerIndex, setActiveServerIndex] = useState(preferredServerIndex);
  const activeServerIndexRef = useRef(activeServerIndex);
  useEffect(() => { activeServerIndexRef.current = activeServerIndex; }, [activeServerIndex]);

  // The playable rotation — the user's ordered list when provided.
  const SERVERS = useMemo(
    () => (Array.isArray(serversProp) && serversProp.length > 0 ? serversProp : VideoSourceAdapter.getServers()),
    [serversProp],
  );
  const serverCount = SERVERS.length;

  // Tracks consecutive server failures across switches. When it reaches
  // serverCount, every source has failed and we show a clear "unreachable"
  // screen with Retry instead of cycling forever on a black iframe.
  const rotationFailuresRef = useRef(0);

  // Per-server consecutive-error tally (dead sources accumulate strikes before
  // failover). A ref, because the value never renders and the watchdog needs it
  // synchronously.
  const serverErrorCountsRef = useRef({});
  // Flips true the moment a source proves it is actually streaming (playing
  // event, loadedmetadata, time advancing, buffered data). Failover trusts this
  // instead of our overlay spinner: CineSrc's own error postMessage can be
  // dropped by the browser (DataCloneError on their side) while their embed
  // keeps spinning, so "no playback" is the only trustworthy dead-source sign.
  const hasPlaybackRef = useRef(false);
  // Set while a failover switch is already scheduled, so an error event and the
  // watchdog firing close together can't both count the same dead source and
  // exhaust the rotation with a false "all servers unreachable" screen.
  const failoverPendingRef = useRef(false);
  // True only while the user explicitly paused via our UI. getPaused returning
  // "not paused" is NOT playback proof (a dead source sits mid-autoplay-buffer
  // with paused=false forever), so the user-pause flag keeps the stall watch
  // from rotating a stream the viewer deliberately rested on.
  const userPausedRef = useRef(false);
  // Stall-watch state for the CineSrc getter poll: the last getCurrentTime
  // value, the last getPaused value, and how many consecutive polls reported a
  // frozen timeline. Fires only when the source was proven playing, it isn't
  // user-paused/buffering, and the timeline stops advancing.
  const pollPausedRef = useRef(false);
  const pollPrevRef = useRef(-1);
  const stallStrikesRef = useRef(0);
  // Dead-source watchdog timer, kept in a REF (not a closure local). The
  // URL-generation effect re-runs on every parent re-render (the caller passes
  // an inline onServerChange + a re-normalized movie object, so refetch/focus
  // rebuilds the deps constantly), and a cleanup that cleared a closure-local
  // handle on each run silently killed failover. A ref survives those re-runs:
  // a genuinely new load clears/re-arms it, and unmount clears it.
  const watchdogRef = useRef(null);

  /* CineSrc internal-source tracking. The CineSrc embed rotates between its
     own ~14 built-in sources (nebula, lisbon, …) and announces every switch
     via cinesrc:sourceused (integration docs). Our failover must let that
     rotation play out — one dead internal source is NOT a dead provider. */
  const cineSourceTriedRef = useRef(new Set()); // distinct internal sourceIds seen this visit
  const cineSourceStrikesRef = useRef({});      // failed windows / fatal errors per sourceId
  const cineLastSourceRef = useRef("");          // current internal sourceId
  const cineWindowsRef = useRef(0);             // expired source windows (aggregate bound)
  const cineReloadsRef = useRef(0);             // automatic in-place reload nudges (capped)
  const cineWatchdogArmRef = useRef(null);      // re-arm fn shared with the message listener
  const cineStateKeyRef = useRef("");           // content+server the cine counters belong to
  // True while the ACTIVE iframe is the CineSrc embed. Per the integration
  // docs CineSrc rotates its own ~14 internal sources (cinesrc:sourceused) —
  // a dead internal source is NOT a dead provider. Our failover must never
  // auto-switch to Server 2/3/… while CineSrc is live; exhaustion shows the
  // fallback UI (Retry / pick another server from the menu) instead.
  const cineActiveRef = useRef(false);

  const advanceServer = useCallback((msg) => {
    if (failoverPendingRef.current || rotationFailuresRef.current >= serverCount) return;
    // CineSrc owns its internal rotation — never advance to the next provider
    // while it is the active source. Surface the fallback UI per the docs'
    // guidance (listen for cinesrc:error and provide fallback UI when the
    // stream fails) rather than silently hopping to Server 2/3/….
    if (cineActiveRef.current) {
      setErrorMessage("");
      setIsLoading(false);
      setFatalError(true);
      return;
    }
    failoverPendingRef.current = true;
    rotationFailuresRef.current += 1;
    const next = (activeServerIndexRef.current + 1) % serverCount;
    if (rotationFailuresRef.current >= serverCount) {
      setErrorMessage("");
      setFatalError(true);
      setIsLoading(false);
      return;
    }
    setErrorMessage(msg);
    setTimeout(() => {
      // The source may have started streaming (slow-but-alive) while we were
      // counting it dead — don't switch away from a working server.
      if (hasPlaybackRef.current) { failoverPendingRef.current = false; return; }
      failoverPendingRef.current = false;
      setErrorMessage("");
      setActiveServerIndex(next);
      onServerChange?.(next);
    }, 2200);
  }, [onServerChange, serverCount]);

  const handleRetry = useCallback(() => {
    rotationFailuresRef.current = 0;
    serverErrorCountsRef.current = {};
    // Fresh CineSrc rotation budget too.
    cineSourceTriedRef.current = new Set();
    cineSourceStrikesRef.current = {};
    cineLastSourceRef.current = "";
    cineWindowsRef.current = 0;
    cineReloadsRef.current = 0;
    cineStateKeyRef.current = "";
    failoverPendingRef.current = false;
    userPausedRef.current = false;
    pollPrevRef.current = -1;
    pollPausedRef.current = false;
    stallStrikesRef.current = 0;
    setFatalError(false);
    setErrorMessage("");
    setIsLoading(true);
    setRetryNonce((n) => n + 1);
  }, []);

  const [iframeUrl, setIframeUrl] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [hasInitiallyLoaded, setHasInitiallyLoaded] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);
  // "False until proven" — CineSrc's autoplay embed reports cinesrc:playing
  // soon after load; browsers commonly block iframe autoplay, so assuming
  // "playing" up-front inverts our custom chrome (Space/click sends pause to an
  // already-paused player, center play affordance never shows). Start paused
  // and let the embed's events flip it.
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const volumeRef = useRef(1);
  const [isVolumeHovered, setIsVolumeHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("streamly_muted") === "true");
  const isMutedRef = useRef(false);
  const [showVolumeArc, setShowVolumeArc] = useState(false);
  const [showAspectRatioArc, setShowAspectRatioArc] = useState(false);
  const autoPlayNext = autoplay;
  const [doubleTapRipple, setDoubleTapRipple] = useState(null);
  const [showControls, setShowControls] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [centerIcon, setCenterIcon] = useState(null);
  const [sideIcon, setSideIcon] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showSubtitlesMenu, setShowSubtitlesMenu] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [fatalError, setFatalError] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [aspectRatioIndex, setAspectRatioIndex] = useState(() => {
    if (typeof window === "undefined") return 0;
    try {
      const saved = localStorage.getItem("streamly_aspectRatio");
      if (saved !== null) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= 0 && n < ASPECT_RATIOS.length) return n;
      }
    } catch {}
    // Phones: pick a smart default that matches the orientation. Landscape
    // (punch-hole / notches) → "Fill Screen (Edge-to-Edge)" so no black bars.
    // Portrait → "Fit (Original)" so the 16:9 picture isn't over-cropped.
    const isTouchish = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    const noHover = window.matchMedia?.("(hover: none)")?.matches;
    const isPhone = isTouchish && noHover && window.innerWidth < 900;
    if (isPhone) return window.innerWidth > window.innerHeight ? 1 : 0;
    return 0;
  });
  /* True once the user intentionally changes the aspect ratio — after that we
     stop auto-switching it on device rotation. */
  const aspectManuallySetRef = useRef(false);
  const [toastMessage, setToastMessage] = useState("");
  /* Restored (was deleted by 6ba4c76's dead-stream cleanup, leaving 3 live
     references → ReferenceError → "Oops! Something went wrong" on Play).
false = CineSrc renders the custom Netflix chrome; flipping this
on falls back to the provider's native controls. */
  const [useNativeControls, setUseNativeControls] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hoverTime, setHoverTime] = useState(null);
  const [hoverX, setHoverX] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [skipIntroTime, setSkipIntroTime] = useState(null);
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showUpNext, setShowUpNext] = useState(false);
  const [upNextCountdown, setUpNextCountdown] = useState(15);
  const [contextMenu, setContextMenu] = useState({ show: false, x: 0, y: 0 });
  const [isLooping, setIsLooping] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const brightnessRef = useRef(1);
  useEffect(() => { brightnessRef.current = brightness; }, [brightness]);
  const [showBrightnessArc, setShowBrightnessArc] = useState(false);
  const brightnessArcTimerRef = useRef(null);
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
  const [orientation, setOrientation] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
  );

  /* Track orientation with state so layout and aspect ratio update on device rotation */
  useEffect(() => {
    const check = () => {
      const next = window.innerWidth > window.innerHeight ? 'landscape' : 'portrait';
      setOrientation(next);
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    if (window.screen?.orientation?.addEventListener) {
      window.screen.orientation.addEventListener('change', check);
    }
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
      if (window.screen?.orientation?.removeEventListener) {
        window.screen.orientation.removeEventListener('change', check);
      }
    };
  }, []);

  /* Phones: follow the screen shape until the user picks a ratio manually.
     Rotate to landscape → edge-to-edge Fill (kills punch-hole black bars);
     rotate back to portrait → Fit so the 16:9 image isn't over-cropped. */
  useEffect(() => {
    if (aspectManuallySetRef.current) return;
    const isPhone = window.innerWidth < 900 &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
      (window.matchMedia?.('(hover: none)')?.matches ?? false);
    if (isPhone) {
      setAspectRatioIndex(window.innerWidth > window.innerHeight ? 1 : 0);
    }
  }, [orientation]);

  /* Refs */
  const iframeRef = useRef(null);
  const containerRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const clickTimeoutRef = useRef(null);
  const singleTapTimerRef = useRef(null);
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
  const isLoopingRef = useRef(isLooping);
  useEffect(() => { isLoopingRef.current = isLooping; }, [isLooping]);

  /* Persist the user's aspect-ratio choice so it survives reloads */
  useEffect(() => {
    try { localStorage.setItem("streamly_aspectRatio", String(aspectRatioIndex)); } catch {}
  }, [aspectRatioIndex]);

  const previewThumbTimerRef = useRef(null);
  const seekLongPressRef = useRef(null);

  const isCineSrc = iframeUrl.includes("cinesrc.st");
  const isVidCore = iframeUrl.includes("vidcore.io");
  const isPeachify = iframeUrl.includes("peachify.top");
  const isVidUp = iframeUrl.includes("vidup.to");
  // Providers with a real postMessage control API (see sendCommand) can run our
  // full custom chrome. Only CineSrc qualifies: reverse-engineering the compiled
  // vidcore.io bundle (chunk 281, its single message handler) proved that its
  // play/pause/seek/volume/mute commands are no-ops — only getStatus is answered.
  // So VidCore joins Peachify/VidUp as an interactive pass-through provider whose
  // own player UI must keep pointer events; our chrome would sit on top and block
  // every real control.
  const isManagedPlayer = isCineSrc;
  const supportsPlaybackRate = isCineSrc;
  const hasManagedSettings = isManagedPlayer;
  const showCustomUI = isManagedPlayer && !useNativeControls;

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
  const [subtitleOffset, setSubtitleOffset] = useState(0);
  const subtitleOffsetRef = useRef(0);
  useEffect(() => { subtitleOffsetRef.current = subtitleOffset; }, [subtitleOffset]);

  const isTvContent = movie?.isSeries || String(movie?.id || "").startsWith("tmdb-tv-");

  useEffect(() => {
    hasTriggeredNextRef.current = false;
    upNextShownRef.current = false;
    setShowUpNext(false);
    setSkipIntroTime(null);
    setShowSkipIntro(false);
    setUpNextCountdown(15);
    setHasInitiallyLoaded(false);
    setSubtitleOffset(0);
  }, [movie?.id, season, episode]);

  // Reset next-episode trigger on mount (player opened) and on unmount (player closed)
  useEffect(() => {
    hasTriggeredNextRef.current = false;
    upNextShownRef.current = false;
  }, []);

  useEffect(() => {
    rotationFailuresRef.current = 0;
    setFatalError(false);
    setActiveServerIndex(preferredServerIndex);
  }, [preferredServerIndex]);

  useEffect(() => {
    const sv = localStorage.getItem("streamly_volume");
    if (sv !== null) setVolume(parseFloat(sv));
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
      }).catch((error) => {
        logWarn("player", "Loading-tips recommendations failed — default tips kept.", { id: movie?.id, message: error?.message });
      });
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
      [controlsTimeoutRef, clickTimeoutRef, singleTapTimerRef, seekTimeoutRef,
       centerIconTimeoutRef, sideIconTimeoutRef, skipIntroTimeoutRef,
       toastTimeoutRef, volumeArcTimerRef, aspectRatioArcTimerRef, brightnessArcTimerRef,
       gestureHudTimerRef, previewThumbTimerRef, watchdogRef].forEach(r => { if (r.current) clearTimeout(r.current); });
      if (upNextIntervalRef.current) clearInterval(upNextIntervalRef.current);
      if (seekLongPressRef.current) clearInterval(seekLongPressRef.current);
    };
  }, []);

  const startTimeRef = useRef(startTime);
  useEffect(() => { startTimeRef.current = startTime; }, [startTime]);

  /* URL Generation */
  useEffect(() => {
    const gen = async () => {
      setIsLoading(true);
      setHasInitiallyLoaded(false);
      let imdbId = movie.imdbId || movie.imdb_id || movie.external_ids?.imdb_id;
      const tid = getNumericId(movie.id);
      if (!tid) { setIsLoading(false); setErrorMessage("No valid content ID."); return; }
      if (!imdbId && activeServerIndex !== 0) {
        try {
          const e = await movieService.getExternalIds(movie.id);
          if (e?.imdbId) imdbId = e.imdbId;
        } catch {}
      }
      const isTv = movie?.isSeries || String(movie?.id || "").startsWith("tmdb-tv-");
      // Reload guard: this effect also re-runs on identity-only changes (the
      // caller passes an inline onServerChange + a re-normalized movie object,
      // so every refetch/focus re-render bumps the deps). Only (re)load when
      // the CONTENT or the SERVER actually changed — otherwise the iframe
      // remounts mid-playback, re-fetching the stream from scratch.
      const key = `${tid}|${isTv ? `${season}e${episode}` : "m"}|s${activeServerIndex}|r${retryNonce}`;
      if (genKeyRef.current === key) {
        setIsLoading(false);
        return;
      }
      genKeyRef.current = key;
      // Fresh server attempt: reset "did it stream yet?" and the per-server
      // failure tally before this source starts loading.
      hasPlaybackRef.current = false;
      serverErrorCountsRef.current = {};
      userPausedRef.current = false;
      // A freshly loaded stream hasn't started yet — never inherit a playing
      // state from the previous server (it would invert play/pause, hide the
      // center play affordance, and stall the watchdog). Events drive truth.
      setIsPlaying(false);
      pollPrevRef.current = -1;
      pollPausedRef.current = false;
      stallStrikesRef.current = 0;
      // Console trace: which ordered server this session plays (Settings → Server Order).
      logDebug("player", `Loading "${movie?.title || movie?.name || tid}" via server #${activeServerIndex + 1} "${SERVERS[activeServerIndex]?.name || "unknown"}" (${serverCount} in rotation).`, { tid, serverIndex: activeServerIndex, serverCount });
      const sig = `${tid}-${isTv ? season : "m"}-${isTv ? episode : "m"}`;
      const isNew = contentSignatureRef.current !== sig;
      contentSignatureRef.current = sig;
      if (isNew) { setCurrentTime(0); setDuration(0); setBuffered(0); targetSeekTimeRef.current = null; }
      /* Iframe-based servers — resolved from the user's ordered list so the
         Settings → Server Order rotation is what actually plays. */
      let url = VideoSourceAdapter.resolveStreamUrl(SERVERS, activeServerIndex, tid, isTv ? season : null, isTv ? episode : null, imdbId, movie.title);
      const isCineServer = url.includes("cinesrc.st");
      cineActiveRef.current = isCineServer;
      if (isCineServer) {
        // Doc-aligned CineSrc customization params: seek follows the seekTime
        // preference and autoskip mirrors the Auto-Skip Intro preference
        // (TV only — movies never carry intros). autonext stays off so the
        // app's own up-next overlay owns episode advancement.
        // NOTE: the previous &lastserver+&prioritize=true pinning was REMOVED.
        // It told CineSrc to start on its last-used internal source (lisbon) and
        // stay there, which froze its own ~14-source rotation (nebula → …) —
        // the tail recorded the SAME /api/playlist/*.m3u8 502 retried twice
        // instead of CineSrc advancing past the dead source.
        url += `&seek=${Math.min(99, Math.max(1, seekStep))}`;
        if (isTv) url += `&autoskip=${autoSkipIntro ? "true" : "false"}`;
        if (isMuted) url += "&muted=true";
        if (!isNew && currentTime > 0 && !targetSeekTimeRef.current) url += `&t=${Math.floor(currentTime)}&continueprompt=false`;
        else if (isNew && startTimeRef.current > 0) url += `&t=${Math.floor(startTimeRef.current)}&continueprompt=false`;
      }
      if (isNew && startTimeRef.current > 0 && (url.includes("vidcore.io") || url.includes("peachify.top") || url.includes("vidup.to")))
        url += `&startAt=${Math.floor(startTimeRef.current)}`;
      setIframeUrl(url);
      // Dead-source watchdog. It re-arms itself so a source that never starts
      // (manifest 502, TMDB timeout inside CineSrc, or an error postMessage
      // swallowed by DataCloneError) keeps accruing strikes until we rotate
      // past it — even while CineSrc's own "fetching nebula/lisbon" loader is
      // on screen. Guards: once a source actually streams, or the rotation is
      // fully exhausted, the watchdog stands down. Stored in a REF so the
      // effect's own re-runs (parent re-renders) can never clear it: the
      // closure-local version was killed by this effect's cleanup on the FIRST
      // parent re-render and the early-return path never re-armed it, so
      // failover silently died. Only gen()'s fresh-load path clears it, plus
      // unmount.
      if (watchdogRef.current) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
      if (isCineServer) {
        /* CineSrc: per-INTERNAL-source watchdog. The embed rotates between its
           own ~14 sources (cinesrc:sourceused fires on every switch, per the
           integration docs) — each fresh source gets a short window to prove
           playback. We NEVER advance to the next provider while CineSrc is
           active (advanceServer is guarded by cineActiveRef): the embed owns
           its rotation, so the "exhausted" branch only means CineSrc itself
           couldn't produce a working stream, and the fallback UI (Retry / pick
           another server from the menu) is shown for the user to decide.
           Limits: 5 expired windows in total, 2 strikes on the same source, or
           4 distinct sources seen. One in-place reload (retryNonce) is allowed
           as a nudge when the embed looks parked on a dead source and stops
           rotating. Without this, the old 2×20s slot watchdog used to abandon
           CineSrc after a single dead internal source — exactly when its
           rotation needed a few more seconds to reach a working one. */
        const cineStateKey = `${tid}|${isTv ? `${season}e${episode}` : "m"}|s${activeServerIndex}`;
        if (cineStateKeyRef.current !== cineStateKey) {
          cineStateKeyRef.current = cineStateKey;
          cineSourceTriedRef.current = new Set();
          cineSourceStrikesRef.current = {};
          cineLastSourceRef.current = "";
          cineWindowsRef.current = 0;
          cineReloadsRef.current = 0;
        }
        const armCineWatchdog = (delay = 10000) => {
          if (watchdogRef.current) clearTimeout(watchdogRef.current);
          watchdogRef.current = setTimeout(() => {
            if (hasPlaybackRef.current || rotationFailuresRef.current >= serverCount || failoverPendingRef.current) return;
            cineWindowsRef.current += 1;
            const src = cineLastSourceRef.current || "initial";
            const nc = (cineSourceStrikesRef.current[src] || 0) + 1;
            cineSourceStrikesRef.current[src] = nc;
            const tried = cineSourceTriedRef.current.size;
            logWarn("player", `CineSrc source "${src}" didn't prove playback (window ${cineWindowsRef.current}, strike ${nc}, ${tried} internal source(s) seen).`, { tid, serverIndex: activeServerIndexRef.current, sourceId: src });
            if (cineWindowsRef.current >= 5 || nc >= 2 || tried >= 4) {
              advanceServer(`Server ${activeServerIndexRef.current + 1} (CineSrc) exhausted its sources — trying next server`);
              return;
            }
            if (cineReloadsRef.current < 1) {
              // Nudge: remount the SAME CineSrc embed so it picks its next
              // internal source (no doc command exists to force a switch).
              cineReloadsRef.current += 1;
              setErrorMessage("Switching source…");
              setTimeout(() => setErrorMessage(""), 4000);
              setRetryNonce((n) => n + 1);
              return;
            }
            armCineWatchdog();
          }, delay);
        };
        cineWatchdogArmRef.current = armCineWatchdog;
        armCineWatchdog();
      } else {
        cineWatchdogArmRef.current = null;
        const watchdogDelay = url.includes("vidcore.io") ? 20000 : 12000;
        const armWatchdog = () => {
          watchdogRef.current = setTimeout(() => {
            if (hasPlaybackRef.current || rotationFailuresRef.current >= serverCount || failoverPendingRef.current) return;
            const si = activeServerIndexRef.current;
            const nc = (serverErrorCountsRef.current[si] || 0) + 1;
            serverErrorCountsRef.current = { ...serverErrorCountsRef.current, [si]: nc };
            if (nc >= 2) {
              advanceServer(`Server ${si + 1} isn't starting — trying next server`);
            } else {
              setErrorMessage("Still loading source…");
              setTimeout(() => setErrorMessage(""), 4000);
              armWatchdog();
            }
          }, watchdogDelay);
        };
        armWatchdog();
      }
    };
    gen();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentTime/onServerChange/setupThumbnailVTT are read but must NOT drive reloads: currentTime changes every timeupdate and would re-init the whole stream, and adding the others would churn the session on every parent render.
  }, [activeServerIndex, movie, season, episode, useNativeControls, advanceServer, retryNonce]);

  const sendCommand = useCallback((c, a = []) => {
    try {
      const w = iframeRef.current?.contentWindow;
      if (!w) return;
      if (isCineSrc) {
        w.postMessage({ type: "cinesrc:command", command: c, args: a }, "https://cinesrc.st");
      }
      // Peachify/VidUp/VidCore publish no postMessage control API (vidcore's
      // handler answers only getStatus) — commands are a no-op for them.
    } catch { /* iframe cross-origin */ }
  }, [isCineSrc]);

  /* Cycle playback speed for the placeable speed pill. Lives after
     playbackRate/sendCommand so their bindings are initialized. */
  const cycleSpeed = useCallback(() => {
    const i = PLAYER_SPEEDS.indexOf(playbackRate);
    const next = PLAYER_SPEEDS[(i + 1) % PLAYER_SPEEDS.length] ?? 1;
    sendCommand("setPlaybackRate", [next]);
    setPlaybackRate(next);
  }, [playbackRate, sendCommand]);

  /* Background preview lookup for a title key — fires once, never blocks init.
     Preview thumbnails now come only from CineSrc's own player chrome. */

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
            sendCommand("getMuted");
            sendCommand("getPaused");
            sendCommand("getPlaybackRate");
            break;
          case "cinesrc:response":
            switch (d.command) {
              case "getCurrentTime":
                if (d.result != null && !targetSeekTimeRef.current && !isScrubbing) {
                  const t = d.result;
                  // Only a real advancing timeline proves playback (their
                  // "not paused" is meaningless mid-load).
                  if (t > 0.5) hasPlaybackRef.current = true;
                  setCurrentTime(t);
                  const prev = pollPrevRef.current;
                  pollPrevRef.current = t;
                  // Stall watch: CineSrc's own error postMessage can be dropped
                  // (DataCloneError on their side), so a source that dies
                  // mid-playback never emits a cinesrc:error for us to fail
                  // over on. If the timeline freezes while the stream reports
                  // paused AND the user didn't pause it, the source is dead —
                  // rotate after ~3 stalled polls (15s).
                  if (hasPlaybackRef.current && !userPausedRef.current && pollPausedRef.current && prev > -1 && !isLoadingRef.current) {
                    if (Math.abs(t - prev) < 0.25) {
                      stallStrikesRef.current += 1;
                      if (stallStrikesRef.current >= 3 && rotationFailuresRef.current < serverCount) {
                        stallStrikesRef.current = 0;
                        advanceServer("Stream stalled — trying next server");
                      }
                    } else stallStrikesRef.current = 0;
                  } else stallStrikesRef.current = 0;
                }
                break;
              case "getDuration": if (d.result) setDuration(d.result); break;
              case "getVolume": if (d.result != null) setVolume(d.result); break;
              case "getMuted": if (d.result != null) setIsMuted(d.result); break;
              case "getPaused": if (d.result != null) { pollPausedRef.current = !!d.result; setIsPlaying(!d.result); } break;
              case "getPlaybackRate": if (d.result != null) setPlaybackRate(d.result); break;
              default: break;
            }
            break;
          case "cinesrc:loadedmetadata": if (d.duration) { setDuration(d.duration); hasPlaybackRef.current = true; } break;
          case "cinesrc:waiting": setIsLoading(true); break;
          case "cinesrc:seeking": setIsLoading(true); break;
          case "cinesrc:seeked": targetSeekTimeRef.current = null; setIsLoading(false); hasPlaybackRef.current = true; break;
          case "cinesrc:playing": setIsLoading(false); setIsPlaying(true); userPausedRef.current = false; stallStrikesRef.current = 0; rotationFailuresRef.current = 0; setFatalError(false); serverErrorCountsRef.current = {}; failoverPendingRef.current = false; hasPlaybackRef.current = true; break;
          case "cinesrc:progress": if (d.buffered !== undefined) { setBuffered(d.buffered); if (d.buffered > 0) hasPlaybackRef.current = true; } break;
          case "cinesrc:timeupdate":
            // A synthetic 0-second timeupdate during load must not count as
            // playback — only a real timeline or real movement does.
            if (d.currentTime > 0.5 || d.duration > 0) hasPlaybackRef.current = true;
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
                const cue = subtitleEngineRef.current.getActiveCue(d.currentTime + subtitleOffsetRef.current);
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
            hasPlaybackRef.current = true;
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
              if (!cineSourceTriedRef.current.has(d.sourceId)) cineSourceTriedRef.current.add(d.sourceId);
              cineLastSourceRef.current = d.sourceId;
            }
            // CineSrc rotated to a new internal source (nebula → lisbon → …).
            // Treat it as a fresh start: the watchdog re-covers this source
            // until the getter poll or a play/loadedmetadata event proves it.
            hasPlaybackRef.current = false;
            stallStrikesRef.current = 0;
            pollPrevRef.current = -1;
            pollPausedRef.current = false;
            // Fresh proof window for the new internal source — the previous
            // window may be nearly spent, and without a re-arm its expiry
            // would blame the NEW source for the OLD one's dead air.
            cineWatchdogArmRef.current?.();
            logInfo("player", `CineSrc rotated to internal source "${d.sourceId || "unknown"}".`, { sourceId: d.sourceId });
            break;
          case "cinesrc:play": setIsLoading(false); setIsPlaying(true); userPausedRef.current = false; stallStrikesRef.current = 0; rotationFailuresRef.current = 0; setFatalError(false); serverErrorCountsRef.current = {}; failoverPendingRef.current = false; hasPlaybackRef.current = true; break;
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
          case "cinesrc:error": {
            setIsLoading(false);
            const cErr = d.error || {};
            const cErrType = cErr.type || "unknown";
            const cDetails = cErr.details || "";
            const cFatal = !!cErr.fatal;
            // A fatal manifest load means THIS internal source is dead — but
            // per the docs it is not the provider: CineSrc rotates between its
            // own ~14 sources. Count it against the sourceId and give the
            // embed room to rotate; only when the same source fails twice, 4
            // distinct sources have been seen, or the aggregate window budget
            // is spent do we surface the fallback UI (advanceServer is guarded
            // by cineActiveRef, so CineSrc is never abandoned mid-rotation).
            if (cFatal && (cDetails === "manifestLoadError" || (cErrType === "networkError" && cDetails))) {
              const src = cineLastSourceRef.current || "initial";
              const errs = (cineSourceStrikesRef.current[src] || 0) + 1;
              cineSourceStrikesRef.current[src] = errs;
              if (errs >= 2 || cineSourceTriedRef.current.size >= 4 || cineWindowsRef.current >= 5) {
                advanceServer(`Server ${activeServerIndexRef.current + 1} (CineSrc) couldn't start a working stream`);
                break;
              }
              setErrorMessage("Switching source…");
              setTimeout(() => setErrorMessage(""), 4000);
              cineWatchdogArmRef.current?.(6000);
              break;
            }
            if (cErrType === 'networkError' || cErrType === 'levelLoadTimeOut') break;
            const ei = activeServerIndexRef.current;
            const nc = (serverErrorCountsRef.current[ei] || 0) + 1;
            serverErrorCountsRef.current = { ...serverErrorCountsRef.current, [ei]: nc };
            if (nc >= 2) {
              advanceServer(`Server ${ei + 1} (CineSrc) is unavailable`);
            } else {
              setErrorMessage("Retrying...");
              setTimeout(() => setErrorMessage(""), 3000);
            }
            break;
          }
          default: break;
        }
      } catch { /* DataCloneError etc */ }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onServerChange/autoSkipIntro/showToast/onClose are read inside the listener but the listener is keyed to playback state; re-adding it when these parent-provided callbacks change would churn message handling on unrelated re-renders.
  }, [isCineSrc, isScrubbing, playbackRate, sendCommand, hasNextEpisode, onNextEpisode, activeServerIndex, startUpNextCountdown, onProgressUpdate, serverCount]);

  /* Managed-provider getter poll — the embed's event postMessage can be dropped
     by the browser (CineSrc's docs note their play() Promise throws DataCloneError
     when posted, so our play/pause/volume UI could drift). Getter responses carry
     plain primitives and DO arrive. Poll every 5s so we keep (a) playback proof
     for the watchdog and (b) our play/pause/volume chrome in sync with the player.
     CineSrc-only today: vidcore.io answers getStatus but nothing else, so its own
     player UI drives playback (interactive pass-through). */
  useEffect(() => {
    if (!isManagedPlayer) return;
    const tick = () => {
      sendCommand("getCurrentTime");
      sendCommand("getPaused");
    };
    const iv = setInterval(tick, 5000);
    return () => clearInterval(iv);
  }, [isManagedPlayer, sendCommand]);

  /* External-iframes PostMessage Listener (VidCore + Peachify + VidUp) — events as
     { type: "timeupdate", data: { currentTime, duration, percent } } (VidCore),
     { type: "PLAYER_EVENT", data: { event: "play"|"pause"|"seeked"|"ended"|"timeupdate"|"playerstatus", ... }} (all),
     or { type: "MEDIA_DATA", data: { ... } } (Peachify/VidUp full progress payload for Continue Watching). */
  useEffect(() => {
    if (!isVidCore && !isPeachify && !isVidUp) return;
    const h = (ev) => {
      try {
        if ((ev.origin !== "https://vidcore.io" && ev.origin !== "https://peachify.top" && ev.origin !== "https://vidup.to") || !ev.data || typeof ev.data !== "object") return;
        const d = ev.data;
        let etype = d.type;
        let payload = d.data;
        if (etype === "PLAYER_EVENT" && payload && typeof payload === "object") {
          etype = payload.event;
        }
        if (typeof etype !== "string" || !etype) return;
        switch (etype) {
          case "play": setIsLoading(false); setIsPlaying(true); userPausedRef.current = false; stallStrikesRef.current = 0; rotationFailuresRef.current = 0; setFatalError(false); serverErrorCountsRef.current = {}; failoverPendingRef.current = false; hasPlaybackRef.current = true; break;
          case "pause": setIsPlaying(false); setIsLoading(false); break;
          case "seeked": targetSeekTimeRef.current = null; setIsLoading(false); hasPlaybackRef.current = true; break;
          case "timeupdate": {
            if ((payload?.currentTime ?? 0) > 0.5 || (payload?.duration ?? 0) > 0) hasPlaybackRef.current = true;
            if (isLoadingRef.current) setIsLoading(false);
            if (!isScrubbing && !targetSeekTimeRef.current) {
              const t = payload?.currentTime;
              const dur = payload?.duration;
              if (t != null) setCurrentTime(t);
              if (dur) setDuration(dur);
              // Debounce progress writes to Firestore — max once per 10 seconds
              const now = Date.now();
              if (now - lastProgressWriteRef.current > 10000) {
                lastProgressWriteRef.current = now;
                onProgressUpdate?.(t, dur);
              }
              if (!isScrubbing) setIsLoading(false);
              if (dur > 0 && t >= dur - 30 && hasNextEpisode && !upNextShownRef.current && !isLoopingRef.current) startUpNextCountdown();
              if (dur > 0 && t >= dur - 1 && hasNextEpisode && onNextEpisode && !hasTriggeredNextRef.current && !isLoopingRef.current) {
                hasTriggeredNextRef.current = true;
                clearInterval(upNextIntervalRef.current);
                setShowUpNext(false);
                onNextEpisode();
              }
            }
            break;
          }
          case "ended":
            hasPlaybackRef.current = true;
            if (isLoopingRef.current) { sendCommand("seek", [0]); return; }
            if (hasNextEpisode && !hasTriggeredNextRef.current) {
              hasTriggeredNextRef.current = true;
              clearInterval(upNextIntervalRef.current);
              setShowUpNext(false);
              onNextEpisode();
            }
            break;
          case "playerstatus":
            if (payload?.playing !== undefined) setIsPlaying(payload.playing);
            if (payload?.muted !== undefined) setIsMuted(payload.muted);
            if (payload?.volume !== undefined) setVolume(payload.volume);
            if (payload?.currentTime != null) setCurrentTime(payload.currentTime);
            if (payload?.duration != null) setDuration(payload.duration);
            setIsLoading(false);
            break;
          case "MEDIA_DATA":
            // Peachify/VidUp Continue Watching payload — store wholesale for quick restore
            try {
              const mediaId = payload?.id ?? payload?.tmdbId;
              if (mediaId != null) {
                const key = ev.origin === "https://vidup.to" ? "vidUpProgress" : "peachifyProgress";
                const curr = JSON.parse(localStorage.getItem(key) || "{}");
                curr[mediaId] = payload;
                localStorage.setItem(key, JSON.stringify(curr));
              }
            } catch { /* localStorage full / blocked */ }
            break;
          default: break;
        }
      } catch { /* DataCloneError etc */ }
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onProgressUpdate (inline parent prop) must not re-attach the listener on every parent render; playback/mute state flows one-way via refs where needed.
  }, [isVidCore, isPeachify, isVidUp, isScrubbing, hasNextEpisode, onNextEpisode, startUpNextCountdown, sendCommand]);

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
    if (isPlaying) {
      sendCommand("pause");
      userPausedRef.current = true;
      setIsPlaying(false);
      setShowControls(true);
      if (showCustomUI) triggerCenterIcon("pause");
    } else {
      sendCommand("play");
      userPausedRef.current = false;
      setIsPlaying(true);
      if (showCustomUI) triggerCenterIcon("play");
      setShowPausedInfo(false);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3500);
    }
  }, [isPlaying, sendCommand, triggerCenterIcon, showCustomUI]);

  const changeVolume = useCallback((nv) => {
    const v = Math.max(0, Math.min(nv, 1));
    setVolume(v);
    volumeRef.current = v;
    localStorage.setItem("streamly_volume", v.toString());
    sendCommand("setVolume", [v]);
    if (v > 0 && isMuted) {
      setIsMuted(false);
      isMutedRef.current = false;
      localStorage.setItem("streamly_muted", "false");
    }
    if (isTouch) {
      setGestureType("volume");
      setGestureValue(v);
      if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
      gestureHudTimerRef.current = setTimeout(() => setGestureType(null), 1000);
    } else {
      /* Show the circular arc volume HUD on desktop */
      setShowVolumeArc(true);
      if (volumeArcTimerRef.current) clearTimeout(volumeArcTimerRef.current);
      volumeArcTimerRef.current = setTimeout(() => setShowVolumeArc(false), 1200);
    }
  }, [isMuted, sendCommand, isTouch]);

  const toggleMute = useCallback((e) => {
    if (e) e.stopPropagation();
    const n = !isMuted;
    setIsMuted(n);
    isMutedRef.current = n;
    localStorage.setItem("streamly_muted", n.toString());
    if (n) {
      sendCommand("setVolume", [0]);
    } else {
      const restoreVol = volume <= 0 ? 0.7 : volume;
      if (volume <= 0) {
        setVolume(restoreVol);
        volumeRef.current = restoreVol;
        localStorage.setItem("streamly_volume", restoreVol.toString());
      }
      sendCommand("setVolume", [restoreVol]);
    }
    if (isTouch) {
      setGestureType("volume");
      setGestureValue(n ? 0 : volume);
      if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
      gestureHudTimerRef.current = setTimeout(() => setGestureType(null), 1000);
    } else {
      setShowVolumeArc(true);
      if (volumeArcTimerRef.current) clearTimeout(volumeArcTimerRef.current);
      volumeArcTimerRef.current = setTimeout(() => setShowVolumeArc(false), 1200);
    }
  }, [isMuted, volume, sendCommand, isTouch]);

  const seekRelative = useCallback((s, showSideFeedback = true) => {
    const base = targetSeekTimeRef.current ?? currentTime;
    const nt = Math.max(0, Math.min(base + s, duration || Infinity));
    targetSeekTimeRef.current = nt;
    setCurrentTime(nt);
    sendCommand("seek", [nt]);
    seekAccumulatorRef.current += s;
    const a = seekAccumulatorRef.current;
    if (showSideFeedback) {
      if (a > 0) triggerSideIcon("forward", `+${a}s`);
      else if (a < 0) triggerSideIcon("backward", `${a}s`);
    }
    if (seekTimeoutRef.current) clearTimeout(seekTimeoutRef.current);
    seekTimeoutRef.current = setTimeout(() => { seekAccumulatorRef.current = 0; }, 1000);
  }, [currentTime, duration, sendCommand, triggerSideIcon]);

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

  const handleSubtitleLanguageSelect = async (link, silent = false) => {
    if (!link) return;
    const lo = availableSubtitleLangs.find((l) => l.downloadLink === link);
    if (!lo) return;
    if (!silent) showToast(`Downloading ${lo.language}...`);
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
          if (!silent) showToast(`${lo.language} loaded!`);
        } else { if (!silent) showToast("Empty file"); }
      } else { if (!silent) showToast("Download failed"); }
    } catch { if (!silent) showToast("Error"); }
    finally { setIsFetchingSubtitles(false); }
  };
  const handleSubtitleLanguageSelectRef = useRef(handleSubtitleLanguageSelect);
  handleSubtitleLanguageSelectRef.current = handleSubtitleLanguageSelect;

  useEffect(() => {
    if (autoSubtitles && !hasSubtitles && availableSubtitleLangs?.length) {
      const match = availableSubtitleLangs.find(
        (l) =>
          l.code?.toLowerCase() === defaultLanguage?.toLowerCase() ||
          l.language?.toLowerCase() === defaultLanguage?.toLowerCase() ||
          (defaultLanguage === "en" && l.language?.toLowerCase().includes("english")),
      ) || availableSubtitleLangs[0];
      if (match?.downloadLink) {
        handleSubtitleLanguageSelectRef.current(match.downloadLink, true);
      }
    }
  }, [availableSubtitleLangs, autoSubtitles, defaultLanguage, hasSubtitles]);

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
    sendCommand("seek", [nt]);
  }, [duration, sendCommand]);

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

  const triggerBrightnessCycle = useCallback(() => {
    const levels = [1, 1.2, 1.4, 0.6, 0.8];
    const curr = brightnessRef.current;
    const matchIdx = levels.findIndex((l) => Math.abs(l - curr) < 0.08);
    const next = levels[(matchIdx + 1) % levels.length] || 1;
    setBrightness(next);
    brightnessRef.current = next;
    setShowBrightnessArc(true);
    if (brightnessArcTimerRef.current) clearTimeout(brightnessArcTimerRef.current);
    brightnessArcTimerRef.current = setTimeout(() => setShowBrightnessArc(false), 1200);
  }, []);

  /* Keyboard Shortcuts */
  useEffect(() => {
    if (!isManagedPlayer) return;
    const h = (e) => {
      if (document.activeElement?.tagName === "input" || e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "f": e.preventDefault(); toggleFullscreen(); break;
        case "m": e.preventDefault(); toggleMute(); break;
        case "arrowright": case "l": case ">": case ".": e.preventDefault(); seekRelative(seekStepRef.current); break;
        case "arrowleft": case "j": case "<": case ",": e.preventDefault(); seekRelative(-seekStepRef.current); break;
        case "arrowup": e.preventDefault(); changeVolume(volumeRef.current + 0.1); break;
        case "arrowdown": e.preventDefault(); changeVolume(volumeRef.current - 0.1); break;
        case "a": e.preventDefault(); aspectManuallySetRef.current = true; setAspectRatioIndex((p) => (p + 1) % ASPECT_RATIOS.length); setShowAspectRatioArc(true); if (aspectRatioArcTimerRef.current) clearTimeout(aspectRatioArcTimerRef.current); aspectRatioArcTimerRef.current = setTimeout(() => setShowAspectRatioArc(false), 1200); break;
        case "b": e.preventDefault(); triggerBrightnessCycle(); break;
        case "?": e.preventDefault(); setShowShortcuts((p) => !p); break;
        case "escape": setShowShortcuts(false); setShowSettings(false); setShowSubtitlesMenu(false); break;
        default: break;
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isManagedPlayer, togglePlay, toggleFullscreen, toggleMute, seekRelative, changeVolume, triggerBrightnessCycle]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !showCustomUI) return;
    const h = (e) => {
      if (showSettings || showSubtitlesMenu || showShortcuts) return;
      e.preventDefault();
      changeVolume(volumeRef.current + (e.deltaY < 0 ? 0.05 : -0.05));
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [showCustomUI, changeVolume, showSettings, showSubtitlesMenu, showShortcuts]);

  /* ═══ Touch Gestures — VLC/MX Player Style ═══════════════════════════════
     LEFT 35%:   swipe ↑↓ = brightness
     CENTER 30%: swipe ←→ = seek, single-tap = toggle controls, double-tap = seek/play
     RIGHT 35%:  swipe ↑↓ = volume
     ══════════════════════════════════════════════════════════════════════ */
  const handleTouchStart = useCallback((e) => {
    if (!isTouch || !showCustomUI || isScreenLocked) return;
    /* Pinch detection: two fingers */
    if (e.touches.length === 2) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartFullscreenRef.current = isFullscreen;
      gestureStartRef.current = null;
      gestureLockRef.current = null;
      return;
    }
    if (e.touches.length > 1) return;
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
      zone: relX < 0.35 ? 'left' : relX > 0.65 ? 'right' : 'center',
      startVolume: isMutedRef.current ? 0 : volumeRef.current,
      startBrightness: brightnessRef.current,
      hasMoved: false,
    };
    gestureLockRef.current = null;
  }, [isTouch, showCustomUI, isFullscreen, isScreenLocked]);

  const handleTouchMove = useCallback((e) => {
    if (!isTouch || !showCustomUI || isScreenLocked) return;
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
    if (!gestureStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - gestureStartRef.current.x;
    const dy = gestureStartRef.current.y - touch.clientY; /* positive = up */
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    const r = containerRef.current?.getBoundingClientRect();
    if (!r) return;

    /* Lock gesture direction after 12px of movement */
    if (!gestureLockRef.current && (absDx > 12 || absDy > 12)) {
      if (absDx > absDy) {
        gestureLockRef.current = 'horizontal'; /* seek */
      } else {
        gestureLockRef.current = 'vertical'; /* brightness or volume */
      }
      gestureStartRef.current.hasMoved = true;
    }

    if (!gestureLockRef.current) return;
    e.preventDefault(); /* Prevent scrolling */
    gestureStartRef.current.hasMoved = true;

    if (gestureLockRef.current === 'vertical') {
      const zone = gestureStartRef.current.zone;
      // Proportional vertical sensitivity: full scale takes 70% player height or min 220px
      const sensitivity = Math.max(220, r.height * 0.7);
      const delta = dy / sensitivity;

      if (zone === 'right') {
        /* Volume: calculated cleanly from startVolume without compounding */
        const newVol = Math.max(0, Math.min(1, gestureStartRef.current.startVolume + delta));
        setVolume(newVol);
        volumeRef.current = newVol;
        localStorage.setItem('streamly_volume', newVol.toString());
        sendCommand('setVolume', [newVol]);
        if (newVol > 0 && isMutedRef.current) {
          setIsMuted(false);
          isMutedRef.current = false;
          localStorage.setItem('streamly_muted', 'false');
        }
        setGestureType('volume');
        setGestureValue(newVol);
      } else if (zone === 'left') {
        /* Brightness: calculated cleanly from startBrightness without compounding */
        // Span is 0.2 to 1.5 = 1.3
        const newBright = Math.max(0.2, Math.min(1.5, gestureStartRef.current.startBrightness + delta * 1.3));
        setBrightness(newBright);
        brightnessRef.current = newBright;
        setGestureType('brightness');
        setGestureValue((newBright - 0.2) / 1.3);
      }
    } else if (gestureLockRef.current === 'horizontal') {
      /* Seek — swipe right = forward, left = backward */
      const seekSensitivity = Math.max(220, r.width * 0.45);
      const seekAmount = (dx / seekSensitivity) * 30; /* 30s per 45% screen width */
      setGestureType('seek');
      setSeekDelta(seekAmount);
    }

    if (gestureHudTimerRef.current) clearTimeout(gestureHudTimerRef.current);
    gestureHudTimerRef.current = setTimeout(() => {
      setGestureType(null);
      setSeekDelta(0);
    }, 800);
  }, [isTouch, showCustomUI, sendCommand, toggleFullscreen, isScreenLocked]);

  const handleTouchEnd = useCallback((e) => {
    lastTouchEndRef.current = Date.now();
    if (gestureLockRef.current === 'horizontal' && gestureStartRef.current) {
      /* Apply seek on release */
      const touch = e.changedTouches[0];
      const dx = touch.clientX - gestureStartRef.current.x;
      const r = containerRef.current?.getBoundingClientRect();
      if (r) {
        const seekSensitivity = Math.max(220, r.width * 0.45);
        const seekAmount = (dx / seekSensitivity) * 30;
        if (Math.abs(seekAmount) > 2) seekRelative(Math.round(seekAmount), false);
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

  /* Auto-hide controls — ignore synthetic mouse events on touch devices */
  const handleMouseMove = useCallback(() => {
    if (isTouch || Date.now() - lastTouchEndRef.current < 600) return;
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying && !showSettings && !showSubtitlesMenu && !isLoading && !isScrubbing) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
    }
  }, [isPlaying, showSettings, showSubtitlesMenu, isLoading, isScrubbing, isTouch]);

  /* Touch single-tap to show/hide controls, double-tap to seek */
  const lastTapRef = useRef(0);
  const handleTouchOverlay = useCallback((e) => {
    if (isLoading) return;
    if (isScreenLocked) return;
    // Bail out if user was swiping (volume, brightness, seek) or pinching
    if (gestureStartRef.current?.hasMoved || gestureLockRef.current !== null || pinchStartDistRef.current) {
      return;
    }
    const now = Date.now();
    lastTouchEndRef.current = now; // Suppress synthetic desktop mousemove/clicks
    const tapGap = now - lastTapRef.current;

    if (tapGap < 280 && tapGap > 0) {
      // Double tap detected: cancel pending single-tap toggle and perform seek
      if (singleTapTimerRef.current) {
        clearTimeout(singleTapTimerRef.current);
        singleTapTimerRef.current = null;
      }
      lastTapRef.current = 0; // Prevent triple-tap retrigger
      e.preventDefault();
      const touch = e.changedTouches[0];
      const r = containerRef.current?.getBoundingClientRect();
      if (!r) return;
      const pct = (touch.clientX - r.left) / r.width;
      if (pct < 0.35) {
        seekRelative(-seekStepRef.current);
        setDoubleTapRipple({ side: "left", id: now });
        setTimeout(() => setDoubleTapRipple(null), 500);
      } else if (pct > 0.65) {
        seekRelative(seekStepRef.current);
        setDoubleTapRipple({ side: "right", id: now });
        setTimeout(() => setDoubleTapRipple(null), 500);
      } else {
        togglePlay();
      }
    } else {
      // Single tap: schedule toggle with 250ms debounce so double-tap can cancel it
      lastTapRef.current = now;
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
      singleTapTimerRef.current = setTimeout(() => {
        singleTapTimerRef.current = null;
        // If a popup menu is open, dismiss it first
        if (showSettings || showSubtitlesMenu || showShortcuts) {
          setShowSettings(false);
          setShowSubtitlesMenu(false);
          setShowShortcuts(false);
          return;
        }
        setShowControls((prev) => {
          const next = !prev;
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
          if (next && isPlaying && !isLoading && !isScrubbing) {
            controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 4500);
          }
          return next;
        });
      }, 250);
    }
  }, [isLoading, isScreenLocked, seekRelative, togglePlay, showSettings, showSubtitlesMenu, showShortcuts, isPlaying, isScrubbing]);

  const pp = duration > 0 ? Math.max(0, Math.min((currentTime / duration) * 100, 100)) : 0;
  const bp = duration > 0 ? Math.max(0, Math.min((buffered / duration) * 100, 100)) : 0;
  const controlsVisible = (showControls || isScrubbing) && !isLoading && !isScreenLocked;
  const effVolume = isMuted ? 0 : volume;

  /* ═══════════════════════════════════════════════════════════════
     UP-CENTER HUD SYSTEM — volume / brightness / aspect indicators
     pin to the TOP-CENTER of the player: their wrapper covers the
     whole player (inset: 0) as a flex column with
     justifyContent: flex-start + alignItems: center, so the pill is
     always horizontally centered and top-anchored. The top inset is
     a fraction of the measured player height (8%) with a 72px floor
     so it clears the top bar on every screen; before the container
     is measured we fall back to a viewport-relative clamp().
     ═══════════════════════════════════════════════════════════════ */
  const { w: playerW, h: playerH } = useContainerSize(containerRef);
  const netflixHudTop = playerH > 0
    ? `${Math.max(playerH * 0.08, 72).toFixed(1)}px`
    : 'clamp(72px, 18vh, 130px)';
  const selectedAspect = ASPECT_RATIOS[aspectRatioIndex] || ASPECT_RATIOS[0];

  /* Aspect ratio calculation — dynamic Edge-to-Edge punch-hole camera coverage.
     ═══════════════════════════════════════════════════════════ */
  const isLandscape = playerW > playerH;
  const currentRatio = playerW && playerH ? playerW / playerH : 16 / 9;
  const targetVideoRatio = 16 / 9;
  let mediaTransform = 'none';

  if (selectedAspect.id === 'fit') {
    mediaTransform = 'none';
  } else if (selectedAspect.id === 'fill') {
    // Edge-to-Edge: every pixel of a punch-hole / notch phone gets picture.
    if (isLandscape) {
      const scale = Math.max(1, currentRatio / targetVideoRatio);
      mediaTransform = `scale(${scale.toFixed(4)})`;
    } else {
      const scale = Math.max(1, targetVideoRatio / currentRatio);
      mediaTransform = `scale(${Math.min(scale, 2.4).toFixed(4)})`;
    }
  } else if (selectedAspect.id === 'zoom') {
    const baseZoom = selectedAspect.scale || 1.25;
    const dynamicZoom = isLandscape ? Math.max(baseZoom, currentRatio / targetVideoRatio) : baseZoom;
    mediaTransform = `scale(${dynamicZoom.toFixed(4)})`;
  } else if (selectedAspect.id === 'stretch') {
    if (isLandscape && currentRatio > targetVideoRatio) {
      const scaleX = currentRatio / targetVideoRatio;
      mediaTransform = `scaleX(${scaleX.toFixed(4)}) scaleY(1)`;
    } else if (!isLandscape && currentRatio < targetVideoRatio) {
      const scaleY = targetVideoRatio / currentRatio;
      mediaTransform = `scaleX(1) scaleY(${Math.min(scaleY, 2.5).toFixed(4)})`;
    } else {
      mediaTransform = 'none';
    }
  } else if (selectedAspect.scale) {
    mediaTransform = `scale(${selectedAspect.scale})`;
  }

/* ── NETFLIX render — single fixed design, black + #E50914 ──────────── */
  return (
    <div
      ref={containerRef}
      data-player-skin="netflix"
      className={`streamly-player${isTouch ? ' streamly-player--touch' : ''}${isFullscreen ? ' streamly-player--fullscreen' : ''}`}
      style={{
        position: isFullscreen ? 'fixed' : 'relative',
        width: '100%',
        height: isFullscreen ? '100dvh' : '100%',
        maxWidth: isFullscreen ? undefined : '100%',
        minHeight: isTouch && !isFullscreen ? 0 : undefined,
        maxHeight: isFullscreen ? '100dvh' : '100%',
        background: '#000',
        borderRadius: isFullscreen || isTouch ? 0 : 12,
        inset: isFullscreen ? '0' : undefined,
        zIndex: isFullscreen ? 9999 : undefined,
        overflow: 'hidden',
        cursor: controlsVisible || !showCustomUI ? 'default' : 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'manipulation',
        WebkitTouchCallout: 'none',
        /* Safe areas protect controls while media reaches the physical edge */
        '--sat': 'env(safe-area-inset-top, 0px)',
        '--sab': 'env(safe-area-inset-bottom, 0px)',
        '--sal': 'env(safe-area-inset-left, 0px)',
        '--sar': 'env(safe-area-inset-right, 0px)',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => {
        if (isPlaying && !showSettings && !showSubtitlesMenu && !isLoading && !isScrubbing)
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
      {/* IFRAME */}
      {iframeUrl && (
        <iframe
          ref={iframeRef}
          key={`iframe-${activeServerIndex}-${useNativeControls}`}
          src={iframeUrl}
          title="Video player"
          style={{
            position: 'absolute', inset: 0, display: 'block', width: '100%', height: '100%', border: 'none', background: '#000', overflow: 'visible',
            pointerEvents: isCineSrc ? 'auto' : (showCustomUI ? 'none' : 'auto'),
            opacity: hasInitiallyLoaded ? 1 : 0,
            transition: 'opacity 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: brightness !== 1 ? `brightness(${brightness})` : undefined,
            transform: mediaTransform,
            transformOrigin: 'center center',
          }}
          allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
          onLoad={() => {
            // Frame document loaded → hide our overlay so the provider's own
            // player UI (and CineSrc's "fetching nebula/lisbon" loader) shows
            // through. Dead-source failover no longer depends on our spinner —
            // the re-arming hasPlaybackRef watchdog in the URL-generation
            // effect rotates past sources that never actually start streaming.
            setIsLoading(false);
            setHasInitiallyLoaded(true);
            rotationFailuresRef.current = 0;
            setFatalError(false);
            serverErrorCountsRef.current = {};
          }}
        />
      )}

      {/* CineSrc interaction overlay — handles mouse (desktop) and touch (mobile) */}
      {showCustomUI && (
        <div
          onMouseMove={handleMouseMove}
          onClick={(e) => {
            e.stopPropagation();
            // Skip if a touch just handled this (prevents double-fire on mobile)
            if (Date.now() - lastTouchEndRef.current < 500) return;
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
          position: "absolute", bottom: controlsVisible ? "calc(clamp(60px, 12vw, 100px) + var(--sab))" : "calc(clamp(20px, 4vw, 36px) + var(--sab))",
          left: 0, right: 0, display: "flex", justifyContent: "center",
          pointerEvents: "none", zIndex: 15,
          transition: "bottom 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSubtitleCue.text}
              initial={{ opacity: 0, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              style={{
                color: subtitleColor || "#fff",
                padding: isTouch ? "2px 8px" : `${R.padSmall} ${R.padLarge}`,
                fontSize: `calc(clamp(15px, 2.5vw, 24px) * ${(subtitleSize || 100) / 100})`,
                fontFamily: subtitleFont === "montserrat" ? "'Montserrat', sans-serif" : (subtitleFont === "netflix" ? "'Arial', sans-serif" : "'Inter', sans-serif"),
                lineHeight: 1.35,
                fontWeight: 600,
                textAlign: "center",
                maxWidth: "88%",
                whiteSpace: "pre-wrap",
                textShadow:
                  "0 2px 4px rgba(0,0,0,0.95), 0 0 2px #000, 0 0 12px rgba(0,0,0,0.95), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
              }}
            >
              {activeSubtitleCue.text}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Bottom vignette — Netflix red-fade scrim */}
      {showCustomUI && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 11, pointerEvents: "none",
          background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.4) 15%, transparent 35%)",
          transition: "opacity 0.4s", opacity: controlsVisible ? 1 : 0,
        }} />
      )}

      {/* ═══ CENTER PLAY/PAUSE ═══════════════════════════════════ */}
      <AnimatePresence>
        {showCustomUI && !isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: controlsVisible ? 0 : (isPlaying ? 0 : 0.85) }}
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
                  exit={{ opacity: 0, scale: 1.4 }}
                  transition={{ type: "spring", stiffness: 420, damping: 24 }}
                  style={{
                    width: "clamp(56px, 10vw, 76px)", height: "clamp(56px, 10vw, 76px)", borderRadius: "50%",
                    background: "#E50914",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "none",
                    boxShadow: "0 8px 36px rgba(0,0,0,0.6), 0 0 24px rgba(229,9,20,0.5)",
                  }}
                >
                  {/* Expanding arc ring — Netflix red pulse */}
                  <motion.div
                    initial={{ opacity: 0.6, scale: 0.8 }}
                    animate={{ opacity: 0, scale: 2 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    style={{ position: "absolute", inset: -2 }}
                  >
                    <svg width="76" height="76" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="38" cy="38" r="34" fill="none" stroke="rgba(229,9,20,0.5)" strokeWidth="2" strokeLinecap="round"
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
                  animate={{ opacity: 0.7, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={SPRING}
                  style={{
                    width: "clamp(52px, 9vw, 68px)", height: "clamp(52px, 9vw, 68px)", borderRadius: "50%",
                    background: "#E50914",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    border: "none",
                    boxShadow: "0 8px 30px rgba(0,0,0,0.6), 0 0 20px rgba(229,9,20,0.4)",
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
        {showPausedInfo && showCustomUI && !isPlaying && controlsVisible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute", inset: 0, zIndex: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.88) 100%)",
              pointerEvents: "none",
            }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0 }}
              transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              style={{
                display: "flex", gap: isTouch ? "clamp(12px, 3vw, 24px)" : "clamp(20px, 4vw, 36px)",
                alignItems: "center", maxWidth: "min(640px, 88%)", padding: isTouch ? "0 clamp(12px, 3vw, 24px)" : `0 ${R.padLarge}`,
              }}
            >
              {(movie?.posterUrl || thumbnailUrl) && (
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  style={{
                    width: isTouch ? "clamp(60px, 16vw, 110px)" : "clamp(80px, 14vw, 150px)", aspectRatio: "2/3",
                    borderRadius: 8, overflow: "hidden", flexShrink: 0,
                    boxShadow: "0 24px 64px rgba(0,0,0,0.85)",
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
                <div style={{ display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)", marginBottom: isTouch ? 6 : 10 }}>
                  <div style={{
                    width: "clamp(20px, 3.5vw, 28px)", height: "clamp(20px, 3.5vw, 28px)", borderRadius: "50%",
                    background: "rgba(255,255,255,0.06)", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}>
                    <Pause size={isTouch ? 10 : 12} fill="rgba(255,255,255,0.8)" color="rgba(255,255,255,0.8)" />
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
                      maxHeight: isTouch ? "clamp(32px, 6vw, 56px)" : "clamp(40px, 8vw, 72px)", width: "auto",
                      maxWidth: "min(380px, 72vw)", objectFit: "contain",
                      filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.95))",
                      marginBottom: isTouch ? 4 : 8,
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
                  fontSize: isTouch ? "clamp(1.1rem, 2.6vw, 1.8rem)" : "clamp(1.3rem, 3.2vw, 2.2rem)", lineHeight: 1.05,
                  marginBottom: isTouch ? 6 : 8, letterSpacing: "-0.03em",
                  display: movie?.logoUrl ? 'none' : 'block',
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                }}>
                  {movie?.title || movie?.name}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: isTouch ? "4px 8px" : "clamp(6px, 1.5vw, 10px)", marginBottom: isTouch ? 6 : 12, flexWrap: "wrap" }}>
                  {movie?.releaseYear && <span style={{ color: "rgba(255,255,255,0.5)", fontSize: isTouch ? R.fontMedium : R.fontLarge, fontWeight: 600, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>{movie.releaseYear}</span>}
                  {movie?.imdbRating > 0 && <span style={{ color: "#FBBF24", fontSize: isTouch ? R.fontMedium : R.fontLarge, fontWeight: 700 }}>★ {movie.imdbRating}</span>}
                  {isTvContent && season && <span style={{ color: "rgba(255,255,255,0.7)", fontSize: isTouch ? R.fontMedium : R.fontLarge, fontWeight: 700, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>S{season} E{episode}</span>}
                  {movie?.duration && <span style={{ color: "rgba(255,255,255,0.4)", fontSize: isTouch ? R.fontMedium : R.fontLarge, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>{movie.duration}</span>}
                  {movie?.genres?.slice(0, 3).map((g, i) => (
                    <span key={i} style={{ color: "rgba(255,255,255,0.4)", fontSize: R.fontSmall, fontWeight: 600, background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: 6, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>{g}</span>
                  ))}
                </div>
                {(movie?.longDescription || movie?.description || movie?.overview) && (
                  <div style={{
                    color: "rgba(255,255,255,0.55)", fontSize: "clamp(0.75rem, 1.2vw, 0.92rem)",
                    lineHeight: 1.55, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    display: (playerH && playerH < 440) ? "none" : "-webkit-box",
                    WebkitLineClamp: isTouch ? 2 : 4,
                    WebkitBoxOrient: "vertical", overflow: "hidden",
                  }}>
                    {movie?.longDescription || movie?.description || movie?.overview}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading — blurred poster backdrop + Netflix arc spinner */}
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
            {/* Blurred poster backdrop */}
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
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* All-servers-unavailable overlay — shown after a full rotation of
          dead sources instead of a silent black screen. */}
      <AnimatePresence>
        {fatalError && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{
              position: "absolute", inset: 0, zIndex: 60,
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", gap: "clamp(10px, 2vw, 14px)",
              background: "radial-gradient(ellipse at 50% 45%, rgba(20,20,28,0.55) 0%, rgba(0,0,0,0.85) 100%)",
              backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
              padding: "0 20px", textAlign: "center",
            }}
          >
            <WifiOff size={40} color="#fff" style={{ opacity: 0.9 }} />
            <div style={{
              color: "#fff", fontSize: "clamp(1.1rem, 3vw, 1.6rem)", fontWeight: 700,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
              letterSpacing: "-0.02em",
            }}>
              All servers are currently unreachable
            </div>
            <div style={{
              color: "rgba(255,255,255,0.55)", fontSize: R.fontMedium, fontWeight: 500,
              maxWidth: 420, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
            }}>
              The stream couldn't start. Retry, or pick a different server from the menu.
            </div>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleRetry}
              style={{
                marginTop: 8, display: "flex", alignItems: "center", gap: 8,
                background: "#E50914", color: "#fff", border: "none",
                padding: "12px 28px", borderRadius: 8, cursor: "pointer",
                fontSize: R.fontMedium, fontWeight: 600, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              }}
            >
              <RefreshCw size={16} /> Retry
            </motion.button>
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
              background: "rgba(229,9,20,0.9)", color: "#fff",
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

      {/* Toast — Netflix pill */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: -8, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -5, x: "-50%" }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute", top: 16, left: "50%",
              background: "rgba(0,0,0,0.9)", color: "#fff",
              padding: `${R.padSmall} clamp(10px, 2vw, 16px)`, borderRadius: 4,
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.6)",
              zIndex: 62, fontWeight: 600, fontSize: R.fontSmall, pointerEvents: "none",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
            }}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ VOLUME HUD ═══ */}
      <AnimatePresence>
        {showVolumeArc && !isTouch && (
          <NetflixVolumeHUD effVolume={effVolume} isMuted={isMuted} volume={volume} top={netflixHudTop} />
        )}
      </AnimatePresence>

      {/* ═══ BRIGHTNESS HUD (Desktop) ═══ */}
      <AnimatePresence>
        {showBrightnessArc && !isTouch && (
          <NetflixBrightnessHUD brightness={brightness} top={netflixHudTop} />
        )}
      </AnimatePresence>

      {/* ═══ ASPECT RATIO HUD ═══ */}
      <AnimatePresence>
        {showAspectRatioArc && (
          <NetflixAspectHUD aspectRatioIndex={aspectRatioIndex} top={netflixHudTop} />
        )}
      </AnimatePresence>

      {/* ═══ TOUCH GESTURE HUDS — Netflix Red ══════════════════════════════ */}
      {/* Brightness vertical bar — left edge */}
      <AnimatePresence>
        {gestureType === 'brightness' && isTouch && (
          <motion.div
            key="brightness-bar"
            initial={{ opacity: 0, x: -28, y: "-50%" }}
            animate={{ opacity: 1, x: 0, y: "-50%" }}
            exit={{ opacity: 0, x: -24, y: "-50%" }}
            transition={SPRING_SNAPPY}
            style={{
              position: 'absolute',
              left: 'calc(clamp(14px, 3.5vw, 28px) + var(--sal))',
              top: '50%',
              width: 44,
              height: 'clamp(170px, 42vh, 230px)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 0 10px',
              zIndex: 65, pointerEvents: 'none',
              background: 'rgba(20,20,20,0.96)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 20px 48px rgba(0,0,0,0.7)',
              overflow: 'hidden',
            }}
          >
            {/* Sun icon at top with glow */}
            <motion.div
              animate={{ scale: [0.95, 1.05, 1] }}
              transition={{ duration: 0.3 }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#E50914" strokeWidth="2.2" strokeLinecap="round" style={{ filter: 'drop-shadow(0 0 6px #E50914)' }}>
                <circle cx="12" cy="12" r="5"/>
                <line x1="12" y1="1" x2="12" y2="3"/>
                <line x1="12" y1="21" x2="12" y2="23"/>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                <line x1="1" y1="12" x2="3" y2="12"/>
                <line x1="21" y1="12" x2="23" y2="12"/>
              </svg>
            </motion.div>
            {/* Track */}
            <div style={{
              position: 'relative', width: 6, flex: 1, margin: '10px 0',
              background: 'rgba(255,255,255,0.12)', borderRadius: 3,
              overflow: 'hidden',
            }}>
              {/* Fill */}
              <motion.div
                animate={{ height: `${Math.max(0, Math.min(100, Math.round(gestureValue * 100)))}%` }}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: 'linear-gradient(to top, #b00710, #E50914)',
                  borderRadius: 3,
                  boxShadow: '0 0 10px #E50914',
                }}
              />
            </div>
            {/* Percentage */}
            <span style={{
              color: '#E50914', fontSize: 11, fontWeight: 800,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}>
              {Math.max(0, Math.min(100, Math.round(gestureValue * 100)))}%
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Volume vertical bar — right edge */}
      <AnimatePresence>
        {gestureType === 'volume' && isTouch && (
          <motion.div
            key="volume-bar"
            initial={{ opacity: 0, x: 28, y: "-50%" }}
            animate={{ opacity: 1, x: 0, y: "-50%" }}
            exit={{ opacity: 0, x: 24, y: "-50%" }}
            transition={SPRING_SNAPPY}
            style={{
              position: 'absolute',
              right: 'calc(clamp(14px, 3.5vw, 28px) + var(--sar))',
              top: '50%',
              width: 44,
              height: 'clamp(170px, 42vh, 230px)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 0 10px',
              zIndex: 65, pointerEvents: 'none',
              background: 'rgba(20,20,20,0.96)',
              borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 20px 48px rgba(0,0,0,0.7)',
              overflow: 'hidden',
            }}
          >
            {/* Speaker icon at top */}
            <motion.div
              key={isMuted || volume === 0 ? 'off' : 'on'}
              initial={{ scale: 0.6 }} animate={{ scale: 1 }}
              transition={SPRING_FAST}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {isMuted || volume === 0 ? (
                <VolumeX size={18} color="#E50914" strokeWidth={2.2} style={{ filter: 'drop-shadow(0 0 6px rgba(229,9,20,0.6))' }} />
              ) : (
                <Volume2 size={18} color="#fff" strokeWidth={2.2} style={{ filter: 'drop-shadow(0 0 6px #E50914)' }} />
              )}
            </motion.div>
            {/* Track */}
            <div style={{
              position: 'relative', width: 6, flex: 1, margin: '10px 0',
              background: 'rgba(255,255,255,0.2)', borderRadius: 1,
              overflow: 'hidden',
            }}>
              <motion.div
                animate={{ height: `${Math.max(0, Math.min(100, Math.round((isMuted ? 0 : volume) * 100)))}%` }}
                transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  background: '#E50914',
                  borderRadius: 1,
                  boxShadow: '0 0 10px rgba(229,9,20,0.5)',
                }}
              />
            </div>
            {/* Percentage */}
            <span style={{
              color: isMuted || volume === 0 ? '#E50914' : (volume < 0.5 ? '#E50914' : '#fff'),
              fontSize: 11, fontWeight: 800,
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
              textShadow: '0 1px 4px rgba(0,0,0,0.8)',
            }}>
              {Math.max(0, Math.min(100, Math.round((isMuted ? 0 : volume) * 100)))}%
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seek indicator — center */}
      <AnimatePresence>
        {gestureType === 'seek' && isTouch && (
          <motion.div
            key="seek-indicator"
            initial={{ opacity: 0, scale: 0.85, x: "-50%", y: "-50%" }}
            animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
            exit={{ opacity: 0, scale: 0.9, x: "-50%", y: "-50%" }}
            transition={SPRING_SNAPPY}
            style={{
              position: 'absolute', top: '50%', left: '50%',
              zIndex: 65, pointerEvents: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              padding: '14px 24px', minWidth: 160,
            }}
          >
            {/* Seek direction & delta */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {seekDelta > 0 ? (
                <ChevronRight size={30} color="#E50914" strokeWidth={2.4} style={{ filter: 'drop-shadow(0 0 8px #E50914)' }} />
              ) : (
                <ChevronLeft size={30} color="#E50914" strokeWidth={2.4} style={{ filter: 'drop-shadow(0 0 8px #E50914)' }} />
              )}
              <span style={{
                color: '#fff', fontSize: 20, fontWeight: 800,
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
              }}>
                {seekDelta > 0 ? '+' : ''}{Math.round(seekDelta)}s
              </span>
            </div>
            {/* Destination time display */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 12, fontWeight: 600,
              fontFamily: "SF Mono, Menlo, monospace", fontVariantNumeric: 'tabular-nums',
            }}>
              <span style={{ color: '#E50914' }}>{fmt(Math.max(0, Math.min(currentTime + seekDelta, duration || 0)))}</span>
              <span style={{ color: 'rgba(255,255,255,0.35)' }}>/</span>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{fmt(duration)}</span>
            </div>
            {/* Mini destination progress bar */}
            {duration > 0 && (
              <div style={{
                width: 120, height: 3, background: 'rgba(255,255,255,0.12)',
                borderRadius: 2, overflow: 'hidden', marginTop: 2, position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0, bottom: 0,
                  width: `${Math.max(0, Math.min(((currentTime + seekDelta) / duration) * 100, 100))}%`,
                  background: '#E50914', borderRadius: 2,
                  boxShadow: '0 0 6px #E50914',
                }} />
              </div>
            )}
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
                background: "rgba(20,20,20,0.98)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 4, padding: `${R.padLarge} clamp(16px, 3vw, 26px)`, width: isTouch ? "min(92vw, 360px)" : R.panelShortcuts,
                color: "#fff", boxShadow: "0 40px 80px rgba(0,0,0,0.8)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                <span style={{
                  fontWeight: 700, fontSize: R.fontLarge,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                }}>{isTouch ? "Touch Gestures" : "Shortcuts"}</span>
                <button onClick={() => setShowShortcuts(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", display: "flex", padding: 6 }}>
                  <X size={16} />
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {(isTouch ? TOUCH_GESTURES : KEYBOARD_SHORTCUTS).map((item) => (
                  <div key={item.key || item.gesture} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <span style={{
                      color: "rgba(255,255,255,0.6)", fontSize: R.fontMedium,
                      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                    }}>{item.action}</span>
                    <span style={{
                      background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)",
                      padding: isTouch ? "4px 10px" : "3px 10px", borderRadius: 6,
                      fontFamily: isTouch ? "-apple-system, BlinkMacSystemFont, sans-serif" : "SF Mono, Menlo, monospace",
                      fontWeight: 700, fontSize: R.fontTiny, color: "rgba(255,255,255,0.85)",
                      whiteSpace: "nowrap", flexShrink: 0,
                    }}>
                      {item.key || item.gesture}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ SEEK INDICATORS ═══════════════════════════════ */}
      <div style={{ position: "absolute", inset: 0, zIndex: 12, pointerEvents: "none", display: "flex", alignItems: "center" }}>
        {/* Left — rewind */}
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "30%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AnimatePresence>
            {sideIcon?.type === "backward" && (
              isTouch ? (
                <motion.div
                  key="bwd-touch"
                  initial={{ opacity: 0, scale: 0.7, x: -14 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.85, x: -8 }}
                  transition={SPRING_SNAPPY}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 16px",
                    marginLeft: "var(--sal, 0px)",
                  }}
                >
                  <motion.div
                    animate={{ x: [0, -3, 0] }}
                    transition={{ repeat: 2, duration: 0.25 }}
                  >
                    <ChevronLeft size={26} color="#E50914" strokeWidth={2.5} />
                  </motion.div>
                  <span style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                    letterSpacing: "0.2px",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {sideIcon.text}
                  </span>
                </motion.div>
              ) : (
                <motion.div
                  key="bwd"
                  initial={{ opacity: 0, scale: 0.85, x: -10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9, x: -6 }}
                  transition={SPRING_SNAPPY}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "9px 18px",
                    marginLeft: "var(--sal, 0px)",
                  }}
                >
                  <motion.div
                    animate={{ x: [0, -3, 0] }}
                    transition={{ repeat: 2, duration: 0.25 }}
                  >
                    <ChevronLeft size={26} color="#E50914" strokeWidth={2.5} />
                  </motion.div>
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: "#fff",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                    letterSpacing: "0.2px", fontVariantNumeric: "tabular-nums",
                  }}>
                    {sideIcon.text}
                  </span>
                </motion.div>
              )
            )}
          </AnimatePresence>
        </div>
        {/* Right — forward */}
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: "30%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AnimatePresence>
            {sideIcon?.type === "forward" && (
              isTouch ? (
                <motion.div
                  key="fwd-touch"
                  initial={{ opacity: 0, scale: 0.7, x: 14 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.85, x: 8 }}
                  transition={SPRING_SNAPPY}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "8px 16px",
                    marginRight: "var(--sar, 0px)",
                  }}
                >
                  <span style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#fff",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                    letterSpacing: "0.2px",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {sideIcon.text}
                  </span>
                  <motion.div
                    animate={{ x: [0, 3, 0] }}
                    transition={{ repeat: 2, duration: 0.25 }}
                  >
                    <ChevronRight size={26} color="#E50914" strokeWidth={2.5} />
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="fwd"
                  initial={{ opacity: 0, scale: 0.85, x: 10 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9, x: 6 }}
                  transition={SPRING_SNAPPY}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "9px 18px",
                    marginRight: "var(--sar, 0px)",
                  }}
                >
                  <span style={{
                    fontSize: 14, fontWeight: 700, color: "#fff",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                    letterSpacing: "0.2px", fontVariantNumeric: "tabular-nums",
                  }}>
                    {sideIcon.text}
                  </span>
                  <motion.div
                    animate={{ x: [0, 3, 0] }}
                    transition={{ repeat: 2, duration: 0.25 }}
                  >
                    <ChevronRight size={26} color="#E50914" strokeWidth={2.5} />
                  </motion.div>
                </motion.div>
              )
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Double-tap ripple — Netflix red */}
      <div style={{ position: "absolute", inset: 0, zIndex: 11, pointerEvents: "none" }}>
        <AnimatePresence>
          {doubleTapRipple && (
            <motion.div
              key={doubleTapRipple.id}
              initial={{ opacity: isTouch ? 0.3 : 0.4 }}
              animate={{ opacity: 0 }}
              transition={{ duration: 0.45 }}
              style={{
                position: "absolute",
                [doubleTapRipple.side]: 0,
                width: isTouch ? "35%" : "40%", height: "100%",
                background: isTouch
                  ? `radial-gradient(ellipse at ${doubleTapRipple.side === "left" ? "0%" : "100%"} center, rgba(229,9,20,0.16) 0%, rgba(255,255,255,0.05) 40%, transparent 75%)`
                  : `radial-gradient(ellipse at ${doubleTapRipple.side} center, rgba(255,255,255,0.04) 0%, transparent 70%)`,
              }}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Screen Lock Button & Unlock HUD */}
      {isTouch && showCustomUI && (
        <AnimatePresence>
          {isScreenLocked ? (
            <motion.button
              key="unlock-btn"
              initial={{ opacity: 0, scale: 0.8, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -6 }}
              whileTap={{ scale: 0.92 }}
              onClick={(e) => {
                e.stopPropagation();
                setIsScreenLocked(false);
                setToastMessage("Controls Unlocked");
                if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
              }}
              style={{
                position: "absolute",
                top: "calc(14px + var(--sat))",
                left: "calc(14px + var(--sal))",
                zIndex: 75,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 18px",
                borderRadius: 999,
                background: "rgba(18, 18, 24, 0.90)",
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
                border: "1px solid rgba(229, 9, 20, 0.5)",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                boxShadow: "0 8px 30px rgba(0,0,0,0.6), 0 0 16px rgba(229, 9, 20, 0.25)",
                cursor: "pointer",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              }}
            >
              <Lock size={15} color="#E50914" /> Tap to Unlock
            </motion.button>
          ) : controlsVisible && (
            <motion.button
              key="lock-btn"
              initial={{ opacity: 0, scale: 0.8, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8, y: -6 }}
              whileTap={{ scale: 0.9 }}
              onClick={(e) => {
                e.stopPropagation();
                setIsScreenLocked(true);
                setShowControls(false);
                setToastMessage("Controls Locked");
                if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 2000);
              }}
              aria-label="Lock screen controls"
              style={{
                position: "absolute",
                top: "calc(14px + var(--sat))",
                left: "calc(14px + var(--sal))",
                zIndex: 65,
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "rgba(18, 18, 24, 0.78)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
                border: "1px solid rgba(229, 9, 20, 0.45)",
                color: "rgba(255, 255, 255, 0.9)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
                cursor: "pointer",
              }}
            >
              <Unlock size={17} />
            </motion.button>
          )}
        </AnimatePresence>
      )}

      {/* ═══ TOP BAR — Netflix ═══════════════════════════════════ */}
      <AnimatePresence>
        {showCustomUI && controlsVisible && !isScreenLocked && (
          <motion.div
            initial={{ opacity: 0, y: -22 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -22 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="player-netflix-topbar"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              zIndex: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "calc(clamp(14px, 3vw, 22px) + var(--sat)) calc(clamp(14px, 3vw, 24px) + var(--sal)) calc(8px + var(--sar))",
              background: "linear-gradient(180deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 55%, transparent 100%)",
              gap: 12,
              pointerEvents: "none",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "clamp(10px, 2vw, 14px)", minWidth: 0, pointerEvents: "auto" }}>
              <button
                aria-label="Exit player"
                onClick={(e) => { e.stopPropagation(); onClose?.(); }}
                style={{
                  background: "transparent", border: "none",
                  color: "#fff", cursor: "pointer", padding: "clamp(4px, 1vw, 10px)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}
              >
                <ArrowLeft size={26} />
              </button>
              <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{
                  color: "#fff", fontWeight: 800, fontSize: "clamp(16px, 2.2vw, 21px)",
                  letterSpacing: "-0.02em", lineHeight: 1.1,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  textShadow: "0 1px 10px rgba(0,0,0,0.9)",
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
                }}>
                  {movie?.title || movie?.name}
                </span>
                {isTvContent && season && (
                  <span style={{
                    color: "rgba(255,255,255,0.85)", fontSize: "clamp(11px, 1.4vw, 13px)", fontWeight: 700,
                    letterSpacing: "0.4px", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                  }}>
                    S{season} E{episode}
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "clamp(4px, 1vw, 8px)", flexShrink: 0, pointerEvents: "auto" }}>
              {hasNextEpisode && (
                <button
                  aria-label="Next episode"
                  onClick={(e) => { e.stopPropagation(); onNextEpisode?.(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: "clamp(3px, 0.8vw, 5px)",
                    background: "rgba(255,255,255,0.08)", border: "none",
                    color: "#fff", padding: "8px 14px", borderRadius: 4, cursor: "pointer",
                    fontWeight: 700, fontSize: R.fontSmall, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                  }}
                >
                  Next <SkipForward size={12} fill="currentColor" />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ BOTTOM CONTROLS — Netflix ═══════════════════════════ */}
      <AnimatePresence>
        {showCustomUI && controlsVisible && (
          <motion.div
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 14 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{
              position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 20,
              paddingBottom: "calc(clamp(10px, 2vw, 16px) + var(--sab))",
              background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.55) 55%, transparent 100%)",
              pointerEvents: "none",
            }}
          >
            {/* Skip Intro / Up Next */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "flex-end",
              padding: `0 ${R.progressBarPad}`, marginBottom: 6, pointerEvents: "none",
              marginLeft: "var(--sal, 0px)", marginRight: "var(--sar, 0px)",
            }}>
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
                        background: "rgba(255,255,255,0.92)", color: "#111",
                        border: "none",
                        padding: isTouch ? "9px 18px" : `${R.padMedium} ${R.padMedium}`,
                        minHeight: isTouch ? 42 : "auto",
                        borderRadius: 6, cursor: "pointer",
                        fontWeight: 700, backdropFilter: "blur(20px)",
                        WebkitBackdropFilter: "blur(20px)",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                        display: "flex", alignItems: "center", gap: "clamp(4px, 1vw, 6px)", fontSize: R.fontMedium,
                        fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                      }}
                    >
                      <FastForward size={13} fill="#E50914" color="#E50914" /> Skip Intro
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
                        background: "rgba(20,20,20,0.92)",
                        borderRadius: 4, padding: `${R.padMedium} ${R.padSmall}`,
                        display: "flex", alignItems: "center", gap: "clamp(6px, 1.5vw, 10px)",
                        boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.35)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>Up Next</div>
                        <div style={{ fontSize: R.fontMedium, color: "#fff", fontWeight: 700, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>Ep {(episode || 0) + 1}</div>
                      </div>
                      <ArcRing progress={upNextCountdown / 15} size={32} strokeWidth={2} color="#E50914" bgColor="rgba(255,255,255,0.06)">
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
                position: "relative", height: isTouch ? 40 : 28, display: "flex",
                alignItems: "center", cursor: "pointer",
                padding: `0 ${R.progressBarPad}`, pointerEvents: "auto",
                touchAction: "none",
              }}
            >
              {/* Hover time tooltip */}
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
                    <div style={{
                      background: "rgba(0,0,0,0.85)",
                      color: "#fff",
                      padding: `4px ${R.padSmall}`, borderRadius: 2,
                      fontSize: R.fontSmall, fontWeight: 600, letterSpacing: "0.3px",
                      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                      fontVariantNumeric: "tabular-nums",
                      boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                      whiteSpace: "nowrap",
                    }}>
                      {fmt(hoverTime)}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {/* Track */}
              <div
                ref={progressTrackRef}
                style={{
                  position: "relative", width: "100%",
                  height: hoverTime != null || isScrubbing ? (isTouch ? 5 : 4) : (isTouch ? 3 : 2),
                  background: hoverTime != null || isScrubbing ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.3)",
                  borderRadius: 1,
                  transition: "height 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                }}
              >
                {duration > 0 && bp > pp && <div style={{
                  position: "absolute", inset: 0,
                  left: `${Math.min(pp, 100)}%`,
                  width: `${Math.min(bp - pp, 100 - pp)}%`,
                  background: "rgba(255,255,255,0.25)", borderRadius: 1,
                  transition: "width 0.3s ease",
                }} />}
                {duration > 0 && <div style={{
                  position: "absolute", inset: 0, width: `${Math.min(pp, 100)}%`,
                  background: "#E50914",
                  borderRadius: 1,
                  boxShadow: isScrubbing ? "0 0 10px rgba(229,9,20,0.8)" : "none",
                  transition: isScrubbing ? "none" : "width 0.1s linear",
                }} />}
                {duration > 0 && !(currentTime === 0 && !isPlaying && !isScrubbing) && (
                  <motion.div
                    animate={{
                      left: `${Math.max(0, Math.min(pp, 100))}%`,
                      width: hoverTime != null || isScrubbing ? (isTouch ? 16 : 12) : (isTouch ? 10 : 0),
                      height: hoverTime != null || isScrubbing ? (isTouch ? 16 : 12) : (isTouch ? 10 : 0),
                      opacity: hoverTime != null || isScrubbing || isTouch ? 1 : 0,
                    }}
                    transition={SPRING}
                    style={{
                      position: "absolute", top: "50%",
                      transform: "translate(-50%, -50%)",
                      borderRadius: "50%",
                      background: "#E50914",
                      border: "2px solid rgba(255,255,255,0.9)",
                      boxShadow: isScrubbing ? "0 0 12px rgba(229,9,20,0.9), 0 2px 8px rgba(0,0,0,0.6)" : "0 2px 8px rgba(0,0,0,0.5)",
                      cursor: "grab", pointerEvents: "none",
                    }}
                  />
                )}
              </div>
            </div>

            {/* ═══ CONTROL ROW ═══════════════════════════════════ */}
            <div className="streamly-player-control-row" onClick={(e) => e.stopPropagation()} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: `${R.controlRowPad} ${R.padMedium} 0`, pointerEvents: "auto",
              gap: "clamp(8px, 2vw, 14px)",
            }}>
              {/* Left cluster */}
              <div style={{ display: "flex", alignItems: "center", gap: "clamp(4px, 1vw, 8px)", flexShrink: 0 }}>
                <motion.button
                  aria-label={isPlaying ? "Pause" : "Play"}
                  onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                  style={{
                    background: "transparent", border: "none", color: "#fff", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {isPlaying ? <Pause size={isTouch ? 26 : 30} fill="currentColor" /> : <Play size={isTouch ? 26 : 30} fill="currentColor" style={{ marginLeft: 3 }} />}
                </motion.button>
                <motion.button
                  aria-label="Rewind 10 seconds"
                  onClick={(e) => { e.stopPropagation(); seekRelative(-seekStep); }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                  style={{
                    background: "transparent", border: "none", color: "rgba(255,255,255,0.9)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: "3px",
                  }}
                >
                  <ChevronLeft size={isTouch ? 21 : 24} strokeWidth={2.4} />
                </motion.button>
                <motion.button
                  aria-label="Forward 10 seconds"
                  onClick={(e) => { e.stopPropagation(); seekRelative(seekStep); }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                  style={{
                    background: "transparent", border: "none", color: "rgba(255,255,255,0.9)", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", padding: "3px",
                  }}
                >
                  <ChevronRight size={isTouch ? 21 : 24} strokeWidth={2.4} />
                </motion.button>
                {/* Volume — button + hover slider */}
                <div
                  style={{ display: "flex", alignItems: "center" }}
                  onMouseEnter={() => setIsVolumeHovered(true)}
                  onMouseLeave={() => setIsVolumeHovered(false)}
                >
                <motion.button
                  aria-label="Toggle mute"
                  onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                  style={{
                    background: "transparent", border: "none", color: "#fff", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {isMuted || volume === 0 ? <VolumeX size={isTouch ? 19 : 21} /> : volume < 0.5 ? <Volume1 size={isTouch ? 19 : 21} /> : <Volume2 size={isTouch ? 19 : 21} />}
                </motion.button>
                <AnimatePresence>
                  {!isTouch && isVolumeHovered && (
                    <motion.div
                      ref={volumeBarRef}
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 88 }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      style={{
                        position: "relative", height: 26, display: "flex",
                        alignItems: "center", cursor: "pointer", touchAction: "none", overflow: "hidden",
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        changeVolume(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
                      }}
                    >
                      <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.3)", borderRadius: 1 }} />
                      <div style={{
                        position: "absolute", left: 0, height: 3, width: `${(isMuted ? 0 : volume) * 100}%`,
                        background: "#E50914", borderRadius: 1,
                      }} />
                    </motion.div>
                  )}
                </AnimatePresence>
                </div>
                <span style={{
                  color: "rgba(255,255,255,0.9)", fontSize: isTouch ? 11 : 12, fontWeight: 600,
                  fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", fontVariantNumeric: "tabular-nums",
                  letterSpacing: "0.2px", marginLeft: "clamp(2px, 0.6vw, 6px)", whiteSpace: "nowrap",
                }}>
                  {fmt(currentTime)}
                </span>
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: isTouch ? 11 : 12, fontWeight: 600, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>/</span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: isTouch ? 11 : 12, fontWeight: 600, fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(duration)}
                </span>
                {isTvContent && season && (
                  <span style={{
                    color: "rgba(255,255,255,0.65)", fontSize: isTouch ? 11 : 12, fontWeight: 600, letterSpacing: "0.2px",
                    marginLeft: "clamp(4px, 1vw, 8px)",
                    whiteSpace: "nowrap", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                  }}>
                    S{season} E{episode}
                  </span>
                )}
              </div>

              {/* Right cluster */}
              <div style={{ display: "flex", alignItems: "center", gap: "clamp(3px, 0.8vw, 6px)", flexShrink: 0 }}>
                <input type="file" accept=".srt,.vtt" ref={subtitleInputRef} onChange={handleSubtitleUpload} style={{ display: "none" }} />
                <motion.button
                  aria-label="Subtitles"
                  onClick={(e) => { e.stopPropagation(); setShowSubtitlesMenu(!showSubtitlesMenu); setShowSettings(false); }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                  style={{
                    background: showSubtitlesMenu ? "rgba(229,9,20,0.25)" : "transparent",
                    border: "none", color: "#fff", cursor: "pointer", borderRadius: "50%",
                    width: isTouch ? 38 : 40, height: isTouch ? 38 : 40,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Captions size={isTouch ? 17 : 18} />
                </motion.button>
                {!narrow && (
                <motion.button
                  aria-label="Change aspect ratio"
                  onClick={(e) => {
                    e.stopPropagation();
                    aspectManuallySetRef.current = true;
                    setAspectRatioIndex((aspectRatioIndex + 1) % ASPECT_RATIOS.length);
                    setShowAspectRatioArc(true);
                    if (aspectRatioArcTimerRef.current) clearTimeout(aspectRatioArcTimerRef.current);
                    aspectRatioArcTimerRef.current = setTimeout(() => setShowAspectRatioArc(false), 1200);
                  }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                  style={{
                    background: "transparent", border: "none", color: "#fff", cursor: "pointer", borderRadius: "50%",
                    width: isTouch ? 38 : 40, height: isTouch ? 38 : 40,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {/* Current ratio glyph */}
                  <span style={{
                    width: 15, height: 11, border: "1.5px solid currentColor", borderRadius: 2, display: "block",
                  }} />
                </motion.button>
                )}
                <motion.button
                  aria-label="Brightness"
                  onClick={(e) => { e.stopPropagation(); triggerBrightnessCycle(); }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                  style={{
                    background: "transparent", border: "none", color: "#fff", cursor: "pointer", borderRadius: "50%",
                    width: isTouch ? 38 : 40, height: isTouch ? 38 : 40,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  <Sun size={isTouch ? 17 : 18} />
                </motion.button>
                {supportsPlaybackRate && !narrow && (
                <motion.button
                  aria-label="Playback speed"
                  onClick={(e) => { e.stopPropagation(); cycleSpeed(); }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                  transition={SPRING}
                  style={{
                    background: playbackRate !== 1 ? "rgba(229,9,20,0.2)" : "transparent",
                    border: playbackRate !== 1 ? "1px solid rgba(229,9,20,0.5)" : "none",
                    color: "#fff", cursor: "pointer", borderRadius: 6,
                    padding: `${isTouch ? 5 : 6}px ${isTouch ? 8 : 10}px`,
                    fontWeight: 800, fontSize: isTouch ? 11 : 12, fontVariantNumeric: "tabular-nums",
                    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                  }}
                >
                  {playbackRate}x
                </motion.button>
                )}
                {hasManagedSettings && (
                  <motion.button onClick={(e) => {
                      e.stopPropagation();
                      setShowSettings(!showSettings); setShowSubtitlesMenu(false);
                    }}
                    whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                    transition={SPRING}
                    aria-label="Settings"
                    style={{
                      background: showSettings ? "rgba(229,9,20,0.25)" : "transparent",
                      border: "none", color: showSettings ? "#fff" : "rgba(255,255,255,0.85)",
                      cursor: "pointer", width: isTouch ? 38 : 40, height: isTouch ? 38 : 40, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    <motion.div animate={{ rotate: showSettings ? 90 : 0 }} transition={SPRING}>
                      <Settings size={isTouch ? 17 : 18} />
                    </motion.div>
                  </motion.button>
                )}
                <motion.button
                  aria-label="Toggle fullscreen"
                  onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.92 }}
                  style={{
                    background: "transparent", border: "none", color: "#fff", cursor: "pointer", borderRadius: "50%",
                    width: isTouch ? 38 : 40, height: isTouch ? 38 : 40,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {isFullscreen ? <Minimize size={isTouch ? 17 : 18} /> : <Maximize size={isTouch ? 17 : 18} />}
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile tap-outside dismiss backdrop for popup menus */}
      {isTouch && (showSettings || showSubtitlesMenu) && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setShowSettings(false);
            setShowSubtitlesMenu(false);
          }}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 48,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        />
      )}

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
              position: "absolute",
              bottom: isTouch ? "calc(12px + var(--sab))" : "calc(clamp(40px, 8vw, 60px) + var(--sab))",
              right: isTouch ? "auto" : "calc(clamp(8px, 2vw, 16px) + var(--sar))",
              left: isTouch ? "50%" : "auto",
              transform: isTouch ? "translateX(-50%)" : "none",
              zIndex: 50,
              width: isTouch ? "min(calc(100% - 24px), 360px)" : R.panelSettings,
              maxHeight: isTouch ? "min(68vh, 420px)" : "50vh",
              background: "rgba(20,20,20,0.98)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: isTouch ? 8 : 4,
              padding: `${R.padMedium} ${R.padMedium}`,
              color: "#fff",
              overflowY: "auto",
              boxShadow: "0 16px 56px rgba(0,0,0,0.7)",
            }}
          >
            {/* Speed */}
            {supportsPlaybackRate && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Playback Speed</div>
              <div style={{ display: "flex", gap: "clamp(4px, 1vw, 6px)", flexWrap: "wrap" }}>
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => (
                  <motion.button key={r} onClick={() => { sendCommand("setPlaybackRate", [r]); setPlaybackRate(r); setShowSettings(false); }}
                    whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
                    transition={SPRING}
                    style={{
                      background: playbackRate === r ? "rgba(229,9,20,0.16)" : "rgba(255,255,255,0.02)",
                      color: playbackRate === r ? "#E50914" : "rgba(255,255,255,0.5)",
                      border: playbackRate === r ? "1px solid rgba(229,9,20,0.4)" : "1px solid rgba(255,255,255,0.04)",
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
            )}

            {/* Aspect Ratio */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, marginBottom: 10, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Aspect Ratio</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {ASPECT_RATIOS.map((ar, i) => (
                  <button key={ar.name} onClick={() => { aspectManuallySetRef.current = true; setAspectRatioIndex(i); setShowSettings(false); setShowAspectRatioArc(true); if (aspectRatioArcTimerRef.current) clearTimeout(aspectRatioArcTimerRef.current); aspectRatioArcTimerRef.current = setTimeout(() => setShowAspectRatioArc(false), 1200); }}
                    style={{
                      background: aspectRatioIndex === i ? "rgba(229,9,20,0.12)" : "transparent",
                      color: aspectRatioIndex === i ? "#E50914" : "rgba(255,255,255,0.5)",
                      border: aspectRatioIndex === i ? "1px solid rgba(229,9,20,0.3)" : "none",
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
                  ...(isCineSrc ? [{ label: "Auto-Skip Intro", val: autoSkipIntro, set: (value) => setPreference("autoSkipIntro", value) }] : []),
                  ...(movie?.isSeries ? [{ label: "Auto-Play Next", val: autoPlayNext, set: (value) => setPreference("autoplay", value) }] : []),
                ].map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: R.fontMedium, fontWeight: 600, color: "rgba(255,255,255,0.6)", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>{item.label}</span>
                    <div onClick={() => { const v = !item.val; item.set(v); }}
                      style={{
                        width: isTouch ? 44 : 36, height: isTouch ? 24 : 20,
                        background: item.val ? "#E50914" : "rgba(255,255,255,0.1)",
                        borderRadius: 100, position: "relative", cursor: "pointer",
                        transition: "background 0.25s",
                      }}
                    >
                      <div style={{
                        width: isTouch ? 20 : 16, height: isTouch ? 20 : 16, background: "#fff", borderRadius: "50%",
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
              position: "absolute",
              bottom: isTouch ? "calc(12px + var(--sab))" : "calc(clamp(40px, 8vw, 60px) + var(--sab))",
              right: isTouch ? "auto" : "calc(clamp(36px, 8vw, 56px) + var(--sar))",
              left: isTouch ? "50%" : "auto",
              transform: isTouch ? "translateX(-50%)" : "none",
              zIndex: 50,
              width: isTouch ? "min(calc(100% - 24px), 360px)" : R.panelSubtitles,
              maxHeight: isTouch ? "min(68vh, 420px)" : "45vh",
              background: "rgba(20,20,20,0.98)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: isTouch ? 8 : 4,
              padding: `${R.padMedium} ${R.padMedium}`,
              color: "#fff",
              overflowY: "auto",
              boxShadow: "0 16px 56px rgba(0,0,0,0.7)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <span style={{ fontSize: R.fontTiny, color: "rgba(255,255,255,0.3)", textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: 700, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>Subtitles</span>
              <div onClick={(e) => { e.stopPropagation(); setSubtitleEnabled(!subtitleEnabled); }}
                style={{
                  width: isTouch ? 44 : 36, height: isTouch ? 24 : 20,
                  background: subtitleEnabled ? "#E50914" : "rgba(255,255,255,0.1)",
                  borderRadius: 100, position: "relative", cursor: "pointer",
                  transition: "background 0.25s",
                }}
              >
                <div style={{
                  width: isTouch ? 20 : 16, height: isTouch ? 20 : 16, background: "#fff", borderRadius: "50%",
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
            {/* Subtitle Sync Offset */}
            <div style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10,
              padding: "8px 10px",
              marginBottom: 10,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: R.fontSmall, color: "rgba(255,255,255,0.6)", fontWeight: 500, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" }}>
                  Sync Offset
                </span>
                <span style={{
                  fontSize: R.fontSmall,
                  fontVariantNumeric: "tabular-nums",
                  color: subtitleOffset === 0 ? "rgba(255,255,255,0.4)" : "#E50914",
                  fontWeight: 600,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                }}>
                  {subtitleOffset > 0 ? `+${subtitleOffset.toFixed(1)}s` : `${subtitleOffset.toFixed(1)}s`}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSubtitleOffset((o) => Math.max(-10, Math.round((o - 0.5) * 10) / 10));
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "none",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "4px 0",
                    fontSize: R.fontSmall,
                    cursor: "pointer",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  }}
                >
                  -0.5s
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSubtitleOffset(0);
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "none",
                    color: "rgba(255,255,255,0.6)",
                    borderRadius: 6,
                    padding: "4px 0",
                    fontSize: R.fontSmall,
                    cursor: "pointer",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSubtitleOffset((o) => Math.min(10, Math.round((o + 0.5) * 10) / 10));
                  }}
                  style={{
                    flex: 1,
                    background: "rgba(255,255,255,0.06)",
                    border: "none",
                    color: "#fff",
                    borderRadius: 6,
                    padding: "4px 0",
                    fontSize: R.fontSmall,
                    cursor: "pointer",
                    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                  }}
                >
                  +0.5s
                </button>
              </div>
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
              background: "rgba(20,20,20,0.98)",
              border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4,
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

  // Expose stream extraction method to parent components
  useImperativeHandle(ref, () => ({
    getStreamUrl: async () => {
      if (!iframeRef.current) {
        logWarn("player", "No iframe available for stream extraction");
        return null;
      }
      const result = await extractStreamUrl(iframeRef.current);
      return result;
    },
  }));
});

CustomVideoPlayer.displayName = "CustomVideoPlayer";

export default CustomVideoPlayer;
