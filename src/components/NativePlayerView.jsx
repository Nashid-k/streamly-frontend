// src/components/NativePlayerView.jsx — native HLS playback view (prototype)
// with a Netflix-style player chrome.
//
// Shared by the /proto-native test route and the watch page's "native test"
// play button. Resolves VidCore-first → VidSrc → CineSrc via downloadService,
// plays through hls.js (manifest-relay + direct-segment loader), and offers
// our own quality ladder + audio menu + attempt log. Custom transport only —
// no native <video controls> anywhere in here.
//
// Chrome mirrors the Netflix web player: top bar (back), bottom gradient with
// title, full-width scrubber (red played / gray buffered / hover knob + time
// bubble), play · ∓10s · volume · time on the left, Episodes · Audio &
// Subtitles · fullscreen on the right, auto-hiding controls, click/double-
// click/keyboard shortcuts. Quality selection lives in the Audio & Subtitles
// dialog (Netflix has no quality menu; our ladders need one).

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bug,
  Captions,
  Check,
  ListVideo,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Hls from "hls.js";
import { downloadService } from "../api/downloadService";
import { createStreamlyLoader, probeSourcePlayable } from "../api/nativeHlsLoader";
import { logWarn } from "../utils/debugLogger";

// A source whose fragments keep failing without ever going fatal (VidCore's
// vidzen fallback: playlist 200, segments 429 on repeat) would otherwise spin
// forever on a black screen. After this many CONSECUTIVE fragment failures we
// force the failover ourselves.
const MAX_CONSECUTIVE_FRAG_FAILURES = 4;

const NETFLIX_RED = "#E50914";
const HIDE_DELAY_MS = 3000;
const SKIP_SECONDS = 10;
// Netflix "Up Next" auto-play countdown for a TV episode's next installment.
const UP_NEXT_MS = 15000;
// Netflix resume gate: wait this long on the "Left off at…" card before
// auto-resuming playback from the saved position.
const RESUME_WAIT_SECONDS = 8;
const VOLUME_STORAGE_KEY = "streamly-native-volume";
const MUTED_STORAGE_KEY = "streamly-native-muted";

/* Plain white circular icon button (Netflix transport glyphs). */
function IconBtn({ label, onClick, children, active }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        border: "none",
        background: "transparent",
        color: active ? NETFLIX_RED : "#fff",
        cursor: "pointer",
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
function DialogRow({ selected, onClick, title, sub }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        textAlign: "left",
        padding: "9px 12px",
        borderRadius: 8,
        border: "none",
        background: selected ? "rgba(255,255,255,0.12)" : "transparent",
        color: "#fff",
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      <span style={{ width: 18, display: "flex", flexShrink: 0 }}>
        {selected ? <Check size={16} /> : null}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {title}
        </span>
        {sub ? (
          <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{sub}</span>
        ) : null}
      </span>
    </button>
  );
}

const SOURCES = [
  { key: "vidcore", label: "VidCore (native)", resolve: (a, o) => downloadService.resolveVidcore(a, o) },
  { key: "vidsrc", label: "VidSrc (native)", resolve: (a, o) => downloadService.resolveVidsrc(a, o) },
  { key: "cinesrc", label: "CineSrc (native)", resolve: (a, o) => downloadService.resolveCinesrc(a, o) },
];

const PARSE_TIMEOUT_MS = 75000;

function stamp() {
  return new Date().toLocaleTimeString();
}

function fmtTime(s) {
  const v = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(v / 3600);
  const m = Math.floor((v % 3600) / 60);
  const r = v % 60;
  // Netflix style: m:ss under an hour, h:mm:ss above (156:22 -> 2:36:22).
  return (h > 0 ? `${h}:` : "") + (h > 0 ? String(m).padStart(2, "0") : `${m}`) + `:${String(r).padStart(2, "0")}`;
}

