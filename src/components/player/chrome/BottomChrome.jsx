// The bottom chrome: scrubber + transport, laid out the Apple TV+ way.
//
// From-scratch layout (replaces the Netflix arrangement of a full-width bar with
// the transport pinned left): the scrubber is a single full-width line with the
// elapsed time on its left end and the duration on its right, and the transport
// is centred beneath it — skip back 10 / play-pause / skip forward 10 — with the
// volume on the left edge and the utility cluster (episodes, audio, subtitles,
// servers, settings, fullscreen) on the right edge.
//
// Entangled region, so it takes state/handlers as explicit props and owns only
// presentation. The desktop hold-to-2x logic stays in the engine: this reports a
// plain click via `onForward10` and the press/release via the hold callbacks, so
// quick-press-vs-hold discrimination is not duplicated.
import { motion } from "framer-motion";
import { useMotionTokens } from "../../../constants/motion";
import IconBtn from "./IconBtn";
import { IS_TOUCH, SAFE_BOTTOM, SCRUBBER_BAND_STYLE } from "./constants";
import { ACCENT, TRACK, BUFFERED, TEXT_DIM, FONT } from "./theme";
import {
  IconAudio,
  IconCaptions,
  IconChevronLeft,
  IconChevronRight,
  IconEpisodes,
  IconFullscreen,
  IconFullscreenExit,
  IconPause,
  IconPlay,
  IconServers,
  IconSettings,
  IconSkipBack10,
  IconSkipForward10,
  IconVolumeHigh,
  IconVolumeLow,
  IconVolumeMute,
} from "./icons";

const TIME_STYLE = {
  color: TEXT_DIM,
  fontFamily: FONT,
  fontSize: 15,
  fontWeight: 500,
  letterSpacing: "-0.01em",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
  minWidth: 48,
  textAlign: "center",
};

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
  showAudioButton,
  showSubsButton,
  isFullscreen,
  onFullscreen,
}) {
  const M = useMotionTokens();
  const VolumeIcon = muted || volume === 0 ? IconVolumeMute : volume < 0.5 ? IconVolumeLow : IconVolumeHigh;
  const transportBtnSize = IS_TOUCH ? 56 : 52;

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
        paddingTop: IS_TOUCH ? 10 : 16,
        paddingLeft: IS_TOUCH ? 14 : 32,
        paddingRight: IS_TOUCH ? 14 : 32,
        paddingBottom: SAFE_BOTTOM,
        background: "linear-gradient(0deg, rgba(0,0,0,0.86) 0%, rgba(0,0,0,0.42) 52%, rgba(0,0,0,0) 100%)",
        fontFamily: FONT,
        pointerEvents: visible ? "auto" : "none",
        zIndex: 4,
      }}
    >
      {/* Scrubber line: elapsed · track · duration. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: IS_TOUCH ? 10 : 16,
          marginBottom: IS_TOUCH ? 6 : 14,
        }}
      >
        <span style={TIME_STYLE}>{fmtTime(currentTime)}</span>
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
            flex: 1,
            // 44px hit target on touch (Apple HIG minimum) — the visual bar
            // stays thin, only the touchable band grows.
            height: IS_TOUCH ? 44 : 30,
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            touchAction: "none",
          }}
        >
          <div
            style={{
              position: "relative",
              height: hoverRatio != null ? 9 : 6,
              width: "100%",
              background: TRACK,
              borderRadius: 999,
              transition: "height 0.18s cubic-bezier(0.2,0.8,0.2,1)",
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
              style={{
                position: "absolute",
                top: "50%",
                left: `calc(${effectiveRatio * 100}% - ${(hoverRatio != null ? 22 : 16) / 2}px)`,
                width: hoverRatio != null ? 22 : 16,
                height: hoverRatio != null ? 22 : 16,
                borderRadius: "50%",
                background: ACCENT,
                transform: "translateY(-50%)",
                transition: "width 0.18s cubic-bezier(0.2,0.8,0.2,1), height 0.18s cubic-bezier(0.2,0.8,0.2,1)",
                boxShadow: "0 2px 10px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.25)",
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
              style={{
                position: "absolute",
                bottom: 36,
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
        <span style={TIME_STYLE}>{fmtTime(duration)}</span>
      </div>

      {/* Transport grid: volume · centred transport · utilities. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span
          onMouseEnter={() => onVolHoverChange(true)}
          onMouseLeave={() => onVolHoverChange(false)}
          onFocus={() => onVolHoverChange(true)}
          onBlur={(e) => {
            if (e.currentTarget.contains(e.relatedTarget)) return;
            onVolHoverChange(false);
          }}
          style={{ display: "flex", alignItems: "center", justifySelf: "start" }}
        >
          <IconBtn label={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>
            <VolumeIcon size={22} />
          </IconBtn>
          {!IS_TOUCH && volHover && (
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              aria-label="Volume"
              className="np-volume-slider"
              style={{ width: 84, cursor: "pointer", marginLeft: 10 }}
            />
          )}
        </span>

        <div style={{ display: "flex", alignItems: "center", gap: IS_TOUCH ? 16 : 30 }}>
          {!IS_TOUCH && (
            <IconBtn
              size={transportBtnSize}
              label="Back 10 seconds"
              onClick={(e) => {
                e.stopPropagation();
                onBack10();
              }}
            >
              <IconSkipBack10 size={30} />
            </IconBtn>
          )}
          <IconBtn
            label={playing ? "Pause" : "Play"}
            onClick={onTogglePlay}
            size={IS_TOUCH ? 68 : 64}
          >
            {playing ? <IconPause size={30} /> : <IconPlay size={30} />}
          </IconBtn>
          {!IS_TOUCH && (
            <IconBtn
              size={transportBtnSize}
              label="Forward 10 seconds (hold for 2x)"
              onPointerDown={(e) => {
                e.stopPropagation();
                if (e.pointerType === "touch") return; // touch holds the SCREEN, not the button
                onForwardHoldStart();
              }}
              onPointerUp={onForwardHoldRelease}
              onPointerLeave={onForwardHoldRelease}
              onPointerCancel={onForwardHoldRelease}
              onClick={(e) => {
                e.stopPropagation();
                onForward10();
              }}
            >
              <IconSkipForward10 size={30} />
            </IconBtn>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "end" }}>
          {showEpisodeNav && (
            <>
              <IconBtn label="Previous episode" disabled={prevDisabled} onClick={onEpPrev}>
                <IconChevronLeft size={22} />
              </IconBtn>
              <IconBtn label="Next episode" disabled={nextDisabled} onClick={onEpNext}>
                <IconChevronRight size={22} />
              </IconBtn>
            </>
          )}
          {showEpisodesButton && (
            <IconBtn
              label="Episodes"
              active={panel === "episodes"}
              expanded={panel === "episodes"}
              onClick={() => onTogglePanel("episodes")}
            >
              <IconEpisodes size={22} />
            </IconBtn>
          )}
          {/* Audio + Subtitles live in the transport row, not only in the gear
              sheet: a viewer who wants the Tamil track should not have to guess
              which submenu holds it. Each appears only when it has something to
              do — a button that opens an empty list is worse than no button. */}
          {showAudioButton ? (
            <IconBtn
              label="Audio"
              active={panel === "audio"}
              expanded={panel === "audio"}
              onClick={() => onTogglePanel("audio")}
            >
              <IconAudio size={22} />
            </IconBtn>
          ) : null}
          {showSubsButton ? (
            <IconBtn
              label="Subtitles"
              active={panel === "subs"}
              expanded={panel === "subs"}
              onClick={() => onTogglePanel("subs")}
            >
              <IconCaptions size={22} />
            </IconBtn>
          ) : null}
          <IconBtn
            label="Servers"
            active={panel === "servers"}
            expanded={panel === "servers"}
            onClick={() => onTogglePanel("servers")}
          >
            <IconServers size={22} />
          </IconBtn>
          <IconBtn
            label="Settings"
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
            <IconSettings size={22} />
          </IconBtn>
          <IconBtn label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={onFullscreen}>
            {isFullscreen ? <IconFullscreenExit size={22} /> : <IconFullscreen size={22} />}
          </IconBtn>
        </div>
      </div>
    </motion.div>
  );
}