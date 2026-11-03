/* Hold-to-2x: press-and-hold plays at 2x, release restores the viewer's rate.

   This cluster has three pieces that kept drifting apart while they lived
   inline, so they move together:

   - `hold2xRef` is the ONLY signal every other handler reads to answer "is a 2x
     hold live right now?" — the touch-end branch, the pause/ended/seeking
     listeners, the volume drag, the keyup. It was once declared and never
     assigned, so it permanently read `false` and the rate restore ran on
     nothing: releasing a hold left the element at 2x, and no keyup, tap or
     pause could bring it back. One place sets it, one place clears it.
   - the rate to restore is a LATCH (`heldRateRef`), not a read of the element
     at release. A browser that paused playback in the background reports 1
     while the picture is still the rate the viewer set, so reading the element
     then would restore the wrong rate. The rule itself lives in
     nativePlayerHold so a release can never write a rate the element rejects.
   - the safety net. The release gesture is the normal exit, but a hold can be
     interrupted by something that never delivers a touchend for the video (an
     OS gesture taking over, the tab backgrounding, a stream dying under the
     finger). Without a backstop the element stays at 2x until the media is
     rebuilt, so two independent exits: "the element is not playing" and a
     wall-clock cutoff.

   The caller keeps the gesture handlers that ARM a hold (the touch right-zone
   timer, the space key, the desktop forward button) because those belong to the
   input layer; this hook owns engaging, releasing and the bookkeeping. */

import { useCallback, useEffect, useRef, useState } from "react";
import { HOLD_SPEED } from "../../../constants/playerUi";
import { HOLD_2X_MAX_MS } from "../nativePlayerGestures";
import { holdRestoreRate } from "../nativePlayerHold";
import { logDebug } from "../../../utils/debugLogger";

/**
 * @param {object} input
 * @param {{ current: HTMLVideoElement | null }} input.videoRef
 * @param {number} input.playbackRate the viewer's chosen rate (Settings).
 * @param {{ current: number }} input.playbackRateRef live mirror of that rate.
 * @param {string} input.mediaKey changes whenever the media does (title,
 *   season, episode) — a new media start must drop a hold from the old one.
 * @param {() => void} input.poke reveals the chrome (a hold is an interaction).
 */
export default function useHold2x({ videoRef, playbackRate, playbackRateRef, mediaKey, poke }) {
  const [hold2x, setHold2x] = useState(false);
  // Read by the once-bound handlers; also written by engage/release below.
  const hold2xRef = useRef(false);
  // The rate a release must restore, latched at engage time.
  const heldRateRef = useRef(playbackRate || 1);
  // The timer that arms 2x, and a pointer id for pointer-cleanup symmetry. The
  // arming timers live in the input layer; these refs let it disarm in one call.
  const holdTimerRef = useRef(null);
  const holdPointerRef = useRef(null);

  const engageHold2x = useCallback(() => {
    const video = videoRef.current;
    if (!video || video.paused) return;
    heldRateRef.current = holdRestoreRate({
      elementRate: video.playbackRate,
      settingRate: playbackRateRef.current,
    });
    try {
      video.playbackRate = HOLD_SPEED;
      hold2xRef.current = true;
      setHold2x(true);
      poke();
    } catch {
      // Some UWP webviews reject odd rates; staying at 1x is fine.
    }
  }, [videoRef, playbackRateRef, poke]);

  const releaseHold2x = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdPointerRef.current = null;
    /* The ref is cleared FIRST: the listeners (ratechange included) react to the
       assignment and must see "no hold" while the restore is written. */
    hold2xRef.current = false;
    const video = videoRef.current;
    if (video) {
      try {
        video.playbackRate = heldRateRef.current || 1;
      } catch {
        // already reset
      }
    }
    heldRateRef.current = 1;
    setHold2x(false);
  }, [videoRef]);

  /* Drop a PENDING arm without ending a live hold. A normal tap releases a press
     that was still inside HOLD_2X_DELAY_MS; that arm must go, but if 2x never
     engaged there is nothing to restore. */
  const disarmHold = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    holdPointerRef.current = null;
  }, []);

  /* Follow the SETTING rate on the element — but never while a hold is live, and
     never ON a hold release. `hold2x` releasing used to fall straight into this
     branch, which re-applied the state rate over the rate releaseHold2x had just
     restored: invisible at 1x, but anyone who chose 1.25x or 1.5x saw a hold
     snap them back a frame later. Only a real SETTING change re-syncs now. */
  useEffect(() => {
    const video = videoRef.current;
    if (video && !hold2x) {
      try {
        video.playbackRate = playbackRate;
        heldRateRef.current = playbackRate;
      } catch (error) {
        // Some engines reject a rate mid-seek; the next effect pass retries.
        logDebug("player", "Could not apply playbackRate.", { message: error?.message });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playbackRate]);

  /* Safety net: see the header. Polls rather than trusting a single event,
     because the interrupting thing is exactly the one that sends no event. */
  useEffect(() => {
    if (!hold2x) return undefined;
    const startedAt = Date.now();
    const id = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      if (video.paused || Date.now() - startedAt >= HOLD_2X_MAX_MS) releaseHold2x();
    }, 500);
    return () => clearInterval(id);
  }, [hold2x, releaseHold2x, videoRef]);

  /* A new episode / title is new media: the element is rebuilt at the state
     rate, so a hold that was live when the switch happened must not keep
     arming 2x. */
  useEffect(() => {
    if (hold2xRef.current || holdTimerRef.current) releaseHold2x();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey]);

  return {
    hold2x,
    hold2xRef,
    heldRateRef,
    holdTimerRef,
    holdPointerRef,
    engageHold2x,
    releaseHold2x,
    disarmHold,
  };
}
