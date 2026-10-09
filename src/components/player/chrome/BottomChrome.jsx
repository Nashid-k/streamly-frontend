// The bottom chrome: full-width scrubber + pill transport, laid out the
// YouTube way (NEW PLAYER UI-UX.html, 2026-10-08).
//
// Scrubber is a single full-width line (no edge times) drawn in the design's
// red #f03; the controls below it are translucent black pills: transport left,
// a hover-expanding volume pill, a time pill, and the utility cluster right
// (episodes / audio / servers / autoplay switch / subtitles / settings+HD /
// fullscreen). Custom hover tooltips carry keyboard badges.
//
// Entangled region, so it takes state/handlers as explicit props and owns only
// presentation. The desktop hold-to-2x logic stays in the engine: this reports a
// plain click via `onForward10` and the press/release via the hold callbacks, so
// quick-press-vs-hold discrimination is not duplicated.
import { motion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import IconBtn from "./IconBtn";
import Tooltip from "./Tooltip";
import { IS_TOUCH, SAFE_BOTTOM, SCRUBBER_BAND_STYLE } from "./constants";
import { ACCENT, TRACK, BUFFERED } from "./theme";
import {
  IconCaptions,
  IconChevronLeft,
  IconChevronRight,
  IconEpisodes,
  IconFullscreen,
  IconFullscreenExit,
  IconPause,
  IconPlay,
  IconSettings,
  IconVolumeHigh,
  IconVolumeLow,
  IconVolumeMute,
} from "./icons";

const PILL = { display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };

export default function BottomChrome({
  visible,
  // Scrubber
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
  // Transport
  playing,
  onTogglePlay,
  onBack10,
  onForward10,
  onForwardHoldStart,
  onForwardHoldRelease,
  muted,
  volume,
  volHover,
  onToggleMute,
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
  showAudioButton,
  showSubsButton,
  isFullscreen,
  onFullscreen,
  // Autoplay switch (design's bottom-right toggle)
  autoplayEnabled,
  onToggleAutoplay,
  // Gear "HD" quality badge (design's crimson chip next to the cog)
  hdBadge,
}) {
  const M = useMotionTokens();
  const VolumeIcon = muted || volume === 0 ? IconVolumeMute : volume < 0.5 ? IconVolumeLow : IconVolumeHigh;
  const pillSize = IS_TOUCH ? 56 : 52;
  const playSize = IS_TOUCH ? 68 : 60;
  const volFill = muted || volume === 0 ? 0 : volume;

  return (
    <motion.div
      initial={false}
      animate={{
        opacity: visible ? 1 : 0,
        y: visible ? 0 : 20,
      }}
      transition={M.SPRING.SHEET}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: IS_TOUCH ? 8 : 12,
        paddingLeft: IS_TOUCH ? 14 : 32,
        paddingRight: IS_TOUCH ? 14 : 32,
        paddingBottom: SAFE_BOTTOM,
        background: "linear-gradient(0deg, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.28) 52%, rgba(0,0,0,0) 100%)",
        pointerEvents: visible ? "auto" : "none",
        zIndex: 4,
      }}
    >
      {/* Scrubber: a bare full-width line, red played, white track/buffered. */}
      <div
        ref={scrubRef}
        className="np-scrub"
        role="slider"
        tabIndex={0}
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
        style={{
          position: "relative",
          // 44px hit target on touch (Apple HIG minimum) — the visual bar
          // stays thin, only the touchable band grows.
          height: IS_TOUCH ? 44 : 30,
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          touchAction: "none",
          marginBottom: IS_TOUCH ? 8 : 12,
        }}
      >
        <div
          className="np-scrub-line"
          style={{
            position: "relative",
            height: hoverRatio != null ? 8 : 5,
            width: "100%",
            background: TRACK,
            borderRadius: 999,
            transition: "height 0.15s ease",
          }}
        >
          {duration > 0 &&
            bufferedRanges.map(([s, e], i) =>
              e > s ? (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: `${(s / duration) * 100}%`,
                    width: `${((e - s) / duration) * 100}%`,
                    background: BUFFERED,
                    borderRadius: 999,
                  }}
                />
              ) : null,
            )}
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: `${effectiveRatio * 100}%`,
              background: ACCENT,
              borderRadius: 999,
            }}
          />
          {/* Measured skip windows, drawn the way the provider draws them: a band
              over the intro, a band over the credits. Estimates never paint here
              — only cue/provider/dataset boundaries (cueBounds carries its source
              stamp), so a 90s guess cannot masquerade as measured data. */}
          {scrubberBands?.intro && (
            <div aria-hidden="true" style={{ ...SCRUBBER_BAND_STYLE, ...scrubberBands.intro }} />
          )}
          {scrubberBands?.credits && (
            <div aria-hidden="true" style={{ ...SCRUBBER_BAND_STYLE, ...scrubberBands.credits }} />
          )}
          <div
            className="np-scrub-dot"
            style={{
              position: "absolute",
              top: "50%",
              left: `calc(${effectiveRatio * 100}% - ${(hoverRatio != null ? 17 : 13) / 2}px)`,
              width: hoverRatio != null ? 17 : 13,
              height: hoverRatio != null ? 17 : 13,
              borderRadius: "50%",
              background: ACCENT,
              transform: "translateY(-50%)",
              transition: "width 0.15s ease, height 0.15s ease",
              boxShadow: "0 1px 6px rgba(0,0,0,0.6)",
            }}
          />
        </div>
        {/* Hover/drag frame preview, clamped so it never leaves the picture. */}
        {hoverRatio != null && previewUrl && (
          <div
            style={{
              position: "absolute",
              bottom: previewBox.lift,
              left: Math.min(
                Math.max(hoverRatio * playerW, previewBox.thumbInset),
                Math.max(previewBox.thumbInset, playerW - previewBox.thumbInset),
              ),
              transform: "translateX(-50%)",
              width: previewBox.thumbW,
              height: previewBox.thumbH,
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.35)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.65)",
              overflow: "hidden",
              pointerEvents: "none",
              zIndex: 4,
              background: "#000",
            }}
          >
            <img
              src={previewUrl}
              alt=""
              aria-hidden="true"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        )}
        {hoverRatio != null && duration > 0 && (
          <div
            className="np-scrub-time"
            style={{
              position: "absolute",
              bottom: 34,
              left: `${Math.min(94, Math.max(6, hoverRatio * 100))}%`,
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.78)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              padding: "4px 8px",
              borderRadius: 6,
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {fmtTime(hoverRatio * duration)}
          </div>
        )}
      </div>

      {/* Transport row: play+volume+time left, utilities right (NEW PLAYER UI-UX.html). */}
      <div className="np-transport" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div className="np-pill np-circle-pill" style={{ ...PILL, width: playSize, height: playSize }}>
          <Tooltip tip={playing ? "Pause" : "Play"} kbd="k">
            <IconBtn size={playSize} label={playing ? "Pause" : "Play"} onClick={onTogglePlay}>
              {playing ? <IconPause size={30} /> : <IconPlay size={28} />}
            </IconBtn>
          </Tooltip>
        </div>

        {/* Volume: the pill widens on hover to reveal the slider (CSS-driven). */}
        <span
          className={["np-pill np-vol-pill", volHover ? "expanded" : ""].filter(Boolean).join(" ")}
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
          style={{
            ...PILL,
            justifyContent: "flex-start",
            height: pillSize,
            padding: "0 6px",
            gap: 2,
          }}
        >
          <Tooltip tip={muted || volume === 0 ? "Unmute" : "Mute"} kbd="m">
            <IconBtn size={IS_TOUCH ? 44 : 40} label={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>
              <VolumeIcon size={22} />
            </IconBtn>
          </Tooltip>
          {!IS_TOUCH && (
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              aria-label="Volume"
              className="np-vol-range"
              style={{ "--vol": `${volFill * 100}%` }}
            />
          )}
        </span>

        {/* Time pill: "3:24 / 4:28". */}
        <div
          className="np-pill np-time-pill"
          aria-hidden="true"
          style={{
            ...PILL,
            height: pillSize,
            minHeight: pillSize,
            padding: "0 20px",
            color: "#fff",
            fontSize: IS_TOUCH ? 15 : 14,
            fontWeight: 700,
            letterSpacing: 0.3,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          <span>{fmtTime(currentTime)}</span>
          <span style={{ margin: "0 7px", color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>/</span>
          <span>{fmtTime(duration)}</span>
        </div>

        <div style={{ flex: 1 }} />

        {/* Right cluster: a single unified pill container (NEW PLAYER UI-UX.html #rp) */}
        <div
          className="np-pill np-right-pill"
          style={{
            ...PILL,
            height: pillSize,
            padding: IS_TOUCH ? "0 10px" : "0 14px",
            gap: IS_TOUCH ? 6 : 10,
          }}
        >
          {showEpisodeNav && (
            <>
              <Tooltip tip="Previous episode">
                <IconBtn size={IS_TOUCH ? 40 : 38} label="Previous episode" disabled={prevDisabled} onClick={onEpPrev}>
                  <IconChevronLeft size={20} />
                </IconBtn>
              </Tooltip>
              <Tooltip tip="Next episode">
                <IconBtn size={IS_TOUCH ? 40 : 38} label="Next episode" disabled={nextDisabled} onClick={onEpNext}>
                  <IconChevronRight size={20} />
                </IconBtn>
              </Tooltip>
            </>
          )}
          {showEpisodesButton && (
            <Tooltip tip="Episodes">
              <IconBtn
                size={IS_TOUCH ? 40 : 38}
                label="Episodes"
                active={panel === "episodes"}
                expanded={panel === "episodes"}
                onClick={() => onTogglePanel("episodes")}
              >
                <IconEpisodes size={20} />
              </IconBtn>
            </Tooltip>
          )}
          {showSubsButton ? (
            <Tooltip tip="Subtitles/closed captions" kbd="c">
              <IconBtn
                size={IS_TOUCH ? 40 : 38}
                label="Subtitles"
                active={panel === "subs"}
                expanded={panel === "subs"}
                onClick={() => onTogglePanel("subs")}
              >
                <IconCaptions size={20} />
              </IconBtn>
            </Tooltip>
          ) : null}
          <Tooltip tip={autoplayEnabled ? "Autoplay is on" : "Autoplay is off"}>
            <button
              type="button"
              className="np-icon-btn"
              aria-label="Autoplay"
              role="switch"
              aria-checked={Boolean(autoplayEnabled)}
              title={autoplayEnabled ? "Autoplay is on" : "Autoplay is off"}
              onClick={onToggleAutoplay}
              style={{
                background: "transparent",
                border: "none",
                padding: "0 2px",
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <span className={`np-toggle${autoplayEnabled ? " on" : ""}`} aria-hidden="true">
                <span className="np-toggle-knob">
                  {autoplayEnabled ? (
                    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
                      <rect x="3" y="2" width="3.5" height="12" fill="#222" rx="0.5" />
                      <rect x="9.5" y="2" width="3.5" height="12" fill="#222" rx="0.5" />
                    </svg>
                  ) : (
                    <svg width="10" height="10" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4.5 3v10l8-5z" fill="#222" />
                    </svg>
                  )}
                </span>
              </span>
            </button>
          </Tooltip>
          <Tooltip tip="Settings">
            <IconBtn
              size={IS_TOUCH ? 40 : 38}
              label="Settings"
              badge={hdBadge}
              active={
                panel === "settings" ||
                panel === "audio" ||
                panel === "subs" ||
                panel === "video" ||
                panel === "speed" ||
                panel === "aspect"
              }
              expanded={Boolean(panel && panel !== "episodes" && panel !== "servers")}
              onClick={onToggleSettings}
            >
              <IconSettings size={20} />
            </IconBtn>
          </Tooltip>
          <Tooltip tip={isFullscreen ? "Exit fullscreen" : "Fullscreen"} kbd="f">
            <div className="np-fs-wrap">
              <IconBtn size={IS_TOUCH ? 40 : 38} label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={onFullscreen}>
                {isFullscreen ? <IconFullscreenExit size={20} /> : <IconFullscreen size={20} />}
              </IconBtn>
            </div>
          </Tooltip>
        </div>
      </div>
    </motion.div>
  );
}