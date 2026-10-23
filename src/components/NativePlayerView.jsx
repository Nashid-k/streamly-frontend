// src/components/NativePlayerView.jsx — the app's player, opened by the hero /
// episode Play buttons. Resolves VidCore-first (4K) → VidSrc → NHD (multi-
// audio) via streamResolve, with a Servers menu to switch the active server,
// and plays through hls.js (manifest relay + direct-segment loader). Custom
// transport only: no native <video controls>.
// Quality lives in the Audio & Subtitles dialog (Netflix has no quality menu), and
// touch devices get a stacked settings sheet instead of the desktop chrome.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { buildAudioTrackList, languageNameFromCode } from "../utils/audioLabels";
import {
  IconAspect,
  IconAudio,
  IconGauge,
  IconServers,
  IconSliders,
  IconCalendar,
  IconCaptions,
  IconTheater,
} from "./player/chrome";
import {
  NetflixVolumeHUD,
  NetflixAspectHUD,
  NetflixSeekHUD,
  NetflixPlayPauseHUD,
  NetflixHold2xHUD,
} from "./player";
import NetflixStillWatching from "./NetflixStillWatching";
import Hls from "hls.js";
import { variantLabel } from "../utils/hlsPlaylist";
import { createStreamlyLoader, probeSourcePlayable } from "../api/nativeHlsLoader";
import { takeWarmResolve, prefetchSources, warmResolve } from "../api/warmResolve";
import { SKIP_DATA_CREDIT, fetchSkipBoundaries } from "../api/skipBoundarySource";
import { fetchZxcIntroBounds } from "../api/skipProviderSource";
import { SubtitleFetcher } from "../api/subtitleFetcher";
import { logDebug, logWarn } from "../utils/debugLogger";
import { SubtitleEngine } from "../utils/subtitleEngine";
import { readStoredNumber } from "../utils/storedNumber";
import { isEpAired } from "../utils/titleDetails";
import useContainerSize from "../hooks/useContainerSize";
import {
  hudMetrics,
  previewMetrics,
  aspectVideoStyle,
  ASPECT_RATIOS,
  HOLD_SPEED,
  STILL_WATCHING_IDLE_MS,
  STILL_WATCHING_EPISODES,
} from "../constants/playerUi";
import {
  PLAYER_SOURCES,
  DEFAULT_SOURCE_KEY,
  AUTO_SOURCE,
  sourceByKey,
  sourceByServer,
  sourceLabel,
} from "../constants/sources";
import {
  getSkipIntroTarget,
  getSkipIntroEnd,
  SKIP_INTRO_LEAD_SECONDS,
  getSkipOutroWindow,
  shouldShowSkipIntro,
  getSkipOutroTarget,
  shouldShowSkipOutro,
  shouldAutoSkipIntroOnce,
  mergeSkipBoundaries,
  getScrubberBands,
  normalizeSkipBoundaries,
  rescopeBoundaries,
} from "../utils/skipMarkers";
import { pickInitialBandwidthBits } from "../utils/streamTuning";
import { subtitleFontFamily, findSubtitleTrack } from "../constants/settings";
import { useOptionalPreferences } from "../context/preferences";
import { getPreviewThumb, clearPreviewCache, resetPreviewPipeline, setPreviewSuppressed } from "../api/previewThumbs";
import {
  ChromeTopBar,
  SkipPill,
  SubtitleOverlay,
  CenterStack,
  TapToUnmutePill,
  BottomChrome,
  ResumeCard,
  UpNextCard,
  PlayerPanel,
  FatalBanner,
  DialogRow,
  EpisodesRail,
  IS_TOUCH,
  SAFE_TOP,
  SAFE_BOTTOM,
} from "./player/chrome";

// A source can fail fragments forever without ever going fatal (VidCore's
// vidzen: playlist 200, segments 429 on repeat) — so fail over ourselves.
const MAX_CONSECUTIVE_FRAG_FAILURES = 4;

// How long to hold a source after an upstream 429 before re-resolving it. A
// provider rate limit clears in seconds, so retrying straight away just spends
// another request on an origin that is already refusing us; every wasted request
// keeps the window open. Sized to ride out a momentary burst without the viewer
// noticing a stall (the player shows a switching note for the duration).
const THROTTLE_BACKOFF_MS = 6000;

const HIDE_DELAY_MS = 3000;

// Minimum gap between two autohide / still-watching timer re-arms. The player
// surface pokes on every pointer move, so this caps timer churn at ~4/s while
// staying far below the 3s hide delay.
const POKE_REARM_MIN_MS = 250;
// Fallback skip amount. The REAL amount is the viewer's "Seek Time" setting
// (5 / 10 / 15 / 30 seconds), read from PreferencesContext below — this
// constant used to be the only value, so the Settings dropdown changed
// nothing and every skip jumped 10s.
const SKIP_SECONDS = 10;
// Netflix "Up Next" auto-play countdown for a TV episode's next installment.
const UP_NEXT_MS = 15000;
// Hold-to-2x (Netflix mobile): how long the right-side hold must run before 2x
// engages, so a normal double-tap seek never fires it.
const HOLD_2X_DELAY_MS = 420;
// Backstop for a hold whose release never arrives (see the safety-net effect).
const HOLD_2X_MAX_MS = 60 * 1000;
// "Still watching?" prompt idles that long in pause before it stops asking.
const STILL_WATCHING_OFFER_MS = 90 * 1000;
// Netflix resume gate: how long the "Left off at…" card waits before auto-resume.
const RESUME_WAIT_SECONDS = 8;
// Forward-buffer policy (YouTube-style). The byte cap is scaled to the top
// rendition's bitrate: a FIXED 60MB cap idled the pipe before 4K could get
// ahead (~20Mbps burns 60MB in ~24s), which is why 4K never buffered. The
// buffer is the viewer's MSE, not our function's RAM, and the total relayed
// bytes per title are unchanged. Failfast is separate: the frag-failure
// counter/step-down fire on LOAD events, independent of depth.
const BUFFER_DEPTH_SECONDS = 90;
const MIN_BUFFER_SIZE = 60 * 1000 * 1000; // hls.js default floor
const MAX_BUFFER_SIZE = 500 * 1000 * 1000; // hard ceiling: ~2min of 4K@16Mbps, ~10min of 1080p
// Underflow guard: you cannot "buffer more" when a rendition outruns the pipe.
// YouTube's answer is to step quality DOWN; we drop one rung after a sustained
// shortfall so the buffer refills faster than it drains.
const BUFFER_FLOOR_SECONDS = 18;
const BUFFER_UNDERFLOOR_MS = 8000;
// Cap the WATCHED back buffer (hls.js defaults to Infinity — a 2h movie would
// pin ~7GB of browser RAM). hls.js trims the rest, like Netflix.
const BACK_BUFFER_SECONDS = 60;
// Background sibling-server warm: long enough that the current stream's own
// ramp-up (resolve, probe, first fragments, ABR climb) owns the pipe first,
// short enough that a viewer who decides to switch has the rows ready. The warm
// itself is a tiny JSON resolve (2-in-flight bounded), so it does not fight the
// stream for bandwidth — 4s is enough for the first fragments to land.
const SIBLING_WARM_DELAY_MS = 4000;
// ABR seed: hls.js starts its bandwidth estimate at 1Mbps, so Auto would climb
// the ladder one relay round-trip at a time (a visible "loading" per rung).
// 10Mbps starts Auto mid-ladder; the floor step-down still guards a bad pipe.
const INITIAL_BW_BITS = 10 * 1000 * 1000;
const VOLUME_STORAGE_KEY = "streamly-native-volume";
const MUTED_STORAGE_KEY = "streamly-native-muted";
const ASPECT_STORAGE_KEY = "streamly-native-aspect";
const SUB_SIZE_STORAGE_KEY = "streamly-native-sub-size";
const SUB_BG_STORAGE_KEY = "streamly-native-sub-bg";
/* Brightness is GONE (user call): a CSS filter is not the device backlight —
   it dims the video while the OS brightness setting stays where it was, which
   reads as a broken picture. The OS owns screen brightness on every platform.
   The old localStorage keys are simply no longer read. */
const HUD_MS = 1100;

// Touch-first devices get bigger tap targets and a stacked settings panel;
// mouse/trackpad keeps the desktop chrome. IS_TOUCH/BTN_SIZE/SAFE_* now live in
// player/chrome/constants.js, shared with every extracted chrome component.
// Skip Intro / Skip Outro live in src/utils/skipMarkers.js — the boundaries are
// estimates (no provider supplies markers) and the module documents that, plus
// the SKIP_INTRO_OVERRIDES seam for confirmed boundaries. Everything below is
// presentation only.

/* IconBtn now lives in player/chrome/IconBtn.jsx, shared with the extracted
   chrome. */


// One auto-retry per source: a fresh open often fails on the FIRST attempt
// (cold function, warm-up 429s, a rate-flaky catalogue returning nothing) and
// succeeds on the retry. Terminal "no-source" answers are not retried.
const SOURCE_RETRIES = 2;
const SOURCE_RETRY_BACKOFF_MS = [800, 1600];

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

/* "HD or better" tag that agrees with the LABELS, not the raw pixel rows: a
   scope/cinema rung cut at 1920x804 labels "1080p" (width-first resolutionLabel)
   but its raw height is below 1080, so height-based checks left both the gear
   badge and the inline row tag missing on exactly the rungs the menu calls HD. */
function qualityHdTag(v) {
  const label = String(v?.label || qualityLabelFor(v) || "");
  return /^(1080p|2K)(\s|$)/.test(label) ? "HD" : "";
}

/* One row per DISTINCT LABEL, tallest/highest-bandwidth rendition kept. Shared
   by the open path (resolver `variants`) and the post-swap ladder rebuild
   (hls.levels of a swapped source) so both menus dedupe identically. */
