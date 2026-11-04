// The player surface and overlay composition. This is the file a redesign
// replaces: it owns the frame, the <video> element's props, the chrome layers,
// the panel and the HUD stack.
//
// Presentation only. It creates no effect and reads no ref of its own: DOM refs
// (videoRef / screenRef / scrubRef / panelRef) are handed down to be attached,
// and every state change arrives as a callback.
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
  });

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
        className={[
          "np-root",
          "player",
          !playing ? "paused" : "",
          buffering || spinner ? "loading" : "",
          !controlsVisible && playing ? "idle" : "",
          panel ? "menu" : "",
          muted || autoMuted || volume === 0 ? "is-muted" : "",
          isFullscreen ? "is-fs" : "",
          ended && upNext ? "nxt-on" : "",
        ].filter(Boolean).join(" ")}
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
          "--np-safe-top": SAFE_TOP,
          "--np-safe-bottom": SAFE_BOTTOM,
          "--accent": v4Appearance.accent,
          "--accent-rgb": v4Appearance.accentRgb,
          "--is": v4Appearance.iconSize,
          "--cz": v4Appearance.cz,
          "--cc": v4Appearance.subColor,
          "--ease": "cubic-bezier(.22, 1, .36, 1)",
          "--ease-spring": "cubic-bezier(.34, 1.4, .5, 1)",
        }}
        data-cb={v4Appearance.subBgStyle}
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
            filter: v4Appearance.brightness !== 1 ? `brightness(${v4Appearance.brightness})` : undefined,
          }}
        />
        {/* Double-tap ripple flashes (.dt.l and .dt.r) */}
        <div
          className={["dt", "l", hud?.kind === "seek" && hud.value < 0 ? "on" : ""].filter(Boolean).join(" ")}
          id="dt-l"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" width={36} height={36}>
            <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" fill="currentColor" />
          </svg>
          <span>{skipSeconds}s</span>
        </div>
        <div
          className={["dt", "r", hud?.kind === "seek" && hud.value > 0 ? "on" : ""].filter(Boolean).join(" ")}
          id="dt-r"
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" width={36} height={36}>
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" fill="currentColor" />
          </svg>
          <span>{skipSeconds}s</span>
        </div>
        {/* (No standalone scrims: the top bar and bottom chrome paint their own
            gradients — stacking more here double-darkened the picture.) */}
        {/* Tapping the picture while a panel is open closes the panel. The
            catcher is transparent (the reference design does not dim the
            frame) and sits below the chrome, so the bars and skip pills stay
            live. Mobile has no Esc, so this is the touch exit. */}
        {panel && (
          <div
            className="dim"
            id="dim"
            aria-hidden="true"
            onClick={() => {
              setPanel(null);
              poke();
            }}
            style={{ position: "absolute", inset: 0, zIndex: 5 }}
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
          onBack={onExitPlayer}
        />
        {/* Skip Intro pill: bottom-right, above the control deck, present only
            inside the intro window, seeks just past the credits. Stays tappable
            even with the chrome hidden (the provider keeps it while the intro
            plays) — but yields to any open panel. */}
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
          hoverRatio={hoverRatio}
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

        {/* On-Screen Display pill (.osd) */}
        <div
          className={["osd", hud || hold2x ? "show" : ""].filter(Boolean).join(" ")}
          id="osd"
          aria-hidden="true"
        >
          {hud?.kind === "play" && (
            <>
              <svg className="ic" viewBox="0 0 24 24" width={22} height={22}>
                <path d="M8 5v14l11-7z" fill="currentColor" />
              </svg>
              <span id="osd-tx">Play</span>
            </>
          )}
          {hud?.kind === "pause" && (
            <>
              <svg className="ic" viewBox="0 0 24 24" width={22} height={22}>
                <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" />
              </svg>
              <span id="osd-tx">Pause</span>
            </>
          )}
          {hud?.kind === "volume" && (
            <>
              <svg className="ic" viewBox="0 0 24 24" width={22} height={22}>
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" fill="currentColor" />
              </svg>
              <span id="osd-tx">{muted || autoMuted ? "Muted" : `Volume ${Math.round(volume * 100)}%`}</span>
            </>
          )}
          {hud?.kind === "seek" && (
            <>
              <svg className="ic" viewBox="0 0 24 24" width={22} height={22}>
                <path d={hud.value < 0 ? "M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" : "M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"} fill="currentColor" />
              </svg>
              <span id="osd-tx">{hud.value < 0 ? `-${Math.abs(Math.round(hud.value))}s` : `+${Math.round(hud.value)}s`}</span>
            </>
          )}
          {hold2x && (
            <>
              <svg className="ic" viewBox="0 0 24 24" width={22} height={22}>
                <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" fill="currentColor" />
              </svg>
              <span id="osd-tx">2x Speed</span>
            </>
          )}
        </div>

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
