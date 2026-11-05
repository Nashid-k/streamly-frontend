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
  "button:not(.big), [role='button']:not(.big), input, [role='slider'], .sheet, .nxt, .top, .bot, .skip-pill, .np-resume-card, [role='dialog'], [role='menu']";

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
}) {
  const v4Appearance = usePlayerV4Appearance({
    subtitleSize,
    setSubtitleSize,
    subtitleBg,
    setSubtitleBg,
    initialSubColor: prefs?.subtitleColor,
  });

  // Player mode: "streamly" (full player with all servers) or "embed" (CineSrc-style embed)
  const [playerMode, setPlayerMode] = useState("streamly");
  const [modeDropdownOpen, setModeDropdownOpen] = useState(false);

  const [navDirection, setNavDirection] = useState(0);
  const panelStackRef = useRef([]);

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
      if (target.closest?.(".np-mode-selector")) return;
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
  const isInitialStage = Boolean(showStage || !everPlayed);
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
          onClick={onVideoClick}
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
              display: "block",
              ...aspectVideoStyle(aspectRatioIndex),
              touchAction: "manipulation",
              WebkitUserSelect: "none",
              filter: v4Appearance.brightness !== 1 ? `brightness(${v4Appearance.brightness})` : undefined,
            }}
          />
        </div>

        {/* UI Overlay */}
        <div
          className="ui"
          id="ui"
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
            onClick={panel ? () => { setPanel(null); poke(); } : undefined}
            style={{ pointerEvents: panel ? "auto" : "none" }}
          />

          {/* Double-tap radial edge flash ripples matching player-v4.html */}
          <div
            key={`dt-l-${hudSeq || 0}`}
            className={["dt", "l", "dtl", hud?.kind === "seek" && hud.value < 0 ? "show" : ""].filter(Boolean).join(" ")}
            id="dtl"
            aria-hidden="true"
          />
          <div
            key={`dt-r-${hudSeq || 0}`}
            className={["dt", "r", "dtr", hud?.kind === "seek" && hud.value > 0 ? "show" : ""].filter(Boolean).join(" ")}
            id="dtr"
            aria-hidden="true"
          />

          {/* Player v4 Double-Arc Spinner (.ld) — hidden during initial logo image loader */}
          {!isInitialStage ? (
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

          {/* Mode selector floating pill - right side, only when not fullscreen */}
          {!isFullscreen && !showStage && (
            <div
              className="np-mode-pill"
              onClick={() => setModeDropdownOpen(!modeDropdownOpen)}
              aria-label="Player mode"
              aria-expanded={modeDropdownOpen}
            >
              <div className="np-mode-pill-inner">
                <svg className="np-mode-pill-icon">
                  <use href={mode === "embed" ? "#i-embed" : "#i-streamly"} />
                </svg>
                <span className="np-mode-pill-label">{mode === "embed" ? "Embed" : "Streamly"}</span>
              </div>
              {modeDropdownOpen && (
                <div className="np-mode-pill-dropdown">
                  <button
                    type="button"
                    className={mode === "streamly" ? "active" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlayerMode("streamly");
                      setModeDropdownOpen(false);
                    }}
                  >
                    <svg className="np-mode-pill-icon"><use href="#i-streamly" /></svg>
                    <span>Streamly (All Servers)</span>
                  </button>
                  <button
                    type="button"
                    className={mode === "embed" ? "active" : ""}
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlayerMode("embed");
                      setModeDropdownOpen(false);
                    }}
                  >
                    <svg className="np-mode-pill-icon"><use href="#i-embed" /></svg>
                    <span>Embed (CineSrc)</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Big center play button on paused state (.big) — only when paused and not loading */}
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

          {/* On-Screen Display pill (.osd). Keyed by hudSeq so every flash
              REMOUNTS the node and its one-shot `osd` keyframe replays — a
              class that simply stays applied silently dies after the first
              900ms run (the "fast clicks show no HUD" report). */}
          <div
            key={`osd-${hudSeq || 0}`}
            className={["osd", (hud && hud.kind !== "play" && hud.kind !== "pause") || hold2x ? "show" : ""].filter(Boolean).join(" ")}
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

          {/* Subtitle overlay */}
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

          {/* Top bar: back + title */}
          <ChromeTopBar
            visible={controlsVisible}
            title={displayTitle}
            subtitle={displaySubtitle}
            onBack={onExitPlayer}
          />

          {/* Skip Intro & Skip Outro pills */}
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

          {/* Center stack: cold stage art during initial load / server switch & replay */}
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

          <TapToUnmutePill
            visible={autoMuted && playing && !sheetOpen}
            onUnmute={() => {
              setAutoMuted(false);
              setMuted(false);
              poke();
            }}
          />

          {/* Bottom chrome: scrubber + controls */}
          <PlayerTransport
            visible={controlsVisible}
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
            onToggleMode={setPlayerMode}
          />

          {/* Resume offer card */}
          <ResumeCard
            offer={resumeOffer && !ended && !sheetOpen ? resumeOffer : null}
            fmtTime={fmtTime}
            onResume={onResumeOffer}
            onRestart={restartFromStart}
          />

          {/* Up Next card */}
          <UpNextCard
            upNext={ended ? upNext : null}
            upNextMs={upNextMs}
            onPlayNow={(n) => chooseEpisode(n)}
            onCancel={() => setUpNext(null)}
          />

          {/* Settings / audio / subs / servers / quality panel shell */}
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

          {/* Netflix Still Watching prompt */}
          <AnimatePresence>
            {stillWatching && (
              <NetflixStillWatching
                key="still-watching"
                onContinue={onStillWatchingContinue}
                onExit={onStillWatchingExit}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Fatal error banner outside sheet */}
        {!panel && (
          <AnimatePresence>
            {fatal ? (
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
