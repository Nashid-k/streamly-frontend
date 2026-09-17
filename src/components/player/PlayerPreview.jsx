import React from "react";
import { logDebug } from "@/utils/debugLogger";
import { usePreferences } from "@/context/preferences";

/* ═══ PlayerPreview ═══════════════════════════════════════════════════
   Minimal subtitle-preview box: a muted looping demo video with the
   subtitle line styled from live preferences.  Used by Settings →
   Subtitles to preview the user's chosen font / size / color.

   Props:
   - label  optional chip text shown below the video
   ═════════════════════════════════════════════════════════════════════ */

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

const PlayerPreview = ({ label }) => {
  const {
    subtitleFont = "cinejoy",
    subtitleSize = 100,
    subtitleColor = "#ffffff",
    subtitleBgBlur = true,
  } = usePreferences();

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
    <div className="player-preview player-preview--bare" data-testid="player-preview">
      <div className="player-preview-screen">
        <DemoVideo />
        <div className="player-preview-scrim" aria-hidden="true" />
        <div className="player-preview-subwrap">
          <span className="player-preview-sub" style={subtitleStyle}>
            Here is what your subtitles will look like.
          </span>
        </div>
      </div>
      {label && <div className="player-preview-chip">{label}</div>}
    </div>
  );
};

export default PlayerPreview;
