// The control deck: the player's primary surface.
//
// From-scratch redesign (2026-11): the transport is no longer a full-bleed
// gradient bar with floating pills. It is one rounded glass DECK floating at
// the bottom of the picture — a scrubber across its top edge and a single
// control row beneath it. The deck is the anchor every other surface (menus,
// cards, HUDs) is aligned to, so the player reads as one composed instrument.
//
// Entangled region, so it takes state/handlers as explicit props and owns only
// presentation. The desktop hold-to-2x logic stays in the engine: the forward
// button reports a plain click via `onForward10` and the press/release via the
// hold callbacks, so quick-press-vs-hold discrimination is not duplicated.
// (Audio-track switching is NOT a chrome button — it lives inside Settings.)
import { motion, useReducedMotion } from "framer-motion";
import { PRESS_SCALE, useMotionTokens } from "../../../constants/motion";
import IconBtn from "./IconBtn";
import Tooltip from "./Tooltip";
import { IS_TOUCH, SAFE_BOTTOM, SCRUBBER_BAND_STYLE } from "./constants";
import {
  ACCENT,
  ACCENT_DIM,
  ACCENT_EDGE,
  ACCENT_FG,
  ACCENT_GLOW,
  ACCENT_SOFT,
  BUFFERED,
  DECK_BG,
  DECK_BORDER,
  DECK_SHADOW,
  GLASS_BLUR,
  RADIUS,
  SCRIM,
  TRACK,
} from "./theme";
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
  IconSkipBack10,
  IconSkipForward10,
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
  /* True while the touch-only centre transport (rewind / play / forward) is
     already drawn over the picture. Its play button IS the mobile play/pause,
     so this pill must stand down or the viewer sees two of them. */
  centerTransport = false,
  onBack10,
  onForward10,
  onForwardHoldStart,
  onForwardHoldRelease,
  /* The skip amount actually applied, in seconds. The buttons used to say
     "10 seconds" unconditionally, so a viewer who set Seek Time to 30 got a
     30-second jump from a button labelled 10 — the label has to name what
     the control does. */
  skipSeconds = 10,
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
  showSubsButton,
  isFullscreen,
  onFullscreen,
  // Gear quality badge (the chip next to the cog)
  hdBadge,
}) {
  // Resolved here (not left to the global MotionConfig) so the show/hide of the
  // whole deck honours the same token contract as every other surface.
  const M = useMotionTokens(useReducedMotion());
  const VolumeIcon = muted || volume === 0 ? IconVolumeMute : volume < 0.5 ? IconVolumeLow : IconVolumeHigh;
  const pillSize = IS_TOUCH ? 54 : 50;
  const playSize = IS_TOUCH ? 66 : 58;
  const volFill = muted || volume === 0 ? 0 : volume;
  const knob = hoverRatio != null ? 18 : 14;

  return (
    <motion.div
      initial={M.MODAL_PANEL.initial}
      animate={M.MODAL_PANEL.animate}
      exit={M.MODAL_PANEL.exit}
      transition={M.MODAL_PANEL.transition}
      // Faded chrome is not just invisible: without this its buttons stay in the
      // tab order and receive focus while painted at 0 opacity.
      inert={!visible}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        paddingTop: IS_TOUCH ? 14 : 20,
        // The player element can be mirrored by the OS/app under an RTL locale
        // (Arabic is a shipped language), which flips the INLINE axis: the
        // physical `paddingLeft`/`paddingRight` pair then swapped sides and the
        // whole deck was flush against the wrong edge.
        paddingInlineStart: IS_TOUCH ? 10 : 24,
        paddingInlineEnd: IS_TOUCH ? 10 : 24,
        paddingBottom: SAFE_BOTTOM,
        background: SCRIM,
        pointerEvents: visible ? "auto" : "none",
        // Above the panel's full-frame dim: the dim darkens the picture so the
        // panel rows read, but the deck keeps its own material. (The panel is
        // painted after this node, so it still layers on top.)
        zIndex: 6,
      }}
    >
      {/* The deck: one continuous instrument, not a row of separate pills. */}
      <div
        className="np-deck"
        style={{
          position: "relative",
          borderRadius: RADIUS.deck,
          background: DECK_BG,
          border: `1px solid ${DECK_BORDER}`,
          boxShadow: DECK_SHADOW,
          backdropFilter: GLASS_BLUR,
          WebkitBackdropFilter: GLASS_BLUR,
          padding: IS_TOUCH ? "4px 10px 8px" : "6px 16px 10px",
        }}
      >
        {/* Scrubber: one hairline across the deck, accent played. */}
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
            height: IS_TOUCH ? 40 : 26,
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            touchAction: "none",
            marginBottom: IS_TOUCH ? 2 : 4,
          }}
        >
          <div
            className="np-scrub-line"
            style={{
              position: "relative",
              height: hoverRatio != null ? 10 : 6,
              width: "100%",
              background: TRACK,
              borderRadius: RADIUS.pill,
              transition: "height var(--zxc-t-fast) var(--zxc-ease)",
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
                      borderRadius: RADIUS.pill,
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
                background: `linear-gradient(90deg, ${ACCENT_DIM}, ${ACCENT})`,
                borderRadius: RADIUS.pill,
                boxShadow: "0 0 14px rgba(149,255,80,0.3)",
              }}
            />
            {/* Measured skip windows, drawn the way the provider draws them: a
                band over the intro, a band over the credits. Estimates never
                paint here — only cue/provider/dataset boundaries (cueBounds
                carries its source stamp), so a 90s guess cannot masquerade as
                measured data. */}
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
                left: `calc(${effectiveRatio * 100}% - ${knob / 2}px)`,
                width: knob,
                height: knob,
                borderRadius: "50%",
                background: "#fff",
                border: `2px solid ${ACCENT}`,
                transform: "translateY(-50%)",
                transition:
                  "width var(--zxc-t-fast) var(--zxc-ease), height var(--zxc-t-fast) var(--zxc-ease)",
                boxShadow: `0 0 0 4px ${ACCENT_SOFT}, 0 2px 8px rgba(0,0,0,0.55)`,
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
                borderRadius: 14,
                border: `1px solid ${ACCENT_EDGE}`,
                boxShadow: "0 18px 44px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,0,0,0.4)",
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
                background: "rgba(9,12,10,0.9)",
                border: `1px solid ${ACCENT_EDGE}`,
                color: "#fff",
                fontSize: 12.5,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                padding: "4px 9px",
                borderRadius: 8,
                pointerEvents: "none",
                whiteSpace: "nowrap",
              }}
            >
              {fmtTime(hoverRatio * duration)}
            </div>
          )}
        </div>

        {/* Control row: transport left, volume + clock, utilities right. */}
        <div className="np-transport" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {/* ±skip buttons flank the play button. The skips are bare IconBtns:
              each carries its own hover disc, so they need no capsule. */}
          {!IS_TOUCH && (
            <Tooltip tip={`Rewind ${skipSeconds} seconds`} kbd="←">
              <IconBtn size={40} label={`Rewind ${skipSeconds} seconds`} onClick={onBack10}>
                <IconSkipBack10 size={22} />
              </IconBtn>
            </Tooltip>
          )}
          {!centerTransport && (
            <motion.div
              className="np-play-pill"
              style={{ ...PILL, width: playSize, height: playSize }}
              whileTap={{ scale: PRESS_SCALE.CONTROL }}
              whileHover={{ scale: 1.05 }}
            >
              <Tooltip tip={playing ? "Pause" : "Play"} kbd="k">
                <IconBtn
                  size={playSize}
                  label={playing ? "Pause" : "Play"}
                  onClick={onTogglePlay}
                  style={{
                    background: ACCENT,
                    color: ACCENT_FG,
                    boxShadow: ACCENT_GLOW,
                  }}
                >
                  {playing ? <IconPause size={30} /> : <IconPlay size={28} />}
                </IconBtn>
              </Tooltip>
            </motion.div>
          )}
          {!IS_TOUCH && (
            <Tooltip tip={`Forward ${skipSeconds} seconds (hold for 2×)`} kbd="→">
              {/* A quick press seeks; a sustained press arms 2x on the engine side
                  and then reports `desktopHoldFiredRef` so the click that follows
                  the release does not also seek. The engine owns the timing; this
                  only reports press and release. */}
              <IconBtn
                size={40}
                label={`Forward ${skipSeconds} seconds`}
                onClick={onForward10}
                onPointerDown={onForwardHoldStart}
                onPointerUp={onForwardHoldRelease}
                onPointerLeave={onForwardHoldRelease}
                onPointerCancel={onForwardHoldRelease}
              >
                <IconSkipForward10 size={22} />
              </IconBtn>
            </Tooltip>
          )}

          {/* Volume: the chip widens on hover to reveal the slider (CSS-driven). */}
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
              padding: "0 5px",
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

          {/* Clock: "3:24 / 4:28". */}
          <div
            className="np-pill np-time-pill"
            aria-hidden="true"
            style={{
              ...PILL,
              height: pillSize,
              minHeight: pillSize,
              padding: "0 16px",
              color: "#fff",
              fontSize: IS_TOUCH ? 14 : 13,
              fontWeight: 650,
              letterSpacing: 0.4,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            <span>{fmtTime(currentTime)}</span>
            <span style={{ margin: "0 7px", color: ACCENT, fontWeight: 700 }}>/</span>
            <span style={{ color: "rgba(255,255,255,0.62)" }}>{fmtTime(duration)}</span>
          </div>

          <div style={{ flex: 1 }} />

          {/* Utility cluster: one capsule on the right edge of the deck. */}
          <div
            className="np-pill np-right-pill"
            style={{
              ...PILL,
              height: pillSize,
              padding: IS_TOUCH ? "0 8px" : "0 10px",
              gap: IS_TOUCH ? 4 : 6,
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
            <Tooltip tip="Settings">
              <IconBtn
                size={IS_TOUCH ? 40 : 38}
                label="Settings"
                badge={hdBadge}
                active={
                  panel === "settings" ||
                  panel === "audio" ||
                  panel === "subs" ||
                  panel === "substyle" ||
                  panel === "video" ||
                  panel === "sourcequality" ||
                  panel === "speed" ||
                  panel === "sleep" ||
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
                <IconBtn
                  size={IS_TOUCH ? 40 : 38}
                  label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  onClick={onFullscreen}
                >
                  {isFullscreen ? <IconFullscreenExit size={20} /> : <IconFullscreen size={20} />}
                </IconBtn>
              </div>
            </Tooltip>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
