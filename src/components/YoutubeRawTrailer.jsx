import React, { useEffect, useRef, useState } from "react";

let apiPromise = null;
const apiSubscribers = [];

const ensureYouTubeApi = () => {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    apiSubscribers.push(resolve);
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    document.head.appendChild(tag);
  });
  return apiPromise;
};

window.onYouTubeIframeAPIReady = () => {
  apiSubscribers.splice(0).forEach((resolve) => resolve(window.YT));
};

/* Full-bleed youtube trailer with the player UI suppressed:
   - IFrame API lets us mute + start playback ourselves, loop reliably,
     and KNOW when playback actually begins.
   - The trailer plays from 0:00, but an opaque cover (backdrop image) stays
     over the player until playback is running AND ~3s have passed — that's
     how long YouTube keeps its big play-button/title overlay up after a
     video starts. So the very moment the cover lifts, that overlay is gone
     and only raw video is visible.
   - The iframe is oversized + cropped inside the overflow:hidden thumb box
     so YouTube's edge chrome (title strip, bottom-right watermark) is
     pushed off-screen even while playing. pointer-events:none stops hover
     from summoning the controls. */

// How long YouTube shows its startup play-button/title overlay after the
// video begins — keep the cover up this long, then reveal the raw frames.
const REVEAL_DELAY_MS = 3000;

export default function YoutubeRawTrailer({ videoKey, poster }) {
  const mountRef = useRef(null);
  const revealTimerRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [reveal, setReveal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let player = null;
    const mount = mountRef.current;
    if (!videoKey || !mount) return undefined;

    ensureYouTubeApi().then((YT) => {
      if (cancelled || !mountRef.current) return;
      player = new YT.Player(mountRef.current, {
        videoId: videoKey,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          loop: 1,
          mute: 1,
          origin: window.location.origin,
          playsinline: 1,
          playlist: videoKey,
          rel: 0,
        },
        events: {
          onReady: (e) => {
            e.target.mute();
            e.target.playVideo();
            const frame = e.target.getIframe();
            frame.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
            frame.setAttribute("tabindex", "-1");
          },
          onStateChange: (e) => {
            if (cancelled) return;
            if (e.data === YT.PlayerState.PLAYING) {
              setPlaying(true);
              // YouTube keeps its play-button/title overlay up for a few
              // seconds after playback starts; only reveal once it's gone.
              if (revealTimerRef.current == null) {
                revealTimerRef.current = setTimeout(() => {
                  if (!cancelled) setReveal(true);
                }, REVEAL_DELAY_MS);
              }
            } else {
              setPlaying(false);
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
      if (player) player.destroy();
    };
  }, [videoKey]);

  const coverHidden = playing && reveal;

  return (
    <>
      <div ref={mountRef} className="cw-popup-trailer" />
      <div
        className={`cw-popup-cover${coverHidden ? " is-hidden" : ""}`}
        aria-hidden="true"
      >
        {poster ? <img src={poster} alt="" /> : null}
      </div>
    </>
  );
}