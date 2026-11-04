// The transport: the reference design's plain bottom row.
//
// The "Pitch" chrome (2026-11) replaces the floating glass deck with the
// pasted design's geometry: a 5px progress hairline at bottom 94 and a bare
// control row (play, rewind, forward, volume, "X left • Finish at HH:MM",
// then episodes / PiP / subtitles / gear / fullscreen) over the picture. No
// scrim, no chips, no deck plate.
//
// Player v4 enhancements:
// - CSS icon morphs (m-pp, m-vol, m-fs) with smooth spring transitions
// - Knob dot with theme accent bloom shadow
// - Thumbnail preview box in scrubber tooltip
// - High-contrast SVG icons matching player-v4.html
import { useState } from "react";
import { IS_TOUCH } from "./constants";
import { IconCaptions, IconEpisodes, IconPip, IconSettings } from "./icons";

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
  // Frame captured by the preview decoder for the hovered second. The v4
  // scrubber shows it inside the tooltip (.tp); without this the pipeline ran
  // and threw the result away.
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
  const [showRemaining, setShowRemaining] = useState(true);
  const isMuted = muted || volume === 0;
  const volFill = isMuted ? 0 : volume;
  const settingsOpen = SETTINGS_PANELS.has(panel);
  const remaining = Math.max(0, (Number(duration) || 0) - (Number(currentTime) || 0));
  const finishAt = formatFinishAt(remaining);
  const thumbW = previewBox?.thumbW || 160;
  const thumbH = previewBox?.thumbH || 90;
  const timeText =
    Number(duration) > 0 ? `${fmtTime(remaining)} left \u2022 Finish at ${finishAt}` : fmtTime(currentTime);

  return (
    <>
      {/* v4 paints the transport on a bottom scrim; without it the white icons
          sit straight on the picture. Decorative and pointer-transparent. */}
      <div className="bot np-scrim" aria-hidden="true" />
      {/* v4's progress row: current time, the seek bar, duration. The bar was
          rendered alone, so the player had no elapsed/remaining time readout. */}
      <div className="prog np-prog">
        <span className="t" aria-hidden="true">
          {fmtTime(currentTime)}
        </span>
      <div
        ref={scrubRef}
        className={["np-progress", "np-scrub", "seek", visible ? "" : "np-chrome-hidden", hoverRatio != null ? "hover" : ""]
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
        <div className="trk" aria-hidden="true" />
        <div className="buf" aria-hidden="true" />
        <div
          className="np-progress-played played"
          style={{ width: `${Math.min(100, Math.max(0, effectiveRatio * 100))}%` }}
        >
          <div className="knob" />
        </div>
        {hoverRatio != null && Number(duration) > 0 ? (
          <div
            className={["np-progress-tip", "tip", "show", previewUrl ? "has-th" : ""].filter(Boolean).join(" ")}
            style={{ left: `${Math.min(96, Math.max(4, hoverRatio * 100))}%` }}
          >
            {previewUrl ? (
              <div className="tp" style={{ width: thumbW, height: thumbH }}>
                <i
                  aria-hidden="true"
                  style={{
                    width: thumbW,
                    height: thumbH,
                    backgroundImage: `url("${previewUrl}")`,
                    backgroundSize: "cover",
                  }}
                />
              </div>
            ) : null}
            <span>{fmtTime(hoverRatio * duration)}</span>
          </div>
        ) : null}
      </div>
        <span className="t" aria-hidden="true">
          {fmtTime(duration)}
        </span>
      </div>

      <div
        className={["np-controls", "ctl", visible ? "" : "np-chrome-hidden"].filter(Boolean).join(" ")}
        inert={!visible}
      >
        <button
          type="button"
          id="pp"
          className="np-ctl-btn np-play btn morph m-pp"
          aria-label={playing ? "Pause" : "Play"}
          onClick={onTogglePlay}
        >
          <svg className="ic a" viewBox="0 0 24 24" aria-hidden="true" width={32} height={32}>
            <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" />
          </svg>
          <svg className="ic b" viewBox="0 0 24 24" aria-hidden="true" width={34} height={34}>
            <path d="M8 5v14l11-7z" fill="currentColor" />
          </svg>
        </button>

        <button
          type="button"
          id="rew"
          className="np-ctl-btn np-skip-l btn nb"
          aria-label={`Rewind ${skipSeconds} seconds`}
          onClick={onBack10}
        >
          {/* v4 draws the skip controls as plain chevrons (`#i-rew` / `#i-fwd`);
              the skip-to-end marks read as "previous/next track". */}
          <svg className="ic lg" viewBox="0 0 24 24" aria-hidden="true" width={32} height={32}>
            <path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <button
          type="button"
          id="fwd"
          className="np-ctl-btn np-skip-r btn nb"
          aria-label={`Forward ${skipSeconds} seconds`}
          onClick={onForward10}
          onPointerDown={onForwardHoldStart}
          onPointerUp={onForwardHoldRelease}
          onPointerLeave={onForwardHoldRelease}
          onPointerCancel={onForwardHoldRelease}
        >
          <svg className="ic lg" viewBox="0 0 24 24" aria-hidden="true" width={32} height={32}>
            <path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span
          className={["np-vol-wrap", "volg", "volb", volHover ? "expanded" : ""].filter(Boolean).join(" ")}
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
            id="vol"
            className="np-ctl-btn np-vol-btn btn morph m-vol"
            aria-label={isMuted ? "Unmute" : "Mute"}
            onClick={onToggleMute}
          >
            <svg className="ic a" viewBox="0 0 24 24" aria-hidden="true" width={30} height={30}>
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" fill="currentColor" />
            </svg>
            <svg className="ic b" viewBox="0 0 24 24" aria-hidden="true" width={30} height={30}>
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" fill="currentColor" />
            </svg>
          </button>
          {!IS_TOUCH ? (
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              aria-label="Volume"
              className="np-vol-slider vs"
              id="vs"
              style={{ "--vol": `${volFill * 100}%` }}
            />
          ) : null}
        </span>

        <div className="np-ctl-time info" aria-hidden="true">
          {timeText}
        </div>

        <div className="np-ctl-spacer sp" />

        <div className="np-ctl-right">
          {showEpisodesButton ? (
            <button
              type="button"
              id="epb"
              className={["np-ctl-btn", "btn", panel === "episodes" ? "active" : ""].filter(Boolean).join(" ")}
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
              id="pip"
              className={["np-ctl-btn", "btn", "pipb", pipActive ? "active" : ""].filter(Boolean).join(" ")}
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
              id="subb"
              className={["np-ctl-btn", "btn", panel === "subs" ? "active" : ""].filter(Boolean).join(" ")}
              aria-label="Subtitles"
              aria-expanded={panel === "subs"}
              onClick={() => onTogglePanel("subs")}
            >
              <IconCaptions size={28} />
            </button>
          ) : null}
          <button
            type="button"
            id="gear"
            className={["np-ctl-btn", "np-gear", "btn", "gear", settingsOpen ? "open" : ""].filter(Boolean).join(" ")}
            aria-label="Settings"
            aria-expanded={settingsOpen}
            onClick={onToggleSettings}
          >
            <IconSettings size={28} />
          </button>
          <button
            type="button"
            id="fs"
            className="np-ctl-btn btn morph m-fs"
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={onFullscreen}
          >
            <svg className="ic a" viewBox="0 0 24 24" aria-hidden="true" width={28} height={28}>
              <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" fill="currentColor" />
            </svg>
            <svg className="ic b" viewBox="0 0 24 24" aria-hidden="true" width={28} height={28}>
              <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
