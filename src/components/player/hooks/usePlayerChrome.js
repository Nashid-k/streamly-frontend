/* Chrome visibility + the "Still watching?" idle prompt.

   These two were the most tangled part of NativePlayerView, so they are lifted
   together on purpose rather than as two hooks: `poke` interleaves the 3s
   auto-hide timer with the 2h still-watching timer under ONE shared rate limit,
   and the rate-limited early return deliberately skips re-arming both. Splitting
   them would have meant a three-callback contract that is harder to follow than
   the behaviour it replaces.

   Everything below is a straight move. The details that are load-bearing and
   were each a real bug at some point:

   - `poke` NEVER dismisses an open prompt. It is the full-surface mousemove
     handler, so clearing here hid "Still watching?" on any incidental pointer
     move (TV remotes and HTPCs emit them), stranding the viewer paused with no
     Continue/Exit. Only a real press (`dismissStillWatching`) or the prompt's
     own buttons clear it.
   - the 2h idle id is both cleared AND nulled when re-arming. A clear without
     the null left the ref truthy-but-dead, so the re-arm guard below treated a
     dead timer as live and the countdown never fired again until `playing`
     flipped.
   - the offer refuses after the credits (`endedRef`) and only while playing —
     otherwise a finished episode would pop "Still watching?" over the Up Next
     card.
   - the auto-advance streak is reset by MANUAL picks only. Making it an effect
     on [id, season, episode] zeroed it on the auto-advance path itself, so the
     binge guard could never reach its threshold. */

import { useCallback, useEffect, useRef, useState } from "react";
import { STILL_WATCHING_IDLE_MS, STILL_WATCHING_EPISODES } from "../../../constants/playerUi";
import { logDebug } from "../../../utils/debugLogger";

/** Idle time before the chrome hides itself. */
const HIDE_DELAY_MS = 3000;
/** How long an ignored "Still watching?" prompt stays up. */
const STILL_WATCHING_OFFER_MS = 90 * 1000;


/**
 * @param {object} input
 * @param {{ current: HTMLVideoElement | null }} input.videoRef
 * @param {boolean} input.playing React's play state (drives the idle re-arm).
 * @param {{ current: boolean }} input.endedRef live "media finished" mirror.
 */
export default function usePlayerChrome({ videoRef, playing, endedRef }) {
  // Netflix chrome state.
  const [controlsVisible, setControlsVisible] = useState(true);
  // Netflix "Still watching?" — after enough unattended playback or
  // auto-advanced episodes, pause and ask.
  const [stillWatching, setStillWatching] = useState(false);

  const idleTimer = useRef(null);
  // Still-watching bookkeeping.
  const swIdleRef = useRef(null); // rolling play-with-no-input timer
  const swAutoAdvRef = useRef(0); // consecutive auto-advanced episodes
  const swOfferTimerRef = useRef(null); // offer expiry
  // Ref-backed so the long-lived gesture/key handlers read the live value.
  const stillWatchingRef = useRef(false);

  /* An open prompt is never cleared by motion — see the header. */
  const dismissStillWatching = useCallback(() => {
    if (!stillWatchingRef.current) return;
    stillWatchingRef.current = false;
    setStillWatching(false);
    if (swOfferTimerRef.current) {
      clearTimeout(swOfferTimerRef.current);
      swOfferTimerRef.current = null;
    }
  }, []);

  const offerStillWatching = useCallback(
    (reason) => {
      const video = videoRef.current;
      if (!video || video.paused || endedRef.current) return;
      logDebug("native", `Still-watching offer (${reason})`);
      try {
        video.pause();
      } catch {
        // already paused
      }
      stillWatchingRef.current = true;
      setStillWatching(true);
      if (swOfferTimerRef.current) clearTimeout(swOfferTimerRef.current);
      // An ignored prompt must not sit there forever; the next poke rearms it.
      swOfferTimerRef.current = setTimeout(() => {
        swOfferTimerRef.current = null;
        stillWatchingRef.current = false;
        setStillWatching(false);
      }, STILL_WATCHING_OFFER_MS);
    },
    [videoRef, endedRef],
  );

  /* Controls autohide: activity shows them, 3s idle while playing hides them.
     Paused always shows. Bound to the full-surface onMouseMove, so it can fire
     100+ times a second — showing/hiding is cheap (React bails out on an
     unchanged value) but re-arming two timers is not, hence the rate limit.
     Visible result is unchanged: the hide deadline still lands ~3s after the
     viewer stops moving. */
  const poke = useCallback(() => {
    setControlsVisible(true);
    // Any interaction re-arms the still-watching countdown and postpones auto-hide
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (swIdleRef.current) {
      clearTimeout(swIdleRef.current);
      swIdleRef.current = null;
    }
    if (videoRef.current && !videoRef.current.paused) {
      idleTimer.current = setTimeout(() => setControlsVisible(false), HIDE_DELAY_MS);
      swIdleRef.current = setTimeout(() => {
        swIdleRef.current = null;
        offerStillWatching("idle");
      }, STILL_WATCHING_IDLE_MS);
    } else {
      swIdleRef.current = null;
    }
  }, [videoRef, offerStillWatching]);

  // Mirror for call sites that bind once (the unmount path, long-lived effects).
  const pokeRef = useRef(poke);
  pokeRef.current = poke;

  /* Drop the auto-hide deadline without touching the still-watching countdown.
     The play/pause-flip effect calls this on cleanup so a deadline armed while
     PLAYING cannot hide the chrome after the element paused. */
  const clearHideTimer = useCallback(() => {
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
  }, []);

  /* Reset the auto-advance streak when the viewer CHOOSES an episode (the streak
     only counts what the Up Next card started on its own). */
  const resetStreak = useCallback(() => {
    swAutoAdvRef.current = 0;
  }, []);

  /* One auto-advance happened: count it, and offer the prompt once the binge
     threshold is reached. Returns nothing — the caller's flow is unchanged. */
  const recordAutoAdvance = useCallback(() => {
    swAutoAdvRef.current += 1;
    if (swAutoAdvRef.current >= STILL_WATCHING_EPISODES) {
      offerStillWatching("binge");
      swAutoAdvRef.current = 0;
    }
  }, [offerStillWatching]);

  // Rolling 2h idle timer while playing, armed once and re-poked by `poke`.
  useEffect(() => {
    if (!playing) {
      if (swIdleRef.current) {
        clearTimeout(swIdleRef.current);
        swIdleRef.current = null;
      }
      return undefined;
    }
    if (!swIdleRef.current) {
      swIdleRef.current = setTimeout(() => {
        swIdleRef.current = null;
        offerStillWatching("idle");
      }, STILL_WATCHING_IDLE_MS);
    }
    return undefined;
  }, [playing, offerStillWatching]);

  useEffect(
    () => () => {
      if (swIdleRef.current) clearTimeout(swIdleRef.current);
      if (swOfferTimerRef.current) clearTimeout(swOfferTimerRef.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    },
    [],
  );

  return {
    controlsVisible,
    setControlsVisible,
    poke,
    pokeRef,
    clearHideTimer,
    stillWatching,
    stillWatchingRef,
    dismissStillWatching,
    offerStillWatching,
    resetStreak,
    recordAutoAdvance,
  };
}
