import React from "react";
import { Play, Captions, StopCircle } from "lucide-react";
import { logDebug } from "../utils/debugLogger";
import { usePreferences } from "../context/preferences";

/* ═══ PlayerPreview ═══════════════════════════════════════════════════
   A truthful mini player with the SAME fixed Netflix-style chrome the
   real CustomVideoPlayer renders (black + #E50914): a muted looping
   demo video, red progress scrubber and a subtitle line styled live
   from preferences.

   Props:
   - showChrome  false → video + subtitle line only (Subtitles preview)
   - label       preset/custom name shown on the caption chip
   - title       meta title next to the time row
   ═════════════════════════════════════════════════════════════════════ */

/* Public, CC-licensed Big Buck Bunny clip (test-videos.co.uk, ~1 MB).
   Chosen over the Google sample bucket, which now answers 403. */
const DEMO_VIDEO_SRC =
  "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4";

/* Big Buck Bunny poster — the preview always shows an image (before play and
   whenever the clip can't load / is blocked) behind the player chrome. */
const BBB_POSTER = "https://peach.blender.org/wp-content/uploads/title_anouncement.jpg";

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
      poster={BBB_POSTER}
      muted
      loop
      autoPlay
      playsInline
      preload="metadata"
      onError={() => {
        logDebug("preview", "Demo preview video failed to load — poster/scrim fallback shown.", {
          src: DEMO_VIDEO_SRC,
          poster: BBB_POSTER,
        });
      }}
      aria-label="Demo video preview"
    />
  );
};

/* ── Demo transport constants (what the fake time row shows) ── */
const DEMO_CURRENT = "1:47";
const DEMO_DURATION = "10:34";

const PlayerPreview = ({
  showChrome = true,
  label = "Classic",
  title = "Streamly Originals",
  episodeTag = "S1:E1",
}) => {
  const {
    subtitleFont = "cinejoy",
    subtitleSize = 100,
    subtitleColor = "#ffffff",
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
    textShadow:
      "0 2px 4px rgba(0,0,0,0.95), 0 0 2px #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000",
  };

  return (
    <div
      className={`player-preview${showChrome ? "" : " player-preview--bare"}`}
      data-testid="player-preview"
      data-player-skin="netflix"
      data-preset={label || undefined}
    >
      <div className="player-preview-screen">
        <DemoVideo />
        <div className="player-preview-scrim" aria-hidden="true" />

        {showChrome && (
          <div className="player-preview-chrome" aria-hidden="true">
            {/* Netflix-style red progress scrubber */}
            <div className="player-preview-progress" aria-hidden="true">
              <span className="player-preview-progress-fill" />
            </div>

            <div className="player-preview-bottom">
              <div className="player-preview-topline">
                <span className="player-preview-time">{DEMO_CURRENT} / {DEMO_DURATION}</span>
                <span className="player-preview-titlemeta">
                  <span className="player-preview-title">{title}</span>
                  <span className="player-preview-pill">{episodeTag}</span>
                </span>
              </div>
              <div className="player-preview-bar">
                <span className="player-preview-btn is-filled" title="Play">
                  <Play size={14} fill="currentColor" />
                </span>
                <span className="player-preview-btn">
                  <StopCircle size={14} />
                </span>
                <span className="player-preview-speedpill" title="Speed">1x</span>
                <span className="player-preview-btn" title="Subtitles">
                  <Captions size={14} />
                </span>
              </div>
            </div>
          </div>
        )}

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