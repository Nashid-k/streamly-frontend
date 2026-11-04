// The transport: the reference design's plain bottom row.
//
// The "Pitch" chrome (2026-11) replaces the floating glass deck with the
// pasted design's geometry: a 5px progress hairline at bottom 94 and a bare
// control row (play, rewind, forward, volume, "X left • Finish at HH:MM",
// then episodes / PiP / subtitles / gear / fullscreen) over the picture. No
// scrim, no chips, no deck plate.
//
// Entangled region, so it takes state/handlers as explicit props and owns only
// presentation. The desktop hold-to-2x logic stays in the engine: the forward
// button reports a plain click via `onForward10` and the press/release via the
// hold callbacks, so quick-press-vs-hold discrimination is not duplicated.
import { IS_TOUCH } from "./constants";
import {
  IconCaptions,
  IconEpisodes,
  IconFullscreen,
  IconFullscreenExit,
  IconPause,
  IconPip,
  IconPlay,
  IconSettings,
  IconSkipBack10,
  IconSkipForward10,
  IconVolumeHigh,
  IconVolumeLow,
  IconVolumeMute,
} from "./icons";

const SETTINGS_PANELS = new Set([
  "settings",
  "servers",
  "audio",
  "subs",
  "video",
  "playback",
  "appearance",
  "sourcequality",
]);

/* Wall-clock finish time for the "X left • Finish at HH:MM" label. Kept
   outside the component so render stays pure; the label is inherently a
   snapshot of "now", so a fresh render (timeupdate) refreshes it. */
function formatFinishAt(remainingSeconds) {
  const finish = new Date(Date.now() + remainingSeconds * 1000);
  return finish.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function BottomChrome({
  visible,
  // Scrubber
  scrubRef,
  duration,
  currentTime,
  effectiveRatio,
  hoverRatio,
  fmtTime,
  onScrubKeyDown,
  onScrubDown,
  onScrubMove,
  onScrubUp,
  onScrubCancel,
  onScrubLeave,
  onScrubFocus,
  // Transport
  playing,
  onTogglePlay,
  onBack10,
  onForward10,
  onForwardHoldStart,
  onForwardHoldRelease,
  skipSeconds = 10,
  muted,
  volume,
  volHover,
  onToggleMute,
  onVolHoverChange,
  onVolumeChange,
  // Utility
  showEpisodesButton,
  showSubsButton,
  panel,
  onTogglePanel,
  onToggleSettings,
  pipSupported,
  pipActive,
  onTogglePip,
  isFullscreen,
  onFullscreen,
}) {
  const VolumeIcon = muted || volume === 0 ? IconVolumeMute : volume < 0.5 ? IconVolumeLow : IconVolumeHigh;
  const volFill = muted || volume === 0 ? 0 : volume;
  const settingsOpen = SETTINGS_PANELS.has(panel);
  const remaining = Math.max(0, (Number(duration) || 0) - (Number(currentTime) || 0));
  const finishAt = formatFinishAt(remaining);
  const timeText =
    Number(duration) > 0 ? `${fmtTime(remaining)} left \u2022 Finish at ${finishAt}` : fmtTime(currentTime);

  return (
    <>
      <div
        ref={scrubRef}
        className={["np-progress", "np-scrub", visible ? "" : "np-chrome-hidden", hoverRatio != null ? "hover" : ""]
          .filter(Boolean)
          .join(" ")}
        role="slider"
        tabIndex={0}
        inert={!visible}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.floor(duration)}
        aria-valuenow={Math.floor(currentTime)}
        aria-valuetext={`${fmtTime(currentTime)} of ${fmtTime(duration)}`}
        onKeyDown={onScrubKeyDown}
        onFocus={onScrubFocus}
        onPointerDown={onScrubDown}
        onPointerMove={onScrubMove}
        onPointerUp={onScrubUp}
        onPointerCancel={onScrubCancel}
        onPointerLeave={onScrubLeave}
      >
        <div
          className="np-progress-played"
          style={{ width: `${Math.min(100, Math.max(0, effectiveRatio * 100))}%` }}
        />
        {hoverRatio != null && Number(duration) > 0 ? (
          <div
            className="np-progress-tip show"
            style={{ left: `${Math.min(96, Math.max(4, hoverRatio * 100))}%` }}
          >
            {fmtTime(hoverRatio * duration)}
          </div>
        ) : null}
      </div>

      <div
        className={["np-controls", visible ? "" : "np-chrome-hidden"].filter(Boolean).join(" ")}
        inert={!visible}
      >
        <button type="button" className="np-ctl-btn np-play" aria-label={playing ? "Pause" : "Play"} onClick={onTogglePlay}>
          {playing ? <IconPause size={32} /> : <IconPlay size={34} />}
        </button>
        <button
          type="button"
          className="np-ctl-btn np-skip-l"
          aria-label={`Rewind ${skipSeconds} seconds`}
          onClick={onBack10}
        >
          <IconSkipBack10 size={34} />
        </button>
        <button
          type="button"
          className="np-ctl-btn np-skip-r"
          aria-label={`Forward ${skipSeconds} seconds`}
          onClick={onForward10}
          onPointerDown={onForwardHoldStart}
          onPointerUp={onForwardHoldRelease}
          onPointerLeave={onForwardHoldRelease}
          onPointerCancel={onForwardHoldRelease}
        >
          <IconSkipForward10 size={34} />
        </button>

        <span
          className={["np-vol-wrap", volHover ? "expanded" : ""].filter(Boolean).join(" ")}
          onMouseEnter={(e) => {
            e.stopPropagation();
            onVolHoverChange?.(true);
          }}
          onMouseLeave={() => onVolHoverChange?.(false)}
          onFocus={() => onVolHoverChange?.(true)}
          onBlur={(e) => {
            if (e.currentTarget.contains(e.relatedTarget)) return;
            onVolHoverChange?.(false);
          }}
        >
          <button
            type="button"
            className="np-ctl-btn np-vol-btn"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={onToggleMute}
          >
            <VolumeIcon size={30} />
          </button>
          {!IS_TOUCH ? (
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              aria-label="Volume"
              className="np-vol-slider"
              style={{ "--vol": `${volFill * 100}%` }}
            />
          ) : null}
        </span>

        <div className="np-ctl-time" aria-hidden="true">
          {timeText}
        </div>

        <div className="np-ctl-spacer" />

        <div className="np-ctl-right">
          {showEpisodesButton ? (
            <button
              type="button"
              className={["np-ctl-btn", panel === "episodes" ? "active" : ""].filter(Boolean).join(" ")}
              aria-label="Episodes"
              aria-expanded={panel === "episodes"}
              onClick={() => onTogglePanel("episodes")}
            >
              <IconEpisodes size={28} />
            </button>
          ) : null}
          {pipSupported ? (
            <button
              type="button"
              className={["np-ctl-btn", pipActive ? "active" : ""].filter(Boolean).join(" ")}
              aria-label="Picture in picture"
              aria-pressed={pipActive}
              onClick={onTogglePip}
            >
              <IconPip size={28} />
            </button>
          ) : null}
          {showSubsButton ? (
            <button
              type="button"
              className={["np-ctl-btn", panel === "subs" ? "active" : ""].filter(Boolean).join(" ")}
              aria-label="Subtitles"
              aria-expanded={panel === "subs"}
              onClick={() => onTogglePanel("subs")}
            >
              <IconCaptions size={28} />
            </button>
          ) : null}
          <button
            type="button"
            className={["np-ctl-btn", "np-gear", settingsOpen ? "open" : ""].filter(Boolean).join(" ")}
            aria-label="Settings"
            aria-expanded={settingsOpen}
            onClick={onToggleSettings}
          >
            <IconSettings size={28} />
          </button>
          <button
            type="button"
            className="np-ctl-btn"
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={onFullscreen}
          >
            {isFullscreen ? <IconFullscreenExit size={28} /> : <IconFullscreen size={28} />}
          </button>
        </div>
      </div>
    </>
  );
}
