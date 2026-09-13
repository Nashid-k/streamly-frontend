import React from "react";
import { Play, RotateCcw, RotateCw, Volume2 } from "lucide-react";
import { logDebug } from "../utils/debugLogger";
import { usePreferences } from "../context/preferences";
import {
  PLAYER_CONTROLS,
  PLAYER_CONTROL_ORDER,
  resolveUILayout,
  resolveSkin,
} from "./playerUIDef";

/* ═══ PlayerPreview ═══════════════════════════════════════════════════
   A truthful mini player used by Player UI Studio and the Subtitles
   live-preview box: a muted looping demo video with the SAME zone-driven
   chrome the real CustomVideoPlayer renders (Player UI Studio zones,
   icon variants in the center/top clusters, volume slider only on the
   outer bottom corners, subtitle line styled from live preferences).

   Props:
   - layout      override of the stored playerUILayout (Studio passes the
                 live drag state so changes preview instantly)
   - visibility  override of the stored playerControls toggles
   - showChrome  false → video + subtitle line only (Subtitles preview)
   - label       preset/custom name shown on the caption chip
   - title       meta title next to the time row
   ═════════════════════════════════════════════════════════════════════ */

/* Public, CC-licensed Big Buck Bunny clip (test-videos.co.uk, ~1 MB).
   Chosen over the Google sample bucket, which now answers 403. */
const DEMO_VIDEO_SRC =
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";

const DemoVideo = () => {
  const videoRef = React.useRef(null);

  React.useEffect(() => {
    const el = videoRef.current;
    if (!el) return undefined;
    const attempt = el.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        /* Autoplay refusal (headless / strict browsers): poster stays. */
      });
    }
    return undefined;
  }, []);

  return (
    <video
      ref={videoRef}
      className="player-preview-video"
      src={DEMO_VIDEO_SRC}
      muted
      loop
      autoPlay
      playsInline
      preload="metadata"
      onError={() => {
        logDebug("preview", "Demo preview video failed to load — scrim fallback shown.", {
          src: DEMO_VIDEO_SRC,
        });
      }}
      aria-label="Demo video preview"
    />
  );
};

/* Render one icon like the real player's ghost circles. The real
   barControl only fills playPause's circle; every other icon-variant
   button is a transparent ghost (speed is always a text pill). */
const PreviewButton = ({ controlKey, variant = "bar", size = 14, children, title }) => {
  const meta = PLAYER_CONTROLS.find((c) => c.key === controlKey);
  const Icon = meta ? meta.Icon : null;
  const tone =
    controlKey === "playPause" ? " is-filled"
      : controlKey === "aspectRatio" ? " is-bordered"
        : variant === "icon" ? " is-muted"
          : "";
  return (
    <span
      className={`player-preview-btn${tone}`}
      title={title || (meta ? meta.label : controlKey)}
    >
      {Icon ? <Icon size={size} /> : children}
    </span>
  );
};

/* ── Demo transport constants (what the fake time row shows) ── */
const DEMO_CURRENT = "1:47";
const DEMO_DURATION = "10:34";

