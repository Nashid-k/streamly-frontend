// The desktop key map: Space tap-vs-hold, arrows, volume, aspect, mute,
// fullscreen, episode next/prev, Escape, and the Tab-to-reveal path — plus the
// v4 character keys ("<"/">" speed, ","/"." frame step, digits, "c" captions),
// which read live refs because they must work no matter what just changed.
//
// Binds once per panel flip, exactly like the effect it replaced. Every
// callback here only touches refs + functional setState, so a stale closure is
// safe; the two that read render state (episode nav) go through refs. Keeping
// the dep array at [panel] is deliberate - re-binding on every state change
// would reset the Space-hold timer mid-press.
import { useEffect } from "react";
import { HOLD_2X_DELAY_MS } from "../nativePlayerGestures";
import { resolveSpaceRelease } from "../nativePlayerHold";
import { keyboardAction } from "../nativePlayerKeys";

export default function usePlayerKeyboard({
  panel,
  poke,
  setControlsVisible,
  controlsVisibleRef,
  setPanel,
  panelBackRef,
  changeVolume,
  cycleAspect,
  toggleMute,
  goFullscreen,
  seekRelative,
  engageHold2x,
  releaseHold2x,
  disarmHold,
  spaceHoldRef,
  spaceFiredRef,
  holdTimerRef,
  togglePlayRef,
  skipSecondsRef,
  keyboardEpNextRef,
  keyboardEpPrevRef,
  onCloseRef,
  videoRef,
  playingRef,
  cyclePlaybackRateRef,
  nudgeFrameRef,
  seekToPercentRef,
  cycleCaptionsRef,
}) {
  useEffect(() => {
    /* The other half of tap-vs-hold Space. A keyup with no 2x engaged means the
       viewer tapped, so play/pause fires HERE — after the intent is known — and
       a keyup when 2x IS engaged just restores the rate and does nothing else. */
    const onKeyUp = (e) => {
      if (e.code !== "Space") return;
      const release = resolveSpaceRelease({
        held: spaceHoldRef.current,
        engaged: spaceFiredRef.current,
      });
      if (release === "ignore") return;
      spaceHoldRef.current = false;
      spaceFiredRef.current = false;
      disarmHold();
      if (release === "release-hold") {
        releaseHold2x();
        return;
      }
      togglePlayRef.current?.();
    };
    const onKey = (e) => {
      // Auto-hidden chrome is inert (no invisible tab targets), so the first Tab
      // must bring it back instead of moving focus nowhere. preventDefault gives
      // React the commit; the next Tab enters the now-focusable controls.
      if (e.key === "Tab" && !controlsVisibleRef.current) {
        e.preventDefault();
        setControlsVisible(true);
        poke();
        return;
      }
      const action = keyboardAction({
        code: e.code,
        key: e.key,
        repeat: e.repeat,
        shiftKey: e.shiftKey,
        defaultPrevented: e.defaultPrevented,
        targetTag: e.target?.tagName,
        panelOpen: Boolean(panel),
        fullscreen: Boolean(document.fullscreenElement),
        spaceHeld: spaceHoldRef.current,
        hasVideo: Boolean(videoRef.current),
        playing: Boolean(playingRef?.current),
      });
      if (!action) return;
      if (action.preventDefault) e.preventDefault();
      // Auto-repeat is swallowed above but never acts twice (see the module).
      if (action.repeated) return;
      switch (action.type) {
        case "space":
          spaceHoldRef.current = true;
          spaceFiredRef.current = false;
          if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
          holdTimerRef.current = setTimeout(() => {
            holdTimerRef.current = null;
            if (!spaceHoldRef.current) return;
            spaceFiredRef.current = true;
            engageHold2x();
          }, HOLD_2X_DELAY_MS);
          break;
        case "toggle-play":
          // The ref, not the closed-over function: this effect binds once per
          // panel flip, so the raw `togglePlay` here captured the mount render's
          // `resumeOffer` (always null) — K ignored a pending "Left off at …"
          // card while a click/Space honoured it. togglePlayRef is reassigned
          // every render.
          togglePlayRef.current?.();
          break;
        case "seek-back":
          seekRelative(-skipSecondsRef.current);
          break;
        case "seek-forward":
          seekRelative(skipSecondsRef.current);
          break;
        case "volume-up":
          changeVolume(0.1);
          break;
        case "volume-down":
          changeVolume(-0.1);
          break;
        case "cycle-aspect":
          cycleAspect();
          break;
        case "toggle-mute":
          toggleMute();
          break;
        case "fullscreen":
          goFullscreen();
          break;
        case "episode-next":
          keyboardEpNextRef.current();
          break;
        case "episode-prev":
          keyboardEpPrevRef.current();
          break;
        case "speed-up":
          cyclePlaybackRateRef.current?.(1);
          break;
        case "speed-down":
          cyclePlaybackRateRef.current?.(-1);
          break;
        case "frame-step":
          nudgeFrameRef.current?.(action.value);
          break;
        case "seek-percent":
          seekToPercentRef.current?.(action.value);
          break;
        case "toggle-captions":
          cycleCaptionsRef.current?.();
          break;
        case "close-panel":
          // The sheet owns its stack (player shell), so Escape routes there:
          // back one level when a sub-pane is open, close the sheet at the
          // root — v4's `stack.length > 1 ? back() : close()`. Fallback keeps
          // the old whole-sheet close if the shell hasn't registered yet.
          if (panelBackRef?.current) panelBackRef.current();
          else setPanel(null);
          break;
        case "close-player":
          onCloseRef.current?.();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
    // togglePlay/seekRelative/changeVolume/toggleMute/goFullscreen only touch
    // refs + functional setState, so binding once per panel flip is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);
}