function buildQualityRows(variantsList) {
  const byLabel = new Map();
  variantsList
    .slice()
    .sort((a, b) => (a.height || 0) - (b.height || 0))
    .forEach((v) => {
      const label = qualityLabelFor(v);
      const prev = byLabel.get(label);
      if (
        !prev ||
        (v.height || 0) > (prev.height || 0) ||
        ((v.height || 0) === (prev.height || 0) && (v.bandwidth || 0) > (prev.bandwidth || 0))
      ) {
        byLabel.set(label, { uri: v.uri, height: v.height || 0, label, bandwidth: v.bandwidth || 0 });
      }
    });
  return Array.from(byLabel.values());
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
  /* Title artwork for the loading stage. Optional: without it the stage falls
     back to black, which is the old behaviour and still correct — a missing
     backdrop must never be the reason a load looks broken. */
  backdropUrl = "",
  /* The title IMAGE centred inside the loading stage (the TMDB logo when the
     page has one), distinct from backdropUrl, which is the blurred full-screen
     ambience behind it. Optional for the same reason as above. */
  posterUrl = "",
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
  /* Viewer preferences. Read here, at the top of the component, because the
     skip amount below is needed by handlers declared further down (and a
     `const` declared later would be a TDZ error at those call sites).
     `useOptionalPreferences` returns null outside a provider — the player is
     also mounted in isolation by several test suites, and a hard
     `usePreferences` would throw there. */
  const prefs = useOptionalPreferences();
  /* The skip amount the viewer chose in Settings (5 / 10 / 15 / 30 seconds).
     It used to be a hardcoded 10, so the Settings dropdown changed nothing
     and every skip — transport buttons, arrow keys, the touch double-tap and
     the media-session handlers — jumped 10s regardless. */
  const skipSeconds = Number(prefs?.seekTime) || SKIP_SECONDS;
  // HUD geometry follows the measured frame, not the window: the player is
  // often a phone-width box on a desktop viewport (and vice versa), so vw/vh
  // units and a fixed top percentage both land the overlay in the wrong place.
  const { w: playerW, h: playerH } = useContainerSize(screenRef);
  const hudBox = useMemo(() => hudMetrics(playerW, playerH), [playerW, playerH]);
  // Resolver args for THIS title/episode, memoized so the Servers-menu prefetch
  // and the player's own resolve sign the SAME streamResolve cache key — that
  // identity is what lets a prefetch coalesce with the click instead of racing.
  const resolveArgs = useMemo(
    () => ({ type, id, season: type === "tv" ? season : undefined, episode: type === "tv" ? episode : undefined, title }),
    [type, id, season, episode, title],
  );
  const scrubRef = useRef(null);
  // Settings sheet surface — focus moves here on open and back to the control
  // that opened it on close, so the panel is actually operable by keyboard.
  const panelRef = useRef(null);
  // Non-null while a settings sheet is open, holding the element that opened
  // it. Doubles as the "already recorded for this open" flag.
  const panelSessionRef = useRef(null);
  const hlsRef = useRef(null);
  const runRef = useRef(0);
  const metaRef = useRef({ variants: [], sourceKey: null, refUrl: null, masterLevels: false });
  const idleTimer = useRef(null);
  const clickTimer = useRef(null);
  // Touch taps: last-tap info for double-tap seek (±10s by screen side) and a
  // flag that swallows the synthetic click after touchend (it would double-toggle).
  const touchTapRef = useRef({ time: 0, zone: null });
  const singleTapTimer = useRef(null);
  const suppressClickRef = useRef(false);
  // Hold-to-2x bookkeeping: the timer that arms 2x, the rate it must restore,
  // and a pointer id for pointer-cleanup symmetry.
  const holdTimerRef = useRef(null);
  const heldRateRef = useRef(1);
  const holdPointerRef = useRef(null);
  // Space tap-vs-hold: is the key currently down, and did the hold already
  // engage 2x (so the keyup must NOT also toggle play).
  const spaceHoldRef = useRef(false);
  const spaceFiredRef = useRef(false);
  // Still-watching bookkeeping.
  const swIdleRef = useRef(null); // rolling play-with-no-input timer
  const swAutoAdvRef = useRef(0); // consecutive auto-advanced episodes
  const swOfferTimerRef = useRef(null); // offer expiry
  // Desktop hold-to-2x on the forward transport button.
  const desktopHoldTimerRef = useRef(null);
  const desktopHoldFiredRef = useRef(false);
  // Scrubber preview state: the latest captured thumbnail (data URL) + request
  // serial so a fast drag only renders the newest hover position.
  const [previewUrl, setPreviewUrl] = useState(null);
  const previewReqRef = useRef(0);
  // Live views of the play/seek closures for media-session handlers that register once.
  const togglePlayRef = useRef(() => {});
  const seekRelativeRef = useRef(() => {});
  // Deltas queued while a seek is still in flight (see seekRelative): each new
  // tap re-targets the pending seek, which cancels hls.js's fragment load on
  // every write — on a relay path nothing finishes until the taps stop.
  const pendingSeekRef = useRef(0);
  // Pending "drop the hover overlay" deadline; cleared when a NEW scrub starts,
  // or a leftover timer snaps the bar back mid-drag between two gestures.
  const scrubHoverTimer = useRef(null);
  const watchedEntryRef = useRef(watchedEntry);
  watchedEntryRef.current = watchedEntry;
  const lastProgressSaved = useRef(0);
  const resumeHandledKeyRef = useRef(null); // title/episode key that already offered resume
  // Ticks remaining before the resume card auto-commits. Mirrored separately
  // from the offer so the countdown interval can drive BOTH the counter and the
  // final seek in one pass (see the effect below).
  const resumeLeftRef = useRef(RESUME_WAIT_SECONDS);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // Live views for closures that must not read stale hold/still-watching state.
  // (Declared here; SYNCED below next to the other mirror refs — the states
  // they read are declared further down, and assigning earlier is a TDZ crash.)
  const hold2xRef = useRef(false);
  const endedRef = useRef(false);
  const onSelectEpisodeRef = useRef(onSelectEpisode);
  onSelectEpisodeRef.current = onSelectEpisode;
  const onGoPrevRef = useRef(onGoPrev);
  onGoPrevRef.current = onGoPrev;
  const onGoNextRef = useRef(onGoNext);
  onGoNextRef.current = onGoNext;
  const keyboardEpPrevRef = useRef(() => {});
  const keyboardEpNextRef = useRef(() => {});
  // Non-master "Auto" rung: the variant negotiated at settle (smooth start / relay-friendly).
  const autoUriRef = useRef(null);
  const autoUriHeightRef = useRef(null);
  const commitResumeRef = useRef(null); // assigned below, driven by the resume card
  const maybeOfferResumeRef = useRef(() => {}); // reassigned below; called from the run effect
  // Reassigned below; the run effect calls it at runtime to keep its deps honest.
  const pickQualityRef = useRef(null);
  // Rapid quality switches stamp a token and re-check it after every await.
  const switchTokenRef = useRef(0);
  // Arm-and-fire resume after a switch whose post-reload video.play() the browser
  // refused (autoplay policy): the next user interaction replays it (see the
  // pointerdown listener below), so a switch-while-playing never strands the
  // viewer on a silently paused frame.
  const pendingResumeRef = useRef(false);
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
  /* NHD sibling-URL dubs: `audioTracks` from the resolver, each a FULL alternate
     manifest (one per dub), never #EXT-X-MEDIA groups — so unlike hls.js tracks a
     dub switch is a position-preserving manifest swap, and the pick must survive
     the token-refresh re-resolve below. */
  const [dubTracks, setDubTracks] = useState([]);
  /* The provider's original-track language code (its `original` dub row), so the
     Audio menu's "Original" row is labelled with what the default master really
     plays — NOT TMDB's `original_language`, which disagrees when the provider's
     default mix is a dub (Jailer 937020: TMDB `ta`, default `ml`). Empty when the
     provider flags none, which falls back to the TMDB language. */
  const [dubOriginalLang, setDubOriginalLang] = useState("");
  const [activeDub, setActiveDub] = useState(0);
  // Mirror of activeDub for the async resolve loop (same pattern as mutedRef et al.).
  const activeDubRef = useRef(0);
  /* Server switcher: which source the viewer chose in the Servers menu (null
     = the auto rotation's winner, the default being VidCore). A manual pick
     re-resolves through runSourceOnce's `forceSource` argument. */
  const [requestedServer, setRequestedServer] = useState(null);
  const requestedServerRef = useRef(null); // mirror for the async resolve loop
  // The media identity the current run belongs to. A manual server pick is
  // scoped to ONE title/episode; when this changes (a different movie, or the
  // next episode) the pick is dropped back to the default rotation. Kept as a
  // ref so the run effect can reset it synchronously, BEFORE the resolve below
  // reads requestedServerRef — otherwise the first resolve after a media change
  // would still force the previous title's server.
  const mediaKeyRef = useRef(null);
  /* Which source is ACTUALLY playing, as state rather than a ref.
     `metaRef.current.sourceKey` already tracked this, but a ref mutation cannot
     schedule a render, so every reader during render saw whatever the last
     render happened to observe. That is fine while the user is the one switching
     (pickServer also flips `status`, forcing a render) and wrong when the LOADER
     decides: a dead source falling over to the next one writes only the ref, so
     the Servers menu and the settings label kept naming the server we just
     abandoned until some unrelated state change happened to re-render.
     Promoting it makes the source change observable, which is what the boundary
     scoping below needs in order to trust it. */
  const [activeSourceKey, setActiveSourceKey] = useState(null);
  // Language codes are named through the shared audioLabels helper (2-letter,
  // 3-letter and regional aliases) so the film-level line and the Audio rows
  // cannot drift apart — see the `languageNameFromCode` call sites below.
  const [fatal, setFatal] = useState(null);
  // Bumped by the fatal banner's "Try again" to re-run the whole load effect —
  // the effect re-resolves the source from scratch (a stale CDN token or a
  // transient 403 usually clears on a second resolve), which is why it is a
  // dependency of that effect and not just a local teardown.
  const [reloadToken, setReloadToken] = useState(0);
  // `poke` is declared further down the component, so this callback cannot close
  // over it directly (TDZ); the ref is the same pattern the file already uses
  // for once-bound handlers.
  const pokeRef = useRef(() => {});
  /* Same-media RELOAD carry (server pick / source-quality pick / manual retry):
     the effect teardown detaches the media element, which resets currentTime to
     0 — without arming this first, every reload restarted the film at the
     beginning. Keyed by media so a reload aimed at a DIFFERENT title/episode
     can never inherit the old position, and it records paused-ness so a switch
     made while paused stays paused (same rule pickQuality follows) instead of
     auto-playing after the reload. */
  const carryRef = useRef(null);
  const armReloadCarry = () => {
    const v = videoRef.current;
    carryRef.current = v
      ? { key: mediaKeyRef.current, at: v.currentTime || 0, paused: Boolean(v.paused) }
      : null;
  };
  /* The last decoded frame as a JPEG data URL, captured while it is still on
     screen: the switch stage shows THIS instead of the title art, so a server
     or source pick reads as "the same picture, re-sourced" rather than a hard
     cut to a static card. Null (no frame yet / canvas unusable) falls back to
     the art stage exactly as before. MSE frames come from same-origin blob
     URLs, so the canvas is never tainted. */
  const captureFrameUrl = () => {
    const v = videoRef.current;
    if (!v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return null;
    try {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = Math.max(1, Math.round((640 * v.videoHeight) / v.videoWidth));
      c.getContext("2d")?.drawImage(v, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.7);
    } catch {
      return null; // tainted or unavailable frame — art stage instead
    }
  };
  // The captured frame above; cleared the moment real frames return (or the
  // reload turns out to be for different media).
  const [switchFrame, setSwitchFrame] = useState(null);
  const retryLoad = useCallback(() => {
    // Position carries over, but the frozen frame does not: it belongs to a
    // source that just died, so the retry shows the art stage, not a still.
    armReloadCarry();
    setSwitchFrame(null);
    setFatal(null);
    setEnded(false);
    setResumeOffer(null);
    setReloadToken((n) => n + 1);
    pokeRef.current();
  }, []);
  const [playing, setPlaying] = useState(false);
  const [ended, setEnded] = useState(false);
  // Netflix "Up Next" card: { number, title } for the next TV episode, or null.
  const [upNext, setUpNext] = useState(null);
  // YouTube-style autoplay switch in the bottom-right. A real preference: the
  // Settings page already wrote `autoplay`, and the player never read it — off
  // means the Up Next card appears but never fires (prefs winner, defaults on).
  // Reads the same storage as PreferencesContext (prefs arrives later in this
  // render, so the initializer touches localStorage directly; an effect below
  // re-syncs once the provider is mounted).
  const [autoplayEnabled, setAutoplayEnabled] = useState(() => {
    try {
      const stored = window.localStorage.getItem("setting-autoplay");
      if (stored !== null) return JSON.parse(stored) === true;
      const legacy = window.localStorage.getItem("streamly_autoNext");
      if (legacy !== null) return legacy !== "false";
    } catch {
      // storage unavailable (privacy-restricted contexts)
    }
    return true;
  });
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
    // Paused + buffering means a seek into an empty region (or a stall caught
    // at the pause instant): the spinner is the only honest feedback there is.
    // It arms faster than the playing-stall delay because a paused seek should
    // feel instant — and a paused-but-LOADED stream never reaches this branch
    // (buffering is false there, so it still never spins).
    const delay = playing ? 700 : 350;
    const t = setTimeout(() => setSpinner(true), delay);
    return () => clearTimeout(t);
  }, [buffering, playing]);
  /* Two waits, two treatments.
     `stageWhileLoading` is true when there is no picture worth keeping: the very
     first load of a title, and any server / dub / quality switch, where the old
     frame belongs to a stream that is no longer playing. There the viewer gets
     the title art, blurred, with the name and a ring over it — proof the player
     still knows what it is playing.
     A mid-playback stall is the opposite case: the frame IS the content, and the
     earlier version that dimmed and blurred it during a stall read as a broken
     player (see the note at the spinner). So a stall keeps the light overlay. */
  const [stageWhileLoading, setStageWhileLoading] = useState(true);
  // True until the very first frame plays. Drives the START loader: the
  // horizontal sweep belongs to the initial cold open (the player is booting)
  // AND to a server switch (the viewer tapped a new backend), while a
  // quality/dub switch and an episode change keep the round Tailspin ring.
  const [everPlayed, setEverPlayed] = useState(false);
  // True while a server the VIEWER picked is being fetched. A server switch is a
  // server-level cold open — same sweep as the first load — so it rides the same
  // horizontal bar. Cleared when frames return (or a quality/dub pick takes the
  // stage instead). Never set by the automatic fail-over, which keeps the ring.
  const [serverSwitchStage, setServerSwitchStage] = useState(false);
  // Set by a server switch, cleared when frames return; null means a cold open.
  const [switchingNote, setSwitchingNote] = useState(null);
  // Transient honest note for a quality pick the player must refuse (e.g. while
  // a pinned dub is playing) — the old silent early-return read as "the button
  // is dead". Cleared by any pick that actually runs. Also carries an audio-track
  // failure note: a dub the provider advertises but cannot deliver (Orion's hi/ta
  // for many titles) used to fail SILENTLY, which reads as "the audio won't change".
  const [qualityNote, setQualityNote] = useState(null);
  // Dub rows (by their pickDub index) a probe already proved dead THIS source/
  // title. Disabled in the Audio menu with an honest "Unavailable" label so the
  // viewer stops retrying a track the provider 404s. Cleared on every new run.
  const [deadDubs, setDeadDubs] = useState(() => new Set());
  // A server switch is a stage even while PAUSED: the teardown blanks the
  // picture, and without this a paused switch showed neither spinner (the
  // spinner gate wants `playing`) nor stage — just a black rectangle with no
  // progress indication until the new stream committed.
  const showStage = (spinner || serverSwitchStage) && (stageWhileLoading || !hasStartedRef.current);
  // Why this particular wait is happening. "Loading…" alone is identical for a
  // cold open and for a server the viewer just picked, and those two deserve
  // different wording — one is the app working, the other is the app admitting
  // it is fetching from a different provider.
  const stageNote = switchingNote || "Loading…";

  const [bufferedSecs, setBufferedSecs] = useState(0);
  const [bufferedRanges, setBufferedRanges] = useState([]);
  // Master-mode (multi-variant) sources start on ABR auto; picking a level pins it.
  // The state starts NULL, not true: for a fixed-ladder source (single-variant HLS
  // like NHD/ZXC-atlas) the source is NOT in ABR auto — Auto just replays the
  // open rung — and starting true left the quality menu with NO active row until
  // the viewer touched it (the Server 3/4 bug). The commit block sets it honestly
  // from the shape of what actually opened.
  const [autoLevel, setAutoLevel] = useState(null);
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
  // Persistent subtitle failure line for the subs pane. Without this a refused
  // download (Cloudflare relay without the UA injection) or an unreadable file
  // fails SILENTLY: the pick flips back to Off with no visible reason. This state
  // keeps the reason on screen until the next pick or title change.
  const [subtitleError, setSubtitleError] = useState(null);
  /* Subtitle STYLING (provider "Subtitle settings" parity): size 0=S/1=M/2=L and
     background 0=none/1=shadow/2=box. Presentation only — persisted separately
     from the track choice. */
  const [subtitleSize, setSubtitleSize] = useState(() =>
    readStoredNumber(SUB_SIZE_STORAGE_KEY, { min: 0, max: 2, fallback: 1 }),
  );
  const [subtitleBg, setSubtitleBg] = useState(() =>
    readStoredNumber(SUB_BG_STORAGE_KEY, { min: 0, max: 2, fallback: 1 }),
  );
  // Netflix chrome state.
  const [controlsVisible, setControlsVisible] = useState(true);
  const [panel, setPanel] = useState(null); // null | "subs" | "episodes" | "servers"
  /* A sheet is open. Everything that floats in the bottom-right corner — the
     Skip Intro pill, the "Tap to unmute" pill, the "Left off at" card — yields
     while this is true: that corner is where the episodes rail and the settings
     pane land, their gradients are transparent at the top, so those controls
     used to show *through* an open panel on a second layer, still tappable. */
  const sheetOpen = Boolean(panel);
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
  // Netflix-style HUD pill (volume / aspect) that pops then self-fades.
  const [autoMuted, setAutoMuted] = useState(false); // autoplay-block → muted play + hint
  const [aspectRatioIndex, setAspectRatioIndex] = useState(() => {
    // Clamp to the shared catalog length — the mode list lives in
    // constants/playerUi.js, so a stale stored index beyond it resets to Fit.
    const i = readStoredNumber(ASPECT_STORAGE_KEY, {
      min: 0,
      max: ASPECT_RATIOS.length - 1,
      fallback: 0,
    });
    return Number.isInteger(i) && ASPECT_RATIOS[i] ? i : 0;
  });
  const [playbackRate, setPlaybackRate] = useState(1);
  /* Provider "Source quality": the raw source ladder a plain-HLS server exposes
     (Daedalus answers 1080/720/480). 0 = Auto, the provider's own default link.
     Distinct from the video-quality selector above, which picks a rung of the
     DELIVERED ladder; this re-resolves the SOURCE at a chosen raw resolution.
     Only populated when the picked server returned >1 distinct resolution, so
     the selector stays hidden rather than offering an empty list. */
  const [sourceHeight, setSourceHeight] = useState(0);
  const sourceHeightRef = useRef(0);
  const [sourceVariants, setSourceVariants] = useState([]);
  // Loop and sleep timer (provider Playback menu parity). Loop wraps the current
  // item; the sleep timer pauses playback after the chosen minutes.
  const [loopEnabled, setLoopEnabled] = useState(false);
  const [sleepMinutes, setSleepMinutes] = useState(null); // chosen duration, null = off
  const [sleepRemaining, setSleepRemaining] = useState(null); // seconds, for the label
  const [pipActive, setPipActive] = useState(false);
  const [hud, setHud] = useState(null); // { kind: "volume"|"aspect"|"seek"|"play"|"pause"|"hold2x", value }
  // Hold-to-2x (Netflix mobile): press-and-hold on the right half of the screen
  // plays at 2x; release restores the previous rate. Desktop holds the forward
  // transport button.
  const [hold2x, setHold2x] = useState(false);
  // Netflix "Still watching?" — after enough unattended playback or auto-advanced
  // episodes, pause and ask. The offer expires if ignored.
  const [stillWatching, setStillWatching] = useState(false);
  // Mirror refs: the keyboard + gesture handlers bind once, so they must read current values.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const aspectRef = useRef(aspectRatioIndex);
  aspectRef.current = aspectRatioIndex;
  /* The skip amount, mirrored for the same reason: the keyboard map, the
     media-session handlers and the gesture handlers are bound ONCE (see the
     effects further down), so a plain closure would keep the amount that was
     current when they bound and ignore a later Settings change. */
  const skipSecondsRef = useRef(skipSeconds);
  skipSecondsRef.current = skipSeconds;
  // The SETTING rate, kept live for handlers bound once (a hold must restore this
  // rate, never the transient 2x it is about to write).
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;
  /* `endedRef` mirrors `ended` for the once-bound handlers (the idle timer's
     `offerStillWatching` reads it to refuse a prompt after the credits). It was
     declared at the top and READ at line ~1209 but never ASSIGNED, so the guard
     was permanently `false` — the same bug class as the old `hold2xRef`. Synced
     here, after the state it mirrors is declared. */
  endedRef.current = ended;
  /* The remaining mirrors below are written imperatively next to each setter,
     but `setActiveDub(0)` in the resolve bootstrap (line ~2249) forgot its ref
     write, so `activeDubRef` could outlive a re-resolve with a stale dub index
     (read by the resolve loop). These render-time syncs make the refs a
     consequence of the state rather than of every caller remembering, which
     closes the whole class instead of the one instance. (`stillWatchingRef` is
     declared further down with its own state, so it keeps its setter-site
     writes.) */
  activeDubRef.current = activeDub;
  requestedServerRef.current = requestedServer;
  sourceHeightRef.current = sourceHeight;
  subtitleEnabledRef.current = subtitleEnabled;
  const sleepTimerId = useRef(null);
  const sleepDisplayId = useRef(null);
  const pipSupported =
    typeof document !== "undefined" && document.pictureInPictureEnabled;
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

  /* What the Audio panel lists, in viewer words. The providers send their own
     strings ("Tamil Dub") and call the original track "Original", so both are
     normalised here once rather than at each render site: the original is named
     by the film's real language when TMDB told us, and a dub row is just the
     language. Covers every multi-audio source — Server 3 (NHD) and Server 4
     (ZXC Centaurus) both arrive as the same `audioTracks` array. */
  const audioTrackList = useMemo(
    () => buildAudioTrackList(dubTracks, originalLanguage, dubOriginalLang),
    [dubTracks, originalLanguage, dubOriginalLang],
  );

  const currentAudioLabel = useMemo(() => {
    if (dubTracks.length > 0) {
      if (activeDub === 0) return audioTrackList[0]?.label || "Original";
      const found = audioTrackList.find((t) => t.sourceIndex === activeDub - 1);
      return found?.label || audioTrackList[activeDub]?.label || "Dub";
    }
    if (audioTracks.length > 0) {
      const a = audioTracks[audioIndex];
      return languageNameFromCode(a?.lang || a?.name) || a?.name || "Original";
    }
    // Prefer the provider's own original-track code over TMDB's film language —
    // same reason the row-0 label does (see buildAudioTrackList).
    const origCode = dubOriginalLang || originalLanguage;
    return origCode ? (languageNameFromCode(origCode) || (origCode || "").toUpperCase() || "Original") : "Original";
  }, [dubTracks, activeDub, audioTrackList, audioTracks, audioIndex, originalLanguage, dubOriginalLang]);


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
    // YouTube-style centre flash for the NEW state. After `await`, `video.paused`
    // is settled either way (play resolved or pause is sync); a rejected play
    // lands here still paused, so "play" never flashes for a failed start.
    showHudRef.current(video.paused ? "pause" : "play");
  };
  togglePlayRef.current = togglePlay;

  const seekTo = (value) => {
    setEnded(false);
    safeSeek(Number(value) || 0);
  };

  const replay = async () => {
    const video = videoRef.current;
    if (!video) return;
    poke();
    try {
      video.currentTime = 0;
    } catch (error) {
      // A detached or not-yet-ready element refuses the write; replay still
      // proceeds and the next `loadedmetadata` sets the position.
      logDebug("player", "Could not reset currentTime for replay.", { message: error?.message });
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

  /* pointermove fires faster than the display can paint (120Hz+ pointers, and
     far faster on some digitisers). Every setScrubHover re-renders this whole
     5k-line player and re-runs the preview-thumbnail effect further down, so the
     latest position is stashed in a ref and applied once per animation frame.
     scrubHoverLatest always mirrors the true pointer position, so a release
     seeks to exactly where the pointer was, not to whichever frame last painted. */
  const scrubHoverLatest = useRef(null);
  const scrubHoverFrame = useRef(0);

  const applyScrubHover = (ratio) => {
    scrubHoverLatest.current = ratio;
    if (scrubHoverFrame.current) return;
    scrubHoverFrame.current = requestAnimationFrame(() => {
      scrubHoverFrame.current = 0;
      const next = scrubHoverLatest.current;
      if (next !== null) setScrubHover(next);
    });
  };

  const flushScrubHover = () => {
    if (scrubHoverFrame.current) {
      cancelAnimationFrame(scrubHoverFrame.current);
      scrubHoverFrame.current = 0;
    }
    if (scrubHoverLatest.current !== null) setScrubHover(scrubHoverLatest.current);
  };

  const clearScrubHover = () => {
    if (scrubHoverFrame.current) {
      cancelAnimationFrame(scrubHoverFrame.current);
      scrubHoverFrame.current = 0;
    }
    scrubHoverLatest.current = null;
    setScrubHover(null);
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
    applyScrubHover(ratio);
    // No seek per pointermove: the bar tracks the drag and the seek commits once on
    // release — seeking on every move makes hls.js cancel in-flight fragments.
  };

  const onScrubMove = (e) => {
    applyScrubHover(scrubRatioOf(e.clientX));
    if (scrubDragging) {
      poke(); // a long drag must not let the controls autohide mid-drag
    }
  };

  const onScrubUp = () => {
    poke();
    // Commit the true final pointer position, not the last painted frame.
    const released = scrubHoverLatest.current ?? scrubHover;
    flushScrubHover();
    if (scrubDragging) {
      const dur = Number(videoRef.current?.duration);
      const target = (released ?? 0) * (Number.isFinite(dur) && dur > 0 ? dur : 0);
      seekTo(target);
    }
    setScrubDragging(false);
    // Let the red bar settle on the seek target before dropping the hover overlay.
    scrubHoverTimer.current = window.setTimeout(clearScrubHover, 250);
  };

  // A cancelled gesture (Esc, scroll steal, pointer leaving) must not strand the scrubber.
  const onScrubCancel = () => {
    setScrubDragging(false);
    clearScrubHover();
    if (scrubHoverTimer.current) {
      clearTimeout(scrubHoverTimer.current);
      scrubHoverTimer.current = null;
    }
  };

  const onScrubLeave = () => {
    if (!scrubDragging) clearScrubHover();
    setPreviewUrl(null);
  };

  /* Keyboard seeking. The bar advertises role="slider" + tabIndex, so it has to
     behave like one: arrows nudge, PageUp/Down jump a minute, Home/End slam to
     the ends, and every key reports through the seek HUD so the viewer sees the
     same feedback a drag gives.
     stopPropagation is load-bearing: the window keydown handler also binds
     ArrowLeft/ArrowRight, and without it one press seeks twice.
     Up/Down are deliberately NOT handled here — they fall through to the global
     volume binding, which is the convention this player uses everywhere else
     (and matches YouTube); hijacking them for seeking would make the same key
     mean two different things depending on focus. */
  const onScrubKeyDown = (e) => {
    const dur = Number(videoRef.current?.duration);
    const known = Number.isFinite(dur) && dur > 0;
    let handled = true;
    switch (e.key) {
      case "ArrowLeft":
        // Same auto-repeat guard as the window handler: a held nudge re-targets
        // the seek on every repeat and thrashes the fragment loader.
        if (e.repeat) break;
        seekRelative(-skipSecondsRef.current);
        break;
      case "ArrowRight":
        if (e.repeat) break;
        seekRelative(skipSecondsRef.current);
        break;
      case "PageDown":
        if (e.repeat) break;
        seekRelative(-60);
        break;
      case "PageUp":
        if (e.repeat) break;
        seekRelative(60);
        break;
      case "Home":
        if (known) seekTo(0);
        else handled = false;
        break;
      case "End":
        if (known) seekTo(dur);
        else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  /* Scrubber preview (Netflix/YouTube hover thumbnails): while hovering or
     dragging, decode the frame at the hover position off-screen and show it in
     a small card above the time bubble. Cache miss decodes ride the preview
     pipeline (same transport as playback); failures resolve null and scrubbing
     keeps working — the card just stays hidden until a capture lands.
     NOTE: declared AFTER safeDuration/hoverRatio below — this effect reads
     them, and an earlier placement read them before initialization (TDZ crash). */

  const seekRelative = (delta) => {
    const video = videoRef.current;
    if (!video) return;
    poke();
    // Rapid taps (double-tap spam, quick key presses) land while the previous
    // seek is still resolving: writing currentTime again cancels the in-flight
    // fragment load, so nothing ever completes until the viewer stops. Queue
    // those deltas and flush the total once `seeked` fires; the HUD shows the
    // growing queued amount so the feedback stays honest.
    if (video.seeking) {
      pendingSeekRef.current += delta;
      showHudRef.current("seek", pendingSeekRef.current);
      return;
    }
    // HUD shows the amount actually applied (clamped at 0 / duration), not the
    // requested one — YouTube shows +Xs / -Xs, never a lie like -0s.
    const dur = Number(video.duration);
    const from = video.currentTime || 0;
    const next = from + delta;
    const real = Number.isFinite(dur) && dur > 0 ? Math.min(Math.max(0, next), dur) : Math.max(0, next);
    showHudRef.current("seek", real - from);
    try {
      video.currentTime = real;
    } catch {
      // ignore out-of-range seeks
    }
  };
  seekRelativeRef.current = seekRelative;

  /* Single place every absolute seek goes through. Direct currentTime writes
     scattered through the player let stale saved positions (resume after a
     quality switch, a media-session seekto, an intro-skip target) land BELOW 0
     or past the end once duration arrives; this clamps exactly like
     seekRelative's HUD math and swallows the element's range errors. */
  const safeSeek = (seconds) => {
    const video = videoRef.current;
    if (!video) return;
    // An absolute seek supersedes any relative deltas queued behind an
    // in-flight one — applying them afterwards would jump off the target.
    pendingSeekRef.current = 0;
    const t = Number(seconds);
    if (!Number.isFinite(t)) return;
    const dur = Number(video.duration);
    const clamped = Number.isFinite(dur) && dur > 0 ? Math.min(Math.max(0, t), dur) : Math.max(0, t);
    try {
      video.currentTime = clamped;
    } catch {
      // out-of-range seek — the element clamps; nothing else to do
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
    resumeLeftRef.current = RESUME_WAIT_SECONDS;
    setResumeOffer({ at, left: RESUME_WAIT_SECONDS });
  };
  maybeOfferResumeRef.current = maybeOfferResume;

  const commitResume = (at) => {
    setResumeOffer(null);
    poke();
    const video = videoRef.current;
    if (!video) return;
    safeSeek(at); // clamped to duration; saved positions are stale by nature
    if (video.paused) {
      video.play().catch(() => {
        // autoplay policy — the big custom play button stays available
      });
    }
  };
  commitResumeRef.current = commitResume;

  const restartFromStart = () => {
    setResumeOffer(null);
    poke();
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = 0;
    } catch (error) {
      // Same detached/not-ready refusal as replay(); playback continues from
      // wherever the element is, which is still better than a crash.
      logDebug("player", "Could not seek to 0 on restart.", { message: error?.message });
    }
    if (video.paused) {
      video.play().catch(() => {
        // autoplay policy — the big custom play button stays available
      });
    }
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

  // Resume countdown: ONE interval ticks the mirror ref and, on the tick that
  // would otherwise just hide the card, commits the resume seek in the same
  // pass. The old design paired this interval with a parallel setTimeout that
  // was re-armed every offer-change (the re-render after each tick) — so the
  // final tick nulled the offer, whose cleanup cancelled the pending auto-commit
  // and the resume silently never fired. Now the counter reaches zero and the
  // seek happens in a single step, and pausing still freezes the countdown.
  useEffect(() => {
    if (!resumeOffer) return undefined;
    const tick = setInterval(() => {
      if (videoRef.current?.paused) return;
      resumeLeftRef.current -= 1;
      if (resumeLeftRef.current <= 0) {
        // Counter expired: commit BEFORE hiding the card so nothing can cancel
        // the pending seek (the offer is intentionally not derived from the ref).
        const at = resumeOffer.at;
        commitResumeRef.current?.(at);
        return;
      }
      setResumeOffer((o) => (o ? { ...o, left: resumeLeftRef.current } : null));
    }, 1000);
    return () => clearInterval(tick);
  }, [resumeOffer]);

  const showHud = useCallback((kind, value) => {
    if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
    setHud({ kind, value });
    hudTimerRef.current = setTimeout(() => setHud(null), HUD_MS);
  }, []);
  // Mirror for once-bound closures (togglePlay) — same pattern as the value
  // mirror refs above, so the YT-style centre flash survives stale closures.
  const showHudRef = useRef(showHud);
  showHudRef.current = showHud;

  /* Settings-sheet focus management. Two real problems: focus was never moved
     into the sheet (so its rows were never announced and Tab started from
     wherever the transport row left off), and closing it dropped focus on the
     floor. Deliberately NOT a focus trap and NOT aria-modal — the sheet is a
     side pane, the transport row stays visible and operable beneath it, and
     trapping Tab would make the play button unreachable while it is open.

     One effect with an explicit open/close state machine, because the opener
     must be recorded exactly once per open: this effect runs AFTER the sheet
     has mounted, so "was it already open?" cannot be answered by testing
     panelRef.current (it is always populated by then). `panelSessionRef` is the
     flag instead, and holds the opener in a wrapper so a null activeElement is
     still a recorded session. */
  useEffect(() => {
    if (panel) {
      if (!panelSessionRef.current) {
        panelSessionRef.current = {
          el: document.activeElement instanceof HTMLElement ? document.activeElement : null,
        };
        // Synchronous (not rAF-deferred) so focus lands in the same commit as
        // the open. preventScroll because the sheet is still translated
        // off-frame when it mounts, and a bare focus() scrolls to chase it.
        panelRef.current?.focus({ preventScroll: true });
      }
      return undefined;
    }
    const session = panelSessionRef.current;
    panelSessionRef.current = null;
    // <body> means nothing was focused when the sheet opened (a synthetic click,
    // or focus was never on the chrome) — focusing it is a no-op.
    if (session?.el?.isConnected && session.el !== document.body) session.el.focus();
    return undefined;
  }, [panel]);

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

  const cycleAspect = () => {
    // Cycle every shared-catalog mode; a corrupted index simply wraps to Fit.
    const next = (Number.isInteger(aspectRef.current) && aspectRef.current >= 0 ? aspectRef.current + 1 : 0) % ASPECT_RATIOS.length;
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

  /* Controls autohide: activity shows them, 3s idle while playing hides them. Paused always shows.
     Bound to the full-surface onMouseMove, so it can fire 100+ times a second.
     Showing/hiding is cheap (React bails out on an unchanged value), but
     re-arming two timers on every event is not, so the timer section is rate
     limited. Visible result is unchanged: the hide deadline still lands ~3s
     after the viewer stops moving. */
  const lastPokeArm = useRef(0);
  const poke = useCallback(() => {
    setControlsVisible(true);
    // Any interaction re-arms the "Still watching?" idle countdown — but it must
    // NOT dismiss an OPEN prompt. `poke` is the full-surface onMouseMove handler,
    // so clearing it here hid "Still watching?" on any incidental pointer move
    // (a TV remote / HTPC that emits move events), leaving the viewer paused
    // with no Continue/Exit. A prompt is dismissed only by a real press
    // (dismissStillWatching) or its own buttons.
    // Clearing is not enough: the id must be nulled too, because the re-arm
    // guard below (and the [playing] effect) tests `swIdleRef.current` to mean
    // "a still-watching countdown is live". A clear without the null left the
    // ref truthy-but-dead, so the rate-limited early return below permanently
    // buried the countdown — it never fired again until `playing` toggled.
    if (swIdleRef.current) {
      clearTimeout(swIdleRef.current);
      swIdleRef.current = null;
    }
    const now = Date.now();
    if (now - lastPokeArm.current < POKE_REARM_MIN_MS) return;
    lastPokeArm.current = now;
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (videoRef.current && !videoRef.current.paused) {
      idleTimer.current = setTimeout(() => setControlsVisible(false), HIDE_DELAY_MS);
      swIdleRef.current = setTimeout(() => {
        swIdleRef.current = null;
        offerStillWatching("idle");
      }, STILL_WATCHING_IDLE_MS);
    } else {
      swIdleRef.current = null;
    }
  }, []);
  pokeRef.current = poke;

  // ---- "Still watching?" (Netflix pauses after long unattended playback) ----
  // Mirrors for the once-bound idle effect + the offer, which reads live state.
  const stillWatchingRef = useRef(false);
  // A real press (pointerdown) dismisses an open prompt; a passive pointer MOVE
  // must not, which is why `poke` no longer clears it. Ref-backed so the
  // long-lived handlers read the live value.
  const dismissStillWatching = useCallback(() => {
    if (!stillWatchingRef.current) return;
    stillWatchingRef.current = false;
    setStillWatching(false);
    if (swOfferTimerRef.current) {
      clearTimeout(swOfferTimerRef.current);
      swOfferTimerRef.current = null;
    }
  }, []);
  const offerStillWatching = (reason) => {
    const video = videoRef.current;
    if (!video || video.paused || endedRef.current) return;
    logDebug("native", `Still-watching offer (${reason})`);
    try {
      video.pause();
    } catch {
      // already paused
    }
    stillWatchingRef.current = true;
    setStillWatching(true);
    if (swOfferTimerRef.current) clearTimeout(swOfferTimerRef.current);
    // An ignored prompt must not sit there forever; the next poke rearms it.
    swOfferTimerRef.current = setTimeout(() => {
      swOfferTimerRef.current = null;
      stillWatchingRef.current = false;
      setStillWatching(false);
    }, STILL_WATCHING_OFFER_MS);
  };
  // Reset the auto-advance streak when the viewer CHOOSES an episode (the
  // streak only counts what the Up Next card started on its own). This must NOT
  // be an effect on [id, season, episode]: the auto-advance path itself changes
  // the episode prop, so a reset there zeroed the counter before the next timer
  // read it and the binge guard could never reach STILL_WATCHING_EPISODES.
  // Manual picks go through `chooseEpisode`; the auto path calls the ref raw.
  const chooseEpisode = useCallback((number) => {
    swAutoAdvRef.current = 0;
    onSelectEpisodeRef.current?.(number);
  }, []);
  // Rolling 2h idle timer while playing, armed once and re-poked by `poke`.
  useEffect(() => {
    if (!playing) {
      if (swIdleRef.current) {
        clearTimeout(swIdleRef.current);
        swIdleRef.current = null;
      }
      return undefined;
    }
    if (!swIdleRef.current) {
      swIdleRef.current = setTimeout(() => {
        swIdleRef.current = null;
        offerStillWatching("idle");
      }, STILL_WATCHING_IDLE_MS);
    }
    return undefined;
  }, [playing]);
  useEffect(
    () => () => {
      if (swIdleRef.current) clearTimeout(swIdleRef.current);
      if (swOfferTimerRef.current) clearTimeout(swOfferTimerRef.current);
    },
    [],
  );

  // ---- Hold-to-2x (Netflix mobile): hold the right half of the screen ----
  /* `hold2xRef` is the ONLY signal every other handler reads to answer "is a
     2x hold live right now?" — the touch-end branch, the pause/ended/seeking
     listeners, the volume drag, the keyup. It was declared and never assigned,
     so it permanently read `false` and the rate restore ran on nothing:
     releasing a hold left the element at 2x (no keyup, no tap and not even a
     pause could bring it back — the picture played fast until the media was
     rebuilt). One place sets it, one place clears it, so the state cannot drift
     from the DOM rate again. */
  const engageHold2x = () => {
    const video = videoRef.current;
    if (!video || video.paused) return;
    /* The element's own rate is the truth, but a browser that paused playback
       in the background reports `playbackRate` as 1 while the picture is still
       the one the viewer set — keep a live mirror of the SETTING rate so a hold
       can never latch 2x as the "rate to restore". */
    heldRateRef.current =
      video.playbackRate > 0 && video.playbackRate !== HOLD_SPEED
        ? video.playbackRate
        : playbackRateRef.current || 1;
    try {
      video.playbackRate = HOLD_SPEED;
      hold2xRef.current = true;
      setHold2x(true);
      poke();
    } catch {
      // Some UWP webviews reject odd rates; staying at 1x is fine.
    }
  };
  const releaseHold2x = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdPointerRef.current = null;
    /* The ref is cleared FIRST: the listeners below (ratechange included) react
       to the assignment and must see "no hold" while the restore is written. */
    hold2xRef.current = false;
    const video = videoRef.current;
    if (video) {
      try {
        video.playbackRate = heldRateRef.current || 1;
      } catch {
        // already reset
      }
    }
    heldRateRef.current = 1;
    setHold2x(false);
  };
  // Right-half hold: arm 2x after a short delay so double-tap seek wins sprints.
  const handleHoldStart = (e) => {
    if (!IS_TOUCH || buffering || stillWatching) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    if (zoneOf(rect, t.clientX) !== "right") return; // center = play/pause, left = double-tap seek
    holdPointerRef.current = t.identifier ?? "touch";
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      if (!gestureRef.current?.active && !stillWatchingRef.current) engageHold2x();
    }, HOLD_2X_DELAY_MS);
  };
  const handleHoldEnd = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (hold2xRef.current) releaseHold2x();
  };
  // Desktop forward-button hold release (pointerup / leave / cancel).
  const desktopHoldRelease = () => {
    if (desktopHoldTimerRef.current) {
      clearTimeout(desktopHoldTimerRef.current);
      desktopHoldTimerRef.current = null;
    }
    if (hold2xRef.current) releaseHold2x();
  };

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

  // Touch taps land on the video itself (overlay buttons keep their own clicks).
  // THREE zones, YouTube/Netflix style: double-tap LEFT = rewind, double-tap
  // RIGHT = forward, and any tap in the CENTER THIRD = play/pause (single tap,
  // no 260ms lag). A double-tap in the center is just two play/pause toggles.
  const zoneOf = (rect, clientX) => {
    const x = clientX - rect.left;
    if (x < rect.width / 3) return "left";
    if (x > (rect.width * 2) / 3) return "right";
    return "center";
  };
  const handleVideoTouchEnd = (e) => {
    poke();
    suppressClickRef.current = true;
    /* A right-zone press arms 2x after HOLD_2X_DELAY_MS, and that arm is still
       PENDING for the whole of a normal tap — so on release the hold branch below
       saw `holdTimerRef.current` set and swallowed the gesture as "not a tap".
       Every right-third tap, single or double, was eaten: the double-tap forward
       seek never fired, and a lone tap never toggled. Only an arm that has
       actually engaged 2x (`hold2xRef`) is a real hold; a pending arm is just a
       tap that has not yet become a hold. */
    if (!hold2xRef.current) {
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
        holdPointerRef.current = null;
      }
    }
    if (hold2xRef.current) {
      // A right-zone hold that reached 2x just ended: it was not a tap —
      // swallow it so play/pause doesn't fire on release.
      handleHoldEnd();
      suppressClickRef.current = true;
      return;
    }
    // A vertical gesture (volume drag) just happened — not a tap.
    if (gestureRef.current?.active) {
      gestureRef.current = null;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const t = e.changedTouches && e.changedTouches[0];
    if (!rect.width || !t) return;
    const zone = zoneOf(rect, t.clientX);
    // During a rebuffer the EDGE zones stay dead — a seek into an empty buffer
    // only deepens the stall — but the CENTER tap still toggles play/pause.
    // Swallowing every tap here made the player feel frozen on touch exactly
    // when the viewer most wanted to interact with it.
    if (buffering && zone !== "center") return;
    // Center taps toggle playback immediately — the single-tap delay only exists
    // where a double-tap means seek.
    if (zone === "center") {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      touchTapRef.current = { time: 0, zone: "center" };
      togglePlay();
      return;
    }
    const now = performance.now();
    const prev = touchTapRef.current;
    /* DOUBLE-TAP SEEK. A double tap is two ~100ms taps, which lands well inside
       the 400ms window below. (The right third's pending hold arm was already
       dropped at the top of this handler — an armed 2x returned above.) */
    if (now - prev.time < 400 && prev.zone === zone) {
      touchTapRef.current = { time: 0, zone: null };
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      seekRelative((zone === "left" ? -1 : 1) * skipSecondsRef.current);
      return;
    }
    touchTapRef.current = { time: now, zone };
    // A lone edge tap waits briefly in case it becomes a double-tap seek;
    // if nothing follows, it plays/pauses. The wait is a hair longer than the
    // double-tap window itself, so the toggle can never fire while the second
    // tap of a deliberate double tap is still on its way.
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      togglePlay();
    }, 420);
  };

  // Vertical drag on the RIGHT THIRD = volume (brightness removed — the OS
  // owns screen brightness). Vertical-only — horizontal movement declares a
  // non-gesture so taps and double-taps survive. A right-zone hold arms 2x;
  // a vertical move on that side cancels the arm.
  const handleGestureStart = (e) => {
    if (!IS_TOUCH || buffering) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    // Only the right zone drives a drag now; left/center drags do nothing.
    if (zoneOf(rect, t.clientX) !== "right") return;
    gestureRef.current = {
      side: "volume",
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
      // A right-half drag is a volume gesture, not a hold — cancel the 2x arm.
      if (g.side === "volume" && holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    }
    // 2x must never ride on top of a volume drag.
    if (hold2xRef.current && g.side === "volume") {
      releaseHold2x();
    }
    // Netflix sign: drag UP → louder (clientY falls, so -dy is positive).
    const nv = Math.min(1, Math.max(0, volumeRef.current - dy * 0.008));
    setMuted(false);
    setAutoMuted(false);
    setVolume(nv);
    showHud("volume", nv);
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
      setEverPlayed(true);
      setPlaying(true);
      setBuffering(false);
      if (navigator.mediaSession) navigator.mediaSession.playbackState = "playing";
      // Playback of any origin satisfies a pending switch-resume.
      pendingResumeRef.current = false;
    };
    const onPause = () => {
      setPlaying(false);
      if (navigator.mediaSession) navigator.mediaSession.playbackState = "paused";
      // A pause of any origin must not leave 2x armed for the next play.
      if (hold2xRef.current) releaseHold2x();
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setEnded(true);
      // Ending while held must not leave the next play stuck at 2x.
      if (hold2xRef.current) releaseHold2x();
      poke();
    };
    const onRateChange = () => {
      // An external rate change (media session, devtools) ends a hold.
      if (hold2xRef.current && Math.abs((video.playbackRate || 1) - HOLD_SPEED) > 0.01) {
        releaseHold2x();
      }
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
      // A seek of any origin ends a 2x hold.
      if (hold2xRef.current) releaseHold2x();
      // timeupdate does not fire while seeking, so mirror currentTime (which already
      // carries the seek target) or the bar sits at the pre-seek position.
      setCurrentTime(video.currentTime || 0);
    };
    const onSeeked = () => {
      setBuffering(false);
      // Flush whatever the viewer queued while this seek was in flight.
      const pending = pendingSeekRef.current;
      if (pending) {
        pendingSeekRef.current = 0;
        seekRelativeRef.current(pending);
      }
    };
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
    video.addEventListener("ratechange", onRateChange);
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
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("canplay", onCanPlay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* One-shot switch-resume: when a switch-while-playing had its post-reload
     video.play() refused (autoplay policy, the play runs outside the click
     gesture), re-drive it on the NEXT interaction. The timer defers past the
     press so the video's own click-to-toggle runs first (it plays when paused,
     so a double play() is a harmless no-op), covering taps on the picture AND
     on controls/settings that do not toggle. */
  useEffect(() => {
    const root = screenRef.current;
    if (!root) return undefined;
    const onPointerDown = () => {
      if (!pendingResumeRef.current) return;
      setTimeout(() => {
        pendingResumeRef.current = false;
        const video = videoRef.current;
        if (!video) return;
        // The video's own click-to-toggle runs first (plays when it is paused);
        // if a real gesture already started playback there is nothing to do,
        // otherwise (tap on chrome/settings/non-toggle) re-drive the play() the
        // browser refused during the switch.
        if (video.paused) {
          video.play().catch(() => {
            // Still blocked — the next interaction tries again.
            pendingResumeRef.current = true;
          });
        }
      }, 0);
    };
    root.addEventListener("pointerdown", onPointerDown);
    return () => root.removeEventListener("pointerdown", onPointerDown);
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

  useEffect(() => {
    const video = videoRef.current;
    if (video && !hold2x) {
      try {
        video.playbackRate = playbackRate;
        heldRateRef.current = playbackRate;
      } catch (error) {
        // Some engines reject a rate mid-seek; the next effect pass retries.
        logDebug("player", "Could not apply playbackRate.", { message: error?.message });
      }
    }
    /* `hold2x` releasing used to fall straight into the branch above, which
       re-applied the STATE rate over the rate releaseHold2x had just restored.
       For a viewer at 1x that is invisible (both are 1). For anyone who chose
       1.25x or 1.5x in Settings it meant a hold-to-2x snapped them back to their
       state rate a frame later — the restore was correct and then immediately
       undone. Only a real SETTING change re-syncs the element now; a hold
       release is releaseHold2x's business alone. */
  }, [playbackRate]);

  /* Hold-to-2x safety net. The release gesture is the normal exit, but the hold
     can be interrupted by something that never delivers a touchend for the video
     (an OS gesture taking over, the tab going to the background, a stream that
     dies under the finger). Without a backstop the element stays at 2x until the
     media is rebuilt. Two independent exits: the element reporting "not playing"
     (a stall or an episode ending) restores immediately, and a wall-clock cutoff
     restores after HOLD_2X_MAX_MS even if the element still claims to be
     playing. */
  useEffect(() => {
    if (!hold2x) return undefined;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused || Date.now() - startedAt >= HOLD_2X_MAX_MS) releaseHold2x();
    }, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold2x]);

  /* A new episode / title is new media: the element is rebuilt at the state rate,
     so a hold that was live when the switch happened must not keep arming 2x. */
  useEffect(() => {
    if (hold2xRef.current || holdTimerRef.current) releaseHold2x();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id, season, episode]);

  /* Pending timers on unmount. These fire long after the player is gone if left
     armed: a HUD timeout would `setHud` on an unmounted component, a single-tap
     timer would run the play/pause toggle against a dead element, and a desktop
     hold timer could arm 2x on a torn-down element. (`swIdleRef` /
     `swOfferTimerRef` have their own unmount effect above; the touch hold timer
     is cleared by `releaseHold2x`.) */
  useEffect(
    () => () => {
      if (hudTimerRef.current) clearTimeout(hudTimerRef.current);
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
      if (desktopHoldTimerRef.current) clearTimeout(desktopHoldTimerRef.current);
    },
    [],
  );

  /* Aspect ratio persists across visits (brightness is gone — the OS owns
     screen brightness; a CSS filter only broke the picture). */
  useEffect(() => {
    try {
      window.localStorage.setItem(ASPECT_STORAGE_KEY, String(aspectRatioIndex));
    } catch {
      // private mode — aspect just won't persist
    }
  }, [aspectRatioIndex]);

  /* Loop + sleep timer + picture-in-picture + subtitle styling. Small,
     self-contained "playback QoL" controls that mirror the provider's own
     Playback and Subtitle menus. */
  const clearSleepTimer = useCallback(() => {
    if (sleepTimerId.current) {
      clearTimeout(sleepTimerId.current);
      sleepTimerId.current = null;
    }
    if (sleepDisplayId.current) {
      clearInterval(sleepDisplayId.current);
      sleepDisplayId.current = null;
    }
    setSleepMinutes(null);
    setSleepRemaining(null);
  }, []);

  const startSleepTimer = useCallback(
    (minutes) => {
      if (sleepTimerId.current) {
        clearTimeout(sleepTimerId.current);
        sleepTimerId.current = null;
      }
      if (sleepDisplayId.current) {
        clearInterval(sleepDisplayId.current);
        sleepDisplayId.current = null;
      }
      if (!minutes || minutes <= 0) {
        setSleepMinutes(null);
        setSleepRemaining(null);
        return;
      }
      const endsAt = Date.now() + minutes * 60 * 1000;
      setSleepMinutes(minutes);
      setSleepRemaining(Math.round((endsAt - Date.now()) / 1000));
      sleepDisplayId.current = setInterval(() => {
        setSleepRemaining(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
      }, 1000);
      sleepTimerId.current = setTimeout(() => {
        try {
          videoRef.current?.pause();
        } catch {
          // element already torn down — nothing to pause
        }
        clearSleepTimer();
        setControlsVisible(true);
        setQualityNote("Sleep timer ended — playback paused.");
      }, minutes * 60 * 1000);
    },
    [clearSleepTimer],
  );

  // Apply the loop toggle to the element (a real attribute, so a wrapped
  // playback restarts without the ended overlay).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.loop = loopEnabled;
    } catch {
      // some webviews reject the attribute; playback simply won't loop
    }
  }, [loopEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SUB_SIZE_STORAGE_KEY, String(subtitleSize));
      window.localStorage.setItem(SUB_BG_STORAGE_KEY, String(subtitleBg));
    } catch {
      // private mode — subtitle styling just won't persist
    }
  }, [subtitleSize, subtitleBg]);

  // Tear the sleep timer down on unmount so its timeout can't fire against a
  // discarded player (and the display interval can't leak).
  useEffect(
    () => () => {
      if (sleepTimerId.current) clearTimeout(sleepTimerId.current);
      if (sleepDisplayId.current) clearInterval(sleepDisplayId.current);
    },
    [],
  );

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (error) {
      logWarn("native", "Picture-in-picture request failed", { message: error?.message });
    }
  }, []);

  /* Track the element's PiP state so the row's label reflects reality (a
     browser gesture can exit PiP without going through our button). */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, []);

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
        seekRelativeRef.current(-(d?.seekOffset || skipSecondsRef.current)),
      );
      navigator.mediaSession.setActionHandler("seekforward", (d) =>
        seekRelativeRef.current(d?.seekOffset || skipSecondsRef.current),
      );
      navigator.mediaSession.setActionHandler("seekto", (d) => {
        if (d?.seekTime == null) return;
        safeSeek(d.seekTime);
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

  /* Scrubber preview pipeline: one shared off-screen decoder for the app.
     Remounted by the player on title/source changes (clearPreviewCache above);
     torn down with the player so no hidden hls outlives the screen. */
  useEffect(
    () => () => {
      resetPreviewPipeline();
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

  /* Episodes that have actually aired. Everything that can move the viewer to a
     different episode — the transport arrows, the keyboard paging, Up Next —
     walks this instead of `episodes`, so an unaired episode (no still, no
     runtime, no source) can never be paged into or auto-played. */
  const airedEpisodes = useMemo(
    () => (Array.isArray(episodes) ? episodes.filter((e) => isEpAired(e)) : []),
    [episodes],
  );

  /* Netflix "Up Next": when a TV episode ends and a next one exists, offer a
     countdown card that auto-plays it. Replaying/cancelling tears it down (a
     cancelled card's fired timer is a no-op thanks to the `prev` guard). */
  useEffect(() => {
    if (type !== "tv" || !ended) {
      setUpNext(null);
      return undefined;
    }
    const idx = airedEpisodes.findIndex((e) => e.number === episode);
    const next = idx >= 0 ? airedEpisodes[idx + 1] : null;
    if (!next) {
      setUpNext(null);
      return undefined;
    }
    setUpNext(next);
    // Autoplay off: the card still appears (with its "Play now" affordance)
    // but never fires — the timer simply isn't registered. Mirrors YouTube's
    // switch, whose only effect is the countdown.
    if (!autoplayEnabled) return undefined;
    const timer = setTimeout(() => {
      setUpNext((prev) => {
        if (prev) {
          // Still-watching guard: three auto-advances with zero interaction in
          // between means nobody is behind the screen — pause and ask instead
          // of burning data through a fourth episode.
          if (swAutoAdvRef.current + 1 >= STILL_WATCHING_EPISODES) {
            offerStillWatching("binge");
            return null;
          }
          swAutoAdvRef.current += 1;
          onSelectEpisodeRef.current?.(prev.number);
        }
        return null;
      });
    }, UP_NEXT_MS);
    return () => clearTimeout(timer);
  }, [type, ended, airedEpisodes, episode, autoplayEnabled]);

  /* Netflix keyboard map. Space/K play-pause, arrows seek/volume, M mute,
     F fullscreen, N/Shift+P next/previous episode, Esc closes the dialog
     first, then the player. */
  useEffect(() => {
    /* The other half of tap-vs-hold Space. A keyup with no 2x engaged means the
       viewer tapped, so play/pause fires HERE — after the intent is known — and
       a keyup when 2x IS engaged just restores the rate and does nothing else. */
    const onKeyUp = (e) => {
      if (e.code !== "Space") return;
      if (!spaceHoldRef.current) return;
      spaceHoldRef.current = false;
      const engaged = spaceFiredRef.current;
      spaceFiredRef.current = false;
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
      if (engaged) {
        releaseHold2x();
        return;
      }
      togglePlayRef.current?.();
    };
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
          e.preventDefault();
          /* Space is the one key that must wait to know the intent: a TAP is
             play/pause, a HOLD is 2x (YouTube/Netflix both do this). Toggling on
             keydown and then also engaging 2x would pause the video out from
             under a viewer who is only holding the key to skim, so the tap is
             deferred to keyup and cancelled outright if 2x engaged. KeyK stays
             an instant toggle — it has no hold meaning. */
          if (spaceHoldRef.current) return; // auto-repeat: ignore the held-down stream
          spaceHoldRef.current = true;
          spaceFiredRef.current = false;
          if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
          holdTimerRef.current = setTimeout(() => {
            holdTimerRef.current = null;
            if (!spaceHoldRef.current) return;
            spaceFiredRef.current = true;
            engageHold2x();
          }, HOLD_2X_DELAY_MS);
          break;
        case "KeyK":
          e.preventDefault();
          // The ref, not the closed-over function: this effect binds once per
          // panel flip, so the raw `togglePlay` here captured the mount render's
          // `resumeOffer` (always null) — K ignored a pending "Left off at …"
          // card while a click/Space honoured it. togglePlayRef is reassigned
          // every render.
          togglePlayRef.current?.();
          break;
        case "KeyJ":
          e.preventDefault();
          seekRelative(-skipSecondsRef.current);
          break;
        case "KeyL":
          e.preventDefault();
          seekRelative(skipSecondsRef.current);
          break;
        case "ArrowLeft":
          e.preventDefault();
          // Auto-repeat must not machine-gun seeks: every write re-targets the
          // in-flight fragments, so a held arrow thrashed the relay and loaded
          // nothing until release. One seek per physical press, like Space.
          if (e.repeat) return;
          seekRelative(-skipSecondsRef.current);
          break;
        case "ArrowRight":
          e.preventDefault();
          if (e.repeat) return;
          seekRelative(skipSecondsRef.current);
          break;
        case "ArrowUp":
          e.preventDefault();
          changeVolume(0.1);
          break;
        case "ArrowDown":
          e.preventDefault();
          changeVolume(-0.1);
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
        case "KeyN":
          // Netflix web: N = next episode.
          e.preventDefault();
          keyboardEpNextRef.current();
          break;
        case "KeyP":
          // Netflix web: Shift+P = previous episode (plain P toggles play there).
          if (e.shiftKey) {
            e.preventDefault();
            keyboardEpPrevRef.current();
          }
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
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
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
    // EPISODE SWITCH = COLD OPEN. hasStartedRef stays true from the previous
    // episode, so without dropping it the spinner effect classifies this wait
    // as a warm stall and shows only the light ring - the viewer never sees
    // the title-logo stage they get on the first episode (user report).
    // Dropping it re-arms the full art stage; `stageWhileLoading` is already
    // true on this path, and the commit block clears it when frames return.
    hasStartedRef.current = false;
    // The source committed by the PREVIOUS run (null on first mount): a dub
    // pin carried across a SERVER switch must not index into the new
    // server's audioTracks — see the publish guard in the commit block.
    const prevSourceKey = metaRef.current?.sourceKey || null;
    // A NEW title/episode drops any manual server pick, so playback always
    // opens on the default rotation (Orion/Server 1) instead of whatever server
    // the viewer happened to pick for the PREVIOUS title. A same-media reload
    // (reloadToken bump from pickServer) keeps the key unchanged and so keeps
    // the pick. Done here, synchronously, so the resolve below sees it.
    const mediaKey = `${type}|${id}|${season ?? ""}|${episode ?? ""}`;
    if (mediaKeyRef.current !== mediaKey) {
      mediaKeyRef.current = mediaKey;
      requestedServerRef.current = null;
      setRequestedServer(null);
      activeDubRef.current = 0;
      setActiveDub(0);
      setDubTracks([]);
      setDubOriginalLang("");
      setSourceVariants([]);
      setSourceHeight(0);
      sourceHeightRef.current = 0;
      clearSleepTimer();
      // A new title/episode is NOT "ended": without this the previous
      // installment's `ended` flag survives the switch and the Up Next card
      // (and the ended overlay) bleeds onto the episode that just started.
      setEnded(false);
      setUpNext(null);
    }
    // Consume any reload carry exactly once, and only for the SAME media — a
    // carry armed for one episode must never reposition another.
    const carry = carryRef.current;
    carryRef.current = null;
    // Queued relative deltas belong to the previous media — never re-apply
    // them onto a fresh stream that starts at 0.
    pendingSeekRef.current = 0;
    const carrySame = Boolean(carry && carry.key === mediaKey);
    const carryPaused = carrySame && Boolean(carry.paused);
    if (!carrySame) setSwitchFrame(null);

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
      setDubTracks([]);
      setDubOriginalLang("");
      setActiveDub(0);
      setBuffering(true);
      setBufferedSecs(0);
      setBufferedRanges([]);
      setAutoLevel(true);
      setManualHeight(null);
      setCurrentHeight(null);
      setResumeOffer(null);
      setPanel(null);
      setTransportRelay(false);
      setQualityNote(null);
      setDeadDubs(new Set());
      autoUriRef.current = null;
      autoUriHeightRef.current = null;
      const args = {
        type,
        id,
        season: type === "tv" ? season : undefined,
        episode: type === "tv" ? episode : undefined,
        title,
        // Raw-source resolution pin (0/undefined = Auto) — see pickSourceQuality.
        sourceHeight: sourceHeightRef.current || undefined,
      };
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

      // Set when any source attempt dies on an upstream 429 (see reportFatal).
      // The final banner reads it: vidzen's 2026-09 delivery fleet quota-dies
      // with Cloudflare "error code: 1027" — the browser logs an opaque CORS
      // error while the real story is the provider's daily quota, so the banner
      // should say THAT instead of a bare "no stream".
      let anyUpstreamQuota = false;

      // The position a re-run of THIS effect must resume at. Seeded from the
      // reload carry (server/source pick, manual retry) and then kept honest by
      // the fatal-latch below, so a MID-PLAY failover to another source picks
      // up where the viewer actually was — a non-auth fatal used to restart the
      // whole run with no carry and began again at 0.
      let carryAt = carrySame && carry.at > 0 ? carry.at : null;

      // One pass at a source: true = settled (caller stops), false = transient (retryable
      // warm-up/empty/flaky), "off" = terminal (the provider doesn't have this title).
      const runSourceOnce = async (defArg, bypassCache) => {
        // Auto rotation resolves through AUTO_SOURCE (the backend picks the
        // healthiest server in one round trip); a Servers-menu pick overrides it
        // for one pass (stale() guards everything as usual).
        let def = defArg || PLAYER_SOURCES.find((s) => s.key === requestedServerRef.current) || null;
        if (!def) return false;
        let resolved = null;
        try {
          // Warm-resolve handover (PLAN.md P0.4): the details page may have
          // pre-minted the token while the viewer read the synopsis — consume it
          // instead of re-paying the resolve leg. The handover is one-shot and
          // refuses ANY manual server pick (a pick must resolve THAT server, not
          // a warm token minted for the auto path).
          const warm = takeWarmResolve(args, { sourceKey: requestedServerRef.current });
          resolved = warm || (await def.resolve(args, { signal: controller.signal, bypass: bypassCache }));
        } catch (error) {
          if (error?.code === "no-source") return "off";
          return false;
        }
        // The backend echoes the server that ACTUALLY served this — for the
        // automatic path because it picks one, and for a manual `prefer` pick
        // because it may fall through when the picked backend has no source.
        // Map it onto its real row so the label, the Servers-menu highlight and
        // any token-refresh retry all speak about the server actually playing.
        // A manual pick that fell through says so, instead of silently playing a
        // different server behind the viewer's back.
        const servedKey = sourceByServer(resolved?.server)?.key || null;
        if (servedKey && servedKey !== def.key) {
          if (requestedServerRef.current && requestedServerRef.current !== servedKey) {
            setSwitchingNote(
              `${sourceLabel(requestedServerRef.current)} has no stream — playing ${sourceLabel(servedKey)}`,
            );
          }
          def = sourceByServer(resolved.server);
        }
        let variants = resolved?.variants || [];
        if (variants.length === 0) {
          // Empty is not terminal: the catalogue returns empty lists when rate-flaky.
          return false;
        }
        // Sibling-URL dubs ride OUTSIDE the ladder (resolved.audioTracks); variants
        // above is rewritten by the token-refresh path, so the dub list keeps the
        // FIRST resolution's — sibling URLs never refresh tokens anyway.
        const dubTracks = Array.isArray(resolved?.audioTracks) ? resolved.audioTracks : [];
        const dubOriginalLang =
          typeof resolved?.audioOriginalLang === "string" ? resolved.audioOriginalLang : "";
        // The server reports the distinct raw source resolutions it can offer for
        // THIS server/title (>1 only), which drives the "Source quality" row. The
        // pick itself lives in sourceHeightRef and is NOT reset here — the reload
        // that a pick triggers re-runs this effect, and a reset would undo it.
        setSourceVariants(Array.isArray(resolved?.sourceVariants) ? resolved.sourceVariants : []);

        let liveSource = resolved.source;
        let liveRefUrl = resolved.source?.refUrl || resolved.source?.url;
        // Master sources ship levels + audio groups in ONE url; others are per-rendition.
        const isMaster = Boolean(liveSource?.multiLevelMaster);
        // attempt 0 = initial URLs; attempt 1 = one token-refresh re-resolve.
        let preferHeight = null;
        // A reload carry (server/source pick, manual retry) — or the fatal-latch
        // from an earlier attempt in this run — repositions this run the same
        // way the token-refresh path below does.
        let resumeTime = carryAt;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          if (stale()) return true;
          const pool = preferHeight != null ? variants.filter((v) => (v.height || 0) === preferHeight) : [];
          // Smooth start: open on the tallest rendition ≤1080p (a 4K segment needs
          // ~20Mbps sustained — opening there is what stalled playback after 5-10s).
          let smoothStart = pool[0] || pickSmooth(variants);
          // A pinned dub re-opens on ITS OWN sibling manifest (the token-refresh
          // attempt below), not the original-language entry — the position restore
          // then lands the viewer back inside the dub they were watching.
          // Row index N is dubTracks[N - 1] (row 0 is the original).
          const pinnedDub =
            activeDubRef.current > 0 && activeDubRef.current <= dubTracks.length
              ? dubTracks[activeDubRef.current - 1]
              : null;
          if (pinnedDub) {
            smoothStart = { uri: pinnedDub.uri, height: 0 };
          }
          let entryUrl = entryUrlFor(def, { source: liveSource }, smoothStart);
          if (!entryUrl) {
            return false;
          }
          // Playability gate: prove one real media byte flows before hls.js sees the
          // source, or a perfect ladder over dead segments plays as a black screen.
          let probe = { ok: false, reason: "probe error" };
          try {
            probe = await probeSourcePlayable(entryUrl, liveRefUrl, { signal: controller.signal });
          } catch (error) {
            if (error?.name === "AbortError" || stale()) return true;
            probe = { ok: false, reason: error?.message || "probe error" };
          }
          if (stale()) return true;
          if (!probe.ok) {
            // A provider whose delivery fleet is quota-dead fails HERE (the
            // probe's relay sip rides the same 429). Flag it for the final
            // banner so "all sources came up empty" can name the real cause.
            if (/\b429\b|quota/i.test(probe.reason || "")) anyUpstreamQuota = true;
            return false;
          }
          setTransportRelay(probe?.via === "relay");
          // Relay delivery is latency-bound (fresh serverless round trip per chunk), so
          // a relay start reopens at the tallest ≤720p; the direct path keeps ≤1080p.
          if (!isMaster && probe.via === "relay" && (smoothStart?.height || 0) > 720) {
            const relayFriendly = variants
              .filter((v) => (v.height || 0) > 0 && (v.height || 0) <= 720)
              .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
            if (relayFriendly && relayFriendly.uri !== smoothStart?.uri) {
              smoothStart = relayFriendly;
              entryUrl = entryUrlFor(def, { source: liveSource }, smoothStart);
              // A per-quality source whose variant lacks a uri must not reach
              // hls.loadSource(undefined) — that surfaced as ?url=undefined at
              // the worker (500 + CORS noise) instead of a clean failover.
              if (!entryUrl) {
                return false;
              }
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
            Math.max(MIN_BUFFER_SIZE, Math.ceil((topBps / 8) * BUFFER_DEPTH_SECONDS * 3)),
          );
          // ABR seed. A fixed 10Mbps is a blind guess: too low on a fast TV, far
          // too high on a phone (an over-optimistic first rung shows a rebuffer
          // before hls.js corrects itself). navigator.connection already knows
          // the pipe's shape before a byte flows, so use it as a PRIOR only —
          // hls.js's own measurement still wins after the first segments, and
          // the underflow step-down is unchanged. Absent the API (Safari,
          // Firefox) this is exactly the old fixed seed.
          const streamSeedBits = pickInitialBandwidthBits(
            typeof navigator !== "undefined" ? navigator.connection : undefined,
            INITIAL_BW_BITS,
          );
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
              // Manifest cue tags, when present, replace the guessed skip windows.
              onCueBoundaries: (bounds) => mergeBoundaries(bounds, "cues"),
            }),
            // ABR + progressive MSE appends: chunks hit the screen while the segment is
            // still arriving. The back buffer stays small so device RAM stays bounded.
            abrEnabled: true,
            progressive: true,
            // The loader's watchdog is an INACTIVITY timer (it re-arms on every
            // progress chunk — see nativeHlsLoader), so 15s means "no bytes for
            // 15s = dead hop", not "the segment must finish in 15s". The old 30s
            // held a seek/stall spinner for half a minute per attempt, and 8
            // retries stretched a dead origin's detection into minutes; with the
            // re-arming watchdog, failover now trips in under a minute worst case.
              fragLoadingTimeOut: 15000,
              fragLoadingMaxRetry: 5,
              manifestLoadingTimeOut: 20000,
              manifestLoadingMaxRetry: 4,
              levelLoadingTimeOut: 20000,
              levelLoadingMaxRetry: 4,
            maxBufferLength: BUFFER_DEPTH_SECONDS,
              maxMaxBufferLength: 180,
            maxBufferSize,
            backBufferLength: BACK_BUFFER_SECONDS,
            // Auto starts mid-ladder (INITIAL_BW_BITS) so quality doesn't climb rung-by-rung.
            initialBandwidthEstimate: streamSeedBits,
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
            // Logs name the PROVIDER, not the generic row: "Server 4" in a
            // console tells you nothing, `zxc-centaurus` tells you which
            // backend to go debug. The viewer-facing status line keeps the generic name.
            if (/\b429\b|quota/i.test(lastFatalDetail)) anyUpstreamQuota = true;
            logWarn("native", `${def.provider} (${def.label}) fatal during playback`, {
              sourceKey: def.key,
              details: data?.details,
              message: data?.error?.message,
              fragSn: frag?.sn ?? null,
            });
          };
          const failOver = () => {
            // Latch the REAL position first: destroy() detaches the media, and a
            // detach resets currentTime to 0 — without this every re-run of the
            // failed run (token refresh, same-source retry, rotation to another
            // server) resumed at 0 instead of where the viewer actually was.
            const lastT = videoRef.current?.currentTime || 0;
            if (lastT > 0) carryAt = lastT;
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
            // A heightless media playlist reports 0/null; keep the last real
            // height rather than drive the dialog to "0p" after a full-reload
            // switch (that path now also seeds currentHeight from the pick).
            if (data?.height) setCurrentHeight(data.height);
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
                                  } else if (consecFragFails >= MAX_CONSECUTIVE_FRAG_FAILURES) {
                  reportFatal({ ...data, fatal: true, details: `${data.details} (×${consecFragFails} consecutive — giving up)` });
                  failOver();
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
          } catch {
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
            entryUrl,
          };
          // Single write point for the live source, so this is the single place
          // that has to announce it. Runs for a manual pick AND for the loader's
          // own fail-over, which is the case the ref could not express.
          setActiveSourceKey(def.key);
          // A fresh resolution carries a fresh referer token — thumbnails from
          // the previous one are dead weight; the preview decoder remounts.
          clearPreviewCache(def.key);
          startLevelFor(hls);
          // One row per DISTINCT LABEL: providers list several renditions of the
          // same rung (640x272 + 640x360 both read "480p"), which showed as
          // duplicate menu rows. Rows carry their RAW height so level matching
          // (highlight, step-down) keeps comparing like with like.
          setQualities(buildQualityRows(variants));
          // Publish this run's dub list — unless a dub pin carried over from
          // a DIFFERENT server (a Servers-menu switch): a stale index must not
          // auto-pin a dub on the new server (its attempt loop would re-open
          // a dead old token). Same-server re-runs keep the pin by design.
          if (activeDubRef.current > 0 && def.key !== prevSourceKey) {
            activeDubRef.current = 0;
            setActiveDub(0);
            setDubTracks([]);
            setDubOriginalLang("");
          } else {
            setDubTracks(dubTracks);
            setDubOriginalLang(dubOriginalLang);
            setActiveDub(activeDubRef.current);
          }
          setIsMasterMode(isMaster);
          setActiveUri(isMaster ? null : smoothStart?.uri || null);
          // Remember the rung the player negotiated (non-master "Auto").
          autoUriRef.current = isMaster ? null : smoothStart?.uri || null;
          autoUriHeightRef.current = isMaster ? null : smoothStart?.height ?? null;
          attachAudio(hls);
          // A real "playing" phase, not a label: consumers (the paused centre
          // transport in CenterStack, the low-buffer ABR step-down below) test
          // `status === "playing"` by exact equality, so the server name must
          // never be folded into this string or both go dead. The provider name
          // is already carried by `switchingNote`/the Servers menu.
          setStatus("playing");
          // Real frames exist again: any later stall is a mid-playback one and
          // must use the light overlay, not hide the picture behind art.
          setStageWhileLoading(false);
          setServerSwitchStage(false);
          setSwitchingNote(null);
          // The captured pre-switch frame has served its purpose; real frames
          // are on screen again.
          setSwitchFrame(null);
          if (resumeTime != null) {
            safeSeek(resumeTime);
            resumeTime = null;
          }
          // A switch made while PAUSED stays paused (pickQuality's rule): the
          // commit's play() runs outside the click gesture, so it would also
          // fight the autoplay policy on the way.
          if (!carryPaused) {
            try {
              await videoRef.current?.play();
            } catch {
              // Muted autoplay is allowed, an unmuted play() outside a user-activation window
              // is not: try unmuted, else play muted + hint at "Tap to unmute".
              try {
                videoRef.current.muted = true;
                setAutoMuted(true);
                await videoRef.current.play();
              } catch (error) {
                // Even muted playback was refused: the element cannot start
                // without a gesture, so leave it paused and let the viewer press
                // play. The log is dev-only and keeps the reason traceable.
                logDebug("player", "Muted autoplay after a quality switch was refused.", {
                  message: error?.message,
                });
              }
            }
          }
          // Non-master sources are single-rendition: their current height is fixed.
          if (!isMaster) setCurrentHeight(smoothStart?.height ?? null);
          // Honest Auto/active state for the quality menu: a master opened on
          // real ABR; a fixed ladder (single-variant HLS) has no ABR to be auto
          // WITH — Auto there just replays the open rung. Without this the
          // menu showed no active row on NHD/ZXC until the viewer picked one.
          setAutoLevel(isMaster);
          // Netflix resume gate: first real playback for this title/episode.
          maybeOfferResumeRef.current();
          // A fatal error AFTER playback started either refreshes tokens in place (same
          // source/quality, resume position) or moves on — never a dead "playing" screen.
          const parked = await Promise.race([fatalLater.then(() => "fatal"), abortPromise()]);
          if (parked === "done") return true;
          // The stream died mid-play (expired token, dead CDN, quota'd relay):
          // the frozen frame belongs to a source that is no longer delivering,
          // so bring the art stage back over it for the reconnect/rotation wait.
          // Cold-open state, exactly like a server switch — hasStartedRef must
          // be dropped too, or the spinner effect would classify the next stall
          // as a "warm" one and hide the stage this open just armed.
          hasStartedRef.current = false;
          setStageWhileLoading(true);
          setSwitchingNote("Reconnecting…");
          // A pinned dub whose token died mid-play cannot refresh in place — its
          // sibling URL is fixed — so drop back to the original track and let the
          // token-refresh re-resolve below mint a fresh ladder for it.
          if (activeDubRef.current > 0 && isAuthFatal(lastFatalDetail) && !stale()) {
            activeDubRef.current = 0;
            setActiveDub(0);
          }
          if (attempt === 0 && isAuthFatal(lastFatalDetail) && !stale()) {
            const savedT = videoRef.current?.currentTime || 0;
            // A quota/429 is a THROTTLE, not an expired token: re-resolving the
            // instant it fires spends another request on an origin that is
            // already refusing us, which is how one momentary limit turned into a
            // cascade through every server (and 1-4 are the same provider, so the
            // failover could not have helped). Hold off long enough for the limit
            // to clear, then re-resolve on this same source. Switching note so the
            // wait reads as intent rather than a hung player.
            const throttled = /\b429\b/.test(lastFatalDetail || "");
            if (throttled) {
              setSwitchingNote(`${def.label}: provider rate-limited, retrying shortly...`);
              await sleep(THROTTLE_BACKOFF_MS);
              if (stale()) return true;
                }
            let fresh = null;
            try {
              // bypass: the cached payload is the one the probe just proved dead
              // — a token refresh must actually re-resolve, not replay it.
              fresh = await def.resolve(args, { signal: controller.signal, bypass: true });
            } catch {
              fresh = null;
            }
            // Dub tracks survive: the fresh re-resolve rewrites the LADDER only,
            // so a pinned dub keeps playing across the token refresh.
            const freshVariants = fresh?.variants || [];
            if (fresh && freshVariants.length > 0) {
              preferHeight = smoothStart?.height ?? null;
              resumeTime = savedT;
              variants = freshVariants;
              liveSource = fresh.source;
              liveRefUrl = fresh.source?.refUrl || fresh.source?.url;
              continue;
            }
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
            await sleep(SOURCE_RETRY_BACKOFF_MS[retry - 1] ?? 1200);
            if (stale()) return true;
          }
          // A retry means the previous attempt (possibly from the prefetch
          // cache) did not play, so bypass the cache and resolve live.
          const outcome = await runSourceOnce(def, retry > 0);
          if (outcome === true) return true;
          if (outcome === "off") return false;
        }
      };

      // A Servers-menu pick plays ONLY that server (its own retry + token-
      // refresh machinery still applies). The no-pick path resolves through
      // AUTO_SOURCE: the server walks its health-ordered backends in ONE round
      // trip, so a dead Server 1 no longer costs the viewer four more client
      // requests before playback. Silently falling back to another provider on
      // an explicit pick would lie about what the viewer chose — the fatal
      // message points at the Servers menu instead.
      if (requestedServerRef.current) {
        if (await runSource(null)) return;
      } else if (await runSource(AUTO_SOURCE)) {
        return;
      }
      if (stale()) return;
      setStatus("error");
      const quotaHit = anyUpstreamQuota;
      setFatal(
        requestedServerRef.current
          ? `${sourceLabel(requestedServerRef.current)} had no playable stream${quotaHit ? " (provider hit its daily delivery quota, HTTP 429 — try again later)" : ""} — try another server (gear → Servers).`
          : `No native source resolved this title (all sources came up empty).${
              quotaHit
                ? " At least one provider hit a daily delivery quota (HTTP 429) — try again later or pick another server."
                : ""
            }`,
      );
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
  }, [type, id, season, episode, title, reloadToken, clearSleepTimer]);

  const pickQuality = async (uri, height, opts = {}) => {
    const hls = hlsRef.current;
    if (!videoRef.current) return;
    if (!hls) return;
    // A pinned NHD dub IS the manifest — the source serves one rung per dub, so
    // a quality pick while a dub plays would silently swap the viewer back to
    // the original language instead of changing quality. Honest answer: fixed.
    // (Dub switches pass dubSwitch — pickDub commits the ref only after its own
    // probe passed, and picking "Original" clears the ref first.)
    if (activeDubRef.current > 0 && !opts.dubSwitch) {
      setBuffering(false);
      setQualityNote("Switch audio back to Original to change quality");
      return;
    }
    const t = videoRef.current.currentTime || 0;
    const wasPaused = videoRef.current.paused;
    // A manual rung pick leaves Auto; the Auto row stays highlighted as the active mode.
    // OPTIMISTIC UI: the menu row and the settings summary flip to the picked
    // rung NOW, before any probe/playlist round trip - on a relay path that
    // wait is measured in seconds, and a highlight that stays put reads as
    // "the pick did nothing". A failed switch rolls both back in the catch.
    if (!opts.auto) {
      setAutoLevel(false);
      if (height != null) setManualHeight(height);
    }
    // The optimistic highlight above must be undone on EVERY bail-out that
    // leaves the old stream playing — not only in the catch. The two early
    // returns below (dead probe, no chosen URI) are plain returns inside the
    // try, so they used to leave the menu row and the settings summary claiming
    // a rung that never loaded.
    const rollbackPick = () => {
      setManualHeight(null);
      setAutoLevel(metaRef.current?.masterLevels ? true : false);
    };
    // pickDub already said "Audio -> <track>…" — don't overwrite it with "?p".
    setBuffering(true);
    poke();
    try {
      // A dub switch on a multi-rung master replaces the whole playlist (the dub
      // is a sibling master URL), so it must NOT be short-circuited into
      // `hls.currentLevel` — that would keep the original language playing.
      // An `external` pick carries a URI from a DIFFERENT master (the
      // vidrack upgrade): pinning a level inside the CURRENT manifest
      // would silently do nothing, so it must take the full loadSource path.
      if (!opts.dubSwitch && !opts.external && metaRef.current?.masterLevels && Array.isArray(hls.levels) && hls.levels.length > 0) {
        let best = 0;
        hls.levels.forEach((lvl, i) => {
          if (Math.abs((lvl.height || 0) - (height || 0)) < Math.abs((hls.levels[best].height || 0) - (height || 0))) best = i;
        });
        hls.currentLevel = best;
        setAutoLevel(false);
        // Highlight the ROW the viewer clicked, not the manifest rung hls.js
        // pinned to it. A coarse manifest ladder (or a resolver that reports
        // different pixel heights than EXT-X-STREAM-INF RESOLUTION) lands on a
        // DIFFERENT rung than the clicked label; keying manualHeight on the
        // manifest height left NO row selected after the pick.
        if (height != null) setManualHeight(height);
        setActiveUri(null);
        setBuffering(false);
        setQualityNote(null);
        return;
      }
      const myId = (switchTokenRef.current += 1);
      // Pre-warm the swap: probe the TARGET while the current level still plays (warms
      // the CDN edge and proves the route). With parallel range chunking a tall pick
      // may try; the floor step-down negotiates back down.
      let chosenUri = uri;
      let chosenHeight = height;
      // Relay transport already proved itself at open, and a dub switch's
      // pickDub probed this exact URI seconds ago — re-probing both is what
      // made audio/quality swaps hang for seconds before anything moved
      // (user report). The real gate below (loadSource + canplay) still fails
      // honestly if the target is dead.
      let warm = transportRelay || opts.preProbed ? { ok: true, via: "pre-checked" } : null;
      const refUrl = metaRef.current?.refUrl;
      try {
        if (!warm) warm = await probeSourcePlayable(uri, refUrl);
        if (switchTokenRef.current !== myId) return;
        if (!warm.ok) {
          rollbackPick();
          setBuffering(false);
          setControlsVisible(true);
          return;
        }
      } catch {
        // probe hiccup (abort, timeout) — fall through to the requested uri
      }
      // A probe hiccup with no requested uri would reach loadSource(undefined)
      // → the worker's ?url=undefined 500. Bail to the current quality instead.
      if (!chosenUri) {
        rollbackPick();
        setBuffering(false);
        setControlsVisible(true);
        return;
      }
      if (chosenUri === activeUri) {
        setBuffering(false);
        setControlsVisible(true);
        return;
      }
      // The picture is about to go black for real: everything above either
      // returned early (probe failed, same URI, pinned level) or proved the
      // target reachable. Only now is it honest to hide the old frame behind
      // the art stage — a viewer staring at a frozen frame during the reload
      // has no idea whether it stalled. The in-manifest shortcut above is
      // deliberately NOT armed: it never drops the frame, so it must not blank
      // the player either.
      setStageWhileLoading(true);
      setServerSwitchStage(false);
      setSwitchingNote(
        opts.dubSwitch
          ? "Switching audio…"
          : `Switching to ${chosenHeight || "?"}p…`,
      );
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
      safeSeek(t);
      const video = videoRef.current;
      // Resume INSIDE the click's activation window: start the play() NOW, before
      // the canplay wait below. Waiting for the first frames first (the previous
      // order) pushed play() past the activation a strict autoplay policy grants,
      // so an audio/quality change left the video paused until the viewer pressed
      // play (user report). The bounded wait below is now only for the art stage,
      // never a gate on the resume.
      const resumePlay =
        !wasPaused && video
          ? Promise.resolve(video.play()).catch((error) => {
              // Never swallow it: say so in the log and arm a one-shot resume so
              // the next interaction still starts playback.
              logWarn("native", "Browser refused the post-switch auto-resume; playback starts on the next tap.", {
                url: String(chosenUri).slice(0, 80),
                code: error?.name || String(error),
              });
              pendingResumeRef.current = true;
            })
          : null;
      if (!wasPaused && video && (video.readyState ?? 0) < 3) {
        let settleFrame;
        let frameTimer;
        function cleanup() {
          video.removeEventListener("canplay", onFrame);
          video.removeEventListener("loadeddata", onFrame);
          clearTimeout(frameTimer);
        }
        function onFrame() {
          cleanup();
          settleFrame?.();
        }
        await new Promise((resolve) => {
          settleFrame = resolve;
          video.addEventListener("canplay", onFrame);
          video.addEventListener("loadeddata", onFrame);
          // The timeout must ALSO detach: previously cleanup() ran only on the
          // frame event, so every audio/quality switch where the frame missed the
          // 4s window left a dead canplay/loadeddata pair (and its timer) behind.
          frameTimer = setTimeout(cleanup, 4000);
        });
      }
      if (switchTokenRef.current !== myId) return;
      if (resumePlay) await resumePlay;
      setActiveUri(chosenUri);
      // The full-reload path never sees LEVEL_SWITCHED's height when the new
      // media playlist carries NO RESOLUTION (a heightless level reports 0),
      // which drove Auto's "Now" line and the HD chip to "0p". Seed currentHeight
      // from the picked rung; LEVEL_SWITCHED still overrides it with a real one.
      if (chosenHeight != null) setCurrentHeight(chosenHeight);
      // A swapped source can bring its OWN ladder (external upgrade, sibling
      // master): refresh the menu from what actually parsed, but only for a real
      // multi-rung ladder — a single heightless media level must never clobber
      // the resolver ladder the rows were built from.
      if (hls && Array.isArray(hls.levels) && hls.levels.length > 1) {
        const parsed = hls.levels.filter((l) => (l.height || 0) > 0);
        if (parsed.length > 1 && parsed.length !== qualities.length) {
          setQualities(
            buildQualityRows(
              parsed.map((l) => ({
                uri: chosenUri,
                width: l.width || 0,
                height: l.height || 0,
                bandwidth: l.bitrate || l.bandwidth || 0,
              })),
            ),
          );
        }
      }
      setQualityNote(null);
      // A dub switch has no quality to report — pickDub already announced the
      // track it is moving to, so don't overwrite it with "?p".
      // Real frames again. The loader's own success path clears this too, but a
      // direct hls.loadSource() swap (quality/dub) never goes through that path,
      // so without this the art stage would sit on top of working video.
      setStageWhileLoading(false);
      setSwitchingNote(null);
    } catch {
      // Roll the optimistic pick back: the stream is still on the old rung, so
      // the highlight must say so.
      rollbackPick();
      // A failed switch must never leave the buffering spinner stuck (the runSource
      // ERROR handler's failover re-drives its own spinner).
      setBuffering(false);
      // Nor the art stage: the old picture is still there and still correct, so
      // the viewer gets their frame back immediately instead of a stuck overlay.
      setStageWhileLoading(false);
      setSwitchingNote(null);
    }
  };
  pickQualityRef.current = pickQuality;

  /* Servers menu: re-drive the whole load effect through a different source.
     The ref is committed FIRST so the next resolve run sees the pick, the
     reload token re-runs the effect (full teardown → fresh resolve), and the
     dub pin is dropped so no NHD dub URL leaks across servers. The transport
     row highlights this icon while a Servers-menu panel is open. */
  const pickServer = (key) => {
    if (requestedServerRef.current === key) return;
    // The teardown below detaches the media element (currentTime → 0) and the
    // stage replaces the picture: carry the position/paused state and the last
    // frame across, or a switch mid-film restarted at the beginning behind a
    // static art card.
    armReloadCarry();
    setSwitchFrame(captureFrameUrl());
    // Overlap: start the target's resolve NOW, while the previous frame is still
    // on screen, instead of after React tears the current run down and
    // re-renders. The player's own resolve for this row coalesces onto this
    // in-flight promise via the streamResolve cache, so the switch begins with
    // the mint -> servers -> MPD chain already running.
    Promise.resolve(sourceByKey(key)?.resolve(resolveArgs)).catch(() => {});
    requestedServerRef.current = key;
    setRequestedServer(key);
    activeDubRef.current = 0;
    setActiveDub(0);
    setDubTracks([]);
    setDubOriginalLang("");
    setSourceVariants([]);
    setSourceHeight(0);
    sourceHeightRef.current = 0;
    setPanel(null);
    poke();
    const def = sourceByKey(key);
    setReloadToken((t) => t + 1);
    // A server switch leaves no valid frame behind, so the wait is a cold one
    // and gets the art stage rather than the light overlay.
    setStageWhileLoading(true);
    setServerSwitchStage(true);
    setSwitchingNote(`Switching to ${def?.label || "that server"}…`);
  };

  /* Source-quality pick: the raw source ladder a plain-HLS server exposes
     (Daedalus 1080/720/480). Distinct from pickQuality (a rung of the DELIVERED
     ladder) — this re-resolves the whole stream from the source at that raw
     resolution, so it rides the same reload path a server switch uses. 0 = Auto
     (the provider's own default link). */
  const pickSourceQuality = (height) => {
    const next = Number(height) > 0 ? Number(height) : 0;
    if ((sourceHeightRef.current || 0) === next) return;
    // Same reload carry as pickServer: this rides the same teardown path, so
    // without it a mid-film source-quality change also restarted at 0.
    armReloadCarry();
    setSwitchFrame(captureFrameUrl());
    sourceHeightRef.current = next;
    setSourceHeight(next);
    setPanel(null);
    // A source re-resolve has no valid frame to keep, so it is a cold wait.
    setStageWhileLoading(true);
    setSwitchingNote(null);
    poke();
    setReloadToken((t) => t + 1);
  };

  // Servers menu open → warm every row so the tap starts almost instantly. The
  // prefetch is bounded (see prefetchSources) and cancelled the moment the menu
  // closes; a warm already in flight finishes and fills the cache for the tap.
  useEffect(() => {
    if (panel !== "servers") return undefined;
    return prefetchSources(resolveArgs, { skipKey: requestedServer || activeSourceKey });
  }, [panel, resolveArgs, requestedServer, activeSourceKey]);

  // Background sibling-server warm. The menu prefetch only covers the menu being
  // OPEN — a viewer who switches shortly after closing it (or from a remembered
  // row) still paid mint -> servers -> MPD cold (~2-6s through the relay chain).
  // Once the CURRENT stream is playing and settled, pump the other rows into the
  // streamResolve client cache in the background: a switch inside the resolve
  // TTL then skips the chain entirely and only pays manifest + first fragment.
  // Bounded by prefetchSources' own 2-in-flight pump (the 429-safe ceiling);
  // cancel stops NEW rows only, so an in-flight resolve still lands in the cache.
  // Re-armed by the menu effect below independently — both pumps coalesce onto
  // the same cached promises, so overlap never doubles a request.
  useEffect(() => {
    if (status !== "playing") return undefined;
    let cancelled = false;
    let stopPump = null;
    const timer = setTimeout(() => {
      if (cancelled) return;
      stopPump = prefetchSources(resolveArgs, { skipKey: requestedServer || activeSourceKey });
    }, SIBLING_WARM_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      stopPump?.();
    };
  }, [status, resolveArgs, requestedServer, activeSourceKey]);

  // YouTube's anti-stall rule: when the pipe can't refill faster than a segment
  // plays, drop one rung once the forward buffer sits under BUFFER_FLOOR_SECONDS
  // for a sustained stretch without refilling. Auto-level only.
  useEffect(() => {
    const st = lowBufferRef.current;
    // A STALL must not reset the clock: `buffering` used to gate this rule, so
    // the step-down only counted while playback limped along and was blind to
    // the full stalls it exists to rescue (the spinner could sit for a minute
    // while the rung stayed pinned). While the element is still "playing", a
    // stall keeps the under-floor timer running. A PAUSED wait (seek in flight)
    // still resets — dropping a rung mid-seek would disturb it.
    if (status !== "playing" || !playing) {
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
      if (refilling) {
        // The pipe recovered by >1s, so the "sustained under-floor" clock must
        // restart. Previously this returned WITHOUT clearing `since`, so a buffer
        // that dipped, briefly refilled, then dipped again kept counting from the
        // first dip and dropped a rung early.
        st.since = Date.now();
        return;
      }
      if (Date.now() - st.since < BUFFER_UNDERFLOOR_MS) return;
      st.since = 0;
      if (metaRef.current?.masterLevels) return;
      const curH = currentHeight || 0;
      const rungs = qualities
        .filter((q) => (q.height || 0) > 0 && (q.height || 0) < curH)
        .sort((a, b) => (b.height || 0) - (a.height || 0));
      const target = rungs[0];
      // A pinned NHD dub IS the manifest — stepping down a rung would swap the
      // viewer back to the original-language track, so leave the dub alone.
      if (activeDubRef.current > 0) return;
      if (!target || activeUri === target.uri) return;
      pickQualityRef.current?.(target.uri, target.height)?.catch?.(() => {});
      return;
    }
    st.since = 0;
    st.prev = bufferedSecs;
  }, [bufferedSecs, status, playing, currentHeight, qualities, activeUri]);

  const pickAudio = (index) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.audioTrack = index;
    setAudioIndex(index);
    poke();
  };

  /* Dub switch: each dub is a SEPARATE HLS manifest (a sibling full-stream
     URL from the resolver's audioTracks, never an in-manifest audio group), so
     switching = swapping the source with pickQuality's position-preserving
     mechanics. Row index 0 is the original soundtrack — picking it swaps back to
     the resolution's own entry URL.

     The row index and the dubTracks index are OFF BY ONE on purpose: the panel
     renders an "Original" row first, so row N is dubTracks[N - 1]. Indexing
     both with the same N played the WRONG language under the clicked label. */
  const pickDub = async (index) => {
    // A sibling is NOT provably the original — the provider's own player
    // highlights tracks[0] while playing the main URL — so the two lists must
    // never be conflated.
    if (index === activeDubRef.current) return;
    const target = index === 0 ? null : dubTracks[index - 1];
    if (index > 0 && !target?.uri) return;
    const meta = metaRef.current;
    // The "Original" row must return to the SAME entry the resolver loaded:
    // for a master source that is the multi-level master (meta.entryUrl), not
    // `variants[0].uri` — `variants` is the per-rendition ladder, so preferring
    // it swapped a 4K-capable master for its lowest rendition and killed ABR.
    // Mirrors entryUrlFor() and the preview target at the top of the file.
    const targetUri =
      index === 0
        ? (meta?.masterLevels ? meta?.entryUrl : meta?.variants?.[0]?.uri || meta?.entryUrl)
        : target.uri;
    if (!targetUri) return;
    poke();
    // Prove the target manifest flows BEFORE committing the pick — NHD tokens are
    // time-scoped, and a dead dub must not end up highlighted with the previous
    // audio still playing. (The same gate pickQuality applies to quality rungs.)
    try {
      const probe = await probeSourcePlayable(targetUri, meta?.refUrl);
      if (!probe.ok) {
        // The provider advertises this dub but does not serve it (verified live:
        // Orion lists Hindi/Tamil for tmdb 1101383 and answers HTTP 404 "Main
        // request failed" for both). Previously this returned silently, so the row
        // looked dead — the "audio track won't change" report. Say so AND mark the
        // row, so the viewer stops retrying and picks a working language.
        const label = index === 0 ? "This track" : audioTrackList[index]?.label || "That audio track";
        const serverLabel = sourceLabel(activeSourceKey) || "this server";
        setQualityNote(`${label} isn't available on ${serverLabel} (dead provider track). Try another.`);
        setDeadDubs((prev) => {
          const next = new Set(prev);
          next.add(index);
          return next;
        });
        setControlsVisible(true);
        return;
      }
    } catch {
      // probe hiccup (abort/timeout) — let the switch itself decide
    }
    // A track that proved playable is no longer flagged dead.
    setDeadDubs((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
    setQualityNote(null);
    activeDubRef.current = index;
    setActiveDub(index);
    try {
      await pickQualityRef.current?.(targetUri, null, { dubSwitch: true, preProbed: true });
    } catch {
      // pickQuality never rejects; the catch is future-proofing
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

  // Load the language list once per title; remember the last choice per title id.
  // No imdbId gate: the fetcher falls back to a title search on its own, so a
  // title whose external_ids lookup failed still gets a list instead of a
  // silent empty pane.
  useEffect(() => {
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
          remembered = window.localStorage.getItem(`streamly-native-subtitle-${id}`);
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
           opened the panel and picked a language by hand. Only runs when
           nothing was remembered — an explicit past pick always wins. */
        if (prefs?.autoSubtitles) {
          const preferred = findSubtitleTrack(list, prefs?.defaultLanguage);
          if (preferred) selectSubtitle(preferred);
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
  };

  // Render-time derivations for the scrubber.
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const progressRatio = safeDuration > 0 ? Math.min(1, Math.max(0, currentTime / safeDuration)) : 0;
  // While dragging, the bar follows the pointer, not the frozen playback head.
  const effectiveRatio = scrubDragging ? (scrubHover ?? progressRatio) : progressRatio;
  const hoverRatio = scrubHover ?? (scrubDragging ? progressRatio : null);

  /* Scrubber preview (thumbnail on hover/drag): while hovering or dragging,
     decode the frame at the hover position off-screen and show it in a small
     card above the time bubble. */
  const previewBox = useMemo(() => previewMetrics(playerW, playerH), [playerW, playerH]);
  useEffect(() => {
    // Touch included: a drag on the scrubber is exactly when a frame preview
    // matters most (no hover state on mobile). The 8s cache + newest-wins
    // queue keeps the relay cost of a drag bounded.
    if (hoverRatio == null || safeDuration <= 0) {
      previewReqRef.current += 1; // invalidate any queued capture
      setPreviewUrl(null);
      return undefined;
    }
    const meta = metaRef.current;
    if (!meta?.sourceKey || !meta?.refUrl) return undefined;
    // The preview pipeline mounts per source entry URL: master playlists get
    // the master (the decoder picks its own rendition), per-quality sources
    // get the smooth-start rendition that playback actually uses.
    const target = meta.masterLevels ? meta.entryUrl : meta.refUrl;
    if (!target) return undefined;
    const seconds = Math.min(Math.max(hoverRatio * safeDuration, 0), Math.max(0, safeDuration - 0.5));
    const mine = ++previewReqRef.current;
    let cancelled = false;
    getPreviewThumb({ url: target, refUrl: meta.refUrl, sourceKey: meta.sourceKey, seconds }).then(
      (thumb) => {
        if (!cancelled && thumb && previewReqRef.current === mine) setPreviewUrl(thumb);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [hoverRatio, safeDuration]);

  /* While the player itself is fetching (seek/stall), park the preview decoder so
     it cannot compete for the same relay bytes the real fragment needs — the
     difference between a seek that resolves on one fragment and one that waits
     behind a scrubber decode. A thin pipe while playing gets the same stand-
     down: under the buffer floor, refill and the next seek outrank a hover
     decode. Cache hits still render (see previewThumbs), only network work
     pauses. */
  useEffect(() => {
    setPreviewSuppressed(buffering || (playing && bufferedSecs < BUFFER_FLOOR_SECONDS));
  }, [buffering, playing, bufferedSecs]);

  const showEpisodesButton = Array.isArray(episodes) && episodes.length > 0;

  // Episode paging (TV only): the parent's canGo*/onGo* cross seasons; we fall back to walking `episodes`.
  const showEpisodeNav = type === "tv";
  const navIndex = airedEpisodes.findIndex((e) => e.number === episode);
  const navPrevNumber = navIndex > 0 ? airedEpisodes[navIndex - 1]?.number : null;
  const navNextNumber =
    navIndex >= 0 && navIndex < airedEpisodes.length - 1 ? airedEpisodes[navIndex + 1]?.number : null;
  const prevDisabled = typeof canGoPrev === "boolean" ? !canGoPrev : navPrevNumber == null;
  const nextDisabled = typeof canGoNext === "boolean" ? !canGoNext : navNextNumber == null;

  /* Next-episode prewarm: once THIS episode is actually playing, mint the next
     one's resolve in the background so "Next" starts almost instantly instead of
     paying mint -> sources after the click. Gated on `playing` so it never
     competes with the current cold start, and delayed so a quick channel-flip
     doesn't spend the warm leg on an episode the viewer never reaches. A
     season-crossing next simply misses the warm key (season differs) and
     resolves normally — harmless. */
  useEffect(() => {
    if (type !== "tv" || status !== "playing" || navNextNumber == null) return undefined;
    const timer = setTimeout(() => {
      try {
        warmResolve({ ...resolveArgs, episode: navNextNumber }, {})?.catch?.(() => {});
      } catch {
        // warmResolve never throws; a stub resolver in tests might.
      }
    }, 15000);
    return () => clearTimeout(timer);
  }, [type, status, navNextNumber, resolveArgs]);

  const goEpPrev = () => {
    if (prevDisabled) return;
    poke();
    setPanel(null);
    setResumeOffer(null);
    setUpNext(null);
    setBuffering(true);
    if (onGoPrevRef.current) return onGoPrevRef.current();
    if (navPrevNumber != null) chooseEpisode(navPrevNumber);
  };
  const goEpNext = () => {
    if (nextDisabled) return;
    poke();
    setPanel(null);
    setResumeOffer(null);
    setUpNext(null);
    setBuffering(true);
    if (onGoNextRef.current) return onGoNextRef.current();
    if (navNextNumber != null) chooseEpisode(navNextNumber);
  };
  // Keyboard episode paging reuses the same guards as the rail buttons. Shift+P
  // mirrors Netflix's Shift+P (previous episode); N mirrors Netflix's N (next).
  const keyboardPrevEpisode = () => {
    if (prevDisabled) return;
    goEpPrev();
  };
  const keyboardNextEpisode = () => {
    if (nextDisabled) return;
    goEpNext();
  };
  // The keydown effect binds once per panel flip — route it through mirrors so
  // N / Shift+P always see the current episode's nav state.
  keyboardEpPrevRef.current = keyboardPrevEpisode;
  keyboardEpNextRef.current = keyboardNextEpisode;

  // Skip-intro / skip-credits windows. The RULE lives in utils/skipMarkers.js;
  // this is only the viewer's choice about how to apply it (the Auto Skip Intro
  // preference, previously dead on web — it was wired in Settings but nothing
  // here ever read it).
  const autoSkipIntro = prefs?.autoSkipIntro === true;

  // Same preference the Settings page toggles ("auto-play the next episode").
  // The switch in the bottom-right writes straight to it; the provider (when
  // mounted) is the single source of truth and re-syncs cross-tab changes.
  useEffect(() => {
    if (prefs?.autoplay !== undefined) setAutoplayEnabled(Boolean(prefs.autoplay));
  }, [prefs?.autoplay]);

  // Gear "HD" badge: shown once the active rendition is HD or better (the
  // design's crimson chip next to the cog). Keyed on the row LABEL classification
  // (scope/cinema 1920x804 reads "1080p"), falling back to the raw pixel height
  // when no menu row matches.
  const activeDisplayHeight = autoLevel === false ? manualHeight : currentHeight;
  const activeQualityRow =
    activeDisplayHeight != null ? qualities.find((q) => q.height === activeDisplayHeight) : undefined;
  const hdBadge = activeQualityRow
    ? qualityHdTag(activeQualityRow) || undefined
    : activeDisplayHeight != null && activeDisplayHeight >= 1080
      ? "HD"
      : undefined;

  /* Real skip boundaries read off the manifest's own cue tags, when a provider
     emits any. Null keeps the 90s/150s estimates in skipMarkers.js. Reset on
     every title change so one episode's credits window can't leak into the next. */
  const [cueBoundaries, setCueBoundaries] = useState(null);
  /* Every measured boundary passes through normalizeSkipBoundaries before
     anything acts on it or draws it, with the real duration in hand: a 0 credits
     start ("no outro" in every source's dialect), a marker past the end of this
     particular cut, or an inverted intro range all arrive as ordinary finite
     numbers and would otherwise become an orange scrubber instead of an error.
     Duration is deliberately NOT a fetch dependency — a boundary that is
     temporarily out of range while `duration` settles normalises again the
     moment the real length arrives, without spending another request. */
  const cueBounds = useMemo(() => normalizeSkipBoundaries(cueBoundaries, safeDuration), [cueBoundaries, safeDuration]);
  const cueIntroEnd = cueBounds?.introEndSeconds ?? 0;
  const cueCreditsStart = cueBounds?.creditsStartSeconds ?? null;
  /* Boundaries arrive from two independent places: cue tags in the manifest
     itself, and the SkipDB dataset, fetched in parallel. Whichever finishes
     first is luck, so the ranking (measured cue > dataset) lives in
     mergeSkipBoundaries rather than being implied by who called setState last. */
  const mergeBoundaries = useCallback((incoming, source) => {
    setCueBoundaries((prev) => mergeSkipBoundaries(prev, incoming, source));
  }, []);
  useEffect(() => {
    setCueBoundaries(null);
    // A new title has no playing source yet. Left set, it would name the PREVIOUS
    // title's server in the Servers menu during the first resolve.
    setActiveSourceKey(null);
    /* season/episode are part of this identity, not optional extras. `id` is the
       SHOW id for a series, so it stays constant across S1E1 → S1E2 and this
       effect simply never fired: the previous episode's measured boundaries were
       then drawn on the next episode's scrubber and aimed its skip pills at the
       wrong moments until that episode's own lookup landed. */
  }, [type, id, season, episode]);

  /* Cue tags are scoped to ONE MANIFEST; dataset boundaries are scoped to the
     TITLE. That difference decides what survives a source switch:

       server switch / dub switch  -> a different manifest, so its cue tags (if
         any) must be re-measured. Keeping the previous manifest's tags would
         apply one provider's cut to another's encode — and, worse, the loader
         logs "No cue tags in manifest — skip windows stay estimated" while the
         windows are in fact NOT estimates, so the one diagnostic meant to answer
         "does any provider emit cue tags" reports a falsehood.
       in-manifest audio group      -> pickAudio only sets hls.audioTrack; the
         manifest is untouched, so the tags still describe what is playing.

     Dataset boundaries are keyed by IMDb id, so they describe the content and are
     kept across every source switch — that is the whole reason to have them. */
  const manifestScope = `${activeSourceKey || ""}|${activeDub}`;
  const prevScopeRef = useRef(manifestScope);
  useEffect(() => {
    setCueBoundaries((prev) => rescopeBoundaries(prev, prevScopeRef.current, manifestScope));
    prevScopeRef.current = manifestScope;
  }, [manifestScope]);

  /* Fetch real boundaries for this title, keyed by IMDb id. Deliberately AFTER
     the first render and never awaited: the player shows and seeks its estimates
     immediately, and this only refines the window once it lands. An absent imdbId
     simply means no lookup. */
  useEffect(() => {
    if (!imdbId) return undefined;
    const controller = new AbortController();
    let alive = true;
    fetchSkipBoundaries({
      imdbId,
      season: type === "tv" ? season : undefined,
      episode: type === "tv" ? episode : undefined,
      signal: controller.signal,
    }).then((bounds) => {
      if (alive && bounds) mergeBoundaries(bounds, "dataset");
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [imdbId, type, season, episode, mergeBoundaries]);

  /* Provider boundaries (ZXC/vidstuck `/backend/intro`, TV-only), fetched in
     parallel with SkipDB through our own function (the endpoint has no CORS
     headers, so the browser cannot call it directly). Same merge path: a
     measured provider record outranks the community dataset but never a cue
     tag embedded in the manifest itself. An absent imdbId simply means no
     lookup, exactly like SkipDB. */
  useEffect(() => {
    if (!imdbId || type !== "tv") return undefined;
    const controller = new AbortController();
    let alive = true;
    fetchZxcIntroBounds({
      imdbId,
      tmdbId: id,
      season,
      episode,
      signal: controller.signal,
    }).then((bounds) => {
      if (alive && bounds) mergeBoundaries(bounds, "provider");
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [imdbId, id, type, season, episode, mergeBoundaries]);

  const skipIntroTarget = getSkipIntroTarget({
    type,
    id,
    season,
    episode,
    duration: safeDuration,
    cueIntroEnd,
  });
  const skipIntroEnd = getSkipIntroEnd({ type, id, season, episode, duration: safeDuration, cueIntroEnd });
  const skipIntroButtonStart = Math.max(0, skipIntroEnd - SKIP_INTRO_LEAD_SECONDS);
  const skipIntroProgress = skipIntroEnd > skipIntroButtonStart ? Math.max(0, Math.min(1, (currentTime - skipIntroButtonStart) / (skipIntroEnd - skipIntroButtonStart))) : 0;

  const showSkipIntro = shouldShowSkipIntro({
    type,
    id,
    season,
    episode,
    duration: safeDuration,
    currentTime,
    ended,
    autoSkip: autoSkipIntro,
    cueIntroEnd,
  });

  const skipOutroTarget = getSkipOutroTarget({ type, duration: safeDuration, cueCreditsStart });
  const wOutro = getSkipOutroWindow({ type, duration: safeDuration, cueCreditsStart });
  const skipOutroButtonStart = wOutro ? wOutro.start : 0;
  const skipOutroEnd = wOutro ? wOutro.end : 0;
  const skipOutroProgress = skipOutroEnd > skipOutroButtonStart ? Math.max(0, Math.min(1, (currentTime - skipOutroButtonStart) / (skipOutroEnd - skipOutroButtonStart))) : 0;

const showSkipOutro = shouldShowSkipOutro({
    type,
    duration: safeDuration,
    currentTime,
    ended,
    cueCreditsStart,
  });

  /* The two measured bands drawn on the scrubber. The GEOMETRY lives in
     skipMarkers.js, not here: computed inline, `right: 0` came to mean "orange
     from the credits to the end of the bar" for every record without a credits
     finish time, and "the whole episode" for any source reporting 0. */
  const scrubberBands = useMemo(
    () => getScrubberBands(cueBounds, safeDuration),
    [cueBounds, safeDuration]
  );


  // Auto-skip fires once per playback, and only while the head is still inside
  // the intro, so the viewer is never yanked before the opening has played.
  const autoSkipFiredRef = useRef(false);
  /* "One-shot per playback" has to mean per PLAYBACK, not per mount. This
     component outlives an episode and a whole binge, so without this reset the
     ref stayed latched after S1E1 and auto-skip silently never fired again for
     the rest of the session — every later episode simply played its intro. */
  useEffect(() => {
    autoSkipFiredRef.current = false;
  }, [type, id, season, episode]);
  useEffect(() => {
    if (!autoSkipIntro) {
      autoSkipFiredRef.current = false;
      return;
    }
    if (autoSkipFiredRef.current) return;
    if (!shouldAutoSkipIntroOnce({ type, id, season, episode, duration: safeDuration, currentTime, firedRef: autoSkipFiredRef, cueIntroEnd })) return;
    autoSkipFiredRef.current = true;
    if (skipIntroTarget <= 0) return;
    safeSeek(skipIntroTarget);
  }, [autoSkipIntro, type, id, season, episode, safeDuration, currentTime, skipIntroTarget, cueIntroEnd]);

  const doSeekPast = (target) => {
    if (!videoRef.current) return;
    safeSeek(target);
    poke();
    try {
      videoRef.current.play();
    } catch {
      // user gesture needed — custom transport is present
    }
  };
  const doSkipIntro = () => doSeekPast(skipIntroTarget);
  const doSkipOutro = () => doSeekPast(skipOutroTarget);

  return (
    // No local <MotionConfig>: this tree inherits the app-level one
    // (App.jsx: reducedMotion = in-app preference ? "always" : "user"). A nested
    // config overrode it, so a viewer who turned Reduce Motion on in Settings
    // still got every HUD pop, sheet slide and spinner fade in the player — the
    // one screen where the setting mattered most was the one ignoring it.
    // player.css covers the pure-CSS half of the same animations.
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
        onPointerDown={dismissStillWatching}
        className="np-root"
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
          // The safe-area policy is published once here; extracted chrome
          // components consume it as CSS vars instead of each knowing whether
          // they are on touch.
          "--np-safe-top": SAFE_TOP,
          "--np-safe-bottom": SAFE_BOTTOM,
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
            // Right-half press-and-hold arms 2x (Netflix mobile); a left-half
            // touch never arms it (brightness drag + double-tap seek live there).
            handleHoldStart(e);
          }}
          onTouchMove={handleGestureMove}
          onTouchEnd={IS_TOUCH ? handleVideoTouchEnd : undefined}
          onTouchCancel={() => {
            // A cancelled touch must not strand 2x at 2x.
            handleHoldEnd();
          }}
          style={{
            width: "100%",
            height: "100%",
            display: "block",
            ...aspectVideoStyle(aspectRatioIndex),
            touchAction: "manipulation",
            WebkitUserSelect: "none",
          }}
        />
        {/* (No standalone scrims: the top bar and bottom chrome paint their own
            gradients — stacking more here double-darkened the picture.) */}
        {/* Dim the picture while a dialog panel is open (Netflix does this) so
            the rows read against the frame, not against the movie. Tapping the
            dim (outside the sheet) closes the panel — mobile has no Esc. */}
        {panel && (
          <div
            aria-hidden="true"
            onClick={() => {
              setPanel(null);
              poke();
            }}
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              zIndex: 5,
            }}
          />
        )}
        {/* Subtitle overlay — active OpenSubtitles line, bottom-anchored above
            the control chrome like CustomVideoPlayer. */}
        <SubtitleOverlay
          text={activeSubtitle}
          controlsVisible={controlsVisible}
          size={subtitleSize}
          background={subtitleBg}
          fontFamily={subtitleFontFamily(prefs?.subtitleFont)}
          color={prefs?.subtitleColor || "#fff"}
          scale={prefs?.subtitleSize}
        />
{/* Top bar: back + title. */}
        <ChromeTopBar
          visible={controlsVisible}
          title={displayTitle}
          subtitle={displaySubtitle}
          onBack={() => {
            if (onCloseRef.current) onCloseRef.current();
            else window.history.back();
          }}
        />
        {/* Netflix-style Skip Intro pill: bottom-right, above the transport row,
            present only inside the intro window, seeks just past the credits.
            Stays tappable even with the chrome hidden (Netflix keeps it while
            the intro plays) — but yields to any open panel. */}
<AnimatePresence>
          {showSkipIntro && !sheetOpen && (
            <SkipPill
              key="np-skip"
              label="Skip Intro"
              ariaLabel="Skip the opening credits"
              title="Stop the intro, come right back in"
              onClick={doSkipIntro}
              progress={skipIntroProgress}
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {showSkipOutro && !sheetOpen && !showSkipIntro && (
            <SkipPill
              key="np-skip-outro"
              label="Skip Credits"
              ariaLabel="Skip the ending credits"
              title="Jump to the end"
              onClick={doSkipOutro}
              progress={skipOutroProgress}
            />
          )}
        </AnimatePresence>
        {/* Center stack, in z-order: the buffering spinner; on touch, a big play
            glyph whenever the stream is simply paused (incl. the autoplay-policy
            case where a cold start can't play without a tap); the replay button
            at the end (Netflix end state).
            The spinner carries deliberately NO full-frame scrim or backdrop blur
            (the first version had both): dimming + blurring the picture during
            every stall read as a broken player, and its fade needs
            AnimatePresence — a `transition` on a conditionally mounted node never
            plays, which is why it looked frozen. */}
        {/* Cold wait: no frame to preserve, so the stage is the picture. */}
        <CenterStack
          showStage={showStage}
          stageNote={stageNote}
          stageInitial={!everPlayed || serverSwitchStage}
          switchFrame={switchFrame}
          displayTitle={displayTitle}
          backdropUrl={backdropUrl}
          posterUrl={posterUrl}
          spinner={spinner}
          buffering={buffering}
          ended={ended}
          playing={playing}
          status={status}
          controlsVisible={controlsVisible}
          onRewind={() => {
            poke();
            seekRelative(-skipSecondsRef.current);
          }}
          onTogglePlay={() => {
            poke();
            togglePlayRef.current();
          }}
          onForward={() => {
            poke();
            seekRelative(skipSecondsRef.current);
          }}
          skipSeconds={skipSeconds}
          onReplay={replay}
        />
        <TapToUnmutePill
          visible={autoMuted && playing && !sheetOpen}
          onUnmute={() => {
            setAutoMuted(false);
            setMuted(false);
            poke();
          }}
        />
{/* Bottom chrome: scrubber + transport row. */}
        <BottomChrome
          visible={controlsVisible}
          scrubRef={scrubRef}
          duration={safeDuration}
          currentTime={currentTime}
          effectiveRatio={effectiveRatio}
          bufferedRanges={bufferedRanges}
          hoverRatio={hoverRatio}
          previewUrl={previewUrl}
          previewBox={previewBox}
          playerW={playerW}
          scrubberBands={scrubberBands}
          fmtTime={fmtTime}
          onScrubKeyDown={onScrubKeyDown}
          onScrubDown={onScrubDown}
          onScrubMove={onScrubMove}
          onScrubUp={onScrubUp}
          onScrubCancel={onScrubCancel}
          onScrubLeave={onScrubLeave}
          onScrubFocus={poke}
          playing={playing}
          onTogglePlay={togglePlay}
          onBack10={() => seekRelative(-skipSecondsRef.current)}
          onForward10={() => {
            if (desktopHoldFiredRef.current) {
              desktopHoldFiredRef.current = false;
              return;
            }
            seekRelative(skipSecondsRef.current);
          }}
          skipSeconds={skipSeconds}
          onForwardHoldStart={() => {
            // Arm 2x on a sustained press; the click still fires on a quick
            // press, so a hold both seeks AND speeds up (YouTube).
            desktopHoldTimerRef.current = setTimeout(() => {
              desktopHoldTimerRef.current = null;
              desktopHoldFiredRef.current = true;
              engageHold2x();
            }, HOLD_2X_DELAY_MS);
          }}
          onForwardHoldRelease={desktopHoldRelease}
          muted={muted}
          volume={volume}
          onToggleMute={toggleMute}
          volHover={volHover}
          onVolHoverChange={setVolHover}
          onVolumeChange={(nv) => {
            setMuted(false);
            setAutoMuted(false);
            setVolume(nv);
            showHud("volume", nv);
            poke();
          }}
          showEpisodeNav={showEpisodeNav}
          prevDisabled={prevDisabled}
          nextDisabled={nextDisabled}
          onEpPrev={goEpPrev}
          onEpNext={goEpNext}
          showEpisodesButton={showEpisodesButton}
          panel={panel}
          onTogglePanel={(key) => {
            setPanel((p) => (p === key ? null : key));
            poke();
          }}
          onToggleSettings={() => {
            // If clicking Settings while any settings panel is open, close it.
            // Otherwise open root settings.
            setPanel((p) =>
              ["settings", "servers", "audio", "subs", "video", "speed", "aspect"].includes(p)
                ? null
                : "settings",
            );
            poke();
          }}
          showSubsButton={subtitleLanguages.length > 0 || isFetchingSubtitles || subtitleError}
          isFullscreen={isFullscreen}
          onFullscreen={goFullscreen}
          hdBadge={hdBadge}
        />
{/* Netflix "Left off at …" resume card — auto-resumes after a short wait. */}
        <ResumeCard
          offer={resumeOffer && !ended && !sheetOpen ? resumeOffer : null}
          fmtTime={fmtTime}
          onResume={(at) => commitResumeRef.current?.(at)}
          onRestart={restartFromStart}
        />
        {/* Netflix "Up Next" post-roll card (TV only). */}
        <UpNextCard
          upNext={ended ? upNext : null}
          upNextMs={UP_NEXT_MS}
          onPlayNow={(n) => chooseEpisode(n)}
          onCancel={() => setUpNext(null)}
        />

{/* The settings / audio / subs / servers / quality panel shell. */}
        <PlayerPanel
          panel={panel}
          panelRef={panelRef}
          onClose={() => setPanel(null)}
          onBackToSettings={() => {
            setPanel("settings");
            poke();
          }}
        >
            {panel === "settings" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
                {/* Audio and Subtitles were REMOVED from this list, not just
                    duplicated: they now have their own buttons in the transport
                    row. Leaving them here too would mean two routes to the same
                    panel, and the two would disagree the moment one of them fell
                    behind — which is exactly the drift the motion-token work
                    already had to clean up once. Settings keeps what belongs to
                    the stream rather than the viewer: server, quality, speed,
                    aspect. */}
                <DialogRow
                  onClick={() => setPanel("servers")}
                  title="Servers"
                  // What the viewer is watching right now, in the same words
                  // the Servers sheet uses — not the resolver's internal key.
                  // Requested wins over committed: after a failed switch the
                  // committed key would highlight the server the viewer just
                  // abandoned.
                  sub={sourceLabel(activeSourceKey || requestedServer || DEFAULT_SOURCE_KEY, "Server 1")}
                  icon={<IconServers size={20} />}
                  hasChevron
                />
                <DialogRow
                  onClick={() => setPanel("audio")}
                  title="Audio track"
                  sub={currentAudioLabel}
                  icon={<IconAudio size={20} />}
                  hasChevron
                />
                <DialogRow
                  onClick={() => setPanel("video")}
                  title="Video Quality"
                  sub={autoLevel === false ? (qualities.find(q => q.height === manualHeight)?.label || (currentHeight ? currentHeight + "p" : "Manual")) : "Auto"}
                  icon={<IconSliders size={20} />}
                  hasChevron
                />
                <DialogRow
                  onClick={() => setPanel("speed")}
                  title="Playback Speed"
                  sub={playbackRate === 1 ? "Normal" : `${playbackRate}x`}
                  icon={<IconGauge size={20} />}
                  hasChevron
                />
                <DialogRow
                  onClick={() => setPanel("aspect")}
                  title="Aspect Ratio"
                  sub={ASPECT_RATIOS[aspectRatioIndex]?.name || "Fit"}
                  icon={<IconAspect size={20} />}
                  hasChevron
                />
                {/* Provider "Source quality" parity: the RAW source resolution
                    (distinct from the delivered-ladder "Video Quality" above).
                    Only surfaced when the picked server actually offers a
                    multi-resolution source — never an empty selector. */}
                {sourceVariants.length > 1 ? (
                  <DialogRow
                    onClick={() => setPanel("sourcequality")}
                    title="Source quality"
                    sub={sourceHeight ? `${sourceHeight}p` : "Auto"}
                    icon={<IconSliders size={20} />}
                    hasChevron
                  />
                ) : null}
                {/* Loop is a direct toggle (selected shows the check); the sleep
                    timer opens its own chooser. Both mirror the provider's
                    Playback menu. */}
                <DialogRow
                  onClick={() => {
                    setLoopEnabled((v) => !v);
                    poke();
                  }}
                  title="Loop"
                  sub={loopEnabled ? "On" : "Off"}
                  selected={loopEnabled}
                />
                <DialogRow
                  onClick={() => setPanel("sleep")}
                  title="Sleep timer"
                  sub={sleepMinutes ? `${fmtTime(sleepRemaining ?? sleepMinutes * 60)} left` : "Off"}
                  icon={<IconCalendar size={20} />}
                  hasChevron
                />
                {pipSupported ? (
                  <DialogRow
                    onClick={() => {
                      togglePip();
                      poke();
                    }}
                    title="Picture in picture"
                    sub={pipActive ? "On" : "Off"}
                    icon={<IconTheater size={20} />}
                  />
                ) : null}
                {/* The SkipDB data licence (ODbL) requires attribution wherever
                    its boundaries are used, so this is a licence term, not a
                    nicety. Gated on `source === "dataset"` so we credit it only
                    for titles where its data actually reached the player —
                    attribution for data we never used would be false. */}
                {cueBoundaries?.source === "dataset" ? (
                  <p
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.35)",
                      margin: "12px 14px 2px",
                      lineHeight: 1.5,
                    }}
                  >
                    Skip boundaries by{" "}
                    <a
                      href={SKIP_DATA_CREDIT.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      style={{ color: "rgba(255,255,255,0.55)" }}
                    >
                      {SKIP_DATA_CREDIT.name}
                    </a>{" "}
                    (open data, ODbL).
                  </p>
                ) : null}
              </div>
            ) : panel === "servers" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
                  <p style={{ fontSize: 12, color: "#a1a1aa", margin: "4px 14px 8px", lineHeight: 1.45 }}>
                    Same title, different stream providers. Switching reloads the
                    stream from the chosen server.
                  </p>
                  {PLAYER_SOURCES.map((s) => (
                    <DialogRow
                      key={s.key}
                      selected={(activeSourceKey || requestedServer || DEFAULT_SOURCE_KEY) === s.key}
                      onClick={() => pickServer(s.key)}
                      title={s.label}
                      sub={s.tag}
                    />
                  ))}
              </div>
            ) : panel === "subs" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
                  <DialogRow
                    key="off"
                    selected={!subtitleEnabled}
                    onClick={() => selectSubtitle(null)}
                    title="Off"
                  />
                  {isFetchingSubtitles ? (
                    <p style={{ fontSize: 12.5, color: "#a1a1aa", margin: "8px 14px 4px", lineHeight: 1.45 }}>
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
                    <p style={{ fontSize: 12.5, color: "#a1a1aa", margin: "8px 14px 4px", lineHeight: 1.45 }}>
                      {!imdbId
                        ? "No subtitles found for this title on OpenSubtitles (no IMDb id — title search also came up empty)."
                        : "No subtitles found for this title on OpenSubtitles."}
                    </p>
                  )}
                  {subtitleError ? (
                    <p role="alert" style={{ fontSize: 12.5, color: "#ff9d9d", margin: "8px 14px 4px", lineHeight: 1.5 }}>
                      {subtitleError}
                    </p>
                  ) : null}
                  {/* Provider "Subtitle settings" parity: styling of the caption
                      line (size + background), presentation-only and persisted
                      separately from the chosen track. */}
                  <DialogRow
                    onClick={() => setPanel("substyle")}
                    title="Subtitle style"
                    sub={`${["Small", "Medium", "Large"][subtitleSize] || "Medium"} · ${["None", "Shadow", "Box"][subtitleBg] || "Shadow"}`}
                    icon={<IconCaptions size={20} />}
                    hasChevron
                  />
              </div>
            ) : panel === "audio" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
                  {qualityNote ? (
                    <p
                      role="status"
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: "#ffb4b4",
                        margin: "4px 14px 8px",
                        lineHeight: 1.5,
                      }}
                    >
                      {qualityNote}
                    </p>
                  ) : null}
                  {dubTracks.length > 0 ? (
                    // Sibling-URL dubs (NHD, ZXC Centaurus): one MASTER per dub,
                    // switched by swapping the source (pickDub) — NOT hls.js
                    // audio groups.
                    //
                    // Checked BEFORE audioTracks on purpose: a transcoded DASH
                    // master always carries an in-manifest #EXT-X-MEDIA group
                    // (the muxed AAC), so testing audioTracks first would show
                    // one lonely "eng" row and hide every real dub behind it.
                    // The sibling list is a superset — it starts at the original.
                    <>
                      {/* Row 0 is the original, named by the SOURCE's own
                          original-track language when it reports one (falling back
                          to TMDB's film language), never the bare word "Original"
                          — but never a guess that collides with a real dub row. */}
                      <DialogRow
                        key="dub-original"
                        selected={activeDub === 0}
                        onClick={() => pickDub(0)}
                        title={audioTrackList[0]?.label || "Original"}
                        sub="This source's soundtrack"
                      />
                      {/* ALL siblings get rows: the provider's own player
                          highlights tracks[0] while playing the main URL, so
                          track[0] is NOT provably the original soundtrack —
                          hiding it would hide a real language. Labels are the
                          normalised language names from audioLabels.js. */}
                      {audioTrackList.slice(1).map((t) => {
                        /* sourceIndex, NOT the row's own position: buildAudioTrackList
                           drops duplicate/empty rows, so positional indexing here
                           would play a different language than the one clicked. */
                        const dead = deadDubs.has(t.sourceIndex + 1);
                        return (
                          <DialogRow
                            key={`dub-${t.sourceIndex}`}
                            selected={activeDub === t.sourceIndex + 1}
                            onClick={() => pickDub(t.sourceIndex + 1)}
                            title={t.label}
                            sub={dead ? "Not available on this server" : undefined}
                            disabled={dead}
                          />
                        );
                      })}
                    </>
                  ) : audioTracks.length > 0 ? (
                    audioTracks.map((a) => {
                      // Name the group by its language CODE: a transcoded DASH
                      // master labels the audio group "eng"/"hin"/"fra", which is
                      // not a name a viewer should read.
                      const proper = languageNameFromCode(a.lang || a.name);
                      return (
                        <DialogRow
                          key={a.index}
                          selected={a.index === audioIndex}
                          onClick={() => pickAudio(a.index)}
                          title={proper || a.name}
                          sub={proper && a.lang && a.lang !== a.name ? a.lang : undefined}
                        />
                      );
                    })
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
                            margin: "4px 14px 8px",
                            letterSpacing: "0.02em",
                          }}
                        >
                          Film's original language:{" "}
                          {languageNameFromCode(originalLanguage) || (originalLanguage || "").toUpperCase() || "Unknown"}
                        </p>
                      ) : null}
                      <DialogRow
                        key="original"
                        selected
                        title={originalLanguage ? `Original — ${languageNameFromCode(originalLanguage) || (originalLanguage || "").toUpperCase() || "Unknown"}` : "Original"}
                        sub="This source's soundtrack"
                      />
                    </>
                  )}
              </div>
            ) : panel === "video" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
                  {qualityNote ? (
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "rgba(255,255,255,0.5)",
                        margin: "4px 14px 8px",
                        letterSpacing: "0.02em",
                      }}
                    >
                      {qualityNote}
                    </p>
                  ) : null}
                  {/* Auto is ALWAYS present — the active mode on every source
                      (master = hls.js ABR; per-rendition sources = the rung the
                      player negotiated at open, smooth-start / relay-friendly). */}
                  <DialogRow
                    selected={autoLevel}
                    onClick={pickAuto}
                    title="Auto"
                    sub={
                      autoLevel && currentHeight != null
                        ? `Now ${qualities.find((q) => q.height === currentHeight)?.label || `${currentHeight}p`} · adjusts with your connection`
                        : "Adjusts with your connection"
                    }
                  />
                  {qualities.map((q, i) => {
                    // autoLevel === null means "nothing opened yet" — no active row
                    // is honest there. The legacy per-rendition case keys on the
                    // ENTRY URI, but a quality pick rewrote activeUri to the picked
                    // rendition, so a fixed-ladder source keys on manualHeight too
                    // (set for masters AND for per-rendition picks alike).
                    const selected = autoLevel === false
                      ? manualHeight != null
                        ? q.height === manualHeight
                        : q.uri === activeUri
                      : autoLevel === true && isMasterMode
                        ? currentHeight != null && q.height === currentHeight
                        : false;
                    return (
                      <DialogRow
                        key={`${q.uri}::${i}`}
                        selected={selected}
                        onClick={() => pickQuality(q.uri, q.height, { external: q.external })}
                        title={`${q.label || `${q.height}p`}${qualityHdTag(q) ? " HD" : ""}`}
                      />
                    );
                  })}
              </div>
            ) : panel === "speed" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
                  {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
                    <DialogRow
                      key={rate}
                      selected={playbackRate === rate}
                      onClick={() => {
                        setPlaybackRate(rate);
                        // The element is driven too, not just the state. Without
                        // this the row updated the checkmark and the settings
                        // label while the video kept playing at its old speed,
                        // and hold-to-2x then restored THAT stale rate — so
                        // picking 1.25x and holding Space returned you to 1x.
                        if (videoRef.current) {
                          try {
                            videoRef.current.playbackRate = rate;
                          } catch {
                            // some webviews reject odd rates; the row still applies
                          }
                        }
                        setPanel(null);
                        poke();
                      }}
                      title={rate === 1 ? "Normal (1x)" : `${rate}x`}
                    />
                  ))}
              </div>
            ) : panel === "aspect" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
                  {ASPECT_RATIOS.map((aspect, idx) => (
                    <DialogRow
                      /* `name`, not `label`: the catalog has only ever had
                         `name`. Reading `.label` here made every option's text
                         undefined, so the whole panel rendered as six blank
                         rows — the reason the aspect labels looked "missing".
                         Keyed on id so rows stay stable. */
                      key={aspect.id}
                      selected={aspectRatioIndex === idx}
                      onClick={() => {
                        setAspectRatioIndex(idx);
                        setPanel(null);
                        poke();
                      }}
                      title={aspect.name}
                      sub={aspect.sub}
                    />
                  ))}
              </div>
            ) : panel === "substyle" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
                  <p style={{ fontSize: 12, color: "#a1a1aa", margin: "4px 14px 8px", lineHeight: 1.45 }}>
                    Appearance of the caption line. Applies to the track you pick
                    in the Subtitles menu.
                  </p>
                  <p style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: "4px 14px 6px", letterSpacing: "0.02em" }}>
                    SIZE
                  </p>
                  {["Small", "Medium", "Large"].map((name, i) => (
                    <DialogRow
                      key={name}
                      selected={subtitleSize === i}
                      onClick={() => setSubtitleSize(i)}
                      title={name}
                    />
                  ))}
                  <p style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(255,255,255,0.5)", margin: "12px 14px 6px", letterSpacing: "0.02em" }}>
                    BACKGROUND
                  </p>
                  {["None", "Shadow", "Box"].map((name, i) => (
                    <DialogRow
                      key={name}
                      selected={subtitleBg === i}
                      onClick={() => setSubtitleBg(i)}
                      title={name}
                    />
                  ))}
              </div>
            ) : panel === "sourcequality" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
                  <p style={{ fontSize: 12, color: "#a1a1aa", margin: "4px 14px 8px", lineHeight: 1.45 }}>
                    The provider's raw source file resolution. Different from Video
                    Quality, which picks a rung of the stream we deliver.
                  </p>
                  <DialogRow
                    selected={!sourceHeight}
                    onClick={() => pickSourceQuality(0)}
                    title="Auto"
                    sub="The provider's own default link"
                  />
                  {sourceVariants.map((v) => (
                    <DialogRow
                      key={v.height}
                      selected={sourceHeight === v.height}
                      onClick={() => pickSourceQuality(v.height)}
                      title={v.label || `${v.height}p`}
                    />
                  ))}
              </div>
            ) : panel === "sleep" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 0 6px" }}>
                  <DialogRow
                    selected={!sleepMinutes}
                    onClick={() => {
                      startSleepTimer(0);
                      setPanel(null);
                      poke();
                    }}
                    title="Off"
                  />
                  {[15, 30, 45, 60].map((min) => (
                    <DialogRow
                      key={min}
                      selected={sleepMinutes === min}
                      onClick={() => {
                        startSleepTimer(min);
                        setPanel(null);
                        poke();
                      }}
                      title={`${min} minutes`}
                    />
                  ))}
                  {sleepMinutes ? (
                    <p style={{ fontSize: 12, color: "#a1a1aa", margin: "8px 14px 4px" }}>
                      Pausing in {fmtTime(sleepRemaining ?? sleepMinutes * 60)}.
                    </p>
                  ) : null}
              </div>
            ) : null}
        </PlayerPanel>

        {/* YouTube-style Bottom Sheet for Episodes */}
        <AnimatePresence>
          {panel === "episodes" && (
            <EpisodesRail 
              episodes={episodes}
              episode={episode}
              onSelectEpisode={chooseEpisode}
              setPanel={setPanel}
              setBuffering={setBuffering}
              setResumeOffer={setResumeOffer}
            />
          )}
        </AnimatePresence>
        {/* Netflix HUD overlays: transient volume / aspect pills
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
          {hud?.kind === "aspect" && (
            <NetflixAspectHUD key="aspect" aspectRatioIndex={aspectRatioIndex} metrics={hudBox} />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {hold2x && <NetflixHold2xHUD key="hold2x" metrics={hudBox} />}
        </AnimatePresence>
        <AnimatePresence>
          {hud?.kind === "play" && <NetflixPlayPauseHUD key="pp" kind="play" metrics={hudBox} />}
        </AnimatePresence>
        <AnimatePresence>
          {hud?.kind === "pause" && <NetflixPlayPauseHUD key="pp" kind="pause" metrics={hudBox} />}
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
        {/* Netflix "Still watching?" — pause + ask after unattended playback. */}
        <AnimatePresence>
          {stillWatching && (
            <NetflixStillWatching
              key="still-watching"
              onContinue={() => {
                // Route through the ref-backed dismisser, not a bare
                // setStillWatching(false): only pointerdown normally clears
                // `stillWatchingRef`, so a KEYBOARD/remote "Continue" left the
                // ref true and the touch hold-to-2x guard (handleHoldStart) dead
                // until some later pointer event.
                dismissStillWatching();
                swAutoAdvRef.current = 0;
                poke();
                const v = videoRef.current;
                try {
                  v?.play();
                } catch {
                  // user gesture needed — the custom transport is right there
                }
              }}
              onExit={() => {
                dismissStillWatching();
                onCloseRef.current?.();
              }}
            />
          )}
        </AnimatePresence>
      </div>
<FatalBanner
        message={fatal}
        onRetry={retryLoad}
        onBack={() => {
          if (onCloseRef.current) onCloseRef.current();
          else window.history.back();
        }}
      />
    </div>
  );
}
