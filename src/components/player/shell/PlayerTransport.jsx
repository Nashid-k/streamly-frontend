// The transport binding: the player's scrubber, volume and utility state wired
// to BottomChrome.
//
// Presentation only. The hold timer, the 2x engage/release and the element
// writes stay in the player (and useHold2x); this file reports intent through
// the callbacks it is given.
import BottomChrome from "../chrome/BottomChrome";

export default function PlayerTransport({
  visible,
  scrubRef,
  duration,
  currentTime,
  effectiveRatio,
  bufferedRanges,
  hoverRatio,
  previewUrl,
  previewBox,
  playerW,
  scrubberBands,
  fmtTime,
  onScrubKeyDown,
  onScrubDown,
  onScrubMove,
  onScrubUp,
  onScrubCancel,
  onScrubLeave,
  onScrubFocus,
  playing,
  onTogglePlay,
  centerTransport,
  onBack10,
  onForward10,
  skipSeconds,
  onForwardHoldStart,
  onForwardHoldRelease,
  muted,
  volume,
  onToggleMute,
  volHover,
  onVolHoverChange,
  onVolumeChange,
  showEpisodeNav,
  prevDisabled,
  nextDisabled,
  onEpPrev,
  onEpNext,
  showEpisodesButton,
  panel,
  onTogglePanel,
  onToggleSettings,
  showSubsButton,
  isFullscreen,
  onFullscreen,
  hdBadge,
}) {
  return (
    <BottomChrome
      visible={visible}
      scrubRef={scrubRef}
      duration={duration}
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
      onScrubFocus={onScrubFocus}
      playing={playing}
      onTogglePlay={onTogglePlay}
      /* On touch the centre transport (rewind / play / forward) is already
         on screen whenever the stream is simply paused, so the bottom bar's
         play/pause pill would be a SECOND play/pause button on the same
         picture. Same condition as CenterStack's paused transport. */
      centerTransport={centerTransport}
      onBack10={onBack10}
      onForward10={onForward10}
      skipSeconds={skipSeconds}
      onForwardHoldStart={onForwardHoldStart}
      onForwardHoldRelease={onForwardHoldRelease}
      muted={muted}
      volume={volume}
      onToggleMute={onToggleMute}
      volHover={volHover}
      onVolHoverChange={onVolHoverChange}
      onVolumeChange={onVolumeChange}
      showEpisodeNav={showEpisodeNav}
      prevDisabled={prevDisabled}
      nextDisabled={nextDisabled}
      onEpPrev={onEpPrev}
      onEpNext={onEpNext}
      showEpisodesButton={showEpisodesButton}
      panel={panel}
      onTogglePanel={onTogglePanel}
      onToggleSettings={onToggleSettings}
      showSubsButton={showSubsButton}
      isFullscreen={isFullscreen}
      onFullscreen={onFullscreen}
      hdBadge={hdBadge}
    />
  );
}
