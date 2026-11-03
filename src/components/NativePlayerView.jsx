// src/components/NativePlayerView.jsx — the app's player, opened by the hero /
// episode Play buttons. Resolves VidCore-first (4K) → VidSrc → NHD (multi-
// audio) via streamResolve, with a Servers menu to switch the active server,
// and plays through hls.js (manifest relay + direct-segment loader). Custom
// transport only: no native <video controls>.
// Quality lives in the Audio & Subtitles dialog (Netflix has no quality menu), and
// touch devices get a stacked settings sheet instead of the desktop chrome.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
import { prefetchSources, warmResolve } from "../api/warmResolve";
import { SKIP_DATA_CREDIT, fetchSkipBoundaries } from "../api/skipBoundarySource";
import { fetchZxcIntroBounds } from "../api/skipProviderSource";
import { logDebug } from "../utils/debugLogger";
import { readStoredNumber } from "../utils/storedNumber";
import { isEpAired } from "../utils/titleDetails";
import useContainerSize from "../hooks/useContainerSize";
import {
  hudMetrics,
  aspectVideoStyle,
  ASPECT_RATIOS,
  HOLD_SPEED,
  STILL_WATCHING_EPISODES,
} from "../constants/playerUi";
import {
  PLAYER_SOURCES,
  DEFAULT_SOURCE_KEY,
  AUTO_SOURCE,
  sourceByKey,
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
import { subtitleFontFamily } from "../constants/settings";
import { RIVO_MOTION } from "./player/chrome/theme";
import { useOptionalPreferences } from "../context/preferences";
import { resetPreviewPipeline, setPreviewSuppressed } from "../api/previewThumbs";
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
import { fmtTime, qualityHdTag, zoneOf } from "./player/nativePlayerHelpers";
import usePlayerHud from "./player/hooks/usePlayerHud";
import usePlaybackExtras from "./player/hooks/usePlaybackExtras";
import usePlayerChrome from "./player/hooks/usePlayerChrome";
import useHold2x from "./player/hooks/useHold2x";
import useScrubber from "./player/hooks/useScrubber";
import useSubtitles from "./player/hooks/useSubtitles";
import useQualitySwitch from "./player/engine/useQualitySwitch";
import useAudioSwitch from "./player/engine/useAudioSwitch";
import useSourceResolve from "./player/engine/useSourceResolve";
import { HOLD_2X_DELAY_MS } from "./player/nativePlayerGestures";
import { resolveSpaceRelease, resolveTouchRelease } from "./player/nativePlayerHold";
import { keyboardAction } from "./player/nativePlayerKeys";

// A source can fail fragments forever without ever going fatal (VidCore's
// vidzen: playlist 200, segments 429 on repeat) — so fail over ourselves.
const MAX_CONSECUTIVE_FRAG_FAILURES = 4;

// How long to hold a source after an upstream 429 before re-resolving it. A
// provider rate limit clears in seconds, so retrying straight away just spends
// another request on an origin that is already refusing us; every wasted request
// keeps the window open. Sized to ride out a momentary burst without the viewer
// noticing a stall (the player shows a switching note for the duration).
const THROTTLE_BACKOFF_MS = 6000;

// Fallback skip amount. The REAL amount is the viewer's "Seek Time" setting
// (5 / 10 / 15 / 30 seconds), read from PreferencesContext below — this
// constant used to be the only value, so the Settings dropdown changed
// nothing and every skip jumped 10s.
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
// An in-manifest audio switch normally settles in well under a second (the
// group's segments are already buffered). If the provider advertises a track it
// never delivers, this bound keeps the branded stage from spinning forever.
const AUDIO_SWITCH_TIMEOUT_MS = 6000;
// A user-initiated switch must be SEEN. An in-manifest track change can be
// confirmed in under a frame, and clearing the branded stage that fast made the
// click read as a dead button: the art flashed in and out, or (when the 700ms
// spinner debounce had not armed yet) never appeared. Hold the stage for this
// long so a pick always reads as an action.
const MIN_SWITCH_STAGE_MS = 600;
// A dub switch probes the sibling manifest before committing. The provider's
// resolve chain (mint -> servers -> MPD) is measured in seconds through the
// relay, so this bound is generous — it exists to stop a hung request from
// leaving the branded stage up indefinitely, not to race a healthy probe.
const DUB_PROBE_TIMEOUT_MS = 12000;
// ABR seed: hls.js starts its bandwidth estimate at 1Mbps, so Auto would climb
// the ladder one relay round-trip at a time (a visible "loading" per rung).
// 10Mbps starts Auto mid-ladder; the floor step-down still guards a bad pipe.
const INITIAL_BW_BITS = 10 * 1000 * 1000;
const VOLUME_STORAGE_KEY = "streamly-native-volume";
const MUTED_STORAGE_KEY = "streamly-native-muted";
const ASPECT_STORAGE_KEY = "streamly-native-aspect";
/* Brightness is GONE (user call): a CSS filter is not the device backlight —
   it dims the video while the OS brightness setting stays where it was, which
   reads as a broken picture. The OS owns screen brightness on every platform.
   The old localStorage keys are simply no longer read. */
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
    () => ({
      type,
      id,
      season: type === "tv" ? season : undefined,
      episode: type === "tv" ? episode : undefined,
      title,
      // TMDB's original_language. RIVO needs it to choose WHICH per-language
      // master is the entry (Server 1 lists Hindi before Malayalam for Premalu).
      originalLanguage,
    }),
    [type, id, season, episode, title, originalLanguage],
  );
  /* Settings → Servers drag order. It was a real preference that the player
     never read: the menu stayed in catalogue order and the auto path ignored it.
     Sort the rows for the menu, and make the FIRST row the preferred server for
     the no-pick path (`prefer` still falls through to the health rotation, so a
     dead first row never dead-ends playback). */
  const orderedSources = useMemo(() => {
    const order = Array.isArray(prefs?.serverOrder) ? prefs.serverOrder : [];
    const rank = new Map(order.map((label, i) => [label, i]));
    return [...PLAYER_SOURCES].sort((a, b) => {
      const ra = rank.has(a.label) ? rank.get(a.label) : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b.label) ? rank.get(b.label) : Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
  }, [prefs?.serverOrder]);
  const preferredAutoSource = useMemo(() => {
    const first = orderedSources[0];
    // Keep AUTO_SOURCE identity for the default order so the details-page warm
    // token stays consumable (it was minted for the auto path).
    if (!first || first.key === DEFAULT_SOURCE_KEY) return AUTO_SOURCE;
    return {
      key: AUTO_SOURCE.key,
      label: AUTO_SOURCE.label,
      tag: AUTO_SOURCE.tag,
      provider: AUTO_SOURCE.provider,
      resolve: (a, o) => first.resolve(a, o),
    };
  }, [orderedSources]);
  const autoSourceRef = useRef(AUTO_SOURCE);
  autoSourceRef.current = preferredAutoSource;
  // Settings sheet surface — focus moves here on open and back to the control
  // that opened it on close, so the panel is actually operable by keyboard.
  const panelRef = useRef(null);
  // Non-null while a settings sheet is open, holding the element that opened
  // it. Doubles as the "already recorded for this open" flag.
  const panelSessionRef = useRef(null);
  const hlsRef = useRef(null);
  const runRef = useRef(0);
  const metaRef = useRef({ variants: [], sourceKey: null, refUrl: null, masterLevels: false });
  const clickTimer = useRef(null);
  // Touch taps: last-tap info for double-tap seek (±10s by screen side) and a
  // flag that swallows the synthetic click after touchend (it would double-toggle).
  const touchTapRef = useRef({ time: 0, zone: null });
  const suppressClickRef = useRef(false);
  // Space tap-vs-hold: is the key currently down, and did the hold already
  // engage 2x (so the keyup must NOT also toggle play).
  const spaceHoldRef = useRef(false);
  const spaceFiredRef = useRef(false);
  // Desktop hold-to-2x on the forward transport button.
  const desktopHoldTimerRef = useRef(null);
  const desktopHoldFiredRef = useRef(false);
  // Live views of the play/seek closures for media-session handlers that register once.
  const togglePlayRef = useRef(() => {});
  const seekRelativeRef = useRef(() => {});
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
  /* The load effect lives in `engine/useSourceResolve`, which is called before
     `mergeBoundaries` is declared (its state lives further down). The ref is
     assigned on every render; the hook reads it when cue tags arrive. */
  const mergeBoundariesRef = useRef(null);
  // Rapid quality switches stamp a token and re-check it after every await.
  const switchTokenRef = useRef(0);
  // User-initiated in-manifest audio switches (hls.audioTrack) — gate events so
  // normal startup audio loading never re-arms the branded loader.
  const audioSwitchRef = useRef(null);
  const audioSwitchTokenRef = useRef(0);
  const audioSwitchTimerRef = useRef(null);
  // When the branded stage was last armed by a user pick, so a switch that
  // confirms instantly still holds the stage for MIN_SWITCH_STAGE_MS.
  const audioStageArmedAtRef = useRef(0);
  // The track a pick last failed on. hls.js keeps the failed id selected after
  // a timeout, so without this the same row could never be retried.
  const audioFailedIndexRef = useRef(null);
  // Persist the viewer's chosen audio track across re-resolves (by lang/name)
  // so a server switch or token refresh doesn't silently revert to track 0.
  const audioPreferenceRef = useRef(null);
  // Rapid sibling-dub picks each probe before committing; only the newest probe
  // may apply its URL/labels (a slower old probe used to win the race).
  const dubPickTokenRef = useRef(0);
  // One place discards a pending in-manifest audio switch: the server/source
  // picks, a full manifest reload, a failover, and the run's own teardown all
  // used to duplicate (and drift from) this reset. Bumping the token makes the
  // old listener/timer continuation a no-op.
  const cancelAudioSwitch = useCallback(() => {
    audioSwitchTokenRef.current += 1;
    audioSwitchRef.current = null;
    audioFailedIndexRef.current = null;
    try {
      clearTimeout(audioSwitchTimerRef.current);
    } catch {
      // no timer armed
    }
    audioSwitchTimerRef.current = null;
  }, []);
  // Arm-and-fire resume after a switch whose post-reload video.play() the browser
  // refused (autoplay policy): the next user interaction replays it (see the
  // pointerdown listener below), so a switch-while-playing never strands the
  // viewer on a silently paused frame.
  const pendingResumeRef = useRef(false);
  // When the forward buffer first dipped under BUFFER_FLOOR_SECONDS (sustained-shortfall guard).
  const lowBufferRef = useRef({ since: 0, prev: -1 });
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
    setStageWhileLoading(true);
    setServerSwitchStage(true);
    setSwitchingNote("Retrying…");
    setBuffering(true);
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
  //
  // `stageWhileLoading` is armed the instant a switch starts, so it is honoured
  // DIRECTLY: waiting for the debounced `spinner` meant an in-manifest audio
  // pick that confirmed inside the 700ms anti-flash window cleared `buffering`
  // before the spinner ever armed, and the branded stage never appeared at all
  // (user report: "audio switching not showing the title image loader"). The
  // debounced spinner still owns the warm-stall case, where the picture is
  // worth keeping and only a light ring may appear.
  const showStage =
    !fatal && (stageWhileLoading || ((spinner || serverSwitchStage) && !hasStartedRef.current));
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
  /* Subtitles: the track list, the picked track, the cues, the overlay line and
     the styling knobs live in `useSubtitles` — a failed pick has to keep
     saying why, which only works if the error state travels with the engine. */
  const {
    subtitleLanguages,
    subtitleEnabled,
    subtitleEngineRef,
    subtitleEnabledRef,
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
  } = useSubtitles({ videoRef, id, type, imdbId, title, prefs });

  /* Chrome autohide + "Still watching?" live together in one hook: `poke`
     interleaves the 3s hide timer with the 2h idle timer under one shared rate
     limit, so they are one concern, not two. Called here (the earliest point
     all three inputs exist) because `controlsVisible` feeds the ref below. */
  const {
    controlsVisible,
    setControlsVisible,
    poke,
    pokeRef,
    clearHideTimer,
    stillWatching,
    stillWatchingRef,
    dismissStillWatching,
    offerStillWatching,
    resetStreak,
    recordAutoAdvance,
  } = usePlayerChrome({ videoRef, playing, endedRef });

  // The panel dim follows the viewer's motion preference like every other
  // surface in the player (see useMotionTokens).
  const dimReducedMotion = useReducedMotion();
  // The global key handler binds once per panel flip, so it cannot read the
  // latest `controlsVisible` from its closure. A ref keeps the Tab-to-reveal
  // path honest without re-binding (and resetting Space-hold state) on every
  // auto-hide.
  const controlsVisibleRef = useRef(controlsVisible);
  controlsVisibleRef.current = controlsVisible;
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
  const [volHover, setVolHover] = useState(false);
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
  // The height that was active before a source-quality pick, so a run that
  // fails on the new rung can roll the selector back to a ladder that worked.
  const pendingSourceHeightRollbackRef = useRef(null);
  const [sourceVariants, setSourceVariants] = useState([]);
  // { kind: "volume"|"aspect"|"seek"|"play"|"pause"|"hold2x", value } — owned by
  // the hook so the engine has no timer of its own.
  const { hud, showHud, showHudRef } = usePlayerHud();
  // Netflix "Still watching?" — after enough unattended playback or auto-advanced
  // episodes, pause and ask. The offer expires if ignored.
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
  /* Hold-to-2x (Netflix mobile): press-and-hold on the right half of the screen
     plays at 2x; release restores the previous rate. Desktop holds the forward
     transport button. Called here because it needs both `poke` and the rate
     mirror above; the input layer still owns the timers that ARM a hold. */
  const {
    hold2x,
    hold2xRef,
    holdTimerRef,
    holdPointerRef,
    engageHold2x,
    releaseHold2x,
    disarmHold,
  } = useHold2x({
    videoRef,
    playbackRate,
    playbackRateRef,
    mediaKey: `${type}:${id}:${season}:${episode}`,
    poke,
  });
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

  /* Seeking + the scrubber live in `useScrubber`, which owns the drag
     arbitration, the once-per-frame hover application, the queued-delta seek
     and the preview decoder. Everything the player still does — episode picks,
     resume, media-session seekto, intro skip — goes through the helpers it
     returns. Called here because the preview pipeline reads `currentTime` /
     `duration` and the player's own box size. */
  const {
    scrubRef,
    previewUrl,
    previewBox,
    safeDuration,
    effectiveRatio,
    hoverRatio,
    seekRelative,
    safeSeek,
    pendingSeekRef,
    onScrubDown,
    onScrubMove,
    onScrubUp,
    onScrubCancel,
    onScrubLeave,
    onScrubKeyDown,
  } = useScrubber({
    videoRef,
    poke,
    showHudRef,
    skipSecondsRef,
    resumeOffer,
    setResumeOffer,
    setEnded,
    metaRef,
    currentTime,
    duration,
    playerW,
    playerH,
  });
  seekRelativeRef.current = seekRelative;

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
      }
      // Synchronous (not rAF-deferred) so focus lands in the same commit as the
      // open. preventScroll because the sheet is still translated off-frame when
      // it mounts, and a bare focus() scrolls to chase it. Re-focus on EVERY
      // panel change: the row that opened a submenu unmounts with it, and focus
      // would otherwise fall back to <body> (silently skipping the new heading
      // and its rows). The episodes rail owns its own focus handling.
      if (panel !== "episodes") {
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
    // At volume 0 the stream is already silent, so "unmute" (muted false) would
    // leave the button looking dead. Treat the first press as "restore sound".
    const atZero = volumeRef.current <= 0;
    const m = atZero ? false : !mutedRef.current;
    if (atZero) setVolume(0.5);
    setMuted(m);
    setAutoMuted(false);
    showHud("volume", atZero ? 0.5 : m ? 0 : volumeRef.current);
    poke();
  };

  const cycleAspect = () => {
    // Cycle every shared-catalog mode; a corrupted index simply wraps to Fit.
    const next = (Number.isInteger(aspectRef.current) && aspectRef.current >= 0 ? aspectRef.current + 1 : 0) % ASPECT_RATIOS.length;
    setAspectRatioIndex(next);
    showHud("aspect", next);
    poke();
  };

  /* Sleep timer / loop / PiP / fullscreen live in their own hook: they need
     the media element and nothing from the streaming engine. Wrapped here so
     the fullscreen button still reveals the chrome after toggling. */
  const {
    loopEnabled,
    setLoopEnabled,
    sleepMinutes,
    sleepRemaining,
    startSleepTimer,
    clearSleepTimer,
    pipActive,
    pipSupported,
    togglePip,
    isFullscreen,
    goFullscreen: goFullscreenRaw,
  } = usePlaybackExtras({
    videoRef,
    screenRef,
    onSleepEnd: (message) => {
      setControlsVisible(true);
      setQualityNote(message);
    },
  });

  const goFullscreen = () => {
    goFullscreenRaw();
    poke();
  };

  // Reset the auto-advance streak when the viewer CHOOSES an episode (the
  // streak only counts what the Up Next card started on its own). Manual picks
  // go through `chooseEpisode`; the auto path calls `recordAutoAdvance`.
  const chooseEpisode = useCallback(
    (number) => {
      resetStreak();
      onSelectEpisodeRef.current?.(number);
    },
    [resetStreak],
  );

  // ---- Hold-to-2x (Netflix mobile): hold the right half of the screen ----
  /* engageHold2x / releaseHold2x / the safety net live in `useHold2x` (called
     above). What stays here is the INPUT layer: the timers that decide a press
     is long enough to be a hold. */
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
    disarmHold();
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
  // THREE zones, and only a DOUBLE tap acts (user decision, mobile only):
  // double-tap LEFT = rewind, double-tap RIGHT = forward, double-tap CENTRE =
  // pause (the next double-tap resumes). A single tap only reveals the chrome —
  // it must never toggle playback, which is what made the old single-tap toggle
  // fight the double-tap seek on a phone.
  const handleVideoTouchEnd = (e) => {
    poke();
    suppressClickRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const t = e.changedTouches && e.changedTouches[0];
    const zone = rect.width && t ? zoneOf(rect, t.clientX) : null;
    /* A right-zone press arms 2x after HOLD_2X_DELAY_MS, so the arm is still
       PENDING for the whole of a normal tap. resolveTouchRelease treats only an
       arm that actually engaged 2x as a hold; a pending arm is dropped and the
       tap survives. */
    const release = resolveTouchRelease({
      holdLive: hold2xRef.current,
      gestureActive: Boolean(gestureRef.current?.active),
      zone,
      buffering,
      now: performance.now(),
      prevTap: touchTapRef.current,
    });
    if (release.dropArm) disarmHold();
    if (release.clearGesture) gestureRef.current = null;
    if (release.tap) touchTapRef.current = release.tap;
    if (release.action === "end-hold") {
      // A hold that reached 2x was not a tap: restore the rate and swallow the
      // release so play/pause does not fire on lift.
      handleHoldEnd();
      return;
    }
    if (release.action === "ignore") return;
    if (release.action === "toggle") {
      // DOUBLE-TAP CENTRE = pause, and the next one resumes. This is the ONLY
      // way the surface changes playback now: a lone tap just pokes the chrome
      // (done at the top of this handler), so a single tap never pauses by
      // accident while the viewer is trying to reveal the controls.
      togglePlay();
      return;
    }
    if (release.action === "seek") {
      // DOUBLE-TAP SEEK. A double tap is two ~100ms taps, well inside the window.
      seekRelative(release.direction * skipSecondsRef.current);
      return;
    }
    // A lone tap records itself (see resolveTap) so the second tap can complete
    // a double tap, and otherwise does nothing to playback.
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
      if (g.side === "volume") disarmHold();
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
      disarmHold();
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

  /* Pending timers on unmount. These fire long after the player is gone if left
     armed: a desktop hold timer could arm 2x on a torn-down element. (The HUD
     timeout now belongs to `usePlayerHud`, which clears its own; `swIdleRef` /
     `swOfferTimerRef` have their own unmount effect above; the touch hold timer
     is cleared by `releaseHold2x`.) */
  useEffect(
    () => () => {
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
    return () => clearHideTimer();
  }, [playing, poke, clearHideTimer]);

  /* Click-timer cleanup for the single/double-click splitter. (The scrubber's
     own hover deadline and rAF are cleared by `useScrubber`.) */
  useEffect(
    () => () => {
      if (clickTimer.current) clearTimeout(clickTimer.current);
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
          recordAutoAdvance();
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
      const release = resolveSpaceRelease({
        held: spaceHoldRef.current,
        engaged: spaceFiredRef.current,
      });
      if (release === "ignore") return;
      spaceHoldRef.current = false;
      spaceFiredRef.current = false;
      disarmHold();
      if (release === "release-hold") {
        releaseHold2x();
        return;
      }
      togglePlayRef.current?.();
    };
    const onKey = (e) => {
      // Auto-hidden chrome is inert (no invisible tab targets), so the first Tab
      // must bring it back instead of moving focus nowhere. preventDefault gives
      // React the commit; the next Tab enters the now-focusable controls.
      if (e.key === "Tab" && !controlsVisibleRef.current) {
        e.preventDefault();
        setControlsVisible(true);
        poke();
        return;
      }
      const action = keyboardAction({
        code: e.code,
        repeat: e.repeat,
        shiftKey: e.shiftKey,
        defaultPrevented: e.defaultPrevented,
        targetTag: e.target?.tagName,
        panelOpen: Boolean(panel),
        fullscreen: Boolean(document.fullscreenElement),
        spaceHeld: spaceHoldRef.current,
        hasVideo: Boolean(videoRef.current),
      });
      if (!action) return;
      if (action.preventDefault) e.preventDefault();
      // Auto-repeat is swallowed above but never acts twice (see the module).
      if (action.repeated) return;
      switch (action.type) {
        case "space":
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
        case "toggle-play":
          // The ref, not the closed-over function: this effect binds once per
          // panel flip, so the raw `togglePlay` here captured the mount render's
          // `resumeOffer` (always null) — K ignored a pending "Left off at …"
          // card while a click/Space honoured it. togglePlayRef is reassigned
          // every render.
          togglePlayRef.current?.();
          break;
        case "seek-back":
          seekRelative(-skipSecondsRef.current);
          break;
        case "seek-forward":
          seekRelative(skipSecondsRef.current);
          break;
        case "volume-up":
          changeVolume(0.1);
          break;
        case "volume-down":
          changeVolume(-0.1);
          break;
        case "cycle-aspect":
          cycleAspect();
          break;
        case "toggle-mute":
          toggleMute();
          break;
        case "fullscreen":
          goFullscreen();
          break;
        case "episode-next":
          keyboardEpNextRef.current();
          break;
        case "episode-prev":
          keyboardEpPrevRef.current();
          break;
        case "close-panel":
          setPanel(null);
          break;
        case "close-player":
          onCloseRef.current?.();
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


  /* Source resolving lives in `engine/useSourceResolve`: the attempt loop,
     warm-resolve handover, relay fallback, fatal latch and reload carry. The
     hook owns the effect (run token, AbortController, teardown) because the
     resolve used to live inside this effect's closure. */
  useSourceResolve({
    type,
    id,
    season,
    episode,
    title,
    originalLanguage,
    reloadToken,
    videoRef,
    hlsRef,
    metaRef,
    runRef,
    switchTokenRef,
    mediaKeyRef,
    carryRef,
    pendingSeekRef,
    requestedServerRef,
    autoSourceRef,
    sourceHeightRef,
    pendingSourceHeightRollbackRef,
    pendingResumeRef,
    activeDubRef,
    audioPreferenceRef,
    dubPickTokenRef,
    audioSwitchRef,
    audioStageArmedAtRef,
    audioFailedIndexRef,
    audioSwitchTimerRef,
    hasStartedRef,
    autoUriRef,
    autoUriHeightRef,
    maybeOfferResumeRef,
    mergeBoundariesRef,
    clearSleepTimer,
    cancelAudioSwitch,
    safeSeek,
    setFatal,
    setStatus,
    setBuffering,
    setSpinner,
    setStageWhileLoading,
    setServerSwitchStage,
    setSwitchingNote,
    setRequestedServer,
    setActiveDub,
    setDubTracks,
    setDubOriginalLang,
    setSourceVariants,
    setSourceHeight,
    setEnded,
    setUpNext,
    setSwitchFrame,
    setQualities,
    setAudioTracks,
    setAudioIndex,
    setBufferedSecs,
    setBufferedRanges,
    setAutoLevel,
    setManualHeight,
    setCurrentHeight,
    setResumeOffer,
    setPanel,
    setTransportRelay,
    setQualityNote,
    setDeadDubs,
    setActiveSourceKey,
    setIsMasterMode,
    setActiveUri,
    setAutoMuted,
    MAX_CONSECUTIVE_FRAG_FAILURES,
    THROTTLE_BACKOFF_MS,
    SOURCE_RETRIES,
    SOURCE_RETRY_BACKOFF_MS,
    PARSE_TIMEOUT_MS,
    MIN_SWITCH_STAGE_MS,
    BUFFER_DEPTH_SECONDS,
    MIN_BUFFER_SIZE,
    MAX_BUFFER_SIZE,
    BACK_BUFFER_SECONDS,
    INITIAL_BW_BITS,
  });

  /* Quality switching lives in `useQualitySwitch` (see the hook for the rules
     each branch exists for). The player still owns the ref the anti-stall rule
     reads, and the menu rows / Settings summary are its state. */
  const { pickQuality, pickSourceQuality, pickAuto } = useQualitySwitch({
    videoRef,
    hlsRef,
    metaRef,
    switchTokenRef,
    activeDubRef,
    transportRelay,
    activeUri,
    qualities,
    isMasterMode,
    autoUriRef,
    autoUriHeightRef,
    status,
    sourceHeightRef,
    pendingSourceHeightRollbackRef,
    pendingResumeRef,
    safeSeek,
    cancelAudioSwitch,
    armReloadCarry,
    captureFrameUrl,
    poke,
    setBuffering,
    setQualityNote,
    setAutoLevel,
    setManualHeight,
    setActiveUri,
    setStageWhileLoading,
    setServerSwitchStage,
    setSwitchingNote,
    setControlsVisible,
    setCurrentHeight,
    setQualities,
    setSwitchFrame,
    setSourceHeight,
    setPanel,
    setReloadToken,
  });
  pickQualityRef.current = pickQuality;

  /* Servers menu: re-drive the whole load effect through a different source.
     The ref is committed FIRST so the next resolve run sees the pick, the
     reload token re-runs the effect (full teardown → fresh resolve), and the
     dub pin is dropped so no NHD dub URL leaks across servers. The transport
     row highlights this icon while a Servers-menu panel is open. */
  const pickServer = (key) => {
    // Same-key pick is a no-op while that server is playing, but after a fatal
    // it is the viewer's retry: let it re-run the resolve instead of dead-ending
    // on a banner that tells them to pick a server.
    if (requestedServerRef.current === key && status !== "error") return;
    // Invalidate any in-flight quality/dub continuation: it belongs to the old
    // stream and must not commit into this run.
    switchTokenRef.current += 1;
    cancelAudioSwitch();
    pendingSourceHeightRollbackRef.current = null;
    // The teardown below detaches the media element (currentTime → 0): carry
    // the position/paused state across, or a switch mid-film restarted at the
    // beginning behind the stage.
    armReloadCarry();
    // A server switch must show the branded TITLE LOGO stage (user report: the
    // loader logo never appeared when switching servers). pickServer used to
    // hand LoadingStage the captured pre-switch frame, and a frame takes the
    // logo's slot — a mid-film switch showed a dim still instead of the art.
    // The reload carry keeps the position, so nothing is lost; the art keeps
    // the title's identity while the new backend loads.
    setSwitchFrame(null);
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
    // Close immediately: the sheet's exit animation is the transition, and the
    // branded loader must be visible the moment the row is picked (a delayed
    // unmount just kept the sheet covering the loader).
    setPanel(null);
    poke();
    const def = sourceByKey(key);
    setReloadToken((t) => t + 1);
    // A server switch leaves no valid frame behind, so the wait is a cold one
    // and gets the art stage rather than the light overlay.
    setStageWhileLoading(true);
    setServerSwitchStage(true);
    setSwitchingNote(`Switching to ${def?.label || "that server"}…`);
    setBuffering(true);
  };

  /* Source-quality pick: the raw source ladder a plain-HLS server exposes
     (Daedalus 1080/720/480). Distinct from pickQuality (a rung of the DELIVERED
     ladder) — this re-resolves the whole stream from the source at that raw
     resolution, so it rides the same reload path a server switch uses. 0 = Auto
     (the provider's own default link). */
  /* Audio switching lives in `useAudioSwitch`: the in-manifest pick and the
     sibling-dub swap are two mechanisms behind one menu, and both have to pause
     for the switch and resume afterwards. The player keeps the state the menu
     renders. */
  const { pickAudio, pickDub } = useAudioSwitch({
    hlsRef,
    videoRef,
    runRef,
    metaRef,
    requestedServerRef,
    sourceHeightRef,
    activeSourceKey,
    activeDubRef,
    audioFailedIndexRef,
    audioPreferenceRef,
    audioSwitchRef,
    audioSwitchTokenRef,
    audioSwitchTimerRef,
    audioStageArmedAtRef,
    dubPickTokenRef,
    dubTracks,
    audioTrackList,
    pickQualityRef,
    pendingResumeRef,
    AUDIO_SWITCH_TIMEOUT_MS,
    DUB_PROBE_TIMEOUT_MS,
    poke,
    setPanel,
    setQualityNote,
    setControlsVisible,
    setStageWhileLoading,
    setServerSwitchStage,
    setSwitchingNote,
    setBuffering,
    setAudioIndex,
    setActiveDub,
    setDeadDubs,
  });

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
    setStageWhileLoading(true);
    setServerSwitchStage(true);
    setSwitchingNote("Loading previous episode…");
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
    setStageWhileLoading(true);
    setServerSwitchStage(true);
    setSwitchingNote("Loading next episode…");
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
  mergeBoundariesRef.current = mergeBoundaries;
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
        {/* The dim used to snap on, which made every panel open read as two
            disconnected events (a hard black flash, then the sheet). It now
            fades in and out over the same window as the sheet, so the dim and
            the card arrive as one gesture. */}
        <AnimatePresence>
          {panel && (
            <motion.div
              key="np-panel-dim"
              aria-hidden="true"
              initial={dimReducedMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              // RIVO's `.3s` step on `ease-tv` — the same curve and duration as
              // the panel page swap, so the veil and the card arrive together.
              transition={dimReducedMotion ? { duration: 0 } : RIVO_MOTION.STANDARD}
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
        </AnimatePresence>
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
          /* On touch the centre transport (rewind / play / forward) is already
             on screen whenever the stream is simply paused, so the bottom bar's
             play/pause pill would be a SECOND play/pause button on the same
             picture. Same condition as CenterStack's paused transport. */
          centerTransport={IS_TOUCH && !buffering && !ended && !playing && status === "playing"}
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
                  {orderedSources.map((s) => (
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
                resetStreak();
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
        {/* `!panel` stays OUTSIDE the AnimatePresence on purpose: opening a
            sheet must remove the banner on the SAME frame (it sits above the
            sheet on the same bottom strip and swallows the server rows its own
            message points at). Only the recovery case — the fatal message
            clearing while no sheet is open — animates out, which is what the
            banner was missing: it returned null internally, so nothing could
            ever play an exit and it vanished in a single frame. */}
        {!panel && (
          <AnimatePresence>
            {fatal ? (
              <FatalBanner
                message={fatal}
                onRetry={retryLoad}
                onBack={() => {
                  if (onCloseRef.current) onCloseRef.current();
                  else window.history.back();
                }}
              />
            ) : null}
          </AnimatePresence>
        )}
    </div>
  );
}