const PlayerPreview = ({
  layout: layoutOverride,
  visibility: visibilityOverride,
  showChrome = true,
  label,
  presetId,
  title = "Streamly Originals",
  episodeTag = "S1:E1",
}) => {
  const {
    playerControls = {},
    playerUILayout,
    playerUIPreset = "classic",
    subtitleFont = "cinejoy",
    subtitleSize = 100,
    subtitleColor = "#ffffff",
    subtitleBgBlur = true,
  } = usePreferences();

  const resolved = React.useMemo(() => {
    if (layoutOverride) return resolveUILayout(layoutOverride);
    return resolveUILayout(playerUILayout);
  }, [layoutOverride, playerUILayout]);

  const visibility = visibilityOverride || playerControls;

  /* Mirror CustomVideoPlayer.zoneKeys: canonical order, tray + hidden out. */
  const zoneKeys = (zone) =>
    PLAYER_CONTROL_ORDER.filter((k) => resolved[k] === zone && visibility[k] !== false);

  /* Variant rules copied from the real player so the preview never lies:
     - volume: full icon+slider only on the outer bottom corners, compact
       mute icon everywhere else (bottom center / top zones).
     - playbackSpeed: "1x" pill on the bar, plain gauge icon in icon zones.
     - jumpForwardBackward: two buttons (back + forward). */
  const renderControl = (key, variant) => {
    if (key === "volume") {
      if (variant === "icon") {
        return <PreviewButton key={key} controlKey={key} variant="icon" size={14} />;
      }
      return (
        <span key={key} className="player-preview-volume">
          <PreviewButton controlKey={key} size={14} />
          <span className="player-preview-volbar" aria-hidden="true">
            <span className="player-preview-volfill" />
          </span>
        </span>
      );
    }
    if (key === "jumpForwardBackward") {
      return (
        <React.Fragment key={key}>
          <PreviewButton controlKey={key} variant={variant} size={13} title="Back 10s">
            <RotateCcw size={13} />
          </PreviewButton>
          <PreviewButton controlKey={key} variant={variant} size={13} title="Forward 10s">
            <RotateCw size={13} />
          </PreviewButton>
        </React.Fragment>
      );
    }
    if (key === "playbackSpeed") {
      /* The real player renders the rate pill in every variant. */
      return (
        <span key={key} className="player-preview-speedpill" title="Speed">
          1x
        </span>
      );
    }
    return <PreviewButton key={key} controlKey={key} variant={variant} size={14} />;
  };

  /* Which bottom corner gets the slider — mirrors the real player: the
     bar variant is used in bottomLeft/bottomRight, icon elsewhere. */
  const volumeVariant = (zoneId) => (zoneId === "bottomLeft" || zoneId === "bottomRight" ? "bar" : "icon");

  const topLeftKeys = zoneKeys("topLeft");
  const topRightKeys = zoneKeys("topRight");
  const bottomLeftKeys = zoneKeys("bottomLeft");
  const bottomCenterKeys = zoneKeys("bottomCenter");
  const bottomRightKeys = zoneKeys("bottomRight");
  const isPlaying = visibility.playPause !== false; // demo: always "playing"

  /* Skin tokens — same source of truth as the real player. A presetId
     prop overrides the stored preset so the Studio preset cards can show
     each look live; "custom" resolves to the Classic tokens. */
  const skin = React.useMemo(
    () => resolveSkin(presetId || playerUIPreset),
    [presetId, playerUIPreset],
  );
  const skinVars = React.useMemo(
    () => ({
      "--skin-bar-bg": skin.barBg,
      "--skin-bar-blur": skin.barBlur,
      "--skin-bar-border": skin.barBorder,
      "--skin-bar-radius": skin.barRadius,
      "--skin-bar-inset": skin.barInset || "0px",
      "--skin-btn-bg": skin.btnBg,
      "--skin-btn-ghost-bg": skin.btnGhostBg || "transparent",
      "--skin-btn-border": skin.btnBorder,
      "--skin-btn-radius": skin.btnRadius,
      "--skin-progress-height": skin.progressHeight,
      "--skin-progress-fill": skin.progressFill,
      "--skin-progress-glow": skin.progressGlow,
      "--skin-progress-track": skin.progressTrack || "rgba(255,255,255,0.12)",
      "--skin-progress-buffered": skin.progressBuffered || "rgba(255,255,255,0.14)",
      "--skin-time-font": skin.timeFont,
      "--skin-accent": skin.accent,
      "--skin-panel-bg": skin.panelBg,
      "--skin-panel-blur": skin.panelBlur,
      "--skin-panel-border": skin.panelBorder,
      "--skin-scrim": skin.scrim,
      "--skin-chrome-shadow": skin.chromeShadow,
      /* Full-UI tokens — keep the demo honest with the real player. */
      "--skin-hud-bg": skin.hudBg,
      "--skin-hud-blur": skin.hudBlur,
      "--skin-hud-border": skin.hudBorder,
      "--skin-hud-radius": skin.hudRadius,
      "--skin-hud-shadow": skin.hudShadow,
      "--skin-hud-font": skin.hudFont,
      "--skin-toast-bg": skin.toastBg || skin.hudBg,
      "--skin-badge-bg": skin.badgeBg || skin.hudBg,
      "--skin-center-icon-bg": skin.centerIconBg,
      "--skin-center-icon-blur": skin.centerIconBlur,
      "--skin-center-icon-border": skin.centerIconBorder,
      "--skin-font-body": skin.fontBody || skin.hudFont,
      "--skin-vignette": skin.vignette || "none",
    }),
    [skin],
  );

  const subtitleStyle = {
    fontFamily:
      subtitleFont === "montserrat"
        ? "'Montserrat', sans-serif"
        : subtitleFont === "netflix"
          ? "'Arial', sans-serif"
          : "'Inter', sans-serif",
    fontSize: `calc(clamp(11px, 1.8vw, 20px) * ${(Number(subtitleSize) || 100) / 100})`,
    color: subtitleColor,
    background: subtitleBgBlur ? "rgba(0,0,0,0.55)" : "transparent",
    borderRadius: subtitleBgBlur ? 6 : 0,
    backdropFilter: subtitleBgBlur ? "blur(8px)" : "none",
    WebkitBackdropFilter: subtitleBgBlur ? "blur(8px)" : "none",
    textShadow: subtitleBgBlur
      ? "0 1px 8px rgba(0,0,0,0.95), 0 0 3px rgba(0,0,0,0.8)"
      : "0 2px 4px rgba(0,0,0,0.95), -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
  };

  return (
    <div
      className={`player-preview${showChrome ? "" : " player-preview--bare"}`}
      data-testid="player-preview"
      data-preset={label || undefined}
      data-player-skin={skin.id}
      style={skinVars}
    >
      <div className="player-preview-screen">
        <DemoVideo />
        <div
          className="player-preview-scrim"
          aria-hidden="true"
          style={{ background: "var(--skin-scrim)" }}
        />
        {skin.vignette && skin.vignette !== "none" && (
          <div
            className="player-preview-scrim"
            aria-hidden="true"
            style={{ background: "var(--skin-vignette)" }}
          />
        )}

        {showChrome && (
          <div className="player-preview-chrome" aria-hidden="true">
            {/* Mini volume HUD — floats top-center and shows the skin's
                HUD surface (bg, blur, border, radius, shadow, font) exactly
                like the real player's volume/brightness/seek cards. */}
            <div
              className="player-preview-hudchip"
              aria-hidden="true"
              style={{
                background: "var(--skin-hud-bg, linear-gradient(180deg, rgba(22,22,26,0.9), rgba(10,10,12,0.9)))",
                backdropFilter: "blur(var(--skin-hud-blur, 24px))",
                WebkitBackdropFilter: "blur(var(--skin-hud-blur, 24px))",
                border: "var(--skin-hud-border, none)",
                borderRadius: "var(--skin-hud-radius, 18px)",
                boxShadow: "var(--skin-hud-shadow, none)",
                fontFamily: "var(--skin-hud-font, inherit)",
              }}
            >
              <Volume2 size={11} />
              <span>72%</span>
            </div>

            {/* Top zones */}
            {(topLeftKeys.length > 0 || topRightKeys.length > 0) && (
              <div className="player-preview-top">
                <div className="player-preview-cluster">
                  {topLeftKeys.map((k) => renderControl(k, "icon"))}
                </div>
                <div className="player-preview-cluster">
                  {topRightKeys.map((k) => renderControl(k, "icon"))}
                </div>
              </div>
            )}

            {/* Center play glyph — skinned like the real player's burst */}
            {!isPlaying && (
              <div className="player-preview-center">
                <span
                  className="player-preview-play"
                  style={{
                    background: "var(--skin-center-icon-bg, rgba(0,0,0,0.35))",
                    border: "var(--skin-center-icon-border, none)",
                    borderRadius: "var(--skin-hud-radius, 50%)",
                    color: skin.centerIconTone === "flat-red" || skin.centerIconTone === "gilded" ? "var(--skin-accent)" : "currentColor",
                  }}
                >
                  <Play size={16} fill="currentColor" />
                </span>
              </div>
            )}

            {/* Subtitle line — styled from live preferences */}
            <div className="player-preview-subwrap">
              <span className="player-preview-sub" style={subtitleStyle}>
                Here is what your subtitles will look like.
              </span>
            </div>

            {/* Bottom stack: progress → time row → control bar */}
            <div className="player-preview-bottom">
              <div
                className="player-preview-progress"
                aria-hidden="true"
                style={{
                  height: "var(--skin-progress-height, 3px)",
                  background: "var(--skin-progress-track, rgba(255,255,255,0.12))",
                }}
              >
                <span
                  className="player-preview-progress-fill"
                  style={{
                    background: "var(--skin-progress-fill)",
                    boxShadow: "var(--skin-progress-glow, none)",
                  }}
                />
                <span className="player-preview-progress-dot" />
              </div>
              <div
                className="player-preview-timerow"
                style={{ fontFamily: "var(--skin-font-body, inherit)" }}
              >
                <span className="player-preview-time">{DEMO_CURRENT} / {DEMO_DURATION}</span>
                <span className="player-preview-titlemeta">
                  <span className="player-preview-title">{title}</span>
                  <span
                    className="player-preview-pill"
                    style={{
                      background: "var(--skin-badge-bg, rgba(255,255,255,0.1))",
                      borderRadius: "var(--skin-hud-radius, 999px)",
                    }}
                  >
                    {episodeTag}
                  </span>
                </span>
                <span className="player-preview-time player-preview-time--ghost" aria-hidden="true" />
              </div>
              <div
                className="player-preview-bar"
                style={{
                  background: "var(--skin-bar-bg, transparent)",
                  backdropFilter: "blur(var(--skin-bar-blur, 0px))",
                  WebkitBackdropFilter: "blur(var(--skin-bar-blur, 0px))",
                  border: "var(--skin-bar-border, none)",
                  borderRadius: "var(--skin-bar-radius, 0px)",
                  boxShadow: "var(--skin-chrome-shadow, none)",
                }}
              >
                <div className="player-preview-cluster">
                  {bottomLeftKeys.map((k) => renderControl(k, k === "volume" ? volumeVariant("bottomLeft") : "bar"))}
                </div>
                <div className="player-preview-cluster player-preview-cluster--center">
                  {bottomCenterKeys.map((k) => renderControl(k, "icon"))}
                </div>
                <div className="player-preview-cluster">
                  {bottomRightKeys.map((k) => renderControl(k, k === "volume" ? volumeVariant("bottomRight") : "bar"))}
                </div>
              </div>
            </div>
          </div>
        )}

        {!showChrome && (
          <div className="player-preview-subwrap">
            <span className="player-preview-sub" style={subtitleStyle}>
              Here is what your subtitles will look like.
            </span>
          </div>
        )}
      </div>
      {label && <div className="player-preview-chip">{label}</div>}
    </div>
  );
};

export default PlayerPreview;
