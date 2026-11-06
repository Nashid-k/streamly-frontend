import { useEffect } from "react";
import { HOLD_SPEED } from "../../../constants/playerUi";

// The video element is the honest stall detector and the single source of truth
// for the HUD's state. All of it lives here now: the event -> state mirror.
export default function useMediaElementEvents({
  videoRef,
  setEverPlayed,
  setPlaying,
  setBuffering,
  setEnded,
  setCurrentTime,
  setDuration,
  setBufferedSecs,
  setBufferedRanges,
  setActiveSubtitle,
  hasStartedRef,
  pendingResumeRef,
  pendingSeekRef,
  hold2xRef,
  subtitleEngineRef,
  subtitleEnabledRef,
  subtitleCueRef,
  seekRelativeRef,
  releaseHold2x,
  disarmHold,
  poke,
}) {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    const onPlay = () => {
      hasStartedRef.current = true;
      setEverPlayed(true);
      setPlaying(true);
      setBuffering(false);
      if (navigator.mediaSession) navigator.mediaSession.playbackState = "playing";
      // Playback of any origin satisfies a pending switch-resume.
      pendingResumeRef.current = false;
    };
    const onPause = () => {
      setPlaying(false);
      if (navigator.mediaSession) navigator.mediaSession.playbackState = "paused";
      // A pause of any origin must not leave 2x armed for the next play.
      if (hold2xRef.current) releaseHold2x();
      disarmHold();
    };
    const onEnded = () => {
      setPlaying(false);
      setEnded(true);
      // Ending while held must not leave the next play stuck at 2x.
      if (hold2xRef.current) releaseHold2x();
      poke();
    };
    const onRateChange = () => {
      // An external rate change (media session, devtools) ends a hold.
      if (hold2xRef.current && Math.abs((video.playbackRate || 1) - HOLD_SPEED) > 0.01) {
        releaseHold2x();
      }
    };
    const bufferedAhead = () => {
      try {
        const b = video.buffered;
        const t = video.currentTime || 0;
        for (let i = 0; i < b.length; i += 1) {
          if (b.start(i) <= t && t <= b.end(i)) return Math.max(0, b.end(i) - t);
        }
      } catch {
        // buffered unreadable (no media yet) — report zero
      }
      return 0;
    };
    const onTime = () => {
      setCurrentTime(video.currentTime || 0);
      setBufferedSecs(Math.round(bufferedAhead()));
      try {
        const ranges = [];
        const b = video.buffered;
        for (let i = 0; i < b.length; i += 1) ranges.push([b.start(i), b.end(i)]);
        setBufferedRanges(ranges);
      } catch {
        // buffered unreadable yet
      }
      // Subtitles: only touch React when the active line changes.
      const engine = subtitleEngineRef.current;
      if (engine && subtitleEnabledRef.current) {
        const cue = engine.getActiveCue(video.currentTime || 0);
        const text = cue?.text || null;
        if (text !== subtitleCueRef.current) {
          subtitleCueRef.current = text;
          setActiveSubtitle(text);
        }
      }
    };
    const onMeta = () => setDuration(video.duration || 0);
    // The element is the honest stall detector: waiting/stalled/seeking = nothing new to show.
    const onWaiting = () => setBuffering(true);
    const onStalled = () => setBuffering(true);
    const onSeeking = () => {
      setBuffering(true);
      // A seek of any origin ends a 2x hold.
      if (hold2xRef.current) releaseHold2x();
      // timeupdate does not fire while seeking, so mirror currentTime (which already
      // carries the seek target) or the bar sits at the pre-seek position.
      setCurrentTime(video.currentTime || 0);
    };
    const onSeeked = () => {
      setBuffering(false);
      // Flush whatever the viewer queued while this seek was in flight.
      const pending = pendingSeekRef.current;
      if (pending) {
        pendingSeekRef.current = 0;
        seekRelativeRef.current(pending);
      }
    };
    const onCanPlay = () => setBuffering(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onMeta);
    video.addEventListener("durationchange", onMeta);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("stalled", onStalled);
    video.addEventListener("seeking", onSeeking);
    video.addEventListener("seeked", onSeeked);
    video.addEventListener("ratechange", onRateChange);
    video.addEventListener("canplay", onCanPlay);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("durationchange", onMeta);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("stalled", onStalled);
      video.removeEventListener("seeking", onSeeking);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("ratechange", onRateChange);
      video.removeEventListener("canplay", onCanPlay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
