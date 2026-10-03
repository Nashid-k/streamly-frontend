// src/components/NativePlayerView.jsx â€” the app's player, opened by the hero /
// episode Play buttons. Resolves VidCore-first (4K) â†’ VidSrc â†’ NHD (multi-
// audio) via downloadService, with a Servers menu to switch the active server,
// and plays through hls.js (manifest relay + direct-segment loader). Custom
// transport only: no native <video controls>.
// Quality lives in the Audio & Subtitles dialog (Netflix has no quality menu), and
// touch devices get a stacked settings sheet instead of the desktop chrome.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { useMotionTokens } from "../constants/motion";
import { buildAudioTrackList, originalTrackLabel } from "../utils/audioLabels";
import useRailArrows from "../hooks/useRailArrows";
import RailArrow from "./RailArrow";
import {
  ArrowLeft,
  AudioLines,
  Calendar,
  Captions,
  Check,
  ChevronLeft,
  ChevronRight,
  Gauge,
  ListVideo,
  SlidersHorizontal,
  Maximize,
  Minimize,
  Pause,
  Play,
  Proportions,
  RotateCcw,
  Server,
  ServerCog,
  Settings,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  NetflixVolumeHUD,
  NetflixAspectHUD,
  NetflixSeekHUD,
  NetflixPlayPauseHUD,
  NetflixHold2xHUD,
} from "./player";
import NetflixStillWatching from "./NetflixStillWatching";
import Hls from "hls.js";
import { variantLabel } from "../utils/downloadQuality";
import { createStreamlyLoader, probeSourcePlayable } from "../api/nativeHlsLoader";
import { takeWarmResolve } from "../api/warmResolve";
import { vidcoreEmbedUrl, shouldOfferVidcoreEmbed } from "../api/vidcoreEmbed";
import { SKIP_DATA_CREDIT, fetchSkipBoundaries } from "../api/skipBoundarySource";
import { SubtitleFetcher } from "../api/subtitleFetcher";
import { logDebug, logWarn } from "../utils/debugLogger";
import { SubtitleEngine } from "../utils/subtitleEngine";
import { readStoredNumber } from "../utils/storedNumber";
import { isEpAired, formatAirsDate } from "../utils/titleDetails";
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
  shouldShowSkipIntro,
  getSkipOutroTarget,
  shouldShowSkipOutro,
  shouldAutoSkipIntroOnce,
  mergeSkipBoundaries,
  rescopeBoundaries,
} from "../utils/skipMarkers";
import { pickInitialBandwidthBits } from "../utils/streamTuning";
import { useOptionalPreferences } from "../context/preferences";
import { getPreviewThumb, clearPreviewCache, resetPreviewPipeline } from "../api/previewThumbs";

// A source can fail fragments forever without ever going fatal (VidCore's
// vidzen: playlist 200, segments 429 on repeat) â€” so fail over ourselves.
const MAX_CONSECUTIVE_FRAG_FAILURES = 4;

const NETFLIX_RED = "#E50914";
const HIDE_DELAY_MS = 3000;
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
const BUFFER_DEPTH_SECONDS = 120;
const MIN_BUFFER_SIZE = 60 * 1000 * 1000; // hls.js default floor
const MAX_BUFFER_SIZE = 240 * 1000 * 1000; // hard ceiling: ~2min of 4K@16Mbps, ~10min of 1080p
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

// Touch-first devices (hover-less, coarse pointer) get bigger tap targets,
// double-tap seek zones, safe-area padding, a centered play glyph and a stacked
// settings panel; mouse/trackpad keeps the desktop chrome.
const IS_TOUCH =
  typeof window !== "undefined" &&
  !!window.matchMedia &&
  window.matchMedia("(hover: none), (pointer: coarse)").matches;
const BTN_SIZE = IS_TOUCH ? 44 : 40;
// Centre-screen rewind/forward chevrons sit directly on the picture with no
// plate behind them, so a light shadow is the only thing keeping them readable
// over a white frame. (A dark box here is exactly what we removed from the
// play/pause HUD â€” same problem, same answer: shadow, not a scrim.)
const CENTER_GLYPH_SHADOW = { filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.8))" };
// Netflix top bar: 16px on desktop; safe-area inset on touch devices.
const SAFE_TOP = IS_TOUCH ? "calc(16px + env(safe-area-inset-top, 0px))" : "16px";
// Netflix bottom chrome: 24px on desktop; safe-area inset on touch devices.
const SAFE_BOTTOM = IS_TOUCH ? "calc(20px + env(safe-area-inset-bottom, 0px))" : "24px";

// Skip Intro / Skip Outro live in src/utils/skipMarkers.js â€” the boundaries are
// estimates (no provider supplies markers) and the module documents that, plus
// the SKIP_INTRO_OVERRIDES seam for confirmed boundaries. Everything below is
// presentation only.

/* Plain white circular icon button (Netflix transport glyphs). */
function IconBtn({ label, onClick, children, active, disabled, expanded }) {
  return (
    <button
      type="button"
      className="np-icon-btn"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={expanded ? undefined : active ? true : undefined}
      aria-expanded={expanded === undefined ? undefined : Boolean(expanded)}
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
function DialogRow({ selected, onClick, title, sub, disabled, icon, hasChevron }) {
  // DialogRow is a module-level component, so it has no access to the player's
  // `M` tokens and must resolve the preference itself — the same value, read
  // from the same hook, so the checkmark still collapses to a cut.
  const M = useMotionTokens(useReducedMotion());
  return (
    <button
      type="button"
      className="np-dialog-row"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-pressed={selected ? true : undefined}
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
      }}
    >
      <span style={{ width: 22, display: "flex", alignItems: "center", flexShrink: 0 }}>
        {icon ? (
          icon
        ) : selected ? (
          // The check itself pops, so a selection change is felt, not just seen.
          <motion.span
            key={`check-${title}`}
            initial={M.CHECK_POP.initial}
            animate={M.CHECK_POP.animate}
            transition={M.CHECK_POP.transition}
            style={{ display: "flex" }}
          >
            <Check size={16} color={NETFLIX_RED} />
          </motion.span>
        ) : null}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {title}
        </span>
        {sub ? (
          <span style={{ display: "block", fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{sub}</span>
        ) : null}
      </span>
      {hasChevron && (
        <span style={{ display: "flex", alignItems: "center", color: "rgba(255,255,255,0.5)" }}>
          <ChevronRight size={18} />
        </span>
      )}
    </button>
  );
}

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

const FUN_FACTS = [
  "Reticulating splines...",
  "Warming up the projector...",
  "Dimming the lights...",
  "Grabbing the popcorn...",
  "Tuning the audio...",
  "Finding the best quality...",
  "Rolling film...",
  "Silencing cellphones...",
  "Preparing the stream...",
];

function LoadingMessage({ title }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % FUN_FACTS.length);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {title && <span style={{ fontSize: 20, color: "#fff" }}>Loading {title}</span>}
      <span style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontStyle: "italic", minHeight: "20px" }}>
        {FUN_FACTS[index]}
      </span>
    </div>
  );
}

/* The stage a viewer stares at while a stream resolves: the title's own art,
   blurred and dimmed as a backdrop, with the name and a spinner over it.
   Reused for the first load AND for every server / quality / dub switch, because
   those are the same wait wearing different clothes — the artwork is what tells
   the viewer the player did not lose their place, and a bare black rectangle
   with a dot in it does not. */