export default function NativePlayerView({
  type = "movie",
  id,
  season = 1,
  episode = 1,
  title,
  subtitle,
  episodes = [],
  onSelectEpisode,
  onClose,
  // Continue-watching entry for THIS title/episode ({ timestamp } in s, >0),
  // plus a sink to persist playback positions. Both optional — leave them off
  // and the player simply never offers resume / never saves progress.
  watchedEntry,
  onProgressChange,
}) {
  const videoRef = useRef(null);
  const screenRef = useRef(null);
  const scrubRef = useRef(null);
  const hlsRef = useRef(null);
  const runRef = useRef(0);
  const metaRef = useRef({ variants: [], sourceKey: null, refUrl: null, cinesrcLevels: false });
  const idleTimer = useRef(null);
  const clickTimer = useRef(null);
  const watchedEntryRef = useRef(watchedEntry);
  watchedEntryRef.current = watchedEntry;
  const lastProgressSaved = useRef(0);
  const resumeHandledKeyRef = useRef(null); // title/episode key that already offered resume
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSelectEpisodeRef = useRef(onSelectEpisode);
  onSelectEpisodeRef.current = onSelectEpisode;
  const resumeOfferRef = useRef(null);
  resumeOfferRef.current = resumeOffer;
  const commitResumeRef = useRef(null); // assigned below, driven by the resume card
  const maybeOfferResumeRef = useRef(() => {}); // reassigned below; called from the run effect

  const [lines, setLines] = useState([]);
  const [status, setStatus] = useState("idle");
  const [qualities, setQualities] = useState([]);
  const [activeUri, setActiveUri] = useState(null);
  const [isMasterMode, setIsMasterMode] = useState(false);
  const [audioTracks, setAudioTracks] = useState([]);
  const [audioIndex, setAudioIndex] = useState(0);
  const [fatal, setFatal] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  // Netflix "Up Next" card: { number, title } for the next TV episode, or null.
  const [upNext, setUpNext] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  // Real loader state: true while the screen has nothing new to show (initial
  // load, stall, seek). Driven by the video element's own signals.
  const [buffering, setBuffering] = useState(true);
  const [bufferedSecs, setBufferedSecs] = useState(0);
  const [bufferedRanges, setBufferedRanges] = useState([]);
  // Master-mode (CineSrc) starts on ABR auto; picking a level pins it.
  const [autoLevel, setAutoLevel] = useState(true);
  const [manualHeight, setManualHeight] = useState(null);
  // The rendition ABR currently settled on (LEVEL_SWITCHED) — shows the real
  // "now playing" resolution in the quality dialog even while on Auto.
  const [currentHeight, setCurrentHeight] = useState(null);
  // Netflix resume card: { at, left } where `at` is the saved position in s.
  const [resumeOffer, setResumeOffer] = useState(null);
  // Netflix chrome state.
  const [controlsVisible, setControlsVisible] = useState(true);
  const [panel, setPanel] = useState(null); // null | "subs" | "episodes"
  const [showLog, setShowLog] = useState(false);
  const [volume, setVolume] = useState(() => {
    try {
      const v = Number(window.localStorage.getItem(VOLUME_STORAGE_KEY));
      return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
    } catch {
      return 1;
    }
  });
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

  const displayTitle = title || (type === "tv" ? `TV ${id}` : `Movie ${id}`);
  const displaySubtitle = subtitle ?? (type === "tv" ? `S${season}:E${episode}` : "");

  const say = (msg) => setLines((prev) => [...prev.slice(-60), `${stamp()} ${msg}`]);

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
        // Netflix behavior: play at the end restarts from the top instead of
        // immediately re-ending (play() at currentTime==duration is a no-op).
        if (video.ended) video.currentTime = 0;
        await video.play();
      } else {
        video.pause();
      }
    } catch {
      // Autoplay policy — the big custom button stays visible for a tap.
    }
  };

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
      // ignore
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
    if (resumeOffer) setResumeOffer(null); // user grabbed the bar — they pick the spot
    try {
      scrubRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // pointer capture unsupported — drag still works while over the bar
    }
    setScrubDragging(true);
    const ratio = scrubRatioOf(e.clientX);
    setScrubHover(ratio);
    // No seek here: the bar tracks the drag position and the seek is
    // committed exactly once on release. Seeking on every pointermove would
    // make hls.js cancel in-flight fragment loads and stall the seek.
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
    // Let the red bar settle on the seek target (currentTime syncs on the
    // `seeking` event) before dropping the hover overlay.
    window.setTimeout(() => setScrubHover(null), 250);
  };

  // A cancelled gesture (Esc on touch, scroll steal, pointer leaving the
  // window) must not strand the scrubber in the dragging state.
  const onScrubCancel = () => {
    setScrubDragging(false);
    setScrubHover(null);
  };

  const onScrubLeave = () => {
    if (!scrubDragging) setScrubHover(null);
  };

  const seekRelative = (delta) => {
    const video = videoRef.current;
    if (!video) return;
    poke();
    const dur = Number(video.duration);
    const next = (video.currentTime || 0) + delta;
    try {
      video.currentTime = Number.isFinite(dur) && dur > 0 ? Math.min(Math.max(0, next), dur) : Math.max(0, next);
    } catch {
      // ignore out-of-range seeks
    }
  };

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
      // unchanged
    }
    if (video.paused) {
      video.play().catch(() => {
        // autoplay policy — the big custom play button stays available
      });
    }
    say("Playing from the beginning.");
  };

  // Progress persistence sink: report every ~5s while playing (>10s in, so a
  // stray 3s peek never writes a resume point). The parent owns storage.
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

  // Resume card countdown: tick the seconds-remaining and auto-commit when it
  // runs out. Uses refs so the effect only re-arms on card state changes.
  useEffect(() => {
    if (!resumeOffer) return undefined;
    const tick = setInterval(() => {
      setResumeOffer((o) => (o && o.left > 1 ? { ...o, left: o.left - 1 } : null));
    }, 1000);
    const auto = setTimeout(() => {
      const current = resumeOfferRef.current;
      if (current) commitResumeRef.current?.(current.at);
    }, resumeOffer.left * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(auto);
    };
  }, [resumeOffer]);

  const changeVolume = (delta) => {
    setMuted(false);
    setVolume((v) => Math.min(1, Math.max(0, Math.round((v + delta) * 100) / 100)));
    poke();
  };

  const toggleMute = () => {
    setMuted((m) => !m);
    poke();
  };

  const goFullscreen = () => {
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen()?.catch?.(() => {});
      } else {
        screenRef.current?.requestFullscreen?.()?.catch?.(() => {});
      }
    } catch {
      // fullscreen unsupported — native video keeps playing inline
    }
    poke();
  };

  // Controls autohide (Netflix behavior): any activity shows them; 3s of idle
  // while playing hides them again (plus the cursor). Paused always shows.
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

  /* Custom transport state (no native video controls — play/pause/seek/time/
     fullscreen below are all wired by hand). */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const onPlay = () => {
      setPlaying(true);
      setBuffering(false);
    };
    const onPause = () => setPlaying(false);
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
    };
    const onMeta = () => setDuration(video.duration || 0);
    // The video element itself is the honest stall detector: waiting/stalled/
    // seeking mean "screen has nothing new", playing/canplay mean pixels flow.
    const onWaiting = () => setBuffering(true);
    const onStalled = () => setBuffering(true);
    const onSeeking = () => {
      setBuffering(true);
      // timeupdate does NOT fire while the element is seeking, so without this
      // the red bar would sit at the pre-seek position until the new segment
      // buffers (the "progress bar won't jump" bug). currentTime already
      // carries the seek target here — mirror it.
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

  /* Volume applies to the element and persists across visits. */
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      try {
        video.volume = volume;
        video.muted = muted;
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
  }, [volume, muted]);

  /* Fullscreen icon follows the real fullscreen state. */
  useEffect(() => {
    const onFull = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFull);
    return () => document.removeEventListener("fullscreenchange", onFull);
  }, []);

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
          changeVolume(0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVolume(-0.1);
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
      // CineSrc keeps audio groups + levels on the master — load the master so
      // hls.js sees them. VidCore/VidSrc variants are per-quality media
      // playlists, loadable directly.
      if (def.key === "cinesrc") return resolved.source?.url;
      return variant?.uri;
    };

    const waitParsed = (hls) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out waiting for the playlist")), PARSE_TIMEOUT_MS);
        const onParsed = () => {
          clearTimeout(timer);
          hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
          hls.off(Hls.Events.ERROR, onError);
          resolve();
        };
        const onError = (_e, data) => {
          if (!data?.fatal) return;
          clearTimeout(timer);
          hls.off(Hls.Events.MANIFEST_PARSED, onParsed);
          hls.off(Hls.Events.ERROR, onError);
          reject(new Error(data?.details || "hls fatal error"));
        };
        hls.on(Hls.Events.MANIFEST_PARSED, onParsed);
        hls.on(Hls.Events.ERROR, onError);
      });

    const startLevelFor = (hls, def) => {
      // CineSrc loads its master: leave level selection on AUTO (-1) so ABR
      // starts conservatively and steps up only when the pipe sustains it.
      // (Forcing the top level first is exactly what stalled 4K playback.)
      if (def.key !== "cinesrc" || !Array.isArray(hls.levels) || hls.levels.length === 0) return;
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
      const args = { type, id, season: type === "tv" ? season : undefined, episode: type === "tv" ? episode : undefined };
      const stale = () => runRef.current !== run || controller.signal.aborted;
      const abortPromise = () =>
        new Promise((resolve) => {
          if (controller.signal.aborted) resolve("done");
          else controller.signal.addEventListener("abort", () => resolve("done"), { once: true });
        });
      // A loader/relay failure that smells like an expired token (VidCore
      // path tokens and CineSrc sessions both rotate) rather than a dead
      // CDN. Downloads survive this via re-mint; playback must too.
      const isAuthFatal = (detail) =>
        /\[relay:(segment-fetch-failed|manifest-fetch-failed)\]/.test(detail || "") ||
        /failed \((401|403|429)\)/.test(detail || "");
      const pickSmooth = (list) =>
        list.filter((v) => (v.height || 0) > 0 && (v.height || 0) <= 1080).sort((a, b) => (b.height || 0) - (a.height || 0))[0] ||
        list[0];

      // Returns true when playback settled on this source (caller stops), false
      // to move to the next source.
      const runSource = async (def) => {
        say(`Trying ${def.label}…`);
        let resolved = null;
        try {
          resolved = await def.resolve(args, { signal: controller.signal });
        } catch (error) {
          say(`${def.label}: resolve failed (${error?.code || error?.message}) — next source.`);
          return false;
        }
        let variants = resolved?.variants || [];
        if (variants.length === 0) {
          say(`${def.label}: no variants — next source.`);
          return false;
        }
        let liveSource = resolved.source;
        let liveRefUrl = resolved.source?.refUrl || resolved.source?.url;
        // attempt 0 = initial URLs; attempt 1 = one token-refresh re-resolve.
        let preferHeight = null;
        let resumeTime = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (stale()) return true;
          const pool = preferHeight != null ? variants.filter((v) => (v.height || 0) === preferHeight) : [];
          // Smooth start: open on the tallest rendition at or below 1080p so
          // the first seconds play instantly; 4K stays one tap away in the
          // menu. (A 4K segment needs ~20 Mbps sustained — opening straight
          // on it is what stalled playback after 5–10s.)
          let smoothStart = pool[0] || pickSmooth(variants);
          let entryUrl = entryUrlFor(def, { source: liveSource }, smoothStart);
          if (!entryUrl) {
            say(`${def.label}: no playable URL — next source.`);
            return false;
          }
          say(
            `${def.label}: ${variants.length} variant(s), loading ` +
              (def.key === "cinesrc" ? "master (ABR auto)…" : `${smoothStart?.height || "?"}p (smooth start)…`),
          );
          // Playability gate: prove one real media byte flows before hls.js
          // ever sees this source. A perfect-looking ladder with dead segments
          // (vidzen: playlist 200, fragments 429) otherwise plays as a black
          // screen with a known duration and no error.
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
          // Relay delivery is latency-bound (every chunk is a fresh serverless
          // round trip), so starting a tall rendition over it asks for timeouts.
          // On the relay path reopen at the tallest ≤720p rendition; the direct
          // path keeps the ≤1080p choice.
          if (def.key !== "cinesrc" && probe.via === "relay" && (smoothStart?.height || 0) > 720) {
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
          const hls = new Hls({
            loader: createStreamlyLoader({ getRefUrl: () => liveRefUrl }),
            // Adaptive bitrate + progressive MSE appends: chunks hit the
            // screen while the rest of the segment is still arriving. Forward
            // buffer is capped so a mid-buffer plateau never delays error
            // detection: 120s/120MB let a struggling source burn silently for
            // far too long — 30s/60MB is plenty for several segments and keeps
            // ABR tuning responsive.
            abrEnabled: true,
            progressive: true,
            maxBufferLength: 30,
            maxBufferSize: 60 * 1000 * 1000,
            // Netflix-authentic ABR: judge by MEASURED bytes/sec (not the
            // manifest's advertised bitrate, which relay-proxied sources lie
            // about), and never pull a rendition taller than the player's own
            // rendered size — a small window doesn't need 1080p and every rung
            // saved off the relay leg is one fewer stall.
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
            setShowLog(true);
          };
          const failOver = () => {
            try {
              hls.destroy();
            } catch {
              // already torn down
            }
            resolveFatal?.();
          };
          // Non-fatal fragment failures never reach the attempt log otherwise —
          // yet a loop of them IS the black screen (vidzen 429s). Count
          // consecutive ones and force the failover ourselves instead of
          // waiting out hls.js's long retry budget.
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
                // Multi-level sources get an early ABR step-down: pin one rung
                // lower so hls.js's own retry has a fighting chance instead of
                // re-burning the same doomed top-level fragment. Single-level
                // sources (VidCore/VidSrc) can't step down — only failover.
                const canStepDown =
                  Array.isArray(hls.levels) &&
                  hls.levels.length > 1 &&
                  Number.isInteger(hls.currentLevel) &&
                  hls.currentLevel > 0;
                if (consecFragFails >= 2 && canStepDown) {
                  hls.currentLevel = hls.currentLevel - 1;
                  consecFragFails = 0;
                  say(`${def.label}: downshifting to level ${hls.currentLevel} (${data.details})…`);
                  setShowLog(true);
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
          metaRef.current = { variants, sourceKey: def.key, refUrl: liveRefUrl, cinesrcLevels: def.key === "cinesrc" };
          startLevelFor(hls, def);
          setQualities(variants.map((v) => ({ uri: v.uri, height: v.height || 0, bandwidth: v.bandwidth || 0, label: v.label })));
          setIsMasterMode(def.key === "cinesrc");
          setActiveUri(def.key === "cinesrc" ? null : smoothStart?.uri || null);
          attachAudio(hls);
          setStatus(`playing via ${def.label}`);
          say(`${def.label}: PLAYING (${def.key === "cinesrc" ? "ABR auto" : `${smoothStart?.height || "?"}p`}).`);
          if (resumeTime != null) {
            try {
              videoRef.current.currentTime = resumeTime;
            } catch {
              // live-edge clamp — start wherever the fresh playlist begins
            }
            resumeTime = null;
          }
          try {
            await videoRef.current?.play();
          } catch {
            say("Autoplay blocked — tap the custom play button.");
          }
          // Non-master sources are single-rendition: their "current" level is
          // fixed, so feed the dialog the height directly.
          if (def.key !== "cinesrc") setCurrentHeight(smoothStart?.height ?? null);
          // Netflix resume gate: first real playback for this title/episode.
          maybeOfferResumeRef.current();
          // Park this attempt: a fatal error AFTER playback started either
          // refreshes tokens in place (same source, same quality, resume at
          // the saved position) or moves to the next source — never a dead
          // "playing" screen. Unmount/abort ends the park quietly.
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

      for (const def of SOURCES) {
        if (stale()) return;
        if (await runSource(def)) return;
      }
      if (stale()) return;
      setStatus("error");
      setFatal("No native source resolved this title (all three resolvers came up empty).");
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
    };
  }, [type, id, season, episode]);

  const pickQuality = async (uri, height) => {
    const hls = hlsRef.current;
    const meta = metaRef.current;
    if (!hls || !videoRef.current) return;
    const t = videoRef.current.currentTime || 0;
    const wasPaused = videoRef.current.paused;
    say(`Switching to ${height || "?"}p…`);
    setBuffering(true);
    poke();
    try {
      if (meta.cinesrcLevels && Array.isArray(hls.levels) && hls.levels.length > 0) {
        let best = 0;
        hls.levels.forEach((lvl, i) => {
          if (Math.abs((lvl.height || 0) - (height || 0)) < Math.abs((hls.levels[best].height || 0) - (height || 0))) best = i;
        });
        hls.currentLevel = best;
        setAutoLevel(false);
        setManualHeight(height || null);
        setActiveUri(null);
        say(`Level -> ${hls.levels[best]?.height || "?"}p (pinned).`);
        return;
      }
      hls.loadSource(uri);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("switch timed out")), 30000);
        const done = () => {
          clearTimeout(timer);
          hls.off(Hls.Events.MANIFEST_PARSED, done);
          resolve();
        };
        hls.on(Hls.Events.MANIFEST_PARSED, done);
      });
      try {
        videoRef.current.currentTime = t;
      } catch {
        // live-edge clamp — start wherever the new playlist begins
      }
      if (!wasPaused) {
        try {
          await videoRef.current.play();
        } catch {
          // user gesture needed — custom transport is present
        }
      }
      setActiveUri(uri);
      say(`Switched to ${height || "?"}p.`);
    } catch (error) {
      say(`Switch failed: ${error?.message || "unknown"}.`);
    }
  };

  const pickAudio = (index) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.audioTrack = index;
    setAudioIndex(index);
    poke();
    say(`Audio -> ${audioTracks[index]?.name || index}.`);
  };

  const pickAuto = () => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = -1;
    setAutoLevel(true);
    setManualHeight(null);
    poke();
    say("Level -> Auto (ABR).");
  };

  // Render-time derivations for the scrubber.
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progressRatio = safeDuration > 0 ? Math.min(1, Math.max(0, currentTime / safeDuration)) : 0;
  // While dragging, the bar follows the pointer — not the playback head, which
  // is frozen until the single commit-on-release seek lands.
  const effectiveRatio = scrubDragging ? (scrubHover ?? progressRatio) : progressRatio;
  const hoverRatio = scrubHover ?? (scrubDragging ? progressRatio : null);
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const showEpisodesButton = Array.isArray(episodes) && episodes.length > 0;

  return (
    <div>
      <div
        ref={screenRef}
        onMouseMove={poke}
        onTouchStart={poke}
        style={{
          position: "relative",
          background: "#000",
          borderRadius: 12,
          overflow: "hidden",
          cursor: !controlsVisible && playing ? "none" : "default",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      >
        <video
          ref={videoRef}
          playsInline
          onClick={handleVideoClick}
          style={{ width: "100%", display: "block", aspectRatio: "16 / 9", background: "#000" }}
        />
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
            padding: "12px 12px 28px",
            background: "linear-gradient(rgba(0,0,0,0.65), transparent)",
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
            <ArrowLeft size={26} />
          </IconBtn>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowLog((v) => !v);
              poke();
            }}
            aria-label="Toggle debug log"
            title="Prototype attempt log"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: showLog ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.35)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Bug size={14} /> Log
          </button>
        </div>
        {/* Center: red buffering spinner, or the replay button at the end
            (Netflix end state). No center play glyph otherwise. */}
        {buffering && (
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
            <Loader2 size={56} className="animate-spin" color={NETFLIX_RED} />
          </div>
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
            padding: "8px 16px 10px",
            background: "linear-gradient(transparent, rgba(0,0,0,0.82))",
            opacity: controlsVisible ? 1 : 0,
            transition: "opacity 0.3s",
            pointerEvents: controlsVisible ? "auto" : "none",
            zIndex: 4,
          }}
        >
          <div style={{ marginBottom: 6, minWidth: 0 }}>
            <div
              style={{
                color: "#fff",
                fontWeight: 800,
                fontSize: "clamp(15px, 2.2vw, 20px)",
                letterSpacing: "-0.01em",
                lineHeight: 1.15,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {displayTitle}
            </div>
            {displaySubtitle ? (
              <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: 600, marginTop: 2 }}>
                {displaySubtitle}
              </div>
            ) : null}
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
              height: 24,
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
              touchAction: "none",
            }}
          >
            <div
              style={{
                position: "relative",
                height: hoverRatio != null ? 6 : 4,
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
                        background: "rgba(255,255,255,0.45)",
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
                  left: `calc(${effectiveRatio * 100}% - ${(hoverRatio != null ? 16 : 12) / 2}px)`,
                  width: hoverRatio != null ? 16 : 12,
                  height: hoverRatio != null ? 16 : 12,
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
                  bottom: 26,
                  left: `${Math.min(94, Math.max(6, hoverRatio * 100))}%`,
                  transform: "translateX(-50%)",
                  background: "rgba(0,0,0,0.85)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  padding: "4px 10px",
                  borderRadius: 6,
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                }}
              >
                {fmtTime(hoverRatio * safeDuration)}
              </div>
            )}
          </div>
          {/* Transport row. */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 2, minWidth: 0 }}>
              <IconBtn label={playing ? "Pause" : "Play"} onClick={togglePlay}>
                {playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" />}
              </IconBtn>
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
                  width: 40,
                  height: 40,
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
                <RotateCcw size={26} />
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
                  width: 40,
                  height: 40,
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
                <RotateCw size={26} />
                <span style={{ position: "absolute", fontSize: 8.5, fontWeight: 800, marginTop: 3 }}>10</span>
              </button>
              <span
                onMouseEnter={() => setVolHover(true)}
                onMouseLeave={() => setVolHover(false)}
                style={{ display: "flex", alignItems: "center" }}
              >
                <IconBtn label={muted ? "Unmute" : "Mute"} onClick={toggleMute}>
                  <VolumeIcon size={26} />
                </IconBtn>
                {volHover && (
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={muted ? 0 : volume}
                    onChange={(e) => {
                      setVolume(Number(e.target.value));
                      setMuted(false);
                      poke();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Volume"
                    style={{ width: 84, accentColor: "#fff", cursor: "pointer" }}
                  />
                )}
              </span>
              <span
                style={{
                  fontSize: 14,
                  color: "rgba(255,255,255,0.9)",
                  fontVariantNumeric: "tabular-nums",
                  marginLeft: 6,
                  whiteSpace: "nowrap",
                }}
              >
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
              {showEpisodesButton && (
                <IconBtn
                  label="Episodes"
                  active={panel === "episodes"}
                  onClick={() => {
                    setPanel((p) => (p === "episodes" ? null : "episodes"));
                    poke();
                  }}
                >
                  <ListVideo size={26} />
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
                <Captions size={26} />
              </IconBtn>
              <IconBtn label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={goFullscreen}>
                {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
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
              left: "50%",
              transform: "translateX(-50%)",
              bottom: 176,
              display: "flex",
              alignItems: "center",
              gap: 14,
              background: "rgba(14,14,14,0.96)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              padding: "10px 14px",
              zIndex: 6,
              boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 14.5 }}>
                You left off at {fmtTime(resumeOffer.at)}
              </div>
              <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
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
                padding: "8px 16px",
                background: "#fff",
                color: "#000",
                border: "none",
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 13.5,
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
                background: "rgba(255,255,255,0.12)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 13.5,
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
              right: 16,
              bottom: 176,
              width: "min(300px, 62%)",
              background: "rgba(14,14,14,0.96)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 12,
              padding: 12,
              zIndex: 6,
              boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
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
            <div style={{ marginTop: 4, color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.25 }}>
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
                padding: "7px 12px",
                background: "#fff",
                color: "#000",
                border: "none",
                borderRadius: 8,
                fontWeight: 800,
                fontSize: 13.5,
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
              right: 12,
              bottom: 168,
              width: panel === "subs" ? "min(560px, 92%)" : "min(330px, 82%)",
              maxHeight: "62%",
              overflowY: "auto",
              background: "rgba(18,18,18,0.97)",
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 12,
              padding: 12,
              zIndex: 5,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>
                {panel === "subs" ? "Audio & Subtitles" : "Episodes"}
              </span>
              <IconBtn label="Close panel" onClick={() => setPanel(null)}>
                <X size={18} />
              </IconBtn>
            </div>
            {panel === "subs" ? (
              <div style={{ display: "flex", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", margin: "8px 0 2px" }}>
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
                    <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)", margin: "6px 0 2px", lineHeight: 1.45 }}>
                      This source serves one soundtrack — no alternate audio to
                      switch to.
                    </p>
                  )}
                  <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", margin: "12px 0 2px" }}>
                    Subtitles
                  </p>
                  <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.5)", margin: "6px 0 2px", lineHeight: 1.45 }}>
                    Not available — the native sources don&apos;t carry subtitle
                    tracks.
                  </p>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", margin: "8px 0 2px" }}>
                    Video Quality
                  </p>
                  {isMasterMode && (
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
                  )}
                  {qualities.map((q, i) => {
                    const selected = isMasterMode
                      ? autoLevel
                        ? currentHeight != null && q.height === currentHeight
                        : manualHeight != null && manualHeight === q.height
                      : activeUri === q.uri;
                    return (
                      <DialogRow
                        key={`${q.uri}::${i}`}
                        selected={selected}
                        onClick={() => pickQuality(q.uri, q.height)}
                        title={q.label || `${q.height}p`}
                        sub={q.bandwidth ? `${(q.bandwidth / 1e6).toFixed(1)} Mbps` : undefined}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              episodes.map((ep) => (
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
              ))
            )}
          </div>
        )}
      </div>
      {fatal && (
        <p style={{ marginTop: 12, padding: 12, borderRadius: 10, background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.35)", fontSize: 14 }}>
          {fatal}
        </p>
      )}
      {showLog && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginBottom: 6 }}>
            Attempt log · {type} {id}
            {type === "tv" ? ` S${season}E${episode}` : ""} · {status} · buf {bufferedSecs}s
          </p>
          <pre
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 10,
              padding: 12,
              fontSize: 12,
              whiteSpace: "pre-wrap",
              maxHeight: 260,
              overflowY: "auto",
            }}
          >
            {lines.length > 0 ? lines.join("\n") : "starting…"}
          </pre>
        </div>
      )}
    </div>
  );
}
