// Low-level chrome primitives lifted out of NativePlayerView.jsx.
//
// These are the shared building blocks the higher-level chrome regions compose
// (the cold "stage", the warm stall ring, the rotating status line). They are
// presentation-only; the stage's data comes in as props so the engine keeps
// owning the resolve state.
import { useEffect, useState } from "react";
import { TEXT, TEXT_FAINT, TRACK } from "./theme";
import { CdnImageAdapter } from "../../../api/cdnImageAdapter";

/* The stage a viewer stares at while a stream resolves: the title's own art,
   blurred and dimmed as a backdrop, with the name and a spinner over it.
   Reused for the first load AND for every server / quality / dub switch, because
   those are the same wait wearing different clothes — the artwork is what tells
   the viewer the player did not lose their place, and a bare black rectangle
   with a dot in it does not. */
export function LoadingStage({ title, backdropUrl, posterUrl, message, initial, frame }) {
  // A logo URL that fails to decode (a stale TMDB path, a blocked CDN) must not
  // leave an empty frame where the title should be: the failed art steps aside
  // and the styled text title takes its place, exactly as when no logo exists.
  const [artFailed, setArtFailed] = useState(false);
  useEffect(() => {
    setArtFailed(false);
  }, [posterUrl]);
  const showArt = !!posterUrl && !frame && !artFailed;
  /* The stage's art leaves as optimized WebP renditions: the blurred backdrop
     reads as colour, so w780 is plenty, and the centred logo gets w500.
     Non-TMDB or already-optimized URLs pass through the adapter unchanged. */
  const backdropSrc = backdropUrl ? CdnImageAdapter.getUrl(backdropUrl, "w780") : null;
  const posterSrc = posterUrl ? CdnImageAdapter.getUrl(posterUrl, "w500") : null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        overflow: "hidden",
        background: "#070a08",
        zIndex: 3,
      }}
    >
      {/* A pre-switch frame was captured (server/source pick): the viewer's own
          picture stays on screen — dimmed, not blurred — so the switch reads as
          continuous instead of a hard cut to title art. */}
      {frame ? (
        <img
          src={frame}
          alt=""
          aria-hidden="true"
          className="np-loading-frame"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "brightness(0.55)",
          }}
        />
      ) : backdropSrc ? (
        <img
          src={backdropSrc}
          alt=""
          aria-hidden="true"
          className="np-loading-art"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            // Heavily blurred so it reads as COLOUR, not as a photo the viewer
            // might mistake for the frame that is about to appear. The dim layer
            // under it keeps the white text and spinner legible over a bright
            // still — a light backdrop would otherwise eat both.
            filter: "blur(28px) saturate(1.2) brightness(0.5)",
            transform: "scale(1.15)", // blur samples the edge; scale hides it
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 50% 45%, rgba(149,255,80,0.1) 0%, rgba(0,0,0,0.42) 30%, rgba(0,0,0,0.82) 72%)",
        }}
      />
      {/* The title art itself, big and centred. The blurred backdrop behind is
          only ambient colour; without this the stage looks like a black screen
          someone slapped a label on. Contained rather than cover: cropping the
          poster's top and bottom during a load makes an unrecognisable
          fragment, which defeats the entire point of showing it. */}
      {title ? (
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
            maxWidth: "min(88vw, 620px)",
          }}
        >
          {/* The title ART is the centrepiece: the logo-style still TMDB
              serves, contained so nothing crops it. */}
          {/* With a captured frame up, the frame IS the picture: the title
              art would cover it, so it steps aside (the status line below
              still names what is happening). */}
          {showArt ? (
            <img
              src={posterSrc}
              alt=""
              aria-hidden="true"
              className="np-loading-poster"
              onError={() => setArtFailed(true)}
              style={{
                width: "auto",
                height: "auto",
                maxWidth: "min(72vw, 520px)",
                maxHeight: "min(30vh, 220px)",
                objectFit: "contain",
              }}
            />
          ) : null}
          {/* Title text removed when the logo exists (user order): the image
              IS the title. Without a logo the text name is the only honest
              identifier left, so it falls back in. */}
          {!showArt && title && !frame ? (
            <div
              style={{
                fontSize: "clamp(18px, 3.2vw, 30px)",
                fontWeight: 700,
                color: TEXT,
                letterSpacing: "-0.025em",
                textAlign: "center",
                padding: "0 24px",
                textShadow: "0 4px 28px rgba(0,0,0,0.8)",
              }}
            >
              {title}
            </div>
          ) : null}
          {/* The loader under the art: a horizontal sweep on the SERVER-level
              cold opens — the very first load (the viewer is waiting on the
              player to boot) AND a manual server switch (they tapped a new
              backend) — and the Tailspin ring for every later wait (a quality/
              dub/episode switch re-mounts this same stage, and a ring reads as
              "the stream is thinking" rather than "the app is starting"). Purely
              decorative → the reduced-motion block stops and parks both. */}
          <div style={{ marginTop: 6, display: "flex", justifyContent: "center" }}>
            {initial ? <LineLoader /> : <RingSpinner size={44} />}
          </div>
        </div>
      ) : null}
      {message ? (
        <div
          style={{
            position: "relative",
            fontSize: 11,
            fontWeight: 600,
            color: TEXT_FAINT,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            textAlign: "center",
            maxWidth: "min(84vw, 560px)",
          }}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}

/* A ring with a gap that travels around it. Purely decorative, so it is
   aria-hidden and the real state is carried by the visible status line instead.
   The reduced-motion block in player.css stops it entirely for viewers who asked
   for that — an endlessly spinning ring is the textbook case of motion that
   causes discomfort, and it is exactly what that media query exists for.
   The conic-gradient comet-tail sweep reads lighter than a border-arc spinner
   at the same size; rendered in the signal accent over video. */
export function RingSpinner({ size = 44 }) {
  return (
    <div
      className="ld np-v4-loader"
      aria-hidden="true"
      style={{
        position: "relative",
        width: size,
        height: size,
        top: "auto",
        left: "auto",
        transform: "none",
        opacity: 1,
        visibility: "visible",
      }}
    >
      <span className="np-tailspin" style={{ display: "none" }}><span /></span>
      <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
        <defs>
          <linearGradient id="lg-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--accent, #8652bb)" }} />
            <stop offset="1" stopColor="#fff" />
          </linearGradient>
        </defs>
        <circle className="lt" cx="50" cy="50" r="40" />
        <circle className="arc a1" cx="50" cy="50" r="40" pathLength="100" style={{ stroke: "url(#lg-ring)" }} />
        <circle className="arc a2" cx="50" cy="50" r="28" pathLength="100" style={{ stroke: "url(#lg-ring)" }} />
      </svg>
    </div>
  );
}

/* The horizontal loader: a hairline track with an accent segment sweeping
   across it. Used for the SERVER-level cold opens (the first load and a manual
   server switch — see LoadingStage); every other later wait keeps the unified
   v4 double-arc spinner. Purely decorative, aria-hidden, and the reduced-motion block in
   player.css parks the segment mid-track (a frozen full bar would read as
   progress; a parked partial bar reads as "loading"). */
export function LineLoader() {
  return (
    <span
      aria-hidden="true"
      className="np-loading-line"
      style={{
        width: "min(56vw, 340px)",
        height: 3,
        borderRadius: 999,
        background: TRACK,
        overflow: "hidden",
        display: "block",
      }}
    >
      <span
        style={{
          display: "block",
          height: "100%",
          borderRadius: 999,
          background: "linear-gradient(90deg, var(--accent, #8652bb), #fff)",
          boxShadow: "0 0 12px var(--accent, #8652bb)",
        }}
      />
    </span>
  );
}
