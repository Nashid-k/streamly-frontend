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
  bufferedRatio,
  hoverRatio,
  previewUrl,
  previewBox,
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
  showEpisodesButton,
  panel,
  panelOpener,
  onTogglePanel,
  onToggleSettings,
  showSubsButton,
  pipSupported,
  pipActive,
  onTogglePip,
  isFullscreen,
  onFullscreen,
}) {
  return (
    <BottomChrome
      visible={visible}
      scrubRef={scrubRef}
      duration={duration}
      currentTime={currentTime}
      effectiveRatio={effectiveRatio}
      bufferedRatio={bufferedRatio}
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
      onScrubFocus={onScrubFocus}
      playing={playing}
      onTogglePlay={onTogglePlay}
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
      showEpisodesButton={showEpisodesButton}
      panel={panel}
      panelOpener={panelOpener}
      onTogglePanel={onTogglePanel}
      onToggleSettings={onToggleSettings}
      showSubsButton={showSubsButton}
      pipSupported={pipSupported}
      pipActive={pipActive}
      onTogglePip={onTogglePip}
      isFullscreen={isFullscreen}
      onFullscreen={onFullscreen}
    />
  );
}
