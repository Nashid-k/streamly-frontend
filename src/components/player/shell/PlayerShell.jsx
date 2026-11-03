// The player surface and overlay composition. This is the file a redesign
// replaces: it owns the frame, the <video> element's props, the chrome layers,
// the panel and the HUD stack.
//
// Presentation only. It creates no effect and reads no ref of its own: DOM refs
// (videoRef / screenRef / scrubRef / panelRef) are handed down to be attached,
// and every state change arrives as a callback.
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
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
  EpisodesRail,
  IS_TOUCH,
  SAFE_TOP,
  SAFE_BOTTOM,
} from "../chrome";
import { RIVO_MOTION } from "../chrome/theme";
import {
  NetflixVolumeHUD,
  NetflixAspectHUD,
  NetflixSeekHUD,
  NetflixPlayPauseHUD,
  NetflixHold2xHUD,
} from "..";
import NetflixStillWatching from "../../NetflixStillWatching";
import { aspectVideoStyle } from "../../../constants/playerUi";
import { subtitleFontFamily } from "../../../constants/settings";
import { fmtTime } from "../nativePlayerHelpers";
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
  goEpNext,
  goEpPrev,
  goFullscreen,
  handleGestureMove,
  handleHoldEnd,
  handleVideoTouchEnd,
  hdBadge,
  hold2x,
  hoverRatio,
  hud,
  hudBox,
  imdbId,
  isFetchingSubtitles,
  isFullscreen,
  isMasterMode,
  loopEnabled,
  manualHeight,
  muted,
  nextDisabled,
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
  playerW,
  playing,
  poke,
  posterUrl,
  prefs,
  prevDisabled,
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
  scrubberBands,
  selectSubtitle,
  serverSwitchStage,
  setAspectRatioIndex,
  setAutoMuted,
  setBuffering,
  setLoopEnabled,
  setMuted,
  setPanel,
  setResumeOffer,
  setSubtitleBg,
  setSubtitleSize,
  setUpNext,
  setVolHover,
  sheetOpen,
  showEpisodeNav,
  showEpisodesButton,
  showSkipIntro,
  showSkipOutro,
  showStage,
  skipIntroProgress,
  skipOutroProgress,
  skipSeconds,
  sleepMinutes,
  sleepRemaining,
  sourceHeight,
  sourceVariants,
  spinner,
  stageNote,
  startSleepTimer,
  status,
  stillWatching,
  subtitleBg,
  subtitleEnabled,
  subtitleError,
  subtitleLanguages,
  subtitleSize,
  switchFrame,
  toggleMute,
  togglePip,
  togglePlay,
  upNext,
  upNextMs,
  videoRef,
  volHover,
  volume,
}) {
  const dimReducedMotion = useReducedMotion();
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
          onClick={onVideoClick}
          onTouchStart={onVideoTouchStart}
          onTouchMove={handleGestureMove}
          onTouchEnd={IS_TOUCH ? handleVideoTouchEnd : undefined}
          onTouchCancel={handleHoldEnd}
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
          onBack={onExitPlayer}
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
          onRewind={onRewindSkip}
          onTogglePlay={onCenterTogglePlay}
          onForward={onForwardSkip}
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
        <PlayerTransport
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
          showEpisodeNav={showEpisodeNav}
          prevDisabled={prevDisabled}
          nextDisabled={nextDisabled}
          onEpPrev={goEpPrev}
          onEpNext={goEpNext}
          showEpisodesButton={showEpisodesButton}
          panel={panel}
          onTogglePanel={onTogglePanel}
          onToggleSettings={onToggleSettings}
          showSubsButton={subtitleLanguages.length > 0 || isFetchingSubtitles || subtitleError}
          isFullscreen={isFullscreen}
          onFullscreen={goFullscreen}
          hdBadge={hdBadge}
        />
{/* Netflix "Left off at …" resume card — auto-resumes after a short wait. */}
        <ResumeCard
          offer={resumeOffer && !ended && !sheetOpen ? resumeOffer : null}
          fmtTime={fmtTime}
          onResume={onResumeOffer}
          onRestart={restartFromStart}
        />
        {/* Netflix "Up Next" post-roll card (TV only). */}
        <UpNextCard
          upNext={ended ? upNext : null}
          upNextMs={upNextMs}
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
            loopEnabled={loopEnabled}
            setLoopEnabled={setLoopEnabled}
            sleepMinutes={sleepMinutes}
            sleepRemaining={sleepRemaining}
            startSleepTimer={startSleepTimer}
            pipSupported={pipSupported}
            pipActive={pipActive}
            togglePip={togglePip}
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
          />
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
              onContinue={onStillWatchingContinue}
              onExit={onStillWatchingExit}
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
                onBack={onExitPlayer}
              />
            ) : null}
          </AnimatePresence>
        )}
    </div>
  );
}