function LoadingStage({ title, backdropUrl, posterUrl, message }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        overflow: "hidden",
        background: "#000",
        zIndex: 3,
      }}
    >
      {backdropUrl ? (
        <img
          src={backdropUrl}
          alt=""
          aria-hidden="true"
          className="np-loading-art"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // Heavily blurred so it reads as COLOUR, not as a photo the viewer
            // might mistake for the frame that is about to appear. The dim layer
            // under it keeps the white text and spinner legible over a bright
            // still — a light backdrop would otherwise eat both.
            filter: "blur(28px) saturate(1.2) brightness(0.5)",
            transform: "scale(1.15)", // blur samples the edge; scale hides it
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 45%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.78) 70%)",
        }}
      />
      {/* The title art itself, big and centred. The blurred backdrop behind is
          only ambient colour; without this the stage looks like a black screen
          someone slapped a label on. Contained rather than cover: cropping the
          poster's top and bottom during a load makes an unrecognisable
          fragment, which defeats the entire point of showing it. */}
      {title ? (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            maxWidth: "min(88vw, 620px)",
          }}
        >
          {/* The title ART is the centrepiece: the logo-style still TMDB
              serves, contained so nothing crops it. */}
          {posterUrl ? (
            <img
              src={posterUrl}
              alt=""
              aria-hidden="true"
              className="np-loading-poster"
              style={{
                width: "auto",
                height: "auto",
                maxWidth: "min(72vw, 520px)",
                maxHeight: "min(30vh, 220px)",
                objectFit: "contain",
              }}
            />
          ) : null}
          {/* Title text removed when the logo exists (user order): the image
              IS the title. Without a logo the text name is the only honest
              identifier left, so it falls back in. */}
          {!posterUrl && title ? (
            <div
              style={{
                fontSize: "clamp(18px, 3.2vw, 30px)",
                fontWeight: 700,
                color: "#fff",
                letterSpacing: "-0.02em",
                textAlign: "center",
                padding: "0 24px",
                textShadow: "0 2px 18px rgba(0,0,0,0.7)",
              }}
            >
              {title}
            </div>
          ) : null}
          {/* The Tailspin ring sits under the art (their composition: centred
              column, logo, ring below). Purely decorative — the reduced-motion
              block stops and dims it. */}
          <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
            <RingSpinner size={44} />
          </div>
        </div>
      ) : null}
      {message ? (
        <div
          style={{
            position: "relative",
            fontSize: 12.5,
            color: "rgba(255,255,255,0.6)",
            letterSpacing: "0.01em",
          }}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}

/* A white ring with a gap that travels around it. Purely decorative, so it is
   aria-hidden and the real state is announced by the `say` line instead. The
   reduced-motion block in player.css stops it entirely for viewers who asked for
   that — an endlessly spinning ring is the textbook case of motion that causes
   discomfort, and it is exactly what that media query exists for. */
/* Tailspin: the conic-gradient ring player.zxcprime.xyz uses (scraped from
   their shipped CSS module). The comet-tail sweep reads lighter than a
   border-arc spinner at the same size; rendered white over video. */
function RingSpinner({ size = 34 }) {
  return (
    <span
      className="np-tailspin np-ring-spinner"
      aria-hidden="true"
      style={{ "--uib-size": `${size}px`, "--uib-color": "#fff", "--uib-speed": "0.9s", "--uib-stroke": "4px" }}
    >
      <span />
    </span>
  );
}

function EpisodesRail({ episodes, episode, onSelectEpisode, setPanel, setBuffering, setResumeOffer, IS_TOUCH }) {
  const railRef = useRef(null);
  const { canScrollLeft, canScrollRight, refresh } = useRailArrows(railRef);
  // Module-level component, so it resolves the preference itself (see DialogRow).
  const M = useMotionTokens(useReducedMotion());

  const scroll = useCallback((dir) => {
    const el = railRef.current;
    if (!el) return;
    const amount = el.clientWidth > 800 ? el.clientWidth * 0.8 : el.clientWidth * 0.9;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
    refresh();
  }, [refresh]);

  return (
    <motion.div
      initial={{ y: "100%", opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: "100%", opacity: 0 }}
      transition={M.SPRING.SHEET}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.5) 55%, transparent 100%)",
        zIndex: 6,
        padding: `40px 24px calc(30px + env(safe-area-inset-bottom, 0px))`,
        display: "flex",
        alignItems: "center",
      }}
    >
      {canScrollLeft && <RailArrow dir="left" onClick={() => scroll("left")} />}
      {canScrollRight && <RailArrow dir="right" onClick={() => scroll("right")} />}
      
      <div 
        ref={railRef}
        style={{ 
          display: "flex", 
          // Explicit: the cards must share one height, and `stretch` is what
          // guarantees that when a card's own content is shorter than its
          // neighbour's (an unreleased episode has no synopsis).
          alignItems: "stretch",
          overflowX: "auto", 
          gap: 16, 
          // Top padding as well as bottom, and it is load-bearing: `overflow-x`
          // forces the block axis to `auto` too, so this element CLIPS its
          // children vertically. With no top padding the current episode's red
          // ring â€” which is an outer box-shadow â€” had its top edge sliced off.
          // It also gives the hover lift somewhere to go.
          padding: "8px 0",
          scrollbarWidth: "none",
          width: "100%",
          WebkitOverflowScrolling: "touch"
        }}
      >
        {episodes.map((ep) => {
          const isCurrent = ep.number === episode;
          // Same "is it aired yet" rule the details page uses. An episode that
          // has not aired carries no still, no runtime and no synopsis, and
          // clicking it used to send the player off to resolve a source that
          // does not exist and land on the fatal banner.
          const aired = isEpAired(ep);
          return (
          <button
            key={ep.number}
            type="button"
            // The selected episode was only marked by a red outline; assistive
            // tech had no idea which one was playing.
            aria-current={isCurrent ? "true" : undefined}
            // Deliberately not `disabled`: a disabled button is unfocusable, so
            // a keyboard or screen-reader user could never discover the card or
            // find out why it will not play. Same call as the details page.
            aria-disabled={aired ? undefined : "true"}
            className="np-episode-card"
            onClick={() => {
              if (!aired) return;
              setResumeOffer(null);
              setPanel(null);
              setBuffering(true);
              onSelectEpisode?.(ep.number);
            }}
            style={{
              flex: "0 0 auto",
              width: IS_TOUCH ? 220 : 260,
              display: "flex",
              flexDirection: "column",
              textAlign: "left",
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: aired ? "pointer" : "default",
              // Dimming is CSS-driven (`.np-episode-card` + :hover/:focus-visible);
              // this used to be flipped by writing style.opacity straight from
              // onMouseOver/onMouseOut, which fought React's own style updates.
              opacity: isCurrent ? 1 : aired ? 0.62 : 0.4,
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                aspectRatio: "16/9",
                flexShrink: 0,
                backgroundColor: "#18181b",
                borderRadius: 8,
                overflow: "hidden",
                marginBottom: 10,
                boxShadow: isCurrent ? "0 0 0 2px #E50914" : "none",
              }}
            >
              {ep.thumbnailUrl ? (
                <img
                  src={ep.thumbnailUrl}
                  alt=""
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    // An unaired episode's still is a placeholder anyway; the
                    // greyscale is what makes the state readable at a glance.
                    filter: aired ? "none" : "grayscale(0.85) brightness(0.6)",
                  }}
                />
              ) : (
                /* No still yet: a bare Play glyph advertised an action the card
                   can't take. Numbered plate instead, like the details page. */
                <div
                  aria-hidden="true"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 4,
                    width: "100%",
                    height: "100%",
                    color: "rgba(255,255,255,0.28)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 26,
                      fontWeight: 800,
                      lineHeight: 1,
                      color: "rgba(255,255,255,0.5)",
                      fontFamily: "monospace",
                    }}
                  >
                    {String(ep.number).padStart(2, "0")}
                  </span>
                  <Play size={16} />
                </div>
              )}
              {isCurrent && (
                <div style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#fff", fontWeight: 700, fontSize: 13, background: "#E50914", padding: "4px 8px", borderRadius: 4 }}>
                    Now Playing
                  </span>
                </div>
              )}
              {!aired && (
                /* "Airs Thu, Sep 9" where the details page shows its green chip,
                   so an unaired episode looks the same on both surfaces. */
                <span
                  style={{
                    position: "absolute",
                    bottom: 0,
                    left: 0,
                    right: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    background: "#3c8217",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    lineHeight: 1.45,
                    padding: "4px 8px",
                  }}
                >
                  <Calendar size={11} strokeWidth={2} aria-hidden="true" />
                  {formatAirsDate(ep.airDate)}
                </span>
              )}
              {aired && ep.durationMins ? (
                <span style={{ position: "absolute", bottom: 6, right: 6, background: "rgba(9,9,11,0.85)", color: "#fff", fontSize: 11, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>
                  {ep.durationMins}m
                </span>
              ) : null}
            </div>
            <div
              style={{
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                // Pinned so a two-line title can never push the block below it
                // out of alignment with its neighbours.
                lineHeight: "20px",
                height: 20,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {ep.number}. {ep.title || `Episode ${ep.number}`}
            </div>
            {/* Fixed two-line slot. An unaired episode has no synopsis, and
                leaving this block at its natural 0px height is what made the
                rail ragged â€” every such card ended higher than the rest. */}
            <div
              style={{
                color: "#a1a1aa",
                fontSize: 12,
                lineHeight: 1.4,
                marginTop: 4,
                minHeight: 34,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                fontStyle: aired ? "normal" : "italic",
              }}
            >
              {ep.description || (aired ? "No synopsis available" : `Airs ${formatAirsDate(ep.airDate)}`)}
            </div>
          </button>
          );
        })}
      </div>
      
      <button
        type="button"
        className="np-icon-btn"
        aria-label="Close episodes"
        onClick={() => setPanel(null)}
        style={{
          position: "absolute",
          top: 8,
          right: 24,
          background: "rgba(0,0,0,0.5)",
          border: "none",
          borderRadius: "50%",
          width: 32,
          height: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          cursor: "pointer",
          zIndex: 7
        }}
      >
        <X size={18} />
      </button>
    </motion.div>
  );
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
  /* The motion vocabulary, already checked against the viewer's OS preference.
     Every `SPRING.*` / `PILL_IN` / `CHECK_POP` below reads `M`, not the raw
     constants, so the reduced-motion contract in constants/motion.js is enforced
     here rather than merely documented. */
  const M = useMotionTokens(useReducedMotion());
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
  /* Vidrack's own player in an iframe, used only when every native source came
     up empty. vidrack refuses Vercel's egress, so the embed is currently the
     only route that can play Server 1 in production; see src/api/vidcoreEmbed.js
     for the reachability evidence and the trade-off. Null = native player. */
  const [embedUrl, setEmbedUrl] = useState(null);
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
  // like NHD/ZXC-milkyway) the source is NOT in ABR auto — Auto just replays the
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
  // Persistent subtitle failure line for the subs pane. The `say()` announcer
  // is a no-op stub, so without this a refused download (Cloudflare relay
  // without the UA injection) or an unreadable file fails SILENTLY: the pick
  // flips back to Off with no visible reason. This state keeps the reason on
  // screen until the next pick or title change.
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
      // Autoplay policy â€” the big custom button stays visible for a tap.
    }
    // YouTube-style centre flash for the NEW state. After `await`, `video.paused`
    // is settled either way (play resolved or pause is sync); a rejected play
    // lands here still paused, so "play" never flashes for a failed start.
    showHudRef.current(video.paused ? "pause" : "play");
  };
  togglePlayRef.current = togglePlay;

  const seekTo = (value) => {
    const video = videoRef.current;
    if (!video) return;
    setEnded(false);
    try {
      video.currentTime = Number(value) || 0;
    } catch {
      // live-edge clamp â€” ignore out-of-range seeks
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
    setScrubHover(ratio);
    // No seek per pointermove: the bar tracks the drag and the seek commits once on
    // release â€” seeking on every move makes hls.js cancel in-flight fragments.
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
      // live-edge clamp â€” start where the stream begins
    }
    if (video.paused) {
      video.play().catch(() => {
        // autoplay policy â€” the big custom play button stays available
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
        // autoplay policy â€” the big custom play button stays available
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
    // blocked (or the user pauses mid-card) the ticks freeze and no seek fires â€”
    // seeking into a paused player would flash "Resumingâ€¦" and vanish. Tapping play
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
    // Any interaction also resets the "Still watching?" idle window.
    if (swIdleRef.current) clearTimeout(swIdleRef.current);
    if (stillWatchingRef.current) {
      stillWatchingRef.current = false;
      setStillWatching(false);
    }
    if (videoRef.current && !videoRef.current.paused) {
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
        const v = videoRef.current;
        if (!v || d?.seekTime == null) return;
        try {
          v.currentTime = d.seekTime;
        } catch {
          // out-of-range seek â€” clamp handled by the element itself
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
    window.addEventListener("keyup", onKeyUp);
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
      /* A new resolve attempt leaves the vidrack embed behind — picking another
         server or another episode must get the native player back. */
      setEmbedUrl(null);
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
        say(`Trying ${def.label}â€¦`);
        let resolved = null;
        try {
          // Warm-resolve handover (PLAN.md P0.4): the details page may have
          // pre-minted the default server's token while the viewer read the
          // synopsis — consume it instead of re-paying the resolve leg. The
          // handover is one-shot and refuses any non-default server pick (a
          // manual pick must resolve THAT server, not a VidCore warm token).
          const warm = takeWarmResolve(args, { sourceKey: requestedServerRef.current });
          resolved = warm || (await def.resolve(args, { signal: controller.signal }));
          if (warm) say(`${def.label}: warm token ready — skipping resolve.`);
        } catch (error) {
          say(`${def.label}: resolve failed (${error?.code || error?.message}) â€” next source.`);
          if (error?.code === "no-source") return "off";
          return false;
        }
        let variants = resolved?.variants || [];
        if (variants.length === 0) {
          // Empty is not terminal: the catalogue returns empty lists when rate-flaky.
          say(`${def.label}: no variants (maybe rate-flaky) â€” retrying/moving on.`);
          return false;
        }
        // Sibling-URL dubs ride OUTSIDE the ladder (resolved.audioTracks); variants
        // above is rewritten by the token-refresh path, so the dub list keeps the
        // FIRST resolution's â€” sibling URLs never refresh tokens anyway.
        const dubTracks = Array.isArray(resolved?.audioTracks) ? resolved.audioTracks : [];
        if (dubTracks.length > 1) {
          say(`${def.label}: ${dubTracks.length} dub audio track(s) available.`);
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
            say(`${def.label}: no playable URL â€” next source.`);
            return false;
          }
          say(
            `${def.label}: ${variants.length} variant(s), loading ` +
              (isMaster ? "master (ABR auto)â€¦" : `${smoothStart?.height || "?"}p (smooth start)â€¦`),
          );
          // Playability gate: prove one real media byte flows before hls.js sees the
          // source, or a perfect ladder over dead segments plays as a black screen.
          say(`${def.label}: probing one media byteâ€¦`);
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
            say(`${def.label}: segments unreachable (${probe.reason}) â€” next source.`);
            return false;
          }
          say(`${def.label}: segments flow via ${probe.via}.`);
          setTransportRelay(probe?.via === "relay");
          // Relay delivery is latency-bound (fresh serverless round trip per chunk), so
          // a relay start reopens at the tallest â‰¤720p; the direct path keeps â‰¤1080p.
          if (!isMaster && probe.via === "relay" && (smoothStart?.height || 0) > 720) {
            const relayFriendly = variants
              .filter((v) => (v.height || 0) > 0 && (v.height || 0) <= 720)
              .sort((a, b) => (b.height || 0) - (a.height || 0))[0];
            if (relayFriendly && relayFriendly.uri !== smoothStart?.uri) {
              say(`${def.label}: relay path â€” smooth-starting at ${relayFriendly.height || "?"}p (â‰¤720p)â€¦`);
              smoothStart = relayFriendly;
              entryUrl = entryUrlFor(def, { source: liveSource }, smoothStart);
              // A per-quality source whose variant lacks a uri must not reach
              // hls.loadSource(undefined) â€” that surfaced as ?url=undefined at
              // the worker (500 + CORS noise) instead of a clean failover.
              if (!entryUrl) {
                say(`${def.label}: no playable URL after relay re-route â€” next source.`);
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
            Math.max(MIN_BUFFER_SIZE, Math.ceil((topBps / 8) * BUFFER_DEPTH_SECONDS)),
          );
          const bufferDepthSecs = Math.round(Math.floor(maxBufferSize / Math.max(1, topBps / 8)));
          say(`Buffer: up to ~${bufferDepthSecs}s (~${Math.round(maxBufferSize / 1024 / 1024)}MB) ahead.`);
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
            maxBufferLength: BUFFER_DEPTH_SECONDS,
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
            say(`${def.label}: fatal ${lastFatalDetail} â€” next source.`);
            // Logs name the PROVIDER, not the generic row: "Server 4" in a
            // console tells you nothing, `zxc-centaurus` tells you which
            // backend to go debug. The viewer-facing `say` keeps the generic name.
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
                  say(`${def.label}: downshifting to level ${autoRung - 1} (${data.details})â€¦`);
                                  } else if (consecFragFails >= MAX_CONSECUTIVE_FRAG_FAILURES) {
                  reportFatal({ ...data, fatal: true, details: `${data.details} (Ã—${consecFragFails} consecutive â€” giving up)` });
                  failOver();
                } else {
                  say(`${def.label}: segment retry ${consecFragFails} (${data.details})â€¦`);
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
            say(`${def.label}: ${error?.message || "load failed"} â€” next source.`);
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
          /* VIDRACK ladder upgrade (Server 1): the fast resolve often ships
             vidzen's short ladder (800p ceiling) while the vidrack aggregate —
             the 4K-capable multi-provider one — is still walking its upstreams
             (13-25s server-side). `upgradeable` marks exactly that case, so a
             background full-pass resolve swaps the quality rows in place when
             it lands. Playback is NEVER interrupted: rows carry their own
             absolute URIs, so picking one goes through the normal probe +
             loadSource switch. Rows are marked `external` so pickQuality
             skips the in-manifest level shortcut — the upgraded master is a
             DIFFERENT playlist than the one hls.js currently holds. */
          if (def.key === "vidcore" && resolved?.upgradeable && !stale()) {
            def
              .resolve(args, { signal: controller.signal, phase: "full" })
              .then((up) => {
                if (stale() || !up?.variants?.length || !up?.source?.url) return;
                if (up.source.url === resolved.source?.url) return;
                const upgradedByLabel = new Map();
                up.variants
                  .slice()
                  .sort((a, b) => (a.height || 0) - (b.height || 0))
                  .forEach((v) => {
                    const label = qualityLabelFor(v);
                    const prev = upgradedByLabel.get(label);
                    if (
                      !prev ||
                      (v.height || 0) > (prev.height || 0) ||
                      ((v.height || 0) === (prev.height || 0) && (v.bandwidth || 0) > (prev.bandwidth || 0))
                    ) {
                      upgradedByLabel.set(label, {
                        uri: v.uri,
                        height: v.height || 0,
                        label,
                        bandwidth: v.bandwidth || 0,
                        external: true,
                      });
                    }
                  });
                // Merge, not replace: the current ladder's rows stay usable
                // while their tokens live, and the viewer's active row never
                // vanishes from under the highlight.
                setQualities((prevRows) => {
                  const merged = new Map(prevRows.map((q) => [q.label, q]));
                  for (const q of upgradedByLabel.values()) merged.set(q.label, q);
                  return Array.from(merged.values());
                });
                metaRef.current = {
                  ...metaRef.current,
                  refUrl: up.source?.refUrl || metaRef.current?.refUrl,
                  upgradedVariants: up.variants,
                };
                say(
                  `${def.label}: upgraded ladder available (` +
                    Array.from(upgradedByLabel.values()).map((q) => q.label).join(", ") +
                    ").",
                );
              })
              .catch(() => {
                // No upgrade is a fine outcome — the fast ladder plays on.
              });
          }
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
              say("Autoplay blocked â€” tap the custom play button.");
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
            say(`${def.label}: dubbed audio token expired â€” falling back to the original track.`);
            activeDubRef.current = 0;
            setActiveDub(0);
          }
          if (attempt === 0 && isAuthFatal(lastFatalDetail) && !stale()) {
            const savedT = videoRef.current?.currentTime || 0;
            say(`${def.label}: token may have expired â€” re-resolvingâ€¦`);
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
              say(`${def.label}: fresh tokens minted â€” resumingâ€¦`);
              continue;
            }
            say(`${def.label}: re-resolve failed â€” next source.`);
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
            say(`${def.label}: transient failure â€” auto-retry ${retry}/${SOURCE_RETRIES}â€¦`);
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

      /* Every native source came up empty. Before declaring the title unplayable,
         hand off to vidrack's own player in an iframe: the resolver needs
         Vercel egress to vidcore.io, which vidrack refuses, so the embed is the
         one path that still plays Server 1. It is a fallback — a native resolve
         that succeeds never reaches here. */
      const embed = vidcoreEmbedUrl({
        type,
        id,
        season,
        episode,
      });
      if (embed && shouldOfferVidcoreEmbed({ requestedServerKey: requestedServerRef.current })) {
        logDebug("playback", "no native source resolved; falling back to the vidrack embed", { embed });
        setEmbedUrl(embed);
        setStatus("playing via Server 1");
        say("No native source resolved — using the provider's own player.");
        return;
      }

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
      say("Quality is fixed while dubbed audio plays (this source serves one rung per dub).");
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
    if (!opts.dubSwitch) say(`Switching to ${height || "?"}pâ€¦`);
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
        say(`Level -> ${hls.levels[best]?.height || "?"}p (pinned).`);
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
          const what = opts.dubSwitch ? "That audio track" : `Quality ${height || "?"}p`;
          say(`${what}: target unreachable (${warm.reason || "probe failed"}) â€” keeping current.`);
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
        say(`${opts.dubSwitch ? "That audio track" : `Quality ${height || "?"}p`}: no URL â€” keeping current.`);
        setBuffering(false);
        setControlsVisible(true);
        return;
      }
      if (chosenUri === activeUri) {
        if (!opts.dubSwitch) say(`Already playing ${chosenHeight || "?"}p â€” no reload.`);
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
          // user gesture needed â€” custom transport is present
        }
      }
      setActiveUri(chosenUri);
      // A dub switch has no quality to report â€” pickDub already announced the
      // track it is moving to, so don't overwrite it with "?p".
      if (!opts.dubSwitch) say(`Switched to ${chosenHeight || "?"}p.`);
      // Real frames again. The loader's own success path clears this too, but a
      // direct hls.loadSource() swap (quality/dub) never goes through that path,
      // so without this the art stage would sit on top of working video.
      setStageWhileLoading(false);
      setSwitchingNote(null);
    } catch (error) {
      say(`Switch failed: ${error?.message || "unknown"}.`);
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
    say(`Switching to ${def?.label || "that"} serverâ€¦`);
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
      say(`Buffer holds <${BUFFER_FLOOR_SECONDS}s â€” stepping down to ${target.height || "?"}p so it refills (keeps playing).`);
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
    /* Announce the NORMALISED name ("Tamil"), not the provider's raw string
       ("Tamil Dub"): the toast and the Audio panel are read in the same breath,
       and a name changing between the two looks like it switched to something
       else. Resolved by sourceIndex because rows can be dropped. */
    const spokenLabel =
      audioTrackList.find((r) => r.sourceIndex === index - 1)?.label ||
      originalTrackLabel(originalLanguage);
    const meta = metaRef.current;
    const targetUri =
      index === 0 ? meta?.variants?.[0]?.uri || meta?.entryUrl : target.uri;
    if (!targetUri) return;
    poke();
    say(index === 0 ? `Audio -> ${spokenLabel}…` : `Audio -> ${spokenLabel}…`);
    // Prove the target manifest flows BEFORE committing the pick â€” NHD tokens are
    // time-scoped, and a dead dub must not end up highlighted with the previous
    // audio still playing. (The same gate pickQuality applies to quality rungs.)
    try {
      const probe = await probeSourcePlayable(targetUri, meta?.refUrl);
      if (!probe.ok) {
        say(
          index === 0
            ? `Original audio is unreachable right now (${probe.reason}) â€” keeping current audio.`
            : `${spokenLabel}: unreachable right now (${probe.reason}) â€” keeping current audio.`,
        );
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
          // keeps the actionable half on screen (say() is a no-op stub).
          setSubtitleError(
            "Subtitle download failed â€” try another language. If every language fails, the Cloudflare relay is serving without the OpenSubtitles update (redeploy the worker snippet from .env.example).",
          );
          say("Subtitle download failed â€” try another language.");
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
          say("This subtitle file had no readable lines â€” pick another language.");
        }
        return;
      }
      const engine = subtitleEngineRef.current || (subtitleEngineRef.current = new SubtitleEngine());
      engine.setCues(cues);
      if (token === subtitleTokenRef.current) {
        const cue = engine.getActiveCue(videoRef.current?.currentTime || 0);
        applySubtitleCue(cue?.text || null);
        setSubtitleError(null);
        say(`Subtitles -> ${entry.language} (${cues.length} lines).`);
      }
    } catch {
      if (token === subtitleTokenRef.current) {
        subtitleEnabledRef.current = false;
        setSubtitleEnabled(false);
        setCurrentSubtitle(null);
        setSubtitleError("Subtitle download failed â€” try another language.");
        say("Subtitle download failed â€” try another language.");
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
    say("Quality -> Auto (adjusts with your connection).");
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

  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
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
  const cueIntroEnd = cueBoundaries?.introEndSeconds ?? 0;
  const cueCreditsStart = cueBoundaries?.creditsStartSeconds ?? null;
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
  }, [type, id]);

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

  const skipIntroTarget = getSkipIntroTarget({
    type,
    id,
    season,
    episode,
    duration: safeDuration,
    cueIntroEnd,
  });
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
  const showSkipOutro = shouldShowSkipOutro({
    type,
    duration: safeDuration,
    currentTime,
    ended,
    cueCreditsStart,
  });

  // Auto-skip fires once per playback, and only while the head is still inside
  // the intro, so the viewer is never yanked before the opening has played.
  const autoSkipFiredRef = useRef(false);
  useEffect(() => {
    if (!autoSkipIntro) {
      autoSkipFiredRef.current = false;
      return;
    }
    if (autoSkipFiredRef.current) return;
    if (!shouldAutoSkipIntroOnce({ type, id, season, episode, duration: safeDuration, currentTime, firedRef: autoSkipFiredRef, cueIntroEnd })) return;
    autoSkipFiredRef.current = true;
    const v = videoRef.current;
    if (!v || skipIntroTarget <= 0) return;
    try {
      v.currentTime = skipIntroTarget;
    } catch {
    }
  }, [autoSkipIntro, type, id, season, episode, safeDuration, currentTime, skipIntroTarget, cueIntroEnd]);

  const doSeekPast = (target) => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.currentTime = target;
    } catch {
    }
    poke();
    try {
      v.play();
    } catch {
      // user gesture needed â€” custom transport is present
    }
  };
  const doSkipIntro = () => doSeekPast(skipIntroTarget);
  const doSkipOutro = () => doSeekPast(skipOutroTarget);

  return (
    // reducedMotion="user" makes every framer-motion transition in this tree
    // (HUD pops, sheet slide, spinner fade, resume/up-next cards) collapse to an
    // instant cut when the OS asks for less motion. The player.css media query
    // covers the pure-CSS half of the same animations.
    <MotionConfig reducedMotion="user">
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
        }}
      >
        {/*
          Vidrack's own player, shown only when every native source came up
          empty (see src/api/vidcoreEmbed.js). It is absolutely positioned over
          the <video> rather than replacing it, so the rest of this tree - the
          overlay, HUDs and close affordances - keeps working untouched. The
          embed brings its own transport controls.
        */}
        {embedUrl && (
          <iframe
            key={embedUrl}
            src={embedUrl}
            title={`${title || "Title"} - Server 1`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="origin"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
              background: "#000",
              zIndex: 2,
            }}
          />
        )}
        <video
          ref={videoRef}
          playsInline
          style={{ visibility: embedUrl ? "hidden" : "visible" }}
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
        <AnimatePresence mode="wait">
          {activeSubtitle ? (
            <motion.div
              // Keyed on the cue text so a new line cross-fades in instead of
              // the old one vanishing mid-read.
              key={activeSubtitle}
              className="np-subtitle"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              style={{
                position: "absolute",
                left: "6%",
                right: "6%",
                // Clears the visible bottom chrome (~140px on desktop) so a cue
                // never sits under the transport row; when the chrome is hidden
                // the caption drops back to a cinematic offset.
                bottom: controlsVisible ? 132 : 64,
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
              <span>{activeSubtitle}</span>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {/* Top bar: back + debug toggle. */}
        <motion.div
          initial={false}
          animate={{
            opacity: controlsVisible ? 1 : 0,
            y: controlsVisible ? 0 : -20
          }}
          transition={M.SPRING.SHEET}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: `${SAFE_TOP} 24px 44px`,
            // The top bar holds a back button and a title only. The old scrim
            // (0.80 â†’ 0 over 52px of dead space) read as a heavy black band over
            // the frame; 0.55 fading out faster keeps the text legible without
            // painting the top third of the picture.
            background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.22) 45%, rgba(0,0,0,0) 100%)",
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
        </motion.div>
        {/* Netflix-style Skip Intro pill: bottom-right, above the transport row,
            present only inside the intro window, seeks just past the credits.
            Stays tappable even with the chrome hidden (Netflix keeps it while
            the intro plays) â€” but yields to any open panel. */}
        <AnimatePresence>
          {showSkipIntro && !sheetOpen && (
            <motion.button
              key="np-skip"
              type="button"
              className="np-skip-intro"
              onClick={doSkipIntro}
              aria-label="Skip the opening credits"
              title="Stop the intro, come right back in"
              // Enters from the right edge it lives on, so the eye is pulled
              // away from the picture toward the action.
              {...M.PILL_IN}
              whileTap={{ scale: 0.97 }}
              style={{
                position: "absolute",
                bottom: `calc(${SAFE_BOTTOM} + 96px)`,
                right: 24,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                background: "rgba(24,24,27,0.72)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.24)",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 16,
                cursor: "pointer",
                zIndex: 5,
              }}
            >
              <SkipForward size={16} />
              Skip Intro
            </motion.button>
          )}
        </AnimatePresence>
        {/* Skip Credits. Only ever a button â€” a wrong tail guess must never
            auto-jump the viewer, so `shouldShowSkipOutro` has no auto path. */}
        <AnimatePresence>
          {showSkipOutro && !sheetOpen && !showSkipIntro && (
            <motion.button
              key="np-skip-outro"
              type="button"
              className="np-skip-intro"
              onClick={doSkipOutro}
              aria-label="Skip the ending credits"
              title="Jump to the end"
              {...M.PILL_IN}
              whileTap={{ scale: 0.97 }}
              style={{
                position: "absolute",
                bottom: `calc(${SAFE_BOTTOM} + 96px)`,
                right: 24,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 20px",
                background: "rgba(24,24,27,0.72)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.24)",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 16,
                cursor: "pointer",
                zIndex: 5,
              }}
            >
              <SkipForward size={16} />
              Skip Credits
            </motion.button>
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
        <AnimatePresence>
          {showStage && (
            <motion.div
              key="np-stage"
              role="status"
              aria-label="Loading video"
              aria-live="polite"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              style={{ position: "absolute", inset: 0, zIndex: 3 }}
            >
              <LoadingStage
                title={displayTitle}
                backdropUrl={backdropUrl}
                posterUrl={posterUrl}
                message={stageNote}
              />
            </motion.div>
          )}
        </AnimatePresence>
        {/* Warm stall: the picture stays, only a ring appears. */}
        <AnimatePresence>
          {spinner && !showStage && (
            <motion.div
              key="np-spinner"
              role="status"
              aria-label="Loading video"
              aria-live="polite"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "none",
                zIndex: 3,
              }}
            >
              <motion.span
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
                transition={M.SPRING.SHEET}
                style={{ display: "flex", lineHeight: 0 }}
              >
              <RingSpinner size={56} />
              </motion.span>
              <div
                style={{
                  marginTop: 32,
                  textAlign: "center",
                  textShadow: "0 2px 8px rgba(0,0,0,0.9)",
                }}
              >
                <LoadingMessage title={displayTitle} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {!buffering && !ended && !playing && status === "playing" && (
          <motion.div
            initial={false}
            animate={{ opacity: controlsVisible ? 1 : 0, scale: controlsVisible ? 1 : 0.9 }}
            transition={M.SPRING.SHEET}
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
              className="np-icon-btn np-center-btn"
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
                border: "none",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "auto",
              }}
            >
              <ChevronLeft size={34} strokeWidth={1.5} style={CENTER_GLYPH_SHADOW} />
            </button>
            <button
              type="button"
              className="np-icon-btn np-center-btn"
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
                transition: "transform 0.16s cubic-bezier(0.2, 0.8, 0.2, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.06)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              {/* Bias the triangle optically: a centred Play glyph reads as
                  slightly left-heavy against the circle. */}
              <Play size={40} fill="currentColor" style={{ transform: "translateX(2px)" }} />
            </button>
            <button
              type="button"
              className="np-icon-btn np-center-btn"
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
                border: "none",
                background: "transparent",
                color: "#fff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "auto",
              }}
            >
              <ChevronRight size={34} strokeWidth={1.5} style={CENTER_GLYPH_SHADOW} />
            </button>
          </motion.div>
        )}
        {/* Transient "Tap to unmute" pill (Netflix web) â€” only when playback
            had to start muted because the autoplay-policy blocked sound. Yields
            to an open panel for the same reason the skip pill does. */}
        <AnimatePresence>
          {autoMuted && playing && !sheetOpen && (
            <motion.button
              key="np-automute"
              type="button"
              initial={{ opacity: 0, y: 14, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              transition={M.SPRING.LIFT}
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
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
            >
              <VolumeX size={16} color="#E50914" />
              Tap to unmute
            </motion.button>
          )}
        </AnimatePresence>
        {!buffering && ended && (
          <motion.button
            type="button"
            className="np-replay"
            onClick={replay}
            aria-label="Watch again"
            title="Watch again"
            // Netflix draws a hairline ring that blooms out once when the end
            // card lands, so the eye is pulled to the only action on screen.
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: [0.7, 1.08, 1] }}
            transition={{
              opacity: { duration: 0.2 },
              scale: M.SPRING.PRESS,
            }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: 84,
              height: 84,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.24)",
              background: "rgba(24,24,27,0.6)",
              backdropFilter: "blur(14px)",
              WebkitBackdropFilter: "blur(14px)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 3,
            }}
          >
            <RotateCcw size={38} />
          </motion.button>
        )}
        {/* Bottom chrome: title, scrubber, transport row. */}
        {/* Hidden while the vidrack embed is up: the scrubber and transport row
            drive OUR video element, which the embed covers, so leaving them
            visible would give the viewer controls that do nothing. The top bar
            stays, so the close/back button is never stranded. */}
        <motion.div
          initial={false}
          animate={{
            opacity: !embedUrl && controlsVisible ? 1 : 0,
            y: !embedUrl && controlsVisible ? 0 : 20
          }}
          transition={M.SPRING.SHEET}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingTop: IS_TOUCH ? 4 : 8,
            paddingLeft: IS_TOUCH ? 12 : 24,
            paddingRight: IS_TOUCH ? 12 : 24,
            paddingBottom: SAFE_BOTTOM,
            // Softer than the 0.95/0.7 it replaced: the controls already carry
            // their own shadows, so a full-strength scrim only hid the picture.
            background: "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0) 100%)",
            pointerEvents: !embedUrl && controlsVisible ? "auto" : "none",
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
            {/* On touch the transport row stays one line â€” the clock lives in
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
          {/* Scrubber: red played Â· gray buffered Â· hover knob + time bubble. */}
          <div
            ref={scrubRef}
            className="np-scrub"
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.floor(safeDuration)}
            aria-valuenow={Math.floor(currentTime)}
            aria-valuetext={`${fmtTime(currentTime)} of ${fmtTime(safeDuration)}`}
            onKeyDown={onScrubKeyDown}
            onFocus={() => poke()}
            onPointerDown={onScrubDown}
            onPointerMove={onScrubMove}
            onPointerUp={onScrubUp}
            onPointerCancel={onScrubCancel}
            onPointerLeave={onScrubLeave}
            style={{
              position: "relative",
              // 44px hit target on touch (Apple HIG minimum) â€” the visual bar
              // stays thin, only the touchable band grows.
              height: IS_TOUCH ? 44 : 36,
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
            {/* Hover/drag thumbnail (Netflix/YouTube scrub preview): the latest
                captured frame at the hover position, clamped so it never leaves
                the frame. Hidden until a capture lands; scrubbing never waits
                on it. */}
            {hoverRatio != null && previewUrl && (
              <div
                style={{
                  position: "absolute",
                  bottom: previewBox.lift,
                  // Centre on the pointer, clamped so the card never leaves the frame.
                  left: Math.min(
                    Math.max(hoverRatio * playerW, previewBox.thumbInset),
                    Math.max(previewBox.thumbInset, playerW - previewBox.thumbInset),
                  ),
                  transform: "translateX(-50%)",
                  width: previewBox.thumbW,
                  height: previewBox.thumbH,
                  borderRadius: 6,
                  border: "1px solid rgba(255,255,255,0.35)",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.65)",
                  overflow: "hidden",
                  pointerEvents: "none",
                  zIndex: 4,
                  background: "#000",
                }}
              >
                <img
                  src={previewUrl}
                  alt=""
                  aria-hidden="true"
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>
            )}
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
                    className="np-icon-btn"
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
                    <ChevronLeft size={24} strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    className="np-icon-btn"
                    aria-label="Forward 10 seconds (hold for 2x)"
                    title="Forward 10 seconds (hold for 2x)"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (e.pointerType === "touch") return; // touch holds the SCREEN, not the button
                      // Arm 2x on a sustained press; the click still fires on a
                      // quick press, so a hold both seeks AND speeds up (YouTube).
                      desktopHoldTimerRef.current = setTimeout(() => {
                        desktopHoldTimerRef.current = null;
                        desktopHoldFiredRef.current = true;
                        engageHold2x();
                      }, HOLD_2X_DELAY_MS);
                    }}
                    onPointerUp={desktopHoldRelease}
                    onPointerLeave={desktopHoldRelease}
                    onPointerCancel={desktopHoldRelease}
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
                    <ChevronRight size={24} strokeWidth={1.5} />
                  </button>
                </>
              )}
              {/* Volume cluster. The slider used to open on hover alone, which
                  made it unreachable by keyboard and a no-show on touch â€”
                  `volHover` now also tracks focus, and the blur handler ignores
                  focus moving from the mute button into the slider itself. */}
              <span
                onMouseEnter={() => setVolHover(true)}
                onMouseLeave={() => setVolHover(false)}
                onFocus={() => setVolHover(true)}
                onBlur={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget)) return;
                  setVolHover(false);
                }}
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
                  expanded={panel === "episodes"}
                  onClick={() => {
                    setPanel((p) => (p === "episodes" ? null : "episodes"));
                    poke();
                  }}
                >
                  <ListVideo size={24} />
                </IconBtn>
              )}
              {/* Audio + Subtitles live HERE, not only in the gear sheet. A
                  viewer who wants the Tamil track should not have to guess which
                  submenu of Settings holds it — these are the two controls every
                  streaming player puts in the transport row, and burying them was
                  the thing this change exists to fix.
                  Each button appears only when it has something to do: no dub on
                  a single-audio server means no Audio button, and an empty or
                  still-searching subtitle list means no Subtitles button. A
                  button that opens an empty list is worse than no button. */}
              {audioTrackList.length > 1 ? (
                <IconBtn
                  label="Audio"
                  active={panel === "audio"}
                  expanded={panel === "audio"}
                  onClick={() => {
                    setPanel((p) => (p === "audio" ? null : "audio"));
                    poke();
                  }}
                >
                  <AudioLines size={22} />
                </IconBtn>
              ) : null}
              {subtitleLanguages.length > 0 || isFetchingSubtitles || subtitleError ? (
                <IconBtn
                  label="Subtitles"
                  active={panel === "subs"}
                  expanded={panel === "subs"}
                  onClick={() => {
                    setPanel((p) => (p === "subs" ? null : "subs"));
                    poke();
                  }}
                >
                  <Captions size={22} />
                </IconBtn>
              ) : null}
              {/* Server switcher: always available â€” VidCore (4K default),
                  VidSrc and NHD (dubs) are pickable mid-playback. */}
              <IconBtn
                label="Servers"
                active={panel === "servers"}
                expanded={panel === "servers"}
                onClick={() => {
                  setPanel((p) => (p === "servers" ? null : "servers"));
                  poke();
                }}
              >
                <Server size={22} />
              </IconBtn>
              <IconBtn
                label="Settings"
                // "subs" was missing here, so opening Subtitles left the gear
                // unlit while every other panel lit it.
                active={
                  panel === "settings" ||
                  panel === "audio" ||
                  panel === "subs" ||
                  panel === "video" ||
                  panel === "speed" ||
                  panel === "aspect"
                }
                expanded={Boolean(panel && panel !== "episodes" && panel !== "servers")}
                onClick={() => {
                  // If clicking Settings while any settings panel is open, close it. Otherwise open root settings.
                  setPanel((p) =>
                    ["settings", "audio", "subs", "video", "speed", "aspect"].includes(p)
                      ? null
                      : "settings",
                  );
                  poke();
                }}
              >
                <Settings size={24} />
              </IconBtn>
              <IconBtn label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={goFullscreen}>
                {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
              </IconBtn>
            </div>
          </div>
        </motion.div>
        {/* Netflix "Left off at â€¦" resume card â€” auto-resumes after a short wait.
            Same bottom-right corner as the episodes rail, whose gradient is
            transparent at the top, so it showed through an open panel too. */}
        <AnimatePresence>
          {resumeOffer && !ended && !sheetOpen && (
            <motion.div
              key="np-resume"
              role="complementary"
              aria-label={`Resume from ${fmtTime(resumeOffer.at)}`}
              initial={{ opacity: 0, x: 28, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.98 }}
              transition={M.SPRING.SHEET}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                right: 24,
                bottom: IS_TOUCH ? 120 : 100,
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: "rgba(24,24,27,0.92)",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(18px) saturate(1.35)",
                WebkitBackdropFilter: "blur(18px) saturate(1.35)",
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
                  : "Resumingâ€¦"}
              </div>
            </div>
            <button
              type="button"
              className="np-resume-btn"
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
                borderRadius: 8,
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
              className="np-restart-btn"
              onClick={restartFromStart}
              aria-label="Restart from the beginning"
              style={{
                padding: "8px 14px",
                background: "transparent",
                color: "rgba(255,255,255,0.85)",
                border: "1px solid rgba(255,255,255,0.4)",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Restart
            </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Netflix "Up Next" post-roll card (TV only). */}
        <AnimatePresence>
          {upNext && ended && (
            <motion.div
              key="np-upnext"
              role="complementary"
              aria-label={`Up Next: playing in ${Math.round(UP_NEXT_MS / 1000)} seconds`}
              initial={{ opacity: 0, x: 28, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.98 }}
              transition={M.SPRING.SHEET}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "absolute",
                right: 24,
                bottom: IS_TOUCH ? 120 : 100,
                width: "min(260px, 55%)",
                background: "rgba(24,24,27,0.92)",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.1)",
                backdropFilter: "blur(18px) saturate(1.35)",
                WebkitBackdropFilter: "blur(18px) saturate(1.35)",
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
                {upNext.title ? `E${upNext.number} Â· ${upNext.title}` : `Episode ${upNext.number}`}
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
                  // Full width, drained by the keyframe â€” the old `width:
                  // "15000ms"` was not a length CSS understands, so the bar
                  // rendered at the track's natural 0% and never counted down.
                  className="np-upnext-countdown"
                  style={{
                    height: "100%",
                    width: "100%",
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
                className="np-resume-btn"
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
                  borderRadius: 8,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                <Play size={18} />
                Play now
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Audio & Subtitles panel. */}
        <AnimatePresence>
          {panel && panel !== "episodes" && (
            <motion.aside
              // Slides from the edge it lives on: right on desktop, up from the
              // bottom on touch (where it is a sheet, not a side pane).
              initial={IS_TOUCH ? { y: "100%" } : { x: "100%" }}
              animate={IS_TOUCH ? { y: 0 } : { x: 0 }}
              exit={IS_TOUCH ? { y: "100%" } : { x: "100%" }}
              transition={M.SPRING.SHEET}
              ref={panelRef}
              role="dialog"
              aria-label={
                panel === "settings"
                  ? "Settings"
                  : panel === "subs"
                    ? "Subtitles"
                    : panel === "audio"
                      ? "Audio"
                      : panel === "video"
                        ? "Video quality"
                        :                panel === "speed"
                  ? "Playback speed"
                    : panel === "servers"
                      ? "Servers"
                      : "Aspect ratio"
              }
              tabIndex={-1}
              onClick={(e) => e.stopPropagation()}
              className="np-panel-surface"
              style={{
                position: "absolute",
                right: 0,
                top: IS_TOUCH ? undefined : 0,
                bottom: 0,
                width:
                  ["settings", "subs", "audio", "video", "speed", "aspect"].includes(panel)
                    ? IS_TOUCH
                      ? "min(480px, 100%)"
                      : "min(480px, 32%)"
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
                // Bottom inset keeps rows clear of the Android/iOS gesture bar.
                padding: `16px 0 calc(12px + env(safe-area-inset-bottom, 0px))`,
                zIndex: 6,
                // The sheet is a side pane, not a modal: the transport row stays
                // visible and operable, so it takes focus (not a focus outline)
                // rather than a ring when focused programmatically.
                outline: "none",
              }}
            >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, padding: "0 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {panel !== "settings" && (
                  <button
                    type="button"
                    className="np-icon-btn"
                    aria-label="Back to settings"
                    onClick={() => {
                      setPanel("settings");
                      poke();
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#fff",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0
                    }}
                  >
                    <ArrowLeft size={20} />
                  </button>
                )}
                <span style={{ color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: "-0.01em" }}>
                  {panel === "settings" ? "Settings" : panel === "subs" ? "Subtitles" : panel === "audio" ? "Audio" : panel === "video" ? "Video Quality" : panel === "speed" ? "Playback Speed" : panel === "aspect" ? "Aspect Ratio" : panel === "servers" ? "Servers" : ""}
                </span>
              </div>
              <IconBtn label="Close panel" onClick={() => setPanel(null)}>
                <X size={18} />
              </IconBtn>
            </div>
            {/* One panel per control (Netflix): Subtitles / Audio / Video
                Quality each get their own sheet and their own scroll. */}
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
                  icon={<ServerCog size={20} />}
                  hasChevron
                />
                <DialogRow
                  onClick={() => setPanel("video")}
                  title="Video Quality"
                  sub={autoLevel === false ? (qualities.find(q => q.height === manualHeight)?.label || (currentHeight ? currentHeight + "p" : "Manual")) : "Auto"}
                  icon={<SlidersHorizontal size={20} />}
                  hasChevron
                />
                <DialogRow
                  onClick={() => setPanel("speed")}
                  title="Playback Speed"
                  sub={playbackRate === 1 ? "Normal" : `${playbackRate}x`}
                  icon={<Gauge size={20} />}
                  hasChevron
                />
                <DialogRow
                  onClick={() => setPanel("aspect")}
                  title="Aspect Ratio"
                  sub={ASPECT_RATIOS[aspectRatioIndex]?.name || "Fit"}
                  icon={<Proportions size={20} />}
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
            </motion.aside>
          )}
        </AnimatePresence>

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
              IS_TOUCH={IS_TOUCH}
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
      {fatal && (
        /* The old banner was a bare <p> with no role and no exit: a screen
           reader never announced the failure, and a viewer whose source failed
           had no way forward but the browser Back button. role="alert" goes on
           the MESSAGE only â€” putting it on the wrapper would make a live region
           announce "â€¦cannot run here.Try againBack" as one string. Try again
           re-runs the load effect via `reloadToken`. */
        <motion.div
          key="np-fatal"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={M.SPRING.SHEET}
          className="np-fatal"
          style={{
            position: "absolute",
            bottom: 80,
            left: 16,
            right: 16,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 16px",
            borderRadius: 12,
            background: "rgba(24,24,27,0.94)",
            border: "1px solid rgba(255,255,255,0.16)",
            fontSize: 14,
            zIndex: 7,
            color: "#fff",
            boxShadow: "0 10px 34px rgba(0,0,0,0.6)",
          }}
        >
          <span role="alert" style={{ flex: 1, minWidth: 0 }}>
            {fatal}
          </span>
          <button
            type="button"
            className="np-fatal-btn"
            onClick={retryLoad}
            style={{
              padding: "7px 14px",
              background: "#fff",
              color: "#000",
              border: "none",
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Try again
          </button>
          <button
            type="button"
            className="np-fatal-btn"
            // Not "Back": the top bar already owns a Back button, and two
            // controls with the same accessible name in one view is ambiguous
            // to get by voice or screen-reader rotor.
            aria-label="Back to browse"
            onClick={() => {
              if (onCloseRef.current) onCloseRef.current();
              else window.history.back();
            }}
            style={{
              padding: "7px 14px",
              background: "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.4)",
              borderRadius: 8,
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Back
          </button>
        </motion.div>
      )}
    </div>
    </MotionConfig>
  );
}
