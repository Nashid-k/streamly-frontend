// The player surface and overlay composition.
// Presentation only. Follows player-v4.html structure:
// - .stage for video
// - .ui overlay containing .dim, .ld, .big, .osd, .dt.l, .dt.r, .top, .bot, .sheet
import { useState, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import {
  ChromeTopBar,
  SkipPill,
  SubtitleOverlay,
  CenterStack,
  TapToUnmutePill,
  ResumeCard,
  UpNextCard,
  PlayerPanel,
  FatalBanner,
  IS_TOUCH,
  SAFE_TOP,
  SAFE_BOTTOM,
} from "../chrome";
import PlayerSvgSprite from "../chrome/PlayerSvgSprite";
import NetflixStillWatching from "../../NetflixStillWatching";
import { aspectVideoStyle } from "../../../constants/playerUi";
import { subtitleFontFamily } from "../../../constants/settings";
import { fmtTime } from "../nativePlayerHelpers";
import usePlayerV4Appearance from "../hooks/usePlayerV4Appearance";
import PlayerMenus from "./PlayerMenus";
import PlayerTransport from "./PlayerTransport";

const CHROME_TARGET_GUARD =
  "button:not(.big), [role='button']:not(.big), input, [role='slider'], .sheet, .nxt, .top, .bot, .skip-pill, .np-resume-card, [role='dialog'], [role='menu'], [role='listbox'], [role='option'], .np-mode-dropdown-wrap, .np-mode-menu, .np-mode-selector";

/* Embed mode is a cross-origin iframe (CineSrc): its DOM and playback state are
   unreadable from here, so the one failure we can honestly detect is "the frame
   never loaded". Each load attempt arms this timer; onLoad clears it. */
const EMBED_LOAD_TIMEOUT_MS = 20_000;

export default function PlayerShell({
  activeDub,
  activeSourceKey,
  activeSubtitle,
  activeUri,
  aspectRatioIndex,
  audioIndex,
  audioTrackList,
  audioTracks,
  autoLevel,
  autoplayEnabled,
  autoMuted,
  backdropUrl,
  bufferedRanges,
  buffering,
  chooseEpisode,
  controlsVisible,
  cueBoundaries,
  currentAudioLabel,
  currentHeight,
  currentSubtitle,
  currentTime,
  deadDubs,
  desktopHoldRelease,
  dismissStillWatching,
  displaySubtitle,
  displayTitle,
  doSkipIntro,
  doSkipOutro,
  dubTracks,
  effectiveRatio,
  ended,
  episode,
  episodes,
  everPlayed,
  fatal,
  goFullscreen,
  handleGestureMove,
  handleHoldEnd,
  handleVideoTouchEnd,
  hold2x,
  hoverRatio,
  scrubDragging,
  hud,
  hudBox,
  hudSeq,
  imdbId,
  isFetchingSubtitles,
  isFullscreen,
  isMasterMode,
  manualHeight,
  muted,
  onBack10,
  onCenterTogglePlay,
  onExitPlayer,
  onForward10,
  onForwardHoldStart,
  onForwardSkip,
  onPickPlaybackRate,
  onSelectSeason,
  onResumeOffer,
  onRewindSkip,
  onScrubCancel,
  onScrubDown,
  onScrubKeyDown,
  onScrubLeave,
  onScrubMove,
  onScrubUp,
  onStillWatchingContinue,
  onStillWatchingExit,
  onTogglePanel,
  onToggleSettings,
  onVideoClick,
  onVideoTouchStart,
  onVolumeChange,
  orderedSources,
  originalLanguage,
  panel,
  panelBackRef,
  panelOpener,
  panelRef,
  pickAudio,
  pickAuto,
  pickDub,
  pickQuality,
  pickServer,
  pickSourceQuality,
  pipActive,
  pipSupported,
  playbackRate,
  playing,
  poke,
  posterUrl,
  prefs,
  previewBox,
  previewUrl,
  qualities,
  qualityNote,
  replay,
  requestedServer,
  restartFromStart,
  resumeOffer,
  resumePoint,
  retryLoad,
  safeDuration,
  screenRef,
  scrubRef,
  season,
  seasonsAvailable,
  selectSubtitle,
  serverSwitchStage,
  setAspectRatioIndex,
  setAutoMuted,
  setBuffering,
  setMuted,
  setPanel,
  setResumeOffer,
  setSubtitleBg,
  setSubtitleSize,
  setUpNext,
  setVolHover,
  sheetOpen,
  showEpisodesButton,
  showSkipIntro,
  showSkipOutro,
  showStage,
  skipIntroProgress,
  skipOutroProgress,
  skipSeconds,
  sourceHeight,
  sourceVariants,
  spinner,
  stageNote,
  status,
  stillWatching,
  subtitleBg,
  subtitleEnabled,
  subtitleError,
  subtitleLanguages,
  subtitleSize,
  switchFrame,
  toggleAutoplay,
  toggleMute,
  togglePip,
  togglePlay,
  upNext,
  upNextMs,
  videoRef,
  volHover,
  volume,
  watchedEpisodes,
  // Mode selector props
  playerMode,
  embedUrl,
  embedRef,
  onToggleMode,
}) {
  // Local state for mode dropdown (PlayerShell owns this)
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);
  const v4Appearance = usePlayerV4Appearance({
    subtitleSize,
    setSubtitleSize,
    subtitleBg,
    setSubtitleBg,
    initialSubColor: prefs?.subtitleColor,
  });

  const [navDirection, setNavDirection] = useState(0);
  const panelStackRef = useRef([]);

  /* Embed load watchdog. `embedNonce` is bumped by the embed retry to force the
     iframe to reload even though its URL is unchanged; `embedTimedOut` is the
     only failure signal a cross-origin frame can give us. */
  const [embedNonce, setEmbedNonce] = useState(0);
  const [embedTimedOut, setEmbedTimedOut] = useState(false);
  const embedTimerRef = useRef(null);
  useEffect(() => {
    if (embedTimerRef.current) clearTimeout(embedTimerRef.current);
    embedTimerRef.current = null;
    if (playerMode !== "embed" || !embedUrl) {
      setEmbedTimedOut(false);
      return undefined;
    }
    setEmbedTimedOut(false);
    embedTimerRef.current = setTimeout(() => setEmbedTimedOut(true), EMBED_LOAD_TIMEOUT_MS);
    return () => {
      if (embedTimerRef.current) clearTimeout(embedTimerRef.current);
      embedTimerRef.current = null;
    };
  }, [playerMode, embedUrl, embedNonce]);
  const retryEmbed = () => {
    setEmbedTimedOut(false);
    setEmbedNonce((n) => n + 1);
  };

  useEffect(() => {
    if (!panel) {
      panelStackRef.current = [];
      setNavDirection(0);
      return;
    }
    const stack = panelStackRef.current;
    if (stack.length === 0 || !stack.includes(panel)) {
      panelStackRef.current = [panel];
      setNavDirection(0);
    }
  }, [panel]);

  // Close mode dropdown on outside click
  useEffect(() => {
    if (!modeDropdownOpen) return;
    const handleClickOutside = (e) => {
      const target = e.target;
      const el = target instanceof Element ? target : target?.parentElement;
      if (
        el?.closest?.(".np-mode-selector") ||
        el?.closest?.(".np-mode-dropdown-wrap") ||
        el?.closest?.(".np-mode-menu") ||
        el?.closest?.(".np-mode-dropdown")
      ) {
        return;
      }
      setModeDropdownOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [modeDropdownOpen]);

  const handleSetPanel = (next) => {
    if (!next) {
      panelStackRef.current = [];
      setNavDirection(0);
      setPanel(null);
      return;
    }
    if (next !== panel) {
      const stack = panelStackRef.current;
      const existingIndex = stack.indexOf(next);
      if (existingIndex !== -1) {
        setNavDirection(-1);
        panelStackRef.current = stack.slice(0, existingIndex + 1);
      } else {
        setNavDirection(1);
        panelStackRef.current = [...stack, next];
      }
      setPanel(next);
    }
  };

  const handleBack = () => {
    const stack = panelStackRef.current;
    if (stack.length > 1) {
      const newStack = stack.slice(0, -1);
      panelStackRef.current = newStack;
      const target = newStack[newStack.length - 1];
      setNavDirection(-1);
      setPanel(target);
    } else {
      panelStackRef.current = [];
      setNavDirection(-1);
      if (panelOpener === "subs") {
        setPanel(null);
      } else {
        setPanel("settings");
      }
    }
    poke();
  };
  /* Escape router for the engine's keymap: back one level while deeper than the
     root, close the sheet at the root — exactly v4's `stack.length > 1 ?
     back() : close()`. Assigned every render so the ref always carries current
     stack state; read by usePlayerKeyboard, which falls back to a plain close
     while this is still null. */
  if (panelBackRef) {
    panelBackRef.current = () => {
      if (panelStackRef.current.length > 1) handleBack();
      else {
        panelStackRef.current = [];
        setNavDirection(0);
        setPanel(null);
        poke();
      }
    };
  }
  const isInitialStage = Boolean((showStage || !everPlayed) && playerMode !== "embed");
  const isLoading = Boolean((buffering || spinner) && !isInitialStage);
  const isMuted = muted || autoMuted || volume === 0;
  // The buffered bar follows the element's real buffer: the end of the range
  // that contains the playhead, as a fraction of the duration. No containing
  // range (e.g. right after a seek) honestly means "nothing buffered here".
  let bufferedRatio = 0;
  const totalDur = Number(safeDuration);
  if (totalDur > 0 && Array.isArray(bufferedRanges)) {
    const t = Number(currentTime) || 0;
    for (const [start, end] of bufferedRanges) {
      if (start <= t && t <= end) {
        bufferedRatio = Math.min(1, end / totalDur);
        break;
      }
    }
  }

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
        onPointerDown={dismissStillWatching}
        onWheel={(e) => {
          if (panel) return;
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.05 : -0.05;
          const next = Math.min(1, Math.max(0, volume + delta));
          onVolumeChange(next);
        }}
        className={[
          "player",
          "np-root",
          !playing ? "paused" : "",
          ended ? "ended" : "",
          resumeOffer ? "resume-offer" : "",
          stillWatching ? "still-watching" : "",
          isLoading ? "loading" : "",
          !controlsVisible && playing ? "idle" : "",
          panel ? "menu" : "",
          isMuted ? "is-muted" : "",
          isFullscreen ? "is-fs" : "",
          ended && upNext ? "nxt-on" : "",
        ].filter(Boolean).join(" ")}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          background: "#000",
          overflow: "hidden",
          userSelect: "none",
          WebkitUserSelect: "none",
          touchAction: "manipulation",
          "--np-safe-top": SAFE_TOP,
          "--np-safe-bottom": SAFE_BOTTOM,
          "--accent": v4Appearance.accent,
          "--np-accent": v4Appearance.accent,
          "--accent-rgb": v4Appearance.accentRgb,
          "--np-accent-rgb": v4Appearance.accentRgb,
          "--is": v4Appearance.iconSize,
          "--cz": v4Appearance.cz,
          "--cc": v4Appearance.subColor,
          "--ease": "cubic-bezier(.22, 1, .36, 1)",
          "--spring": "cubic-bezier(.34, 1.4, .5, 1)",
        }}
        data-cb={v4Appearance.subBgStyle}
      >
        <PlayerSvgSprite />

        {/* Video Stage */}
        <div
          className="stage"
          onClick={playerMode === "embed" ? undefined : onVideoClick}
          style={{ position: "absolute", inset: 0, background: "#000" }}
        >
          <video
            ref={videoRef}
            playsInline
            onClick={onVideoClick}
            onTouchStart={onVideoTouchStart}
            onTouchMove={handleGestureMove}
            onTouchEnd={handleVideoTouchEnd}
            onTouchCancel={handleHoldEnd}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: playerMode === "embed" ? "none" : "block",
              ...aspectVideoStyle(aspectRatioIndex),
              touchAction: "manipulation",
              WebkitUserSelect: "none",
              filter: v4Appearance.brightness !== 1 ? `brightness(${v4Appearance.brightness})` : undefined,
            }}
          />
          {playerMode === "embed" ? (
            embedUrl ? (
              <iframe
                key={`${embedUrl}#${embedNonce}`}
                ref={embedRef}
                src={embedUrl}
                title="CineSrc embed player"
                onLoad={() => {
                  if (embedTimerRef.current) clearTimeout(embedTimerRef.current);
                  embedTimerRef.current = null;
                  setEmbedTimedOut(false);
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  border: "none",
                  display: "block",
                  zIndex: 1,
                }}
                allow="autoplay *; fullscreen *; picture-in-picture *; encrypted-media *"
                allowFullScreen
                referrerPolicy="origin"
              />
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "rgba(255,255,255,0.7)",
                  fontSize: 15,
                }}
              >
                This title has no playable embed.
              </div>
            )
          ) : null}
        </div>

        {/* UI Overlay */}
        <div
          className="ui"
          id="ui"
          style={{
            pointerEvents: playerMode === "embed" ? "none" : undefined,
          }}
          onTouchStart={(e) => {
            if (e.target.closest?.(CHROME_TARGET_GUARD)) {
              return;
            }
            if (panel) return;
            onVideoTouchStart(e);
          }}
          onTouchMove={(e) => {
            if (e.target.closest?.(CHROME_TARGET_GUARD)) {
              return;
            }
            if (panel) return;
            handleGestureMove(e);
          }}
          onTouchEnd={(e) => {
            if (e.target.closest?.(CHROME_TARGET_GUARD)) {
              return;
            }
            if (panel) {
              setPanel(null);
              poke();
              if (e.cancelable) e.preventDefault();
              return;
            }
            handleVideoTouchEnd(e);
          }}
          onTouchCancel={handleHoldEnd}
          onClick={(e) => {
            if (e.target.closest?.(CHROME_TARGET_GUARD)) {
              return;
            }
            if (panel) {
              setPanel(null);
              poke();
              return;
            }
            onVideoClick(e);
          }}
          /* v4 desktop double-click: the sides seek ±skip, the middle toggles
             fullscreen. Touch keeps its own gesture path; the click guard above
             already ignores chrome targets, and two rapid single clicks cancel
             each other's play toggle just like v4. */
          onDoubleClick={(e) => {
            if (IS_TOUCH || panel) return;
            if (e.target.closest?.(CHROME_TARGET_GUARD)) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / Math.max(1, rect.width);
            poke();
            if (x < 1 / 3) onRewindSkip();
            else if (x > 2 / 3) onForwardSkip();
            else goFullscreen();
          }}
        >
          {/* Dimmer for menu/panel opening */}
          <div
            className="dim"
            id="dim"
            aria-hidden="true"
            onClick={panel && playerMode !== "embed" ? () => { setPanel(null); poke(); } : undefined}
            style={{ pointerEvents: panel && playerMode !== "embed" ? "auto" : "none" }}
          />

          {/* Double-tap radial edge flash ripples matching player-v4.html */}
          <div
            key={`dt-l-${hudSeq || 0}`}
            className={["dt", "l", "dtl", playerMode !== "embed" && hud?.kind === "seek" && hud.value < 0 ? "show" : ""].filter(Boolean).join(" ")}
            id="dtl"
            aria-hidden="true"
          />
          <div
            key={`dt-r-${hudSeq || 0}`}
            className={["dt", "r", "dtr", playerMode !== "embed" && hud?.kind === "seek" && hud.value > 0 ? "show" : ""].filter(Boolean).join(" ")}
            id="dtr"
            aria-hidden="true"
          />

          {/* Player v4 Double-Arc Spinner (.ld) — hidden during initial logo image loader or embed */}
          {!isInitialStage && playerMode !== "embed" ? (
            <div className="ld" aria-hidden="true">
              <svg viewBox="0 0 100 100">
                <defs>
                  <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" style={{ stopColor: "var(--accent)" }} />
                    <stop offset="1" stopColor="#fff" />
                  </linearGradient>
                </defs>
                <circle className="lt" cx="50" cy="50" r="40" />
                <circle className="arc a1" cx="50" cy="50" r="40" pathLength="100" />
                <circle className="arc a2" cx="50" cy="50" r="28" pathLength="100" />
              </svg>
            </div>
          ) : null}

          {/* Mode selector dropdown - right side, visible above initial loader when not fullscreen */}
          {!isFullscreen && (
            <>
              {modeDropdownOpen && (
                <div
                  className="np-mode-menu-wrap"
                  style={{ pointerEvents: "auto" }}
                  onClick={() => setModeDropdownOpen(false)}
                  aria-hidden="true"
                />
              )}
              <div className="np-mode-dropdown-wrap" style={{ pointerEvents: "auto" }}>
                <button
                  type="button"
                  className="np-mode-select"
                  style={{ pointerEvents: "auto" }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setModeDropdownOpen(!modeDropdownOpen);
                  }}
                  aria-label="Player mode"
                  aria-expanded={modeDropdownOpen}
                  aria-haspopup="listbox"
                >
                  <span>{playerMode === "embed" ? "Embed" : "Streamly"}</span>
                  <svg className="np-mode-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
                {modeDropdownOpen && (
                  <div className="np-mode-menu" style={{ pointerEvents: "auto" }} role="listbox" aria-label="Player mode">
                    <button
                      type="button"
                      role="option"
                      aria-selected={playerMode === "streamly"}
                      className={playerMode === "streamly" ? "active" : ""}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleMode && onToggleMode("streamly");
                        setModeDropdownOpen(false);
                      }}
                    >
                      Streamly
                    </button>
                    <button
                      type="button"
                      role="option"
                      aria-selected={playerMode === "embed"}
                      className={playerMode === "embed" ? "active" : ""}
                      onMouseDown={(e) => e.stopPropagation()}
                      onTouchStart={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleMode && onToggleMode("embed");
                        setModeDropdownOpen(false);
                      }}
                    >
                      Embed
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Big center play button on paused state (.big) — only when paused and not loading */}
          {playerMode !== "embed" && (
          <button
            type="button"
            className="big"
            id="big"
            aria-label="Play"
            onClick={(e) => {
              if (IS_TOUCH) return;
              togglePlay(e);
            }}
          >
            <svg className="ic"><use href="#i-play" /></svg>
          </button>
          )}

          {/* On-Screen Display pill (.osd). Keyed by hudSeq so every flash
              REMOUNTS the node and its one-shot `osd` keyframe replays — a
              class that simply stays applied silently dies after the first
              900ms run (the "fast clicks show no HUD" report). */}
          <div
            key={`osd-${hudSeq || 0}`}
            className={["osd", playerMode !== "embed" && ((hud && hud.kind !== "play" && hud.kind !== "pause") || hold2x) ? "show" : "", playerMode !== "embed" && hud?.kind === "seek" ? "osd-seek" : ""].filter(Boolean).join(" ")}
            id="osd"
            aria-live="polite"
            style={{ left: hud?.kind === "seek" ? (hud.value < 0 ? "22%" : "78%") : "50%" }}
          >
            {hud?.kind === "volume" && (
              <>
                <svg className="ic"><use href={isMuted ? "#i-mute" : "#i-vol"} /></svg>
                <span>{isMuted ? "Muted" : `${Math.round(volume * 100)}%`}</span>
              </>
            )}
            {hud?.kind === "seek" && (
              <>
                <svg className="ic"><use href={hud.value < 0 ? "#i-rew" : "#i-fwd"} /></svg>
                <span>{hud.value < 0 ? `\u2212${Math.abs(Math.round(hud.value))}s` : `+${Math.round(hud.value)}s`}</span>
              </>
            )}
            {hud?.kind === "speed" && <span>{hud.value}</span>}
            {hud?.kind === "subs" && (
              <>
                <svg className="ic"><use href="#i-subs" /></svg>
                <span>{hud.value}</span>
              </>
            )}
            {hold2x && (
              <>
                <svg className="ic"><use href="#i-fwd" /></svg>
                <span>2x</span>
              </>
            )}
          </div>

          {/* Subtitle overlay (native only: the embed renders its own) */}
          {playerMode !== "embed" && (
            <SubtitleOverlay
              text={activeSubtitle}
              controlsVisible={controlsVisible}
              size={subtitleSize}
              background={subtitleBg}
              subBgStyle={v4Appearance.subBgStyle}
              fontFamily={subtitleFontFamily(prefs?.subtitleFont)}
              color={v4Appearance.subColor || prefs?.subtitleColor || "#fff"}
              scale={prefs?.subtitleSize}
            />
          )}

          {/* Top bar: back + title */}
          <ChromeTopBar
            visible={controlsVisible}
            title={displayTitle}
            subtitle={displaySubtitle}
            onBack={onExitPlayer}
          />

          {/* Skip Intro & Skip Outro pills */}
          <AnimatePresence>
            {playerMode !== "embed" && showSkipIntro && !sheetOpen && (
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
            {playerMode !== "embed" && showSkipOutro && !sheetOpen && !showSkipIntro && (
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

          {/* Center stack: cold stage art during initial load / server switch & replay */}
          {playerMode !== "embed" && (
            <CenterStack
              showStage={showStage}
              stageNote={stageNote}
              stageInitial={!everPlayed || serverSwitchStage}
              switchFrame={switchFrame}
              displayTitle={displayTitle}
              backdropUrl={backdropUrl}
              posterUrl={posterUrl}
              ended={ended}
              onReplay={replay}
            />
          )}

          <TapToUnmutePill
            visible={playerMode !== "embed" && autoMuted && playing && !sheetOpen}
            onUnmute={() => {
              setAutoMuted(false);
              setMuted(false);
              poke();
            }}
          />

          {/* Bottom chrome: scrubber + controls */}
          <PlayerTransport
            visible={controlsVisible && playerMode !== "embed"}
            scrubRef={scrubRef}
            duration={safeDuration}
            currentTime={currentTime}
            effectiveRatio={effectiveRatio}
            bufferedRatio={bufferedRatio}
            hoverRatio={hoverRatio}
            scrubDragging={scrubDragging}
            previewUrl={previewUrl}
            previewBox={previewBox}
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
            onBack10={onBack10}
            onForward10={onForward10}
            skipSeconds={skipSeconds}
            onForwardHoldStart={onForwardHoldStart}
            onForwardHoldRelease={desktopHoldRelease}
            muted={muted}
            volume={volume}
            onToggleMute={toggleMute}
            volHover={volHover}
            onVolHoverChange={setVolHover}
            onVolumeChange={onVolumeChange}
            showEpisodesButton={showEpisodesButton}
            panel={panel}
            panelOpener={panelOpener}
            onTogglePanel={onTogglePanel}
            onToggleSettings={onToggleSettings}
            showSubsButton={subtitleLanguages.length > 0 || isFetchingSubtitles || subtitleError}
            pipSupported={pipSupported}
            pipActive={pipActive}
            onTogglePip={() => {
              togglePip();
              poke();
            }}
            isFullscreen={isFullscreen}
            onFullscreen={goFullscreen}
            mode={playerMode}
            modeDropdownOpen={modeDropdownOpen}
            setModeDropdownOpen={setModeDropdownOpen}
            onToggleMode={onToggleMode}
          />

          {/* Resume offer card */}
          <ResumeCard
            offer={resumeOffer && !ended && !sheetOpen && playerMode !== "embed" ? resumeOffer : null}
            fmtTime={fmtTime}
            onResume={onResumeOffer}
            onRestart={restartFromStart}
          />

          {/* Up Next card */}
          <UpNextCard
            upNext={ended && playerMode !== "embed" ? upNext : null}
            upNextMs={upNextMs}
            onPlayNow={(n) => chooseEpisode(n)}
            onCancel={() => setUpNext(null)}
          />

          {/* Settings / audio / subs / servers / quality panel shell (native only) */}
          {playerMode !== "embed" && (
          <PlayerPanel
            panel={panel}
            panelOpener={panelOpener}
            panelRef={panelRef}
            direction={navDirection}
            onClose={() => {
              panelStackRef.current = [];
              setNavDirection(0);
              setPanel(null);
            }}
            onBackToSettings={handleBack}
            season={season}
            seasonsAvailable={seasonsAvailable}
            onChangeSeason={onSelectSeason}
            actionLabel={panel === "subs" ? "Customize" : null}
            onAction={() => {
              if (panel === "subs") {
                setNavDirection(1);
                panelStackRef.current = [...panelStackRef.current, "captions"];
                setPanel("captions");
              }
              poke();
            }}
          >
            <PlayerMenus
              panel={panel}
            panelOpener={panelOpener}
              setPanel={handleSetPanel}
              poke={poke}
              activeSourceKey={activeSourceKey}
              requestedServer={requestedServer}
              currentAudioLabel={currentAudioLabel}
              autoLevel={autoLevel}
              qualities={qualities}
              manualHeight={manualHeight}
              currentHeight={currentHeight}
              currentTime={currentTime}
              safeDuration={safeDuration}
              playbackRate={playbackRate}
              onPickPlaybackRate={onPickPlaybackRate}
              aspectRatioIndex={aspectRatioIndex}
              setAspectRatioIndex={setAspectRatioIndex}
              sourceVariants={sourceVariants}
              sourceHeight={sourceHeight}
              pickSourceQuality={pickSourceQuality}
              cueBoundaries={cueBoundaries}
              orderedSources={orderedSources}
              pickServer={pickServer}
              subtitleEnabled={subtitleEnabled}
              selectSubtitle={selectSubtitle}
              isFetchingSubtitles={isFetchingSubtitles}
              subtitleLanguages={subtitleLanguages}
              currentSubtitle={currentSubtitle}
              imdbId={imdbId}
              subtitleError={subtitleError}
              subtitleSize={subtitleSize}
              setSubtitleSize={setSubtitleSize}
              subtitleBg={subtitleBg}
              setSubtitleBg={setSubtitleBg}
              qualityNote={qualityNote}
              dubTracks={dubTracks}
              activeDub={activeDub}
              pickDub={pickDub}
              audioTrackList={audioTrackList}
              deadDubs={deadDubs}
              audioTracks={audioTracks}
              audioIndex={audioIndex}
              pickAudio={pickAudio}
              originalLanguage={originalLanguage}
              isMasterMode={isMasterMode}
              activeUri={activeUri}
              pickQuality={pickQuality}
              pickAuto={pickAuto}
              autoplayEnabled={autoplayEnabled}
              onToggleAutoplay={toggleAutoplay}
              showEpisodesButton={showEpisodesButton}
              episodes={episodes}
              episode={episode}
              chooseEpisode={chooseEpisode}
              watchedEpisodes={watchedEpisodes}
              resumePoint={resumePoint}
              setBuffering={setBuffering}
              setResumeOffer={setResumeOffer}
              v4Appearance={v4Appearance}
            />
          </PlayerPanel>
          )}

          {/* Netflix Still Watching prompt (native only) */}
          <AnimatePresence>
            {playerMode !== "embed" && stillWatching && (
              <NetflixStillWatching
                key="still-watching"
                onContinue={onStillWatchingContinue}
                onExit={onStillWatchingExit}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Fatal banner outside sheet. Embed mode gets its own message: the
            native banner names a native source and its "Try again" re-runs the
            native resolve, so it must never sit on top of the iframe. */}
        {(!panel || playerMode === "embed") && (
          <AnimatePresence>
            {playerMode === "embed" ? (
              embedTimedOut ? (
                <FatalBanner
                  message="The embed player didn't load. Check your connection, then try again."
                  onRetry={retryEmbed}
                  onBack={onExitPlayer}
                />
              ) : null
            ) : fatal ? (
              <FatalBanner
                message={fatal}
                onRetry={retryLoad}
                onBack={onExitPlayer}
              />
            ) : null}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
