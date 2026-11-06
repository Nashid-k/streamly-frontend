/* Playback "quality of life" controls that need the media element but nothing
   from the streaming engine: the sleep timer, loop, picture-in-picture and
   fullscreen state.

   Pulled out of NativePlayerView so the component body keeps to the source
   lifecycle, and so a redesign can re-present these controls (or drop one)
   without editing a 5k-line file. Behaviour is a straight move — including the
   details that were easy to get wrong:

   - the sleep timer keeps TWO handles (the expiry timeout and the 1s label
     interval) and both are cleared by `clearSleepTimer`, on expiry, and on
     unmount, so neither can fire against a discarded player;
   - PiP and fullscreen are tracked from the element/document events rather than
     from our own clicks, because the browser can change either state without
     going through the player's buttons (Esc, iOS controls, another tab);
   - `goFullscreen` prefers the container element and falls back to iOS Safari's
     `<video>.webkitEnterFullscreen`, which is the only path there (a div cannot
     be made fullscreen on iOS). */

import { useCallback, useEffect, useRef, useState } from "react";
import { logWarn } from "../../../utils/debugLogger";

/**
 * @param {object} input
 * @param {{ current: HTMLVideoElement | null }} input.videoRef
 * @param {{ current: HTMLElement | null }} input.screenRef
 * @param {(message: string) => void} [input.onSleepEnd] called when the timer
 *   expires, after the element is paused — the player uses it to reveal the
 *   chrome and explain why playback stopped.
 */
export default function usePlaybackExtras({ videoRef, screenRef, onSleepEnd }) {
  const [loopEnabled, setLoopEnabled] = useState(false);
  // Chosen duration (null = off) and the live countdown shown on the label.
  const [sleepMinutes, setSleepMinutes] = useState(null);
  const [sleepRemaining, setSleepRemaining] = useState(null);
  const [pipActive, setPipActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const sleepTimerId = useRef(null);
  const sleepDisplayId = useRef(null);
  // Kept in a ref so the sleep timer (a stable useCallback, because the resolve
  // effect depends on its identity) still calls the CURRENT handler.
  const sleepEndRef = useRef(onSleepEnd);
  sleepEndRef.current = onSleepEnd;

  const pipSupported =
    typeof document !== "undefined" && document.pictureInPictureEnabled;

  const clearSleepTimer = useCallback(() => {
    if (sleepTimerId.current) {
      clearTimeout(sleepTimerId.current);
      sleepTimerId.current = null;
    }
    if (sleepDisplayId.current) {
      clearInterval(sleepDisplayId.current);
      sleepDisplayId.current = null;
    }
    setSleepMinutes(null);
    setSleepRemaining(null);
  }, []);

  const startSleepTimer = useCallback(
    (minutes) => {
      if (sleepTimerId.current) {
        clearTimeout(sleepTimerId.current);
        sleepTimerId.current = null;
      }
      if (sleepDisplayId.current) {
        clearInterval(sleepDisplayId.current);
        sleepDisplayId.current = null;
      }
      if (!minutes || minutes <= 0) {
        setSleepMinutes(null);
        setSleepRemaining(null);
        return;
      }
      const endsAt = Date.now() + minutes * 60 * 1000;
      setSleepMinutes(minutes);
      setSleepRemaining(Math.round((endsAt - Date.now()) / 1000));
      sleepDisplayId.current = setInterval(() => {
        setSleepRemaining(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
      }, 1000);
      sleepTimerId.current = setTimeout(() => {
        try {
          videoRef.current?.pause();
        } catch {
          // element already torn down — nothing to pause
        }
        clearSleepTimer();
        sleepEndRef.current?.("Sleep timer ended — playback paused.");
      }, minutes * 60 * 1000);
    },
    [clearSleepTimer, videoRef],
  );

  // Apply the loop toggle to the element (a real attribute, so a wrapped
  // playback restarts without the ended overlay).
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.loop = loopEnabled;
    } catch {
      // some webviews reject the attribute; playback simply won't loop
    }
  }, [loopEnabled, videoRef]);

  // Tear the sleep timer down on unmount so its timeout can't fire against a
  // discarded player (and the display interval can't leak).
  useEffect(
    () => () => {
      if (sleepTimerId.current) clearTimeout(sleepTimerId.current);
      if (sleepDisplayId.current) clearInterval(sleepDisplayId.current);
    },
    [],
  );

  const togglePip = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled) {
        await video.requestPictureInPicture();
      }
    } catch (error) {
      logWarn("native", "Picture-in-picture request failed", { message: error?.message });
    }
  }, [videoRef]);

  /* Track the element's PiP state so the row's label reflects reality (a
     browser gesture can exit PiP without going through our button). */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    video.addEventListener("enterpictureinpicture", onEnter);
    video.addEventListener("leavepictureinpicture", onLeave);
    return () => {
      video.removeEventListener("enterpictureinpicture", onEnter);
      video.removeEventListener("leavepictureinpicture", onLeave);
    };
  }, [videoRef]);

  /* Fullscreen icon follows the real fullscreen state (incl. iOS webkit). */
  useEffect(() => {
    const onFull = () =>
      setIsFullscreen(
        Boolean(document.fullscreenElement || document.webkitFullscreenElement),
      );
    onFull();
    document.addEventListener("fullscreenchange", onFull);
    document.addEventListener("webkitfullscreenchange", onFull);
    return () => {
      document.removeEventListener("fullscreenchange", onFull);
      document.removeEventListener("webkitfullscreenchange", onFull);
    };
  }, []);

  const goFullscreen = useCallback(() => {
    try {
      const video = videoRef.current;
      const el = screenRef.current;
      const rq = (el && (el.requestFullscreen || el.webkitRequestFullscreen)) || null;
      if (rq) {
        if (document.fullscreenElement || document.webkitFullscreenElement) {
          const ex = document.exitFullscreen || document.webkitExitFullscreen;
          ex?.call(document)?.catch?.(() => {});
        } else {
          rq.call(el)?.catch?.(() => {});
        }
      } else if (video && video.webkitEnterFullscreen) {
        // iOS Safari: the <video> enters its own native fullscreen (no DOM
        // fullscreen on a div).
        video.webkitEnterFullscreen();
        setIsFullscreen(true);
      }
    } catch {
      // fullscreen unsupported — native video keeps playing inline
    }
  }, [videoRef, screenRef]);

  return {
    loopEnabled,
    setLoopEnabled,
    sleepMinutes,
    sleepRemaining,
    startSleepTimer,
    clearSleepTimer,
    pipActive,
    pipSupported,
    togglePip,
    isFullscreen,
    setIsFullscreen,
    goFullscreen,
  };
}
