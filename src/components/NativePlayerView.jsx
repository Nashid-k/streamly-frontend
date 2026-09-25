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
import { SubtitleFetcher } from "../api/subtitleFetcher";
import { logWarn, logError } from "../utils/debugLogger";
import { SubtitleEngine } from "../utils/subtitleEngine";

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
// Forward-buffer policy (YouTube-style deep buffering). hls.js stops fetching
// ahead when EITHER maxBufferLength(seconds) OR maxBufferSize(bytes) is hit.
// A FIXED 60MB byte cap is the reason "4K" never builds a buffer: a ~20Mbps
// stream burns 60MB in ~24s, so the pipe is idled before it can get ahead.
// Scale the byte cap to the top rendition's bitrate instead: always keep room
// for ~BUFFER_DEPTH_SECONDS of the tallest variant we serve. This buffer lives
// in the USER's browser MSE — it never touches our Vercel function memory, and
// the total relayed bytes per title are unchanged (buffering downloads the
// same data sooner, not more). Dead-source failfast is preserved: our own
// frag-failure counter/step-down fire on LOAD events, independent of depth.
// Depth note: YouTube's media engine targets roughly 30-60s of forward buffer
// (min ~2-3 chunks) and DOWNGRADES quality when the arrival rate can't
// sustain it — it never lets a stream play in a stall loop. The user asked
// for "2 minutes of buffering", so the goal is set to two minutes at the
// served bitrate; the hard byte cap bounds the RAM hit at the top.
const BUFFER_DEPTH_SECONDS = 120;
const MIN_BUFFER_SIZE = 60 * 1000 * 1000; // hls.js default floor
const MAX_BUFFER_SIZE = 240 * 1000 * 1000; // hard ceiling: ~2min of 4K@16Mbps, ~10min of 1080p
// YouTube-style underflow guard: you cannot "buffer more" when a rendition
// outruns the pipe — the buffer drains no matter the depth goal. YouTube's
// actual mechanism is to step the quality DOWN so refill outruns playback.
// If the forward buffer holds below this floor for a sustained stretch while
// playing (and isn't refilling), we drop one rung instead of draining to 0
// and stalling. Shared with the buffer display so "buf 8s" visibly maps to
// "about to drop a rung".
const BUFFER_FLOOR_SECONDS = 18;
const BUFFER_UNDERFLOOR_MS = 8000;
// While the forward buffer goes deep, don't let the WATCHED back buffer grow
// without bound (default is Infinity — a 2h movie would pin ~7GB in the
// browser's RAM). Keep 60s behind; hls.js trims the rest like Netflix does.
const BACK_BUFFER_SECONDS = 60;
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
        padding: "9px 12px",
        borderRadius: 8,
        border: "none",
        background: selected ? "rgba(255,255,255,0.12)" : "transparent",
        color: "#fff",
        opacity: disabled ? 0.45 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
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
  // NetMirror (net27.cc) is a DIRECT mp4 source whose "audio" = per-language
  // dubs, each with its own file — a true multiple-audio feed where the HLS
  // sources only ever deliver track-within-the-same-stream alternates. Listed
  // first so the native player catches every title (incl. K-drama / Malayalam
  // hits like Premalu that the HLS catalogues lack); its probe is direct-first
  // so a blocked CDN falls through to VidCore quickly.
  { key: "netmirror", label: "NetMirror (native)", resolve: (a, o) => downloadService.resolveNetmirror(a, o) },
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
  // IMDb id used to look up OpenSubtitles tracks ({imdbId} or {imdb_id} from
  // TMDB). Optional — subtitle menu shows "not found" when absent.
  imdbId = "",
  episodes = [],
  onSelectEpisode,
  onClose,
  // Continue-watching entry for THIS title/episode ({ timestamp } in s, >0),
  // plus a sink to persist playback positions. Both optional — leave them off
  // and the player simply never offers resume / never saves progress.
  watchedEntry,
  onProgressChange,
  // TMDB original_language (iso code) for the TITLE — the only real language
  // signal the streaming sources give us. Surfaced as film-level fact in the
  // Audio panel; the per-TRACK languages are not exposed by any backend.
  originalLanguage = "",
}) {
  const videoRef = useRef(null);
  const screenRef = useRef(null);
  const scrubRef = useRef(null);
  const hlsRef = useRef(null);
  const runRef = useRef(0);
  const metaRef = useRef({ variants: [], sourceKey: null, refUrl: null, cinesrcLevels: false, mp4Mode: false });
  // Media URLs we already ran an on-failure diagnostic for (avoid console spam
  // across quality/audio swaps of the same file).
  const diagnosedMediaRef = useRef(new Set());
  // Wall-clock cap for the on-failure net27 diagnostic (once/hour per browser
  // — see diagnoseMediaLoad; keeps us from tripping their per-IP throttle).
  const lastNetmirrorDiagRef = useRef(0);
  // net27's mp4 proxy 429s this connection once, it will 429 forever (their
  // per-IP gate). Remember that so later plays skip NetMirror instead of
  // paying the stall again.
  const netmirrorDownRef = useRef(
    (() => {
      try {
        // Remember the verdict across page loads within the tab session so we
        // never pay the ~14s resolve+stall again after net27 refused once.
        return sessionStorage.getItem("streamly.netmirrorDown") === "1";
      } catch {
        return false;
      }
    })(),
  );
  const idleTimer = useRef(null);
  const clickTimer = useRef(null);
  // Pending "drop the hover overlay" deadline after a released scrub. Cleared
  // when a NEW scrub starts, or the bar snaps back to the playback head
  // mid-drag when the leftover 250ms timer fires between the two gestures.
  const scrubHoverTimer = useRef(null);
  const watchedEntryRef = useRef(watchedEntry);
  watchedEntryRef.current = watchedEntry;
  const lastProgressSaved = useRef(0);
  const resumeHandledKeyRef = useRef(null); // title/episode key that already offered resume
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSelectEpisodeRef = useRef(onSelectEpisode);
  onSelectEpisodeRef.current = onSelectEpisode;
  const commitResumeRef = useRef(null); // assigned below, driven by the resume card
  const maybeOfferResumeRef = useRef(() => {}); // reassigned below; called from the run effect
  // Reassigned below; the run effect's relay-demote calls it at runtime (keeps
  // the effect's exhaustive-deps clean).
  const pickQualityRef = useRef(null);
  // Guards against rapid quality switches clobbering each other: each call
  // stamps a token; after every await it re-checks it's still the newest.
  const switchTokenRef = useRef(0);
  // Underflow watchdog: remembers when the forward buffer first dipped below
  // BUFFER_FLOOR_SECONDS so the step-down fires only after a sustained shortfall.
  const lowBufferRef = useRef({ since: 0, prev: -1 });
  // Subtitle render state. The cue text is derived on video `timeupdate` from a
  // SubtitleEngine binary-search; a ref snapshot avoids re-rendering the whole
  // player on every tick (only when the active line actually changes).
  const subtitleEngineRef = useRef(null);
  const subtitleEnabledRef = useRef(false); // mirrors state, read inside onTime
  const subtitleCueRef = useRef(null); // last rendered cue text
  const subtitleTokenRef = useRef(0); // download race guard (last pick wins)

  const [lines, setLines] = useState([]);
  const [status, setStatus] = useState("idle");
  const [qualities, setQualities] = useState([]);
  const [activeUri, setActiveUri] = useState(null);
  const [isMasterMode, setIsMasterMode] = useState(false);
  const [audioTracks, setAudioTracks] = useState([]);
  const [audioIndex, setAudioIndex] = useState(0);
  // Videasy (VidCore) titles expose a real second soundtrack under a hidden
  // base playlist (index-s{res}-v1) — the alternate row swaps the whole
  // stream to it. Only TRACK position is knowable; languages are not labelled
  // by any backend (verified: API JSON, playlists, and media boxes carry none).
  const [altAudioOn, setAltAudioOn] = useState(false);
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
  // Real loader state: true while the screen has nothing new to show (initial
  // load, stall, seek). Driven by the video element's own signals.
  const [buffering, setBuffering] = useState(true);
  const [bufferedSecs, setBufferedSecs] = useState(0);
  const [bufferedTargetSecs, setBufferedTargetSecs] = useState(30);
  const [bufferedRanges, setBufferedRanges] = useState([]);
  // Master-mode (CineSrc) starts on ABR auto; picking a level pins it.
  const [autoLevel, setAutoLevel] = useState(true);
  const [manualHeight, setManualHeight] = useState(null);
  // The rendition ABR currently settled on (LEVEL_SWITCHED) — shows the real
  // "now playing" resolution in the quality dialog even while on Auto.
  const [currentHeight, setCurrentHeight] = useState(null);
  // Netflix resume card: { at, left } where `at` is the saved position in s.
  const [resumeOffer, setResumeOffer] = useState(null);
  // Subtitles (OpenSubtitles + SubtitleEngine overlay, mirrors CustomVideoPlayer).
  const [subtitleLanguages, setSubtitleLanguages] = useState([]); // [{language, languageId, downloadLink}]
  const [subtitleEnabled, setSubtitleEnabled] = useState(false);
  const [activeSubtitle, setActiveSubtitle] = useState(null); // current cue line or null
  const [currentSubtitle, setCurrentSubtitle] = useState(null); // the selected track object
  const [isFetchingSubtitles, setIsFetchingSubtitles] = useState(false);
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
  // Fragments currently flowing via the Vercel relay (0 = all direct). A real
  // streak past a couple means the CDN throttled the direct pull mid-session
  // — surfaced in the attempt log so "loads on good internet" is diagnosable.
  const [relayStreak, setRelayStreak] = useState(0);
  // Transport verdict for THIS session: does the current source's fragments
  // flow via the serverless relay (true) or straight from the CDN (false)?
  // Drives the quality menu's relay-limited rows and lets the switch skip its
  // re-probe when the verdict is already known. Live-flipped by the loader.
  const [transportRelay, setTransportRelay] = useState(false);

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
    scrubHoverTimer.current = window.setTimeout(() => setScrubHover(null), 250);
  };

  // A cancelled gesture (Esc on touch, scroll steal, pointer leaving the
  // window) must not strand the scrubber in the dragging state.
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
    // Netflix behavior: the countdown only runs while playback is actually
    // underway. When autoplay is blocked (or the user pauses mid-card) the
    // ticks freeze and the auto-commit does nothing — committing a seek into
    // a paused player would flash "Resuming…" and vanish with the card. The
    // user tapping play commits the offer immediately instead (togglePlay).
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

  /* Direct-mp4 (NetMirror) helpers: the <video> element plays a raw file, so
     "waiting for the media" is a loadedmetadata/error race (mirrors the hls
     waitParsed promise), and a quality/audio switch is a src swap that keeps
     the playhead. */
  const waitVideoElement = (video, { timeoutMs = PARSE_TIMEOUT_MS, signal } = {}) =>
    new Promise((resolve, reject) => {
      let settled = false;
      let timer;
      const cleanup = () => {
        clearTimeout(timer);
        video?.removeEventListener("loadedmetadata", onMeta);
        video?.removeEventListener("error", onErr);
        signal?.removeEventListener("abort", onAbort);
      };
      const finish = (fn, arg) => {
        if (settled) return;
        settled = true;
        cleanup();
        fn(arg);
      };
      const onMeta = () => finish(resolve);
      const onErr = () => finish(reject, new Error("mp4 load failed"));
      const onAbort = () => {
        const error = new Error("Aborted");
        error.name = "AbortError";
        finish(reject, error);
      };
      timer = setTimeout(() => finish(reject, new Error("Timed out waiting for the mp4")), timeoutMs);
      video.addEventListener("loadedmetadata", onMeta);
      video.addEventListener("error", onErr);
      signal?.addEventListener("abort", onAbort, { once: true });
    });

  const loadMp4 = async (video, url, signal) => {
    video.removeAttribute("src");
    video.src = url;
    video.load();
    await waitVideoElement(video, { signal });
  };

const swapMp4 = async (video, url, resumeAt, wasPaused) => {
    await loadMp4(video, url);
    if (resumeAt > 0) {
      try {
        video.currentTime = resumeAt;
      } catch {
        // live-edge clamp — start wherever the file begins
      }
    }
    if (!wasPaused) {
      try {
        await video.play();
      } catch {
        // autoplay policy fallback path handled by the outer play()
      }
    }
  };

  /* When a direct mp4 fails to load, re-request its first byte from the
     browser and log the REAL answer (HTTP status, content-type, CORS) under
     [Streamly][netmirror]. net27's proxy replies Access-Control-Allow-Origin:
     *, so the status even for a refusal is readable here — that distinguishes
     "net27 throttled this IP (429)" from "server up, stream fine (200/206)".
     Fire-and-forget; deduped per URL; never throws. */
  const diagnoseMediaLoad = (url) => {
    if (diagnosedMediaRef.current.has(url)) return;
    diagnosedMediaRef.current.add(url);
    // net27's proxy is per-IP throttled and their own player sends ONE request
    // per stream. A failed play firing the diagnostic every time would burn the
    // bucket ourselves — cap it at once per hour per browser.
    const now = Date.now();
    if (now - lastNetmirrorDiagRef.current < 60 * 60 * 1000) return;
    lastNetmirrorDiagRef.current = now;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    (async () => {
      try {
        const res = await fetch(url, { headers: { range: "bytes=0-0" }, signal: ctrl.signal });
        const type = res.headers.get("content-type") || "";
        const cr = res.headers.get("content-range") || "";
        const acao = res.headers.get("access-control-allow-origin") || "";
        let firstBytes;
        try {
          const buf = await res.arrayBuffer();
          firstBytes = buf.byteLength
            ? new TextDecoder().decode(buf.slice(0, 48)).replace(/\s+/g, " ").slice(0, 40)
            : "";
        } catch {
          // head-only reply — still useful
        }
        logError(
          "netmirror",
          `Media diagnostic: HTTP ${res.status}${res.ok ? " (media served)" : " (refused)"}`,
          null,
          {
            status: res.status,
            contentType: type,
            contentRange: cr,
            acao,
            firstBytes: firstBytes || undefined,
            url: String(url).slice(0, 180),
          },
        );
        if (res.status >= 400) {
          netmirrorDownRef.current = true;
          try {
            sessionStorage.setItem("streamly.netmirrorDown", "1");
          } catch {
            // storage unavailable (private mode) — session-only verdict stays
          }
        }
      } catch (error) {
        logError("netmirror", "Media diagnostic: request failed from the browser (CORS/network)", error, {
          url: String(url).slice(0, 180),
        });
      } finally {
        clearTimeout(timer);
      }
    })();
  };

  useEffect(() => {
    if (!Hls.isSupported()) {
      setFatal("This browser has no MediaSource support — native playback cannot run here.");
      return undefined;
    }
    const run = runRef.current + 1;
    runRef.current = run;
    const controller = new AbortController();

    const entryUrlFor = (def, resolved, variant) => {
      // Master sources (CineSrc, canonical NetMirror mirrors) keep audio
      // groups + levels on the master — load the master so hls.js sees them.
      // VidCore/VidSrc variants are per-quality media playlists, loadable
      // directly.
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
        // Abort hygiene: a source failover / title switch mid-load previously
        // left this promise hanging past its 75s timer (cleanup destroyed hls
        // but the timer kept the shadow). Reject immediately on abort.
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
      // Master sources load their master: leave level selection on AUTO (-1) so
      // ABR starts conservatively and steps up only when the pipe sustains it.
      // (Forcing the top level first is exactly what stalled 4K playback.)
      if (!metaRef.current?.cinesrcLevels || !Array.isArray(hls.levels) || hls.levels.length === 0) return;
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
      setAltAudioOn(false);
      setBuffering(true);
      setBufferedSecs(0);
      setBufferedTargetSecs(30);
      setBufferedRanges([]);
      setAutoLevel(true);
      setManualHeight(null);
      setCurrentHeight(null);
      setResumeOffer(null);
      setPanel(null);
      setRelayStreak(0);
      setTransportRelay(false);
      const args = { type, id, season: type === "tv" ? season : undefined, episode: type === "tv" ? episode : undefined, title };
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
        // Master sources (CineSrc / canonical NetMirror mirrors) ship the whole
        // multivariant + audio-group tree in ONE url; every other source is a
        // per-rendition media playlist or a direct file.
        const isMaster = Boolean(liveSource?.multiLevelMaster);
        // Direct-file sources (NetMirror's per-language mp4 dubs) skip hls.js
        // entirely: the <video> element plays the file, and "audio" switching
        // is a src swap to that language's own mp4.
        const isDirect = liveSource && (liveSource.kind === "mp4" || liveSource.kind === "direct");
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
              (isMaster ? "master (ABR auto)…" : `${smoothStart?.height || "?"}p (smooth start)…`),
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
          setTransportRelay(probe?.via === "relay");
          // Relay delivery is latency-bound (every chunk is a fresh serverless
          // round trip), so starting a tall rendition over it asks for timeouts.
          // On the relay path reopen at the tallest ≤720p rendition; the direct
          // path keeps the ≤1080p choice.
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
          // NetMirror / any direct-mp4 source: no hls.js, no MSE manifest — the
          // video element plays the raw file, quality and audio (per-language
          // dubs) are src swaps. Parked until abort or a video-level error.
          if (isDirect) {
            if (attempt !== 0) return false;
            try {
              hlsRef.current?.destroy();
            } catch {
              // previous instance already gone
            }
            hlsRef.current = null;
            const video = videoRef.current;
            if (!video) return false;
            let directOutcome = "fatal";
            try {
              setActiveUri(entryUrl);
              setQualities(
                variants.map((v) => ({ uri: v.uri, height: v.height || 0, bandwidth: v.bandwidth || 0, label: v.label })),
              );
              setIsMasterMode(false);
              setAutoLevel(false);
              setCurrentHeight(smoothStart?.height ?? null);
              metaRef.current = { variants, sourceKey: def.key, refUrl: liveRefUrl, cinesrcLevels: false, mp4Mode: true };
              const dubs = Array.isArray(resolved.audio) ? resolved.audio : [];
              if (dubs.length > 0) {
                setAudioTracks(
                  dubs.map((d, i) => ({ index: i, name: d.language || `Audio ${i + 1}`, lang: d.language || "", url: d.url || "" })),
                );
                setAudioIndex(0);
              } else {
                setAudioTracks([]);
                setAudioIndex(0);
              }
              await loadMp4(video, entryUrl, controller.signal);
              if (stale()) return true;
              setStatus(`playing via ${def.label}`);
              say(`${def.label}: PLAYING direct (${smoothStart?.height || "?"}p).`);
              try {
                await video.play();
              } catch {
                say("Autoplay blocked — tap the custom play button.");
              }
              maybeOfferResumeRef.current?.();
              directOutcome = await Promise.race([
                abortPromise().then(() => "abort"),
                new Promise((resolvePark) => {
                  video.addEventListener(
                    "error",
                    () => {
                      say(`${def.label}: direct stream error — next source.`);
                      resolvePark("fatal");
                    },
                    { once: true },
                  );
                }),
              ]);
            } catch (error) {
              if (error?.name === "AbortError" || stale()) directOutcome = "abort";
              else {
                say(`${def.label}: ${error?.message || "load failed"} — next source.`);
                say(`${def.label}: media diagnostic logged to console ([Streamly][netmirror]).`);
                diagnoseMediaLoad(entryUrl);
                directOutcome = "fatal";
              }
            }
            if (directOutcome === "abort") return true;
            return false;
          }
          try {
            hlsRef.current?.destroy();
          } catch {
            // previous instance already gone
          }
          // Deep, bitrate-aware forward buffer: size the byte cap so the top
          // rendition we serve can always get BUFFER_DEPTH_SECONDS ahead.
          const topBps = variants.reduce((m, v) => Math.max(m, Number(v.bandwidth) || 0), 0) || 8 * 1000 * 1000;
          const maxBufferSize = Math.min(
            MAX_BUFFER_SIZE,
            Math.max(MIN_BUFFER_SIZE, Math.ceil((topBps / 8) * BUFFER_DEPTH_SECONDS)),
          );
          const bufferDepthSecs = Math.round(Math.floor(maxBufferSize / Math.max(1, topBps / 8)));
          setBufferedTargetSecs(bufferDepthSecs);
          say(`Buffer: up to ~${bufferDepthSecs}s (~${Math.round(maxBufferSize / 1024 / 1024)}MB) ahead.`);
          // Start-conservative, pick-liberal transport policy: fragments load
          // through the Vercel relay with PARALLEL range chunking (see
          // nativeHlsLoader), so a manual pick of a tall rendition is allowed
          // to try — the buffer-floor step-down negotiates back down seamlessly
          // if the pipe can't sustain it. What we no longer do is yank a user's
          // 4K/1080p pick after 2 relayed fragments (every source here is
          // relay-only on the free tier; banning tall rungs bans everything).
          // Startup STAYS conservative (≤720p over relay) so a fresh open is
          // always instant; the menu lets the user raise from there. CineSrc is
          // multi-level ABR and self-adjusts entirely.
          const hls = new Hls({
            loader: createStreamlyLoader({
              getRefUrl: () => liveRefUrl,
              onRelayPath: () => {
                setRelayStreak((n) => n + 1);
                setTransportRelay(true);
              },
              onDirectPath: () => {
                setRelayStreak(0);
                setTransportRelay(false);
              },
            }),
            // Adaptive bitrate + progressive MSE appends: chunks hit the
            // screen while the rest of the segment is still arriving. The
            // depth is now scaled to the served bitrate (see the constants
            // above) — a fixed 60MB cap is what strangled buffering at high
            // quality. The back buffer stays small (watched content is
            // trimmed) so device RAM stays bounded even on long titles.
            abrEnabled: true,
            progressive: true,
            maxBufferLength: BUFFER_DEPTH_SECONDS,
            maxBufferSize,
            backBufferLength: BACK_BUFFER_SECONDS,
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
                // Only step down while in PURE AUTO (manualLevel -1): a quality
                // the user pinned in the menu is never overridden — a pinned
                // level that keeps failing goes straight to failover.
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
          const altByUri = {};
          variants.forEach((v) => {
            if (v.altUri) {
              altByUri[v.uri] = v.altUri;
              altByUri[v.altUri] = v.uri;
            }
          });
          metaRef.current = {
            variants,
            sourceKey: def.key,
            refUrl: liveRefUrl,
            cinesrcLevels: isMaster,
            altByUri,
          };
          startLevelFor(hls);
          setQualities(variants.map((v) => ({ uri: v.uri, height: v.height || 0, bandwidth: v.bandwidth || 0, label: v.label })));
          setIsMasterMode(isMaster);
          setActiveUri(isMaster ? null : smoothStart?.uri || null);
          attachAudio(hls);
          setStatus(`playing via ${def.label}`);
          say(`${def.label}: PLAYING (${isMaster ? "ABR auto" : `${smoothStart?.height || "?"}p`}).`);
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
          if (!isMaster) setCurrentHeight(smoothStart?.height ?? null);
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
        if (def.key === "netmirror" && netmirrorDownRef.current) {
          say("NetMirror: net27 refused earlier (HTTP 429) — skipping this session.");
          continue;
        }
        if (await runSource(def)) return;
      }
      if (stale()) return;
      setStatus("error");
      setFatal("No native source resolved this title (all four resolvers came up empty).");
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
      // Direct-mp4 mode: drop the src so an abandoned file fetch stops on the
      // next title/run instead of streaming in the background.
      try {
        videoRef.current?.removeAttribute?.("src");
      } catch {
        // element already detached
      }
    };
  }, [type, id, season, episode, title]);

  const pickQuality = async (uri, height, opts) => {
    const hls = hlsRef.current;
    const meta = metaRef.current;
    if (!videoRef.current) return;
    // Direct-mp4 source: swap the file (keep the playhead + paused state).
    if (meta?.mp4Mode) {
      const video = videoRef.current;
      const t = video.currentTime || 0;
      const wasPaused = video.paused;
      if (uri === activeUri) {
        say(`Already playing ${height || "?"}p — no reload.`);
        return;
      }
      say(`Switching to ${height || "?"}p…`);
      setBuffering(true);
      poke();
      try {
        await swapMp4(video, uri, t, wasPaused);
        setActiveUri(uri);
        setCurrentHeight(height || null);
        say(`Switched to ${height || "?"}p.`);
      } catch (error) {
        say(`Switch failed: ${error?.message || "unknown"}.`);
        setBuffering(false);
      }
      return;
    }
    if (!hls) return;
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
        // Pin the dialog highlight to the level ACTUALLY selected (the
        // advertised row height can differ a few px from the real stream).
        setManualHeight(hls.levels[best]?.height || height || null);
        setActiveUri(null);
        say(`Level -> ${hls.levels[best]?.height || "?"}p (pinned).`);
        return;
      }
      const myId = (switchTokenRef.current += 1);
      // Pre-warm the swap. A single-level rendition is a separate media
      // playlist, so the swap itself pays a manifest fetch + first fragment.
      // Probe the TARGET first (while the current level still plays): it warms
      // the CDN edge AND proves the route is alive. With the relay now
      // fetching fragments' range slices in PARALLEL (nativeHlsLoader), a tall
      // pick is allowed to try; if the pipe can't sustain it the buffer-floor
      // step-down negotiates back down seamlessly — the old auto-substitute to
      // ≤720p is gone, so a user can genuinely choose 1080p/4K (this is a
      // relay-only app on the free tier; banning tall rungs bans everything).
      let chosenUri = uri;
      let chosenHeight = height;
      // While the alternate soundtrack (the hidden -v1 base) is active, a
      // quality pick must stay on the SAME audio: variants list the -a1 uris,
      // so map the pick to that rendition's alternating twin. The swap itself
      // (pickAltAudio) passes rawAlt and bypasses this so its target uri is
      // honored exactly in both directions.
      const rawAlt = typeof opts === "object" && opts !== null && opts.rawAlt === true;
      const twin = !rawAlt && altAudioOn ? metaRef.current?.altByUri?.[uri] : null;
      if (twin && twin !== uri) {
        chosenUri = twin;
        if (uri === activeUri) {
          say(`Already on ${height || "?"}p (Alternate) — no reload.`);
          setBuffering(false);
          setControlsVisible(true);
          return;
        }
      }
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
        // live-edge clamp — start wherever the new playlist begins
      }
      // Reproduce the "paused switch feels instant" behavior: a fresh play()
      // with zero buffered data at the new position drops straight back into
      // `waiting` (the playing-switch stall). So wait for the first media
      // bytes to land BEFORE resuming — bounded by a short timeout so a dead
      // source still surfaces the switch error, not a forever-spinner.
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
      // A failed switch must never leave the honest buffering spinner stuck.
      // (The runSource ERROR handler's failover, when invoked, re-drives its
      // own spinner for the next source.)
      setBuffering(false);
    }
  };
  pickQualityRef.current = pickQuality;

  // YouTube's anti-stall rule. The depth goal only helps when the pipe can
  // refill faster than a segment plays; when it can't, the buffer drains and
  // playback enters the 5s/5s loop. Drop one rung once the forward buffer
  // sits under BUFFER_FLOOR_SECONDS for a sustained stretch WITHOUT refilling
  // (a bright startup fill is normal down to the floor and must not trigger).
  // Auto-level only: a pinned selection is the user's explicit override.
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
      if (metaRef.current?.cinesrcLevels) return;
      const curH = currentHeight || 0;
      const rungs = qualities
        .filter((q) => (q.height || 0) > 0 && (q.height || 0) < curH)
        .sort((a, b) => (b.height || 0) - (a.height || 0));
      const target = rungs[0];
      if (!target || activeUri === target.uri) return;
      say(`Buffer holds <${BUFFER_FLOOR_SECONDS}s — stepping down to ${target.height || "?"}p so it refills (keeps playing).`);
      setShowLog(true);
      st.prev = bufferedSecs;
      pickQualityRef.current?.(target.uri, target.height)?.catch?.(() => {});
      return;
    }
    st.since = 0;
    st.prev = bufferedSecs;
  }, [bufferedSecs, status, buffering, currentHeight, qualities, activeUri]);

  const pickAudio = (index) => {
    const meta = metaRef.current;
    const video = videoRef.current;
    // Direct-mp4 source: the "audio tracks" are per-language mp4 dubs — switch
    // is a src swap to that language's own file (playhead + paused preserved).
    if (meta?.mp4Mode && video) {
      const track = audioTracks[index];
      setAudioIndex(index);
      poke();
      const resume = async () => {
        const t = video.currentTime || 0;
        const wasPaused = video.paused;
        if (!track?.url || track.url === activeUri) return;
        say(`Audio -> ${track.name}…`);
        setBuffering(true);
        try {
          await swapMp4(video, track.url, t, wasPaused);
          setActiveUri(track.url);
          say(`Audio switched to ${track.name}.`);
        } catch (error) {
          say(`Audio switch failed: ${error?.message || "unknown"}.`);
        }
      };
      resume();
      return;
    }
    const hls = hlsRef.current;
    if (!hls) return;
    hls.audioTrack = index;
    setAudioIndex(index);
    poke();
    say(`Audio -> ${audioTracks[index]?.name || index}.`);
  };

  /* Videasy's dual soundtrack: the hidden base variant of the currently
     playing rendition (-a1 ↔ -v1 siblings) is a second REAL soundtrack.
     Reuses the HLS quality-swap machinery so the switch gets probe-warm +
     playhead + pause preservation for free (the fragments are Open-CORS
     fMP4 in both). rawAlt keeps pickQuality from re-mapping the twin. */
  const pickAltAudio = async (useAlt) => {
    const meta = metaRef.current;
    const video = videoRef.current;
    const map = meta?.altByUri;
    if (!video || !map || meta?.mp4Mode) return;
    const source = activeUri;
    const target = source && map[source];
    if (!target || target === source || useAlt === altAudioOn) return;
    const height = meta.variants?.find((v) => v.uri === source || v.altUri === source)?.height ?? null;
    say(`Audio -> ${useAlt ? "Alternate soundtrack" : "Original soundtrack"}…`);
    setAltAudioOn(useAlt);
    setBuffering(true);
    poke();
    try {
      await pickQualityRef.current?.(target, height, { rawAlt: true });
    } catch (error) {
      say(`Audio switch failed: ${error?.message || "unknown"}.`);
    }
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

  // Load the language list once per title; remember (and restore) the last
  // chosen language per title id.
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
                background: "rgba(255,255,255,0.22)",
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
                        background: "rgba(255,255,255,0.62)",
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
                  ) : !metaRef.current?.mp4Mode && activeUri && metaRef.current?.altByUri?.[activeUri] ? (
                    // Videasy (VidCore): a hidden base soundtrack (-v1) rides
                    // alongside the listed -a1 streams — offer both. The CDN
                    // ships NO language tags, so track labels are positional;
                    // the only real signal is the film's own original language.
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
                        key="alt-original"
                        selected={!altAudioOn}
                        onClick={() => pickAltAudio(false)}
                        title="Original"
                        sub="Primary soundtrack — language not labelled"
                      />
                      <DialogRow
                        key="alt-2"
                        selected={altAudioOn}
                        onClick={() => pickAltAudio(true)}
                        title="Alternate"
                        sub="Second soundtrack — language not labelled"
                      />
                    </>
                  ) : (
                    // No alternate-audio groups (#EXT-X-MEDIA AUDIO) in this
                    // source's ladder: hls.js reports no audioTracks, but the
                    // soundtrack IS playing — surface it as the single track.
                    <DialogRow
                      key="original"
                      selected
                      title="Original"
                      sub="This source's soundtrack"
                    />
                  )}
                  <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", margin: "12px 0 2px" }}>
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.55)", margin: "8px 0 2px" }}>
                    Video Quality
                  </p>
                  {transportRelay && !isMasterMode && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "0 0 4px" }}>
                      Source streams via relay — tall rungs auto-step down if your connection can&apos;t keep
                      them filled.
                    </p>
                  )}
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
                    const viaRelay = transportRelay && !isMasterMode && (q.height || 0) > 720;
                    return (
                      <DialogRow
                        key={`${q.uri}::${i}`}
                        selected={selected}
                        onClick={() => pickQuality(q.uri, q.height)}
                        title={q.label || `${q.height}p`}
                        sub={
                          viaRelay
                            ? q.bandwidth
                              ? `${(q.bandwidth / 1e6).toFixed(1)} Mbps · via relay`
                              : "via relay"
                            : q.bandwidth
                              ? `${(q.bandwidth / 1e6).toFixed(1)} Mbps`
                              : undefined
                        }
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
            {type === "tv" ? ` S${season}E${episode}` : ""} · {status} · buf {bufferedSecs}/{bufferedTargetSecs}s ·{" "}
            {relayStreak > 0 ? `relay ×${relayStreak} frags` : "frags direct"}
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
