// The player surface and overlay composition.
// Presentation only. Follows player-v4.html structure:
// - .stage for video
// - .ui overlay containing .dim, .ld, .big, .osd, .dt.l, .dt.r, .top, .bot, .sheet
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
  retryLoad,
  safeDuration,
  screenRef,
  scrubRef,
  season,
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
}) {
  const v4Appearance = usePlayerV4Appearance({
    subtitleSize,
    setSubtitleSize,
    subtitleBg,
    setSubtitleBg,
    initialSubColor: prefs?.subtitleColor,
  });

  const isLoading = buffering || spinner;
  const isMuted = muted || autoMuted || volume === 0;

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
        className={[
          "player",
          "np-root",
          !playing ? "paused" : "",
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
        <div className="stage" style={{ position: "absolute", inset: 0, background: "#000" }}>
          <video
            ref={videoRef}
            playsInline
            onClick={onVideoClick}
            onTouchStart={onVideoTouchStart}
            onTouchMove={handleGestureMove}
            onTouchEnd={IS_TOUCH ? handleVideoTouchEnd : undefined}
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
        <div className="ui" id="ui">
          {/* Dimmer for menu/panel opening */}
          <div
            className="dim"
            id="dim"
            aria-hidden="true"
            onClick={panel ? () => { setPanel(null); poke(); } : undefined}
            style={{ pointerEvents: panel ? "auto" : "none" }}
          />

          {/* Double-tap ripple flashes (pure gradient flash without inner clutter) */}
          <div
            key={`dt-l-${hudSeq || 0}`}
            className={["dt", "l", hud?.kind === "seek" && hud.value < 0 ? "show" : ""].filter(Boolean).join(" ")}
            id="dtl"
            aria-hidden="true"
          />
          <div
            key={`dt-r-${hudSeq || 0}`}
            className={["dt", "r", hud?.kind === "seek" && hud.value > 0 ? "show" : ""].filter(Boolean).join(" ")}
            id="dtr"
            aria-hidden="true"
          />

          {/* Player v4 Double-Arc Spinner (.ld) */}
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

          {/* Big center play button on paused state (.big) — only when paused and not loading */}
          <button
            type="button"
            className="big"
            id="big"
            aria-label="Play"
            onClick={togglePlay}
          >
            <svg className="ic"><use href="#i-play" /></svg>
          </button>

          {/* On-Screen Display pill (.osd) */}
          <div
            className={["osd", hud || hold2x ? "show" : ""].filter(Boolean).join(" ")}
            id="osd"
            aria-live="polite"
            style={{ left: hud?.kind === "seek" ? (hud.value < 0 ? "22%" : "78%") : "50%" }}
          >
            {hud?.kind === "play" && <svg className="ic"><use href="#i-play" /></svg>}
            {hud?.kind === "pause" && <svg className="ic"><use href="#i-pause" /></svg>}
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
            hoverRatio={hoverRatio}
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
            panelRef={panelRef}
            onClose={() => setPanel(null)}
            onBackToSettings={() => {
              setPanel("settings");
              poke();
            }}
            season={season}
            actionLabel={panel === "subs" ? "Customize" : null}
            onAction={() => {
              setPanel("appearance");
              poke();
            }}
          >
            <PlayerMenus
              panel={panel}
              setPanel={setPanel}
              poke={poke}
              activeSourceKey={activeSourceKey}
              requestedServer={requestedServer}
              currentAudioLabel={currentAudioLabel}
              autoLevel={autoLevel}
              qualities={qualities}
              manualHeight={manualHeight}
              currentHeight={currentHeight}
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
