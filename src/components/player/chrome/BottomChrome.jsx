// The bottom chrome: scrubber + transport row.
//
// This is the most entangled region of the player, so it takes its state and
// handlers as explicit props and owns only presentation. Extraction keeps the
// scrubber geometry (played / buffered / hover / thumbnail / time bubble / skip
// bands) and the transport controls in one place the Apple TV+ re-layout can
// restyle without touching the engine.
//
// The desktop hold-to-2x logic deliberately stays in the engine: the component
// only calls `onForwardHoldStart` / `onForwardHoldRelease` and reports the plain
// click through `onForward10`, so the quick-press-vs-hold discrimination is not
// duplicated.
import { motion } from "framer-motion";
import {
  AudioLines,
  Captions,
  ChevronLeft,
  ChevronRight,
  ListVideo,
  Maximize,
  Minimize,
  Pause,
  Play,
  Server,
  Settings,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useMotionTokens } from "../../../constants/motion";
import IconBtn from "./IconBtn";
import { BTN_SIZE, IS_TOUCH, SAFE_BOTTOM, SCRUBBER_BAND_STYLE } from "./constants";
import { ACCENT, TRACK, BUFFERED } from "./theme";

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
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

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
        paddingTop: IS_TOUCH ? 4 : 8,
        paddingLeft: IS_TOUCH ? 12 : 24,
        paddingRight: IS_TOUCH ? 12 : 24,
        paddingBottom: SAFE_BOTTOM,
        // Softer than the 0.95/0.7 it replaced: the controls already carry
        // their own shadows, so a full-strength scrim only hid the picture.
        background: "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0) 100%)",
        pointerEvents: visible ? "auto" : "none",
        zIndex: 4,
      }}
    >
      {/* Scrubber: white played · gray buffered · hover knob + time bubble. */}
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
          height: IS_TOUCH ? 44 : 36,
          display: "flex",
          alignItems: "center",
          cursor: "pointer",
          touchAction: "none",
        }}
      >
        <div
          style={{
            position: "relative",
            height: hoverRatio != null ? 7 : 4,
            width: "100%",
            background: TRACK,
            borderRadius: 999,
            transition: "height 0.15s",
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
              — only cue/provider/dataset boundaries (cueBounds carries its
              source stamp), so a 90s guess cannot masquerade as measured data.
              The geometry lives in `scrubberBands`, which is built from markers
              that have already survived normalizeSkipBoundaries and returns null
              for any band it cannot place inside the track. */}
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
              left: `calc(${effectiveRatio * 100}% - ${(hoverRatio != null ? 18 : 14) / 2}px)`,
              width: hoverRatio != null ? 18 : 14,
              height: hoverRatio != null ? 18 : 14,
              borderRadius: "50%",
              background: ACCENT,
              transform: "translateY(-50%)",
              transition: "width 0.15s, height 0.15s",
              boxShadow: "0 1px 6px rgba(0,0,0,0.6)",
            }}
          />
        </div>
        {/* Hover/drag thumbnail (Netflix/YouTube scrub preview): the latest
            captured frame at the hover position, clamped so it never leaves
            the frame. Hidden until a capture lands; scrubbing never waits
            on it. */}
        {hoverRatio != null && previewUrl && (
          <div
            style={{
              position: "absolute",
              bottom: previewBox.lift,
              // Centre on the pointer, clamped so the card never leaves the frame.
              left: Math.min(
                Math.max(hoverRatio * playerW, previewBox.thumbInset),
                Math.max(previewBox.thumbInset, playerW - previewBox.thumbInset),
              ),
              transform: "translateX(-50%)",
              width: previewBox.thumbW,
              height: previewBox.thumbH,
              borderRadius: 6,
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
              bottom: 28,
              left: `${Math.min(94, Math.max(6, hoverRatio * 100))}%`,
              transform: "translateX(-50%)",
              background: "rgba(0,0,0,0.8)",
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              padding: "4px 8px",
              borderRadius: 4,
              pointerEvents: "none",
              whiteSpace: "nowrap",
            }}
          >
            {fmtTime(hoverRatio * duration)}
          </div>
        )}
      </div>
      {/* Transport row. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
          <IconBtn label={playing ? "Pause" : "Play"} onClick={onTogglePlay}>
            {playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
          </IconBtn>
          {!IS_TOUCH && (
            <>
              <button
                type="button"
                className="np-icon-btn"
                aria-label="Back 10 seconds"
                title="Back 10 seconds"
                onClick={(e) => {
                  e.stopPropagation();
                  onBack10();
                }}
                style={{
                  position: "relative",
                  width: BTN_SIZE,
                  height: BTN_SIZE,
                  borderRadius: "50%",
                  border: "none",
                  background: "transparent",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <ChevronLeft size={24} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className="np-icon-btn"
                aria-label="Forward 10 seconds (hold for 2x)"
                title="Forward 10 seconds (hold for 2x)"
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
                style={{
                  position: "relative",
                  width: BTN_SIZE,
                  height: BTN_SIZE,
                  borderRadius: "50%",
                  border: "none",
                  background: "transparent",
                  color: "#fff",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <ChevronRight size={24} strokeWidth={1.5} />
              </button>
            </>
          )}
          {/* Volume cluster. The slider used to open on hover alone, which
              made it unreachable by keyboard and a no-show on touch —
              `volHover` now also tracks focus, and the blur handler ignores
              focus moving from the mute button into the slider itself. */}
          <span
            onMouseEnter={() => onVolHoverChange(true)}
            onMouseLeave={() => onVolHoverChange(false)}
            onFocus={() => onVolHoverChange(true)}
            onBlur={(e) => {
              if (e.currentTarget.contains(e.relatedTarget)) return;
              onVolHoverChange(false);
            }}
            style={{ display: "flex", alignItems: "center" }}
          >
            <IconBtn label={muted ? "Unmute" : "Mute"} onClick={onToggleMute}>
              <VolumeIcon size={24} />
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
                style={{ width: 72, cursor: "pointer", marginLeft: 4 }}
              />
            )}
          </span>
          <span
            style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.9)",
              fontVariantNumeric: "tabular-nums",
              marginLeft: 12,
              whiteSpace: "nowrap",
            }}
          >
            {fmtTime(currentTime)} / {fmtTime(duration)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {showEpisodeNav && (
            <>
              <IconBtn label="Previous episode" disabled={prevDisabled} onClick={onEpPrev}>
                <SkipBack size={24} />
              </IconBtn>
              <IconBtn label="Next episode" disabled={nextDisabled} onClick={onEpNext}>
                <SkipForward size={24} />
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
              <ListVideo size={24} />
            </IconBtn>
          )}
          {/* Audio + Subtitles live HERE, not only in the gear sheet. A viewer
              who wants the Tamil track should not have to guess which submenu of
              Settings holds it — these are the two controls every streaming
              player puts in the transport row, and burying them was the thing
              this change exists to fix.
              Each button appears only when it has something to do: no dub on
              a single-audio server means no Audio button, and an empty or
              still-searching subtitle list means no Subtitles button. A
              button that opens an empty list is worse than no button. */}
          {showAudioButton ? (
            <IconBtn
              label="Audio"
              active={panel === "audio"}
              expanded={panel === "audio"}
              onClick={() => onTogglePanel("audio")}
            >
              <AudioLines size={22} />
            </IconBtn>
          ) : null}
          {showSubsButton ? (
            <IconBtn
              label="Subtitles"
              active={panel === "subs"}
              expanded={panel === "subs"}
              onClick={() => onTogglePanel("subs")}
            >
              <Captions size={22} />
            </IconBtn>
          ) : null}
          {/* Server switcher: always available — VidCore (4K default),
              VidSrc and NHD (dubs) are pickable mid-playback. */}
          <IconBtn
            label="Servers"
            active={panel === "servers"}
            expanded={panel === "servers"}
            onClick={() => onTogglePanel("servers")}
          >
            <Server size={22} />
          </IconBtn>
          <IconBtn
            label="Settings"
            // "subs" was missing here, so opening Subtitles left the gear
            // unlit while every other panel lit it.
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
            <Settings size={24} />
          </IconBtn>
          <IconBtn label={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={onFullscreen}>
            {isFullscreen ? <Minimize size={22} /> : <Maximize size={22} />}
          </IconBtn>
        </div>
      </div>
    </motion.div>
  );
}