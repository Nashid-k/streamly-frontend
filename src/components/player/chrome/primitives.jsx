// Low-level chrome primitives lifted out of NativePlayerView.jsx.
//
// These are the shared building blocks the higher-level chrome regions compose
// (the cold "stage", the warm stall ring, the rotating status line). They are
// presentation-only; the stage's data comes in as props so the engine keeps
// owning the resolve state.
import { useEffect, useState } from "react";

const FUN_FACTS = [
  "Reticulating splines...",
  "Warming up the projector...",
  "Dimming the lights...",
  "Grabbing the popcorn...",
  "Tuning the audio...",
  "Finding the best quality...",
  "Rolling film...",
  "Silencing cellphones...",
  "Preparing the stream...",
];

export function LoadingMessage({ title }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % FUN_FACTS.length);
    }, 2500);
    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {title && <span style={{ fontSize: 20, color: "#fff" }}>Loading {title}</span>}
      <span style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontStyle: "italic", minHeight: "20px" }}>
        {FUN_FACTS[index]}
      </span>
    </div>
  );
}

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
        background: "#000",
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
      ) : backdropUrl ? (
        <img
          src={backdropUrl}
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
          background: "radial-gradient(circle at 50% 45%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.78) 70%)",
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
              src={posterUrl}
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
                color: "#fff",
                letterSpacing: "-0.02em",
                textAlign: "center",
                padding: "0 24px",
                textShadow: "0 2px 18px rgba(0,0,0,0.7)",
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
          <div style={{ marginTop: 10, display: "flex", justifyContent: "center" }}>
            {initial ? <LineLoader /> : <RingSpinner size={44} />}
          </div>
        </div>
      ) : null}
      {message ? (
        <div
          style={{
            position: "relative",
            fontSize: 12.5,
            color: "rgba(255,255,255,0.6)",
            letterSpacing: "0.01em",
          }}
        >
          {message}
        </div>
      ) : null}
    </div>
  );
}

/* A white ring with a gap that travels around it. Purely decorative, so it is
   aria-hidden and the real state is carried by the visible status line instead. The
   reduced-motion block in player.css stops it entirely for viewers who asked for
   that — an endlessly spinning ring is the textbook case of motion that causes
   discomfort, and it is exactly what that media query exists for. */
/* Tailspin: the conic-gradient ring player.zxcprime.xyz uses (scraped from
   their shipped CSS module). The comet-tail sweep reads lighter than a
   border-arc spinner at the same size; rendered white over video. */
export function RingSpinner({ size = 34 }) {
  return (
    <span
      className="np-tailspin np-ring-spinner"
      aria-hidden="true"
      style={{ "--uib-size": `${size}px`, "--uib-color": "#fff", "--uib-speed": "0.9s", "--uib-stroke": "4px" }}
    >
      <span />
    </span>
  );
}

/* The horizontal loader: a hairline track with a white segment sweeping across
   it. Used for the SERVER-level cold opens (the first load and a manual server
   switch — see LoadingStage); every other later wait keeps the round Tailspin
   ring. Purely decorative, aria-hidden, and the reduced-motion block in
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
        borderRadius: 2,
        background: "rgba(255,255,255,0.16)",
        overflow: "hidden",
        display: "block",
      }}
    >
      <span style={{ display: "block", height: "100%", borderRadius: 2, background: "#fff" }} />
    </span>
  );
}