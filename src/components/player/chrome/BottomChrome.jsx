// Player v4 Bottom Chrome
// Structure and styling exactly mirror player-v4.html:
// - Single .bot container with gradient background
// - .prog progress row: elapsed time, .seek > .trk > (.buf, .played, .knob, .tip > .tp), remaining time
// - .ctl control row with exact v4 button layout and icon morphs:
//   - #pp: .morph.m-pp (#i-pause / #i-play)
//   - #rew: .btn.nb (#i-rew)
//   - #fwd: .btn.nb (#i-fwd)
//   - #vol: .volg.volb > .morph.m-vol (#i-vol / #i-mute) + .vs slider
//   - #info: remaining time • Finish at HH:MM
//   - #epb: episodes (#i-ep)
//   - #pip: picture-in-picture (#i-pip)
//   - #subb: subtitles (#i-subs)
//   - #gear: settings with rotation (#i-gear)
//   - #fs: .morph.m-fs (#i-fs / #i-fsx)
import { IS_TOUCH } from "./constants";

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

function formatFinishAt(remainingSeconds) {
  const finish = new Date(Date.now() + remainingSeconds * 1000);
  return finish.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function BottomChrome({
  visible,
  panelOpener,
  // Scrubber
  scrubRef,
  duration,
  currentTime,
  effectiveRatio = 0,
  bufferedRatio = null,
  hoverRatio,
  scrubDragging,
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
  volume = 1,
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
  // Mode selector (embed vs streamly)
  mode = "streamly",
  modeDropdownOpen = false,
  setModeDropdownOpen,
  onToggleMode,
}) {
  const isMuted = muted || volume === 0;
  const volFill = isMuted ? 0 : volume;
  const isSettingsOpener = panelOpener === "settings";
  const isSubsOpener = panelOpener === "subs";
  const isEpisodesOpener = panelOpener === "episodes";

  const settingsOpen =
    isSettingsOpener ||
    (Boolean(panel) && SETTINGS_PANELS.has(panel) && !isSubsOpener && panel !== "subs");
  const subsOpen = isSubsOpener || (panel === "subs" && !isSettingsOpener);
  const episodesOpen = isEpisodesOpener || (panel === "episodes" && !isSettingsOpener);
  const durNum = Number(duration) || 0;
  const curNum = Number(currentTime) || 0;
  const remaining = Math.max(0, durNum - curNum);
  const finishAt = formatFinishAt(remaining);
  const thumbW = previewBox?.thumbW || 160;
  const thumbH = previewBox?.thumbH || 90;
  const timeText =
    durNum > 0 ? `${fmtTime(remaining)} left \u2022 Finish at ${finishAt}` : fmtTime(currentTime);

  const ratio = Math.min(1, Math.max(0, effectiveRatio));
  // The buffered bar reflects what the element has actually buffered (the range
  // containing the playhead), never the played fraction — faking it hides
  // stalls behind a full bar.
  const bufRatio = bufferedRatio == null ? ratio : Math.min(1, Math.max(0, bufferedRatio));
  const hoverPct = hoverRatio != null ? Math.min(100, Math.max(0, hoverRatio * 100)) : 0;
  const hoverTime = hoverRatio != null ? hoverRatio * durNum : curNum;

  return (
    <div
      className={["bot", !visible ? "np-chrome-hidden" : ""].filter(Boolean).join(" ")}
      inert={!visible}
    >
        {/* Progress bar row matching player-v4.html */}
        <div className="prog">
          <span className="t" id="cur" aria-hidden="true">
            {fmtTime(currentTime)}
          </span>
          <div
            ref={scrubRef}
            id="seek"
            className={["seek", hoverRatio != null ? "drag" : "", scrubDragging ? "pressed" : ""].filter(Boolean).join(" ")}
            role="slider"
            tabIndex={0}
            inert={!visible}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.floor(durNum)}
            aria-valuenow={Math.floor(curNum)}
            aria-valuetext={`${fmtTime(currentTime)} of ${fmtTime(duration)}`}
            onKeyDown={onScrubKeyDown}
            onFocus={onScrubFocus}
            onPointerDown={onScrubDown}
            onPointerMove={onScrubMove}
            onPointerUp={onScrubUp}
            onPointerCancel={onScrubCancel}
            onPointerLeave={onScrubLeave}
          >
            <div className="trk" id="trk" aria-hidden="true">
              <i className="buf" id="buf" style={{ transform: `scaleX(${bufRatio})` }} />
              <i className="played" id="played" style={{ transform: `scaleX(${ratio})` }} />
              <i className="knob" id="knob" style={{ "--p": ratio }} />
              {hoverRatio != null && durNum > 0 ? (
                <span
                  className={["tip", previewUrl ? "has-th" : ""].filter(Boolean).join(" ")}
                  id="tip"
                  style={{ "--hp": hoverPct }}
                >
                  <span className="tp" id="tp" style={previewUrl ? { width: thumbW, height: thumbH } : undefined}>
                    {previewUrl ? (
                      <i
                        style={{
                          width: thumbW,
                          height: thumbH,
                          backgroundImage: `url("${previewUrl}")`,
                          backgroundSize: "cover",
                        }}
                      />
                    ) : (
                      <i />
                    )}
                  </span>
                  <b id="tt">{fmtTime(hoverTime)}</b>
                </span>
              ) : null}
            </div>
          </div>
          <span className="t" id="rem" aria-hidden="true">
            {fmtTime(duration)}
          </span>
        </div>

        {/* Control buttons row matching player-v4.html */}
        <div className="ctl">
          <button
            type="button"
            className="btn"
            id="pp"
            aria-label={playing ? "Pause" : "Play"}
            onClick={onTogglePlay}
          >
            <span className="morph m-pp">
              <svg className="ic a"><use href="#i-pause" /></svg>
              <svg className="ic b"><use href="#i-play" /></svg>
            </span>
          </button>

          <button
            type="button"
            className="btn nb"
            id="rew"
            aria-label={`Rewind ${skipSeconds} seconds`}
            onClick={onBack10}
          >
            <svg className="ic lg"><use href="#i-rew" /></svg>
          </button>

          <button
            type="button"
            className="btn nb"
            id="fwd"
            aria-label={`Forward ${skipSeconds} seconds`}
            onClick={onForward10}
            onPointerDown={onForwardHoldStart}
            onPointerUp={onForwardHoldRelease}
            onPointerLeave={onForwardHoldRelease}
            onPointerCancel={onForwardHoldRelease}
          >
            <svg className="ic lg"><use href="#i-fwd" /></svg>
          </button>

          <span
            className={["volg", "volb", volHover ? "expanded" : ""].filter(Boolean).join(" ")}
            onMouseEnter={() => onVolHoverChange?.(true)}
            onMouseLeave={() => onVolHoverChange?.(false)}
            onFocus={() => onVolHoverChange?.(true)}
            onBlur={(e) => {
              if (e.currentTarget.contains(e.relatedTarget)) return;
              onVolHoverChange?.(false);
            }}
            onWheel={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const delta = e.deltaY < 0 ? 0.05 : -0.05;
              const next = Math.min(1, Math.max(0, volume + delta));
              onVolumeChange?.(next);
            }}
          >
            <button
              type="button"
              className="btn"
              id="vol"
              aria-label={isMuted ? "Unmute" : "Mute"}
              aria-pressed={isMuted}
              onClick={onToggleMute}
            >
              <span className="morph m-vol">
                <svg className="ic a"><use href="#i-vol" /></svg>
                <svg className="ic b"><use href="#i-mute" /></svg>
              </span>
            </button>
            {!IS_TOUCH ? (
              <input
                className="vs"
                id="vs"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                style={{ "--p": `${volFill * 100}%` }}
                aria-label="Volume"
              />
            ) : null}
          </span>

          <span className="info" id="info">
            {timeText}
          </span>
          <span className="sp" />

          {showEpisodesButton ? (
            <button
              type="button"
              className={["btn", episodesOpen ? "active" : ""].filter(Boolean).join(" ")}
              id="epb"
              data-open
              aria-label="Episodes"
              aria-haspopup="dialog"
              aria-expanded={episodesOpen}
              onClick={() => onTogglePanel("episodes")}
            >
              <svg className="ic"><use href="#i-ep" /></svg>
            </button>
          ) : null}

          {pipSupported ? (
            <button
              type="button"
              className={["btn", "pipb", pipActive ? "active" : ""].filter(Boolean).join(" ")}
              id="pip"
              aria-label="Picture in picture"
              aria-pressed={pipActive}
              onClick={onTogglePip}
            >
              <svg className="ic"><use href="#i-pip" /></svg>
            </button>
          ) : null}

          {showSubsButton ? (
            <button
              type="button"
              className={["btn", subsOpen ? "active" : ""].filter(Boolean).join(" ")}
              id="subb"
              data-open
              aria-label="Subtitles"
              aria-haspopup="dialog"
              aria-expanded={subsOpen}
              onClick={() => onTogglePanel("subs")}
            >
              <svg className="ic"><use href="#i-subs" /></svg>
            </button>
          ) : null}

          <button
            type="button"
            className={["btn", "gear", settingsOpen ? "open" : ""].filter(Boolean).join(" ")}
            id="gear"
            data-open
            aria-label="Settings"
            aria-haspopup="dialog"
            aria-expanded={settingsOpen}
            onClick={onToggleSettings}
          >
            <svg className="ic"><use href="#i-gear" /></svg>
          </button>

          <button
            type="button"
            className="btn"
            id="fs"
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={onFullscreen}
          >
            <span className="morph m-fs">
              <svg className="ic a"><use href="#i-fs" /></svg>
              <svg className="ic b"><use href="#i-fsx" /></svg>
            </span>
          </button>
        </div>
      </div>
  );
}
