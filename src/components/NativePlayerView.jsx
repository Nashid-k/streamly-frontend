// src/components/NativePlayerView.jsx â€” the app's player, opened by the hero /
// episode Play buttons. Resolves VidCore-first (4K) â†’ VidSrc â†’ NHD (multi-
// audio) via streamResolve, with a Servers menu to switch the active server,
// and plays through hls.js (manifest relay + direct-segment loader). Custom
// transport only: no native <video controls>.
// Quality lives in the Audio & Subtitles dialog (Netflix has no quality menu), and
// touch devices get a stacked settings sheet instead of the desktop chrome.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { buildAudioTrackList } from "../utils/audioLabels";
import {
  IconAspect,
  IconGauge,
  IconServers,
  IconSliders,
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
import { takeWarmResolve } from "../api/warmResolve";
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
import { pickInitialBandwidthBits } from "../utils/streamTuning";
import { useOptionalPreferences } from "../context/preferences";
import { getPreviewThumb, clearPreviewCache, resetPreviewPipeline } from "../api/previewThumbs";
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
// vidzen: playlist 200, segments 429 on repeat) â€” so fail over ourselves.
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
const SKIP_SECONDS = 10;
// Netflix "Up Next" auto-play countdown for a TV episode's next installment.
const UP_NEXT_MS = 15000;
// Hold-to-2x (Netflix mobile): how long the right-side hold must run before 2x
// engages, so a normal double-tap seek never fires it.
const HOLD_2X_DELAY_MS = 420;
// "Still watching?" prompt idles that long in pause before it stops asking.
const STILL_WATCHING_OFFER_MS = 90 * 1000;
// Netflix resume gate: how long the "Left off atâ€¦" card waits before auto-resume.
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
// Cap the WATCHED back buffer (hls.js defaults to Infinity â€” a 2h movie would
// pin ~7GB of browser RAM). hls.js trims the rest, like Netflix.
const BACK_BUFFER_SECONDS = 60;
// ABR seed: hls.js starts its bandwidth estimate at 1Mbps, so Auto would climb
// the ladder one relay round-trip at a time (a visible "loading" per rung).
// 10Mbps starts Auto mid-ladder; the floor step-down still guards a bad pipe.
const INITIAL_BW_BITS = 10 * 1000 * 1000;
const VOLUME_STORAGE_KEY = "streamly-native-volume";
const MUTED_STORAGE_KEY = "streamly-native-muted";
const ASPECT_STORAGE_KEY = "streamly-native-aspect";
/* Brightness is GONE (user call): a CSS filter is not the device backlight â€”
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
// the menu always reads low â†’ high (480p â†’ 720p â†’ 1080p â†’ 2K â†’ 4K) regardless.
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
  // TMDB original_language â€” the only language signal the sources give us.
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
  // Settings sheet surface â€” focus moves here on open and back to the control
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
  // Touch taps: last-tap info for double-tap seek (Â±10s by screen side) and a
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
  // (Declared here; SYNCED below next to the other mirror refs â€” the states
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
     manifest (one per dub), never #EXT-X-MEDIA groups â€” so unlike hls.js tracks a
     dub switch is a position-preserving manifest swap, and the pick must survive
     the token-refresh re-resolve below. */
  const [dubTracks, setDubTracks] = useState([]);
  const [activeDub, setActiveDub] = useState(0);
  // Mirror of activeDub for the async resolve loop (same pattern as mutedRef et al.).
  const activeDubRef = useRef(0);
  /* Server switcher: which source the viewer chose in the Servers menu (null
     = the auto rotation's winner, the default being VidCore). A manual pick
     re-resolves through runSourceOnce's `forceSource` argument. */
  const [requestedServer, setRequestedServer] = useState(null);
  const requestedServerRef = useRef(null); // mirror for the async resolve loop
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
  // TMDB iso_639_1 -> display name, for the film-level original-language line.
  const FILM_LANG = {
    en: "English", te: "Telugu", hi: "Hindi", ta: "Tamil", ml: "Malayalam",
    kn: "Kannada", bn: "Bengali", pa: "Punjabi", mr: "Marathi", gu: "Gujarati",
    es: "Spanish", fr: "French", de: "German", it: "Italian", pt: "Portuguese",
    ru: "Russian", ja: "Japanese", ko: "Korean", zh: "Chinese", ar: "Arabic",
    tr: "Turkish", vi: "Vietnamese", th: "Thai", id: "Indonesian", pl: "Polish",
  };
  const [fatal, setFatal] = useState(null);
  // Bumped by the fatal banner's "Try again" to re-run the whole load effect â€”
  // the effect re-resolves the source from scratch (a stale CDN token or a
  // transient 403 usually clears on a second resolve), which is why it is a
  // dependency of that effect and not just a local teardown.
  const [reloadToken, setReloadToken] = useState(0);
  // `poke` is declared further down the component, so this callback cannot close
  // over it directly (TDZ); the ref is the same pattern the file already uses
  // for once-bound handlers.
  const pokeRef = useRef(() => {});
  const retryLoad = useCallback(() => {
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
  // Set by a server switch, cleared when frames return; null means a cold open.
  const [switchingNote, setSwitchingNote] = useState(null);
  const showStage = spinner && (stageWhileLoading || !hasStartedRef.current);
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
  // The rendition ABR currently settled on (LEVEL_SWITCHED) â€” shows the real
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
  // Netflix chrome state.
  const [controlsVisible, setControlsVisible] = useState(true);
  const [panel, setPanel] = useState(null); // null | "subs" | "episodes" | "servers"
  /* A sheet is open. Everything that floats in the bottom-right corner â€” the
     Skip Intro pill, the "Tap to unmute" pill, the "Left off at" card â€” yields
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
  const [autoMuted, setAutoMuted] = useState(false); // autoplay-block â†’ muted play + hint
  const [aspectRatioIndex, setAspectRatioIndex] = useState(() => {
    // Clamp to the shared catalog length â€” the mode list lives in
    // constants/playerUi.js, so a stale stored index beyond it resets to Fit.
    const i = readStoredNumber(ASPECT_STORAGE_KEY, {
      min: 0,
      max: ASPECT_RATIOS.length - 1,
      fallback: 0,
    });
    return Number.isInteger(i) && ASPECT_RATIOS[i] ? i : 0;
  });
  const [playbackRate, setPlaybackRate] = useState(1);
  const [hud, setHud] = useState(null); // { kind: "volume"|"aspect"|"seek"|"play"|"pause"|"hold2x", value }
  // Hold-to-2x (Netflix mobile): press-and-hold on the right half of the screen
  // plays at 2x; release restores the previous rate. Desktop holds the forward
  // transport button.
  const [hold2x, setHold2x] = useState(false);
  // Netflix "Still watching?" â€” after enough unattended playback or auto-advanced
  // episodes, pause and ask. The offer expires if ignored.
  const [stillWatching, setStillWatching] = useState(false);
  // Mirror refs: the keyboard + gesture handlers bind once, so they must read current values.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const aspectRef = useRef(aspectRatioIndex);
  aspectRef.current = aspectRatioIndex;
  // Hold/still-watching mirrors â€” synced here because `hold2x`/`ended` are
  // declared above this line, not at the ref block up top.
  hold2xRef.current = hold2x;
  endedRef.current = ended;
  const hudTimerRef = useRef(null);
  // Touch gesture state for Netflix's vertical drags on the video surface.
  const gestureRef = useRef(null);
  // Fragments flowing via the Vercel relay (0 = all direct). A streak past a
  // couple means the CDN throttled us mid-session â€” surfaced in the attempt log.
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
    () => buildAudioTrackList(dubTracks, originalLanguage),
    [dubTracks, originalLanguage],
  );


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
      // Autoplay policy â€” the big custom button stays visible for a tap.
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
    } catch {
    }
    setEnded(false);
    try {
      await video.play();
    } catch {
      // user gesture needed â€” controls are visible
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
    if (resumeOffer) setResumeOffer(null); // user grabbed the bar â€” they pick the spot
    try {
      scrubRef.current?.setPointerCapture?.(e.pointerId);
    } catch {
      // pointer capture unsupported â€” drag still works while over the bar
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
     Up/Down are deliberately NOT handled here â€” they fall through to the global
     volume binding, which is the convention this player uses everywhere else
     (and matches YouTube); hijacking them for seeking would make the same key
     mean two different things depending on focus. */
  const onScrubKeyDown = (e) => {
    const dur = Number(videoRef.current?.duration);
    const known = Number.isFinite(dur) && dur > 0;
    let handled = true;
    switch (e.key) {
      case "ArrowLeft":
        seekRelative(-SKIP_SECONDS);
        break;
      case "ArrowRight":
        seekRelative(SKIP_SECONDS);
        break;
      case "PageDown":
        seekRelative(-60);
        break;
      case "PageUp":
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
     keeps working â€” the card just stays hidden until a capture lands.
     NOTE: declared AFTER safeDuration/hoverRatio below â€” this effect reads
     them, and an earlier placement read them before initialization (TDZ crash). */

  const seekRelative = (delta) => {
    const video = videoRef.current;
    if (!video) return;
    poke();
    // HUD shows the amount actually applied (clamped at 0 / duration), not the
    // requested one â€” YouTube shows +Xs / -Xs, never a lie like -0s.
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
     episode, offer "Left off at â€¦" once per session and auto-resume into the
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
        // autoplay policy â€” the big custom play button stays available
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
    } catch {
    }
    if (video.paused) {
      video.play().catch(() => {
        // autoplay policy â€” the big custom play button stays available
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
  // Mirror for once-bound closures (togglePlay) â€” same pattern as the value
  // mirror refs above, so the YT-style centre flash survives stale closures.
  const showHudRef = useRef(showHud);
  showHudRef.current = showHud;

  /* Settings-sheet focus management. Two real problems: focus was never moved
     into the sheet (so its rows were never announced and Tab started from
     wherever the transport row left off), and closing it dropped focus on the
     floor. Deliberately NOT a focus trap and NOT aria-modal â€” the sheet is a
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
    // or focus was never on the chrome) â€” focusing it is a no-op.
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
      // fullscreen unsupported â€” native video keeps playing inline
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
    // Any interaction also resets the "Still watching?" idle window.
    if (swIdleRef.current) clearTimeout(swIdleRef.current);
    if (stillWatchingRef.current) {
      stillWatchingRef.current = false;
      setStillWatching(false);
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
  // streak only counts what the Up Next card started on its own).
  useEffect(() => {
    swAutoAdvRef.current = 0;
  }, [id, season, episode]);
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
  const engageHold2x = () => {
    const video = videoRef.current;
    if (!video || video.paused) return;
    heldRateRef.current = video.playbackRate || 1;
    try {
      video.playbackRate = HOLD_SPEED;
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
    if (hold2xRef.current || holdTimerRef.current) {
      // A right-zone hold just ended (2x engaged or still arming): it was not a
      // tap â€” swallow it so play/pause doesn't fire on release.
      handleHoldEnd();
      suppressClickRef.current = true;
      return;
    }
    if (buffering) return;
    // A vertical gesture (volume drag) just happened â€” not a tap.
    if (gestureRef.current?.active) {
      gestureRef.current = null;
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const t = e.changedTouches && e.changedTouches[0];
    if (!rect.width || !t) return;
    const zone = zoneOf(rect, t.clientX);
    // Center taps toggle playback immediately â€” the 260ms single-tap delay
    // only exists where a double-tap means seek.
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
    if (now - prev.time < 350 && prev.zone === zone) {
      touchTapRef.current = { time: 0, zone: null };
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      seekRelative((zone === "left" ? -1 : 1) * SKIP_SECONDS);
      return;
    }
    touchTapRef.current = { time: now, zone };
    // A lone edge tap waits briefly in case it becomes a double-tap seek;
    // if nothing follows, it plays/pauses.
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current);
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null;
      togglePlay();
    }, 260);
  };

  // Vertical drag on the RIGHT THIRD = volume (brightness removed â€” the OS
  // owns screen brightness). Vertical-only â€” horizontal movement declares a
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
      // A right-half drag is a volume gesture, not a hold â€” cancel the 2x arm.
      if (g.side === "volume" && holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    }
    // 2x must never ride on top of a volume drag.
    if (hold2xRef.current && g.side === "volume") {
      releaseHold2x();
    }
    // Netflix sign: drag UP â†’ louder (clientY falls, so -dy is positive).
    const nv = Math.min(1, Math.max(0, volumeRef.current - dy * 0.008));
    setMuted(false);
    setAutoMuted(false);
    setVolume(nv);
    showHud("volume", nv);
    g.lastY = t.clientY;
    poke();
  };

  /* Custom transport state (no native video controls â€” play/pause/seek/time/
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
        // buffered unreadable (no media yet) â€” report zero
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

  /* Volume applies to the element and persists across visits. autoMuted is the
     transient autoplay-policy mute (Netflix autoplays muted + hints) â€” it
     overrides until the user taps the "unmute" affordance. */
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      try {
        video.volume = volume;
        video.muted = muted || autoMuted;
      } catch {
        // element not ready â€” applied on the next change
      }
    }
    try {
      window.localStorage.setItem(VOLUME_STORAGE_KEY, String(volume));
      window.localStorage.setItem(MUTED_STORAGE_KEY, muted ? "1" : "0");
    } catch {
      // private mode â€” volume just won't persist
    }
  }, [volume, muted, autoMuted]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && !hold2x) {
      try {
        video.playbackRate = playbackRate;
        heldRateRef.current = playbackRate;
      } catch {
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

  /* Aspect ratio persists across visits (brightness is gone â€” the OS owns
     screen brightness; a CSS filter only broke the picture). */
  useEffect(() => {
    try {
      window.localStorage.setItem(ASPECT_STORAGE_KEY, String(aspectRatioIndex));
    } catch {
      // private mode â€” aspect just won't persist
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
     once â€” the handlers call live refs so nothing goes stale. */
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
      // MediaMetadata/session unsupported â€” playback is unaffected
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
     inline-styled, so the 0%â†’100% sweep is injected into the head). */
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
     different episode â€” the transport arrows, the keyboard paging, Up Next â€”
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
    const timer = setTimeout(() => {
      setUpNext((prev) => {
        if (prev) {
          // Still-watching guard: three auto-advances with zero interaction in
          // between means nobody is behind the screen â€” pause and ask instead
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
  }, [type, ended, airedEpisodes, episode]);

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
      // Space/Enter on a focused button already clicks it â€” running our own
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
          // In fullscreen the browser consumes Esc to exit it â€” don't also
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
      setFatal("This browser has no MediaSource support â€” native playback cannot run here.");
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
    // server's audioTracks â€” see the publish guard in the commit block.
    const prevSourceKey = metaRef.current?.sourceKey || null;

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

      // Set when any source attempt dies on an upstream 429 (see reportFatal).
      // The final banner reads it: vidzen's 2026-09 delivery fleet quota-dies
      // with Cloudflare "error code: 1027" — the browser logs an opaque CORS
      // error while the real story is the provider's daily quota, so the banner
      // should say THAT instead of a bare "no stream".
      let anyUpstreamQuota = false;

      // One pass at a source: true = settled (caller stops), false = transient (retryable
      // warm-up/empty/flaky), "off" = terminal (the provider doesn't have this title).
      const runSourceOnce = async (defArg) => {
        // Auto rotation walks PLAYER_SOURCES in order; a Servers-menu pick overrides
        // it for one pass (stale().guards everything as usual).
        const def = defArg || PLAYER_SOURCES.find((s) => s.key === requestedServerRef.current) || null;
        if (!def) return false;
        let resolved = null;
        try {
          // Warm-resolve handover (PLAN.md P0.4): the details page may have
          // pre-minted the default server's token while the viewer read the
          // synopsis — consume it instead of re-paying the resolve leg. The
          // handover is one-shot and refuses any non-default server pick (a
          // manual pick must resolve THAT server, not a VidCore warm token).
          const warm = takeWarmResolve(args, { sourceKey: requestedServerRef.current });
          resolved = warm || (await def.resolve(args, { signal: controller.signal }));
        } catch (error) {
          if (error?.code === "no-source") return "off";
          return false;
        }
        let variants = resolved?.variants || [];
        if (variants.length === 0) {
          // Empty is not terminal: the catalogue returns empty lists when rate-flaky.
          return false;
        }
        // Sibling-URL dubs ride OUTSIDE the ladder (resolved.audioTracks); variants
        // above is rewritten by the token-refresh path, so the dub list keeps the
        // FIRST resolution's â€” sibling URLs never refresh tokens anyway.
        const dubTracks = Array.isArray(resolved?.audioTracks) ? resolved.audioTracks : [];

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
          // Smooth start: open on the tallest rendition â‰¤1080p (a 4K segment needs
          // ~20Mbps sustained â€” opening there is what stalled playback after 5-10s).
          let smoothStart = pool[0] || pickSmooth(variants);
          // A pinned dub re-opens on ITS OWN sibling manifest (the token-refresh
          // attempt below), not the original-language entry â€” the position restore
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
          // a relay start reopens at the tallest â‰¤720p; the direct path keeps â‰¤1080p.
          if (!isMaster && probe.via === "relay" && (smoothStart?.height || 0) > 720) {
            const relayFriendly = variants
              .filter((v) => (v.height || 0) > 0 && (v.height || 0) <= 720)
              .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
            if (relayFriendly && relayFriendly.uri !== smoothStart?.uri) {
              smoothStart = relayFriendly;
              entryUrl = entryUrlFor(def, { source: liveSource }, smoothStart);
              // A per-quality source whose variant lacks a uri must not reach
              // hls.loadSource(undefined) â€” that surfaced as ?url=undefined at
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
          // the pipe's shape before a byte flows, so use it as a PRIOR only â€”
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
          // Startup stays â‰¤720p over relay; master sources self-adjust.
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
              fragLoadingTimeOut: 30000,
              fragLoadingMaxRetry: 8,
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
            // lie), and never exceed the rendered size â€” a small window doesn't need 1080p
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
          // the black screen (vidzen 429s) â€” count them and fail over ourselves.
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
                                  } else if (consecFragFails >= MAX_CONSECUTIVE_FRAG_FAILURES) {
                  reportFatal({ ...data, fatal: true, details: `${data.details} (Ã—${consecFragFails} consecutive â€” giving up)` });
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
          // A fresh resolution carries a fresh referer token â€” thumbnails from
          // the previous one are dead weight; the preview decoder remounts.
          clearPreviewCache(def.key);
          startLevelFor(hls);
          // One row per DISTINCT LABEL: providers list several renditions of the
          // same rung (640x272 + 640x360 both read "480p"), which showed as
          // duplicate menu rows. Keep the tallest/highest-bandwidth rendition
          // per label; rows carry their RAW height so level matching (highlight,
          // step-down) keeps comparing like with like.
          const byLabel = new Map();
          variants
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
          setQualities(Array.from(byLabel.values()));
          // Publish this run's dub list â€” unless a dub pin carried over from
          // a DIFFERENT server (a Servers-menu switch): a stale index must not
          // auto-pin a dub on the new server (its attempt loop would re-open
          // a dead old token). Same-server re-runs keep the pin by design.
          if (activeDubRef.current > 0 && def.key !== prevSourceKey) {
            activeDubRef.current = 0;
            setActiveDub(0);
            setDubTracks([]);
          } else {
            setDubTracks(dubTracks);
            setActiveDub(activeDubRef.current);
          }
          setIsMasterMode(isMaster);
          setActiveUri(isMaster ? null : smoothStart?.uri || null);
          // Remember the rung the player negotiated (non-master "Auto").
          autoUriRef.current = isMaster ? null : smoothStart?.uri || null;
          autoUriHeightRef.current = isMaster ? null : smoothStart?.height ?? null;
          attachAudio(hls);
          setStatus(`playing via ${def.label}`);
          // Real frames exist again: any later stall is a mid-playback one and
          // must use the light overlay, not hide the picture behind art.
          setStageWhileLoading(false);
          setSwitchingNote(null);
          if (resumeTime != null) {
            safeSeek(resumeTime);
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
          // source/quality, resume position) or moves on â€” never a dead "playing" screen.
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
          // A pinned dub whose token died mid-play cannot refresh in place â€” its
          // sibling URL is fixed â€” so drop back to the original track and let the
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
              fresh = await def.resolve(args, { signal: controller.signal });
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
          const outcome = await runSourceOnce(def);
          if (outcome === true) return true;
          if (outcome === "off") return false;
        }
      };

      // A Servers-menu pick plays ONLY that server (its own retry + token-
      // refresh machinery still applies); the auto rotation is the no-pick
      // path. Silently falling back to another provider would lie about what
      // the viewer chose â€” the fatal message points at the Servers menu.
      if (requestedServerRef.current) {
        if (await runSource(null)) return;
      } else {
        for (const def of PLAYER_SOURCES) {
          if (stale()) return;
          if (await runSource(def)) return;
        }
      }
      if (stale()) return;
      setStatus("error");
      const quotaHit = anyUpstreamQuota;
      setFatal(
        requestedServerRef.current
          ? `${sourceLabel(requestedServerRef.current)} had no playable stream${quotaHit ? " (provider hit its daily delivery quota, HTTP 429 — try again later)" : ""} â€” try another server (gear â†’ Servers).`
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
  }, [type, id, season, episode, title, reloadToken]);

  const pickQuality = async (uri, height, opts = {}) => {
    const hls = hlsRef.current;
    if (!videoRef.current) return;
    if (!hls) return;
    // A pinned NHD dub IS the manifest â€” the source serves one rung per dub, so
    // a quality pick while a dub plays would silently swap the viewer back to
    // the original language instead of changing quality. Honest answer: fixed.
    // (Dub switches pass dubSwitch â€” pickDub commits the ref only after its own
    // probe passed, and picking "Original" clears the ref first.)
    if (activeDubRef.current > 0 && !opts.dubSwitch) {
      setBuffering(false);
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
    // pickDub already said "Audio -> <track>â€¦" â€” don't overwrite it with "?p".
    setBuffering(true);
    poke();
    try {
      // A dub switch on a multi-rung master replaces the whole playlist (the dub
      // is a sibling master URL), so it must NOT be short-circuited into
      // `hls.currentLevel` â€” that would keep the original language playing.
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
        // Pin the dialog highlight to the level ACTUALLY selected (row height can differ a few px).
        setManualHeight(hls.levels[best]?.height || height || null);
        setActiveUri(null);
        setBuffering(false);
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
          setBuffering(false);
          setControlsVisible(true);
          return;
        }
      } catch {
        // probe hiccup (abort, timeout) â€” fall through to the requested uri
      }
      // A probe hiccup with no requested uri would reach loadSource(undefined)
      // â†’ the worker's ?url=undefined 500. Bail to the current quality instead.
      if (!chosenUri) {
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
          // user gesture needed â€” custom transport is present
        }
      }
      setActiveUri(chosenUri);
      // A dub switch has no quality to report â€” pickDub already announced the
      // track it is moving to, so don't overwrite it with "?p".
      // Real frames again. The loader's own success path clears this too, but a
      // direct hls.loadSource() swap (quality/dub) never goes through that path,
      // so without this the art stage would sit on top of working video.
      setStageWhileLoading(false);
      setSwitchingNote(null);
    } catch {
      // Roll the optimistic pick back: the stream is still on the old rung, so
      // the highlight must say so.
      setManualHeight(null);
      setAutoLevel(metaRef.current?.masterLevels ? true : false);
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
     reload token re-runs the effect (full teardown â†’ fresh resolve), and the
     dub pin is dropped so no NHD dub URL leaks across servers. The transport
     row highlights this icon while a Servers-menu panel is open. */
  const pickServer = (key) => {
    if (requestedServerRef.current === key) return;
    requestedServerRef.current = key;
    setRequestedServer(key);
    activeDubRef.current = 0;
    setActiveDub(0);
    setDubTracks([]);
    setPanel(null);
    poke();
    const def = sourceByKey(key);
    setReloadToken((t) => t + 1);
    // A server switch leaves no valid frame behind, so the wait is a cold one
    // and gets the art stage rather than the light overlay.
    setStageWhileLoading(true);
    setSwitchingNote(`Switching to ${def?.label || "that server"}…`);
  };

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
      // A pinned NHD dub IS the manifest â€” stepping down a rung would swap the
      // viewer back to the original-language track, so leave the dub alone.
      if (activeDubRef.current > 0) return;
      if (!target || activeUri === target.uri) return;
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
  };

  /* Dub switch: each dub is a SEPARATE HLS manifest (a sibling full-stream
     URL from the resolver's audioTracks, never an in-manifest audio group), so
     switching = swapping the source with pickQuality's position-preserving
     mechanics. Row index 0 is the original soundtrack â€” picking it swaps back to
     the resolution's own entry URL.

     The row index and the dubTracks index are OFF BY ONE on purpose: the panel
     renders an "Original" row first, so row N is dubTracks[N - 1]. Indexing
     both with the same N played the WRONG language under the clicked label. */
  const pickDub = async (index) => {
    // A sibling is NOT provably the original â€” the provider's own player
    // highlights tracks[0] while playing the main URL â€” so the two lists must
    // never be conflated.
    if (index === activeDubRef.current) return;
    const target = index === 0 ? null : dubTracks[index - 1];
    if (index > 0 && !target?.uri) return;
    const meta = metaRef.current;
    const targetUri =
      index === 0 ? meta?.variants?.[0]?.uri || meta?.entryUrl : target.uri;
    if (!targetUri) return;
    poke();
    // Prove the target manifest flows BEFORE committing the pick â€” NHD tokens are
    // time-scoped, and a dead dub must not end up highlighted with the previous
    // audio still playing. (The same gate pickQuality applies to quality rungs.)
    try {
      const probe = await probeSourcePlayable(targetUri, meta?.refUrl);
      if (!probe.ok) {
        setControlsVisible(true);
        return;
      }
    } catch {
      // probe hiccup (abort/timeout) â€” let the switch itself decide
    }
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
      // storage full/blocked â€” subtitle still works this session
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
            "Subtitle download failed â€” try another language. If every language fails, the Cloudflare relay is serving without the OpenSubtitles update (redeploy the worker snippet from .env.example).",
          );
        }
        return;
      }
      const parsed = SubtitleEngine.parseSRT(text);
      const cues = parsed.length ? parsed : SubtitleEngine.parseVTT(text);
      if (!cues.length) {
        // The fetcher already refuses non-subtitle bodies, so reaching here
        // means a real caption file with zero parseable lines â€” never leave
        // the track "enabled" with nothing to render.
        if (token === subtitleTokenRef.current) {
          subtitleEnabledRef.current = false;
          setSubtitleEnabled(false);
          setCurrentSubtitle(null);
          subtitleEngineRef.current?.setCues([]);
          applySubtitleCue(null);
          setSubtitleError("This subtitle file had no readable lines â€” pick another language.");
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
        setSubtitleError("Subtitle download failed â€” try another language.");
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
          // storage unavailable â€” no auto restore
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

  const showEpisodesButton = Array.isArray(episodes) && episodes.length > 0;

  // Episode paging (TV only): the parent's canGo*/onGo* cross seasons; we fall back to walking `episodes`.
  const showEpisodeNav = type === "tv";
  const navIndex = airedEpisodes.findIndex((e) => e.number === episode);
  const navPrevNumber = navIndex > 0 ? airedEpisodes[navIndex - 1]?.number : null;
  const navNextNumber =
    navIndex >= 0 && navIndex < airedEpisodes.length - 1 ? airedEpisodes[navIndex + 1]?.number : null;
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
  // The keydown effect binds once per panel flip â€” route it through mirrors so
  // N / Shift+P always see the current episode's nav state.
  keyboardEpPrevRef.current = keyboardPrevEpisode;
  keyboardEpNextRef.current = keyboardNextEpisode;

  // Skip-intro / skip-credits windows. The RULE lives in utils/skipMarkers.js;
  // this is only the viewer's choice about how to apply it (the Auto Skip Intro
  // preference, previously dead on web â€” it was wired in Settings but nothing
  // here ever read it).
  const prefs = useOptionalPreferences();
  const autoSkipIntro = prefs?.autoSkipIntro === true;

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
         apply one provider's cut to another's encode â€” and, worse, the loader
         logs "No cue tags in manifest â€” skip windows stay estimated" while the
         windows are in fact NOT estimates, so the one diagnostic meant to answer
         "does any provider emit cue tags" reports a falsehood.
       in-manifest audio group      -> pickAudio only sets hls.audioTrack; the
         manifest is untouched, so the tags still describe what is playing.

     Dataset boundaries are keyed by IMDb id, so they describe the content and are
     kept across every source switch â€” that is the whole reason to have them. */
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
      // user gesture needed â€” custom transport is present
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
            gradients â€” stacking more here double-darkened the picture.) */}
        {/* Dim the picture while a dialog panel is open (Netflix does this) so
            the rows read against the frame, not against the movie. Tapping the
            dim (outside the sheet) closes the panel â€” mobile has no Esc. */}
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
        {/* Subtitle overlay â€” active OpenSubtitles line, bottom-anchored above
            the control chrome like CustomVideoPlayer. */}
        <SubtitleOverlay text={activeSubtitle} controlsVisible={controlsVisible} />
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
            the intro plays) â€” but yields to any open panel. */}
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
            AnimatePresence â€” a `transition` on a conditionally mounted node never
            plays, which is why it looked frozen. */}
        {/* Cold wait: no frame to preserve, so the stage is the picture. */}
        <CenterStack
          showStage={showStage}
          stageNote={stageNote}
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
            seekRelative(-SKIP_SECONDS);
          }}
          onTogglePlay={() => {
            poke();
            togglePlayRef.current();
          }}
          onForward={() => {
            poke();
            seekRelative(SKIP_SECONDS);
          }}
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
          onBack10={() => seekRelative(-SKIP_SECONDS)}
          onForward10={() => {
            if (desktopHoldFiredRef.current) {
              desktopHoldFiredRef.current = false;
              return;
            }
            seekRelative(SKIP_SECONDS);
          }}
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
              ["settings", "audio", "subs", "video", "speed", "aspect"].includes(p)
                ? null
                : "settings",
            );
            poke();
          }}
          showAudioButton={audioTrackList.length > 1}
          showSubsButton={subtitleLanguages.length > 0 || isFetchingSubtitles || subtitleError}
          isFullscreen={isFullscreen}
          onFullscreen={goFullscreen}
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
          onPlayNow={(n) => onSelectEpisodeRef.current?.(n)}
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
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
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
                  // the Servers sheet uses â€” not the resolver's internal key.
                  // Requested wins over committed: after a failed switch the
                  // committed key would highlight the server the viewer just
                  // abandoned.
                  sub={sourceLabel(activeSourceKey || requestedServer || DEFAULT_SOURCE_KEY, "Server 1")}
                  icon={<IconServers size={20} />}
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
                {/* The SkipDB data licence (ODbL) requires attribution wherever
                    its boundaries are used, so this is a licence term, not a
                    nicety. Gated on `source === "dataset"` so we credit it only
                    for titles where its data actually reached the player â€”
                    attribution for data we never used would be false. */}
                {cueBoundaries?.source === "dataset" ? (
                  <p
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.35)",
                      margin: "14px 0 0",
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
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#a1a1aa", margin: "4px 0 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Servers
                  </p>
                  <p style={{ fontSize: 12.5, color: "#a1a1aa", margin: "6px 0 8px", lineHeight: 1.45 }}>
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
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#a1a1aa", margin: "4px 0 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Subtitles
                  </p>
                  <DialogRow
                    key="off"
                    selected={!subtitleEnabled}
                    onClick={() => selectSubtitle(null)}
                    title="Off"
                  />
                  {isFetchingSubtitles ? (
                    <p style={{ fontSize: 12.5, color: "#a1a1aa", margin: "6px 0 2px", lineHeight: 1.45 }}>
                      Searching OpenSubtitlesâ€¦
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
                    <p style={{ fontSize: 12.5, color: "#a1a1aa", margin: "6px 0 2px", lineHeight: 1.45 }}>
                      {!imdbId
                        ? "No subtitles found for this title on OpenSubtitles (no IMDb id â€” title search also came up empty)."
                        : "No subtitles found for this title on OpenSubtitles."}
                    </p>
                  )}
                  {subtitleError ? (
                    <p role="alert" style={{ fontSize: 12.5, color: "#ff9d9d", margin: "8px 0 2px", lineHeight: 1.5 }}>
                      {subtitleError}
                    </p>
                  ) : null}
              </div>
            ) : panel === "audio" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#a1a1aa", margin: "4px 0 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Audio
                  </p>
                  {dubTracks.length > 0 ? (
                    // Sibling-URL dubs (NHD, ZXC Centaurus): one MASTER per dub,
                    // switched by swapping the source (pickDub) â€” NOT hls.js
                    // audio groups.
                    //
                    // Checked BEFORE audioTracks on purpose: a transcoded DASH
                    // master always carries an in-manifest #EXT-X-MEDIA group
                    // (the muxed AAC), so testing audioTracks first would show
                    // one lonely "eng" row and hide every real dub behind it.
                    // The sibling list is a superset â€” it starts at the original.
                    <>
                      {/* Row 0 is the original, named by the film's language
                          rather than the word "Original": TMDB already told us
                          what it is, and "Original" next to a row called "Tamil"
                          reads as a category rather than a language. */}
                      <DialogRow
                        key="dub-original"
                        selected={activeDub === 0}
                        onClick={() => pickDub(0)}
                        title={audioTrackList[0]?.label || "Original"}
                        sub="This source's soundtrack"
                      />
                      {/* ALL siblings get rows: the provider's own player
                          highlights tracks[0] while playing the main URL, so
                          track[0] is NOT provably the original soundtrack â€”
                          hiding it would hide a real language. Labels are the
                          normalised language names from audioLabels.js. */}
                      {audioTrackList.slice(1).map((t) => (
                        /* sourceIndex, NOT the row's own position: buildAudioTrackList
                           drops duplicate/empty rows, so positional indexing here
                           would play a different language than the one clicked. */
                        <DialogRow
                          key={`dub-${t.sourceIndex}`}
                          selected={activeDub === t.sourceIndex + 1}
                          onClick={() => pickDub(t.sourceIndex + 1)}
                          title={t.label}
                        />
                      ))}
                    </>
                  ) : audioTracks.length > 0 ? (
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
                    // soundtrack IS playing â€” surface it as the single track.
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
                        title={originalLanguage ? `Original â€” ${FILM_LANG[originalLanguage] || (originalLanguage || "").toUpperCase() || "Unknown"}` : "Original"}
                        sub="This source's soundtrack"
                      />
                    </>
                  )}
              </div>
            ) : panel === "video" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#a1a1aa", margin: "4px 0 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Video Quality
                  </p>
                  {/* Auto is ALWAYS present â€” the active mode on every source
                      (master = hls.js ABR; per-rendition sources = the rung the
                      player negotiated at open, smooth-start / relay-friendly). */}
                  <DialogRow
                    selected={autoLevel}
                    onClick={pickAuto}
                    title="Auto"
                    sub={
                      autoLevel && currentHeight != null
                        ? `Now ${qualities.find((q) => q.height === currentHeight)?.label || `${currentHeight}p`} Â· adjusts with your connection`
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
                        title={q.label || `${q.height}p`}
                      />
                    );
                  })}
              </div>
            ) : panel === "speed" ? (
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#a1a1aa", margin: "4px 0 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Playback Speed
                  </p>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
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
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 16px" }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: "#a1a1aa", margin: "4px 0 4px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Aspect Ratio
                  </p>
                  {ASPECT_RATIOS.map((aspect, idx) => (
                    <DialogRow
                      /* `name`, not `label`: the catalog has only ever had
                         `name`. Reading `.label` here made every option's text
                         undefined, so the whole panel rendered as six blank
                         rows â€” the reason the aspect labels looked "missing".
                         Keyed on id so rows stay stable. */
                      key={aspect.id}
                      selected={aspectRatioIndex === idx}
                      onClick={() => {
                        setAspectRatioIndex(idx);
                        setPanel(null);
                        poke();
                      }}
                      title={aspect.name}
                    />
                  ))}
              </div>
            ) : null}
        </PlayerPanel>

        {/* YouTube-style Bottom Sheet for Episodes */}
        <AnimatePresence>
          {panel === "episodes" && (
            <EpisodesRail 
              episodes={episodes}
              episode={episode}
              onSelectEpisode={onSelectEpisode}
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
        {/* Netflix "Still watching?" â€” pause + ask after unattended playback. */}
        <AnimatePresence>
          {stillWatching && (
            <NetflixStillWatching
              key="still-watching"
              onContinue={() => {
                setStillWatching(false);
                swAutoAdvRef.current = 0;
                poke();
                const v = videoRef.current;
                try {
                  v?.play();
                } catch {
                  // user gesture needed â€” the custom transport is right there
                }
              }}
              onExit={() => {
                setStillWatching(false);
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
