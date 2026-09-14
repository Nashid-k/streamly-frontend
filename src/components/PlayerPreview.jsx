import React from "react";
import { Play, RotateCcw, RotateCw, Volume2, Maximize, Captions } from "lucide-react";
import { logDebug } from "../utils/debugLogger";
import { usePreferences } from "../context/preferences";
import {
  PLAYER_CONTROLS,
  PLAYER_CONTROL_ORDER,
  PLAYER_UI_PRESETS,
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
  draggable = false,
  iconVariants = {},
  onZoneDrop,
  onChipDragStart,
}) => {
  const [dragOverZone, setDragOverZone] = React.useState(null);

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
    if (draggable) {
      const variantStyle = iconVariants[key] || "outline";
      const meta = PLAYER_CONTROLS.find((c) => c.key === key);
      const Icon = meta?.Icon;
      return (
        <span
          key={key}
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.setData("text/plain", key);
            e.dataTransfer.effectAllowed = "move";
            onChipDragStart?.(e, key);
          }}
          className={`player-preview-chip-${variantStyle}`}
          style={{ width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center", margin: "0 2px", cursor: "grab" }}
        >
          {Icon && <Icon size={12} />}
        </span>
      );
    }

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

  const effectivePreset = React.useMemo(() => {
    if (presetId) return presetId;
    if (label && typeof label === "string") {
      const match = PLAYER_UI_PRESETS.find(
        (p) => p.name.toLowerCase() === label.toLowerCase() || p.id === label.toLowerCase(),
      );
      if (match) return match.id;
    }
    if (layoutOverride) return "custom";
    return playerUIPreset || "classic";
  }, [presetId, label, layoutOverride, playerUIPreset]);

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
            {/* Mini volume HUD — floats top-center */}
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

            {/* Subtitle line */}
            <div className="player-preview-subwrap">
              <span className="player-preview-sub" style={subtitleStyle}>
                Here is what your subtitles will look like.
              </span>
            </div>

            {/* ══ ARCHETYPE 1: MINIMAL (Zen Floating Island & Center Trio) ══ */}
            {effectivePreset === "minimal" ? (
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, background: "rgba(255,255,255,0.12)" }}>
                   <div style={{ width: "30%", height: "100%", background: "#fff" }} />
                </div>
                <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 8, background: "rgba(8,8,12,0.88)", backdropFilter: "blur(28px)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 999, padding: "0 16px", height: 32 }}>
                  <Play size={12} fill="#fff" title="Play / Pause" />
                  <span style={{ color: "#fff", fontSize: 10, fontWeight: 700, fontFamily: "monospace" }}>{DEMO_CURRENT}</span>
                  <div style={{ width: 80, height: 2, background: "rgba(255,255,255,0.2)", borderRadius: 2 }}>
                    <div style={{ width: "30%", height: "100%", background: "#fff", borderRadius: 2 }} />
                  </div>
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 10, fontWeight: 700, fontFamily: "monospace" }}>-{DEMO_DURATION}</span>
                </div>
              </div>
            ) : effectivePreset === "compact" ? (
              /* ══ ARCHETYPE 2: COMPACT (Floating Dock & Vertical Action Rail) ══ */
              <>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 44, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(20px)", borderRadius: "0 12px 12px 0", display: "flex", flexDirection: "column", alignItems: "center", padding: "12px 0", gap: 6 }}>
                  <Volume2 size={14} color="#fff" />
                  <div style={{ flex: 1 }} />
                  <span style={{ color: "#fff", fontSize: 8, fontWeight: 700 }}>-10s</span>
                  <Play size={20} fill="#fff" color="#fff" style={{ margin: "4px 0" }} />
                  <span style={{ color: "#fff", fontSize: 8, fontWeight: 700 }}>+10s</span>
                  <div style={{ flex: 1 }} />
                  <Captions size={14} color="#fff" />
                  <span style={{ color: "#fff", fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,0.2)", borderRadius: 8, padding: "2px 4px" }}>1x</span>
                  <Maximize size={14} color="#fff" />
                </div>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: "rgba(255,255,255,0.08)" }}>
                  <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "30%", background: "#fff" }} />
                  <div style={{ position: "absolute", bottom: "30%", left: "50%", transform: "translate(-50%, 50%)", width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />
                </div>
              </>
            ) : effectivePreset === "theater" ? (
              /* ══ ARCHETYPE 3: THEATER (Top Cinema Marquee, Grand Stage & Gold Timeline) ══ */
              <>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 36, background: "linear-gradient(to bottom, rgba(10,6,0,0.88), transparent)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "Georgia, serif", fontSize: 12, color: "#ffd166", fontWeight: 700, fontStyle: "italic" }}>{title}</span>
                    <span style={{ color: "#ffd166", fontSize: 8, border: "1px solid rgba(255,209,102,0.4)", borderRadius: 2, padding: "1px 3px" }}>★ 4K IMAX</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, color: "#ffd166", fontSize: 8, fontWeight: 700 }}>
                    <span>SUBTITLES</span><span>AUDIO</span>
                  </div>
                </div>
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", gap: 12 }}>
                  <RotateCcw size={16} color="#ffd166" style={{ border: "1px solid #ffd166", borderRadius: "50%", padding: 4 }} />
                  <div style={{ width: 48, height: 48, borderRadius: "50%", boxShadow: "0 0 0 8px rgba(255,209,102,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Play size={24} fill="#ffd166" color="#ffd166" style={{ marginLeft: 2 }} />
                  </div>
                  <RotateCw size={16} color="#ffd166" style={{ border: "1px solid #ffd166", borderRadius: "50%", padding: 4 }} />
                </div>
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 42, background: "linear-gradient(to top, rgba(6,4,0,0.95), transparent)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <div style={{ width: "100%", height: 3, background: "rgba(255,209,102,0.15)" }}>
                    <div style={{ width: "30%", height: "100%", background: "#ffd166", boxShadow: "0 0 4px #ffd166" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 12px" }}>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 10, color: "#ffd166", fontWeight: 700 }}>{DEMO_CURRENT} / {DEMO_DURATION}</div>
                    <div style={{ fontFamily: "Georgia, serif", fontSize: 9, color: "#ffd166", fontStyle: "italic", opacity: 0.8, position: "absolute", left: "50%", transform: "translateX(-50%)" }}>42min remaining</div>
                    <div style={{ display: "flex", gap: 8 }} className="player-preview-volume"><Volume2 size={12} color="#ffd166" /><Maximize size={12} color="#ffd166" /></div>
                  </div>
                </div>
              </>
            ) : effectivePreset === "studio" ? (
              /* ══ ARCHETYPE 4: STUDIO (Broadcast Telemetry Strip, Timecode Ruler & Pro Console) ══ */
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
                <div style={{ height: 16, background: "#0a0a0c", borderBottom: "1px solid rgba(255,255,255,0.07)", display: "flex", alignItems: "center", padding: "0 8px", gap: 6, fontSize: 8, fontFamily: "monospace", color: "rgba(255,255,255,0.6)" }}>
                  <span style={{ color: "#ff3b4e" }}>● LIVE</span><span>|</span><span style={{ color: "#fff" }}>{title}</span><span>|</span><span style={{ color: "#ff3b4e" }}>TC 01:47:12</span><span>|</span><span>1080P</span>
                </div>
                <div style={{ height: 20, background: "#111113", position: "relative" }}>
                  <div style={{ position: "absolute", top: 8, left: 0, right: 0, height: 4, background: "rgba(255,255,255,0.08)" }}>
                    <div style={{ width: "30%", height: "100%", background: "linear-gradient(90deg, #e63946, #ff6b6b)" }} />
                    <div style={{ position: "absolute", left: "30%", top: -4, bottom: -4, width: 2, background: "#ff3b4e" }} />
                  </div>
                </div>
                <div style={{ height: 36, background: "#0d0d0f", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 8px" }}>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ color: "#fff", fontSize: 8 }}>|◀◀</span>
                    <span style={{ color: "#fff", fontSize: 8 }}>◀◀</span>
                    <Play size={16} fill="#ff3b4e" color="#ff3b4e" style={{ border: "1px solid #ff3b4e", borderRadius: "50%", padding: 2 }} />
                    <span style={{ color: "#fff", fontSize: 8 }}>▶▶</span>
                    <span style={{ color: "#fff", fontSize: 8 }}>▶▶|</span>
                  </div>
                  <div style={{ display: "flex", gap: 2, fontSize: 8, color: "rgba(255,255,255,0.5)" }}><span>[0.5x]</span><span style={{ color: "#ff3b4e" }}>[1x]</span><span>[2x]</span></div>
                  <div style={{ display: "flex", gap: 2, fontSize: 8, color: "#fff" }}><span>[SUB]</span><span>[AUD]</span><span>[AR]</span></div>
                </div>
              </div>
            ) : (
              /* ══ ARCHETYPE 5: CLASSIC (Traditional Web Streaming Player with Zone Clusters) ══ */
              <>
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

                {/* Center play glyph */}
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
              </>
            )}
          </div>
        )}

        {draggable && (effectivePreset === "classic" || effectivePreset === "custom") && (
          <>
            <div
              className={`player-preview-dropzone${dragOverZone === "topLeft" ? " is-over" : ""}`}
              style={{ position: "absolute", top: 4, left: 4, width: "42%", height: "30%" }}
              onDragOver={(e) => { e.preventDefault(); setDragOverZone("topLeft"); }}
              onDragLeave={() => setDragOverZone(null)}
              onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("text/plain"); onZoneDrop?.(k, "topLeft"); setDragOverZone(null); }}
            >
              {dragOverZone === "topLeft" ? "Top left" : ""}
            </div>
            <div
              className={`player-preview-dropzone${dragOverZone === "topRight" ? " is-over" : ""}`}
              style={{ position: "absolute", top: 4, right: 4, width: "42%", height: "30%" }}
              onDragOver={(e) => { e.preventDefault(); setDragOverZone("topRight"); }}
              onDragLeave={() => setDragOverZone(null)}
              onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("text/plain"); onZoneDrop?.(k, "topRight"); setDragOverZone(null); }}
            >
              {dragOverZone === "topRight" ? "Top right" : ""}
            </div>
            <div
              className={`player-preview-dropzone${dragOverZone === "bottomLeft" ? " is-over" : ""}`}
              style={{ position: "absolute", bottom: 4, left: 4, width: "30%", height: "30%" }}
              onDragOver={(e) => { e.preventDefault(); setDragOverZone("bottomLeft"); }}
              onDragLeave={() => setDragOverZone(null)}
              onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("text/plain"); onZoneDrop?.(k, "bottomLeft"); setDragOverZone(null); }}
            >
              {dragOverZone === "bottomLeft" ? "Bottom left" : ""}
            </div>
            <div
              className={`player-preview-dropzone${dragOverZone === "bottomCenter" ? " is-over" : ""}`}
              style={{ position: "absolute", bottom: 4, left: "35%", width: "30%", height: "30%" }}
              onDragOver={(e) => { e.preventDefault(); setDragOverZone("bottomCenter"); }}
              onDragLeave={() => setDragOverZone(null)}
              onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("text/plain"); onZoneDrop?.(k, "bottomCenter"); setDragOverZone(null); }}
            >
              {dragOverZone === "bottomCenter" ? "Bottom center" : ""}
            </div>
            <div
              className={`player-preview-dropzone${dragOverZone === "bottomRight" ? " is-over" : ""}`}
              style={{ position: "absolute", bottom: 4, right: 4, width: "30%", height: "30%" }}
              onDragOver={(e) => { e.preventDefault(); setDragOverZone("bottomRight"); }}
              onDragLeave={() => setDragOverZone(null)}
              onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("text/plain"); onZoneDrop?.(k, "bottomRight"); setDragOverZone(null); }}
            >
              {dragOverZone === "bottomRight" ? "Bottom right" : ""}
            </div>
            <div
              className={`player-preview-dropzone is-tray${dragOverZone === "tray" ? " is-over" : ""}`}
              style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", width: 60, height: 18 }}
              onDragOver={(e) => { e.preventDefault(); setDragOverZone("tray"); }}
              onDragLeave={() => setDragOverZone(null)}
              onDrop={(e) => { e.preventDefault(); const k = e.dataTransfer.getData("text/plain"); onZoneDrop?.(k, "tray"); setDragOverZone(null); }}
            >
              {dragOverZone === "tray" ? "Remove" : ""}
            </div>
          </>
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
