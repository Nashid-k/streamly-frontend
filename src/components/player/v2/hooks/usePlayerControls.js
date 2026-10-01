import { useCallback, useEffect, useState } from "react";
import { logWarn } from "../../../../utils/debugLogger";
import { bufferedFraction, bufferedMoved } from "../timecode";

/**
 * Imperative control of the media element (task.md 3.7).
 *
 * ── Why this is a hook and not part of PlayerShell ─────────────────────────
 * task.md 2.5 requires the shell to COMPOSE ONLY: no playback logic. Calling
 * `play()` on an element the shell happens to hold a ref to is playback logic,
 * and it would put element access, autoplay-policy handling and fullscreen
 * bookkeeping into the one file that is supposed to be readable as a layout.
 * So the shell passes a ref; this owns what can be done with it.
 *
 * ── Why PAUSE/RESUME are dispatched from HERE ──────────────────────────────
 * The machine is the source of truth, but `pause` cannot come from the
 * element's own `pause` event without a real hazard: the event also fires when
 * the element is torn down for a source switch, and browsers fire it after
 * `ended`. Listening would let a source swap drop the machine into `paused` and
 * strand a video that is loading perfectly well. This hook only pauses the
 * element because a viewer asked it to, so it is the only honest source of the
 * event. The cost — an outside caller pausing the element goes unnoticed — is
 * written down in `playbackMachine.js` too, rather than left as a surprise.
 *
 * ── Every failure is logged ────────────────────────────────────────────────
 * `play()` returns a promise that REJECTS when the browser's autoplay policy
 * blocks it, which is the single most common way a player button appears dead.
 * That rejection is caught and logged rather than left to become an unhandled
 * rejection. A null `play()` return (older Safari, some engines) is handled too,
 * because `promise?.catch` on a null does nothing at all and would look like it
 * worked.
 */
/**
 * @param videoRef   imperative handle on the `<video>`; read at CALL time by the
 *                   actions, so it never goes stale.
 * @param containerRef the shell root, for fullscreen.
 * @param videoNode   the SAME element, but as a REACT VALUE, so the subscription
 *                   effect below can depend on it. See the note there: this is
 *                   load-bearing, not a convenience.
 */
export default function usePlayerControls(videoRef, containerRef, videoNode) {
  const [muted, setMutedState] = useState(false);
  const [volume, setVolumeState] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  /* 3.14. Seconds of video buffered PAST the playhead — a single number, not the
   * range list the legacy kept. See `bufferedFraction` for why one number is the
   * honest answer and a list is not. */
  const [buffered, setBuffered] = useState(0);

  /* Element-level facts. `timeupdate` is the browser's own ~4Hz cadence, which
   * is right for a timecode and wrong for a scrubber fill — 3.14/5.15 replace
   * the scrubber's update path with rAF and direct DOM writes. Noting the
   * boundary here so nobody later reads this as the finished design.
   *
   * NOTE WHAT IS ABSENT: no `play`/`pause` listener, and no isPlaying state.
   * An earlier draft tracked both here AND in the machine, and they disagreed —
   * the machine said PLAYING while the element was paused, because the element's
   * `pause` event never fires when the pause came from our own code. Two owners
   * of one fact is the defect the machine was introduced to remove, so playback
   * state lives in the machine and only the element lives here.
   *
   * ── Why the dependency is `videoNode` and not `videoRef` ───────────────────
   * This was a real bug, not a style preference. `videoRef` is a STABLE object
   * for the component's whole life, and `PlayerVideo` does not mount until the
   * source ladder produces a URL. So on the shell's first render there is no
   * element, this effect returned early, and when the element finally appeared
   * nothing re-ran it — `timeupdate`, `durationchange`, `loadedmetadata` and
   * `volumechange` were NEVER subscribed. The timecode sat at `0:00 / 0:00`
   * forever and the scrubber never moved, with no error anywhere.
   *
   * Depending on the NODE means the effect re-runs exactly when the element it
   * subscribes to changes identity, which is the only moment the subscription
   * needs redoing. The imperative actions above keep using `videoRef`, because
   * reading `.current` at call time is correct and needs no re-subscription. */
  useEffect(() => {
    const video = videoNode;
    if (!video) return undefined;

    const onTimeUpdate = () => setCurrentTime(video.currentTime || 0);
    const onDuration = () => setDuration(Number.isFinite(video.duration) ? video.duration : 0);
    const onVolume = () => {
      setMutedState(Boolean(video.muted));
      setVolumeState(Number.isFinite(video.volume) ? video.volume : 0);
    };

    /**
     * Read `video.buffered` ONCE and store it only if the band visibly moved.
     *
     * The gate is the point. `progress` fires several times a second while a
     * title downloads, and a `setState` per event re-renders the transport, the
     * timecode and the scrubber for a change narrower than the thumb — which is
     * the same waste the legacy paid four times a second on `timeupdate`, just
     * from a different event.
     *
     * The comparison is against the ELEMENT's last read rather than React state,
     * because the state setter is asynchronous: two `progress` events in one tick
     * would both compare against a stale value and the second write would be a
     * duplicate. That is harmless but it means the gate could be defeated, so the
     * gate is kept off the render path deliberately.
     */
    let lastBuffered = 0;
    const readBuffered = () => {
      const total = Number.isFinite(video.duration) ? video.duration : 0;
      const now = Number.isFinite(video.currentTime) ? video.currentTime : 0;
      let seconds = 0;
      try {
        seconds = bufferedFraction(video.buffered, now, total) * total;
      } catch (error) {
        /* `buffered` can throw while the element is being torn down for a source
         * swap. A failed read must not take the `progress` handler — and every
         * other subscriber to it — down with it. */
        logWarn("player", "buffered read failed", error);
        return;
      }
      /* No clamp here: `bufferedFraction` is contracted to return a finite value
       * in [0, 1] for every input it accepts — including an unknown duration and a
       * throwing index — so `seconds` is finite and non-negative by construction.
       * A defensive re-check would be a branch no test could ever fail, which is
       * worse than no branch: it reads as protection and protects nothing. */
      if (!bufferedMoved(seconds, lastBuffered)) return;
      lastBuffered = seconds;
      setBuffered(seconds);
    };

    // Seed from the element, because `volume`/`muted` may already be set by the
    // element's own defaults or by an attribute before this effect runs.
    onDuration();
    onVolume();
    readBuffered();

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDuration);
    video.addEventListener("loadedmetadata", onDuration);
    video.addEventListener("volumechange", onVolume);
    /* `progress` is the buffered band's own event: it fires as the browser
     * downloads, which is the only thing that moves a buffer. Subscribing to
     * `timeupdate` for this — as the legacy did — would ask "how much is
     * buffered" four times a second and learn nothing new between answers.
     *
     * `seeked` is here because a seek changes WHICH range contains the playhead,
     * so the honest extent can drop instantly without any new download having
     * happened. Without it, seeking backward leaves the band claiming more than
     * is cached. */
    video.addEventListener("progress", readBuffered);
    video.addEventListener("seeked", readBuffered);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDuration);
      video.removeEventListener("loadedmetadata", onDuration);
      video.removeEventListener("volumechange", onVolume);
      video.removeEventListener("progress", readBuffered);
      video.removeEventListener("seeked", readBuffered);
    };
  }, [videoNode]);

  /**
   * Fullscreen is capability-checked rather than assumed.
   *
   * `document.fullscreenEnabled` is checked instead of the existence of
   * `requestFullscreen`, because the method exists in jsdom and in some embedded
   * webviews where calling it rejects — a button that looks like it works and
   * does nothing is worse than one that is honestly unavailable.
   */
  const canFullscreen =
    typeof document !== "undefined" && document.fullscreenEnabled === true;

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onChange = () => setFullscreen(document.fullscreenElement != null);
    document.addEventListener("fullscreenchange", onChange);
    onChange();
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const target = containerRef?.current;
    if (!canFullscreen || !target) {
      logWarn("player-controls", "fullscreen requested but unavailable", {
        canFullscreen,
        hasTarget: Boolean(target),
      });
      return;
    }
    try {
      if (document.fullscreenElement) {
        const exit = document.exitFullscreen?.();
        exit?.catch?.((error) =>
          logWarn("player-controls", "exitFullscreen rejected", { error: error?.message }),
        );
      } else {
        const request = target.requestFullscreen?.();
        request?.catch?.((error) =>
          logWarn("player-controls", "requestFullscreen rejected", { error: error?.message }),
        );
      }
    } catch (error) {
      // Older engines throw synchronously instead of returning a promise.
      logWarn("player-controls", "fullscreen call threw", { error: error?.message });
    }
  }, [canFullscreen, containerRef]);

  /**
   * `play()` that REPORTS whether it worked, and never rejects.
   *
   * Two failure shapes, both handled, because both happen in real browsers:
   * the promise rejects when the autoplay policy blocks playback, and some
   * engines throw synchronously instead of returning a promise at all.
   *
   * Returning a boolean rather than a raw promise is deliberate: the caller has
   * to dispatch `RESUME` to the machine only once the element really is playing,
   * and a `Promise<void>` invites `.then(() => send(RESUME))` on a promise that
   * may have just been refused. Resolving `false` makes "did it actually start"
   * impossible to skip. The rejection is logged here rather than re-thrown, so
   * there is no unhandled rejection and no double log.
   */
  const play = useCallback(
    () => {
      const video = videoRef?.current;
      if (!video) return Promise.resolve(false);
      try {
        const attempt = video.play();
        // No promise at all is a legitimate engine behaviour, not a failure.
        if (!attempt || typeof attempt.then !== "function") return Promise.resolve(true);
        return attempt.then(
          () => true,
          (error) => {
            logWarn("player-controls", "play() rejected", { error: error?.message });
            return false;
          },
        );
      } catch (error) {
        logWarn("player-controls", "play() threw", { error: error?.message });
        return Promise.resolve(false);
      }
    },
    [videoRef],
  );

  const pause = useCallback(() => {
    videoRef?.current?.pause();
  }, [videoRef]);

  /* ── Imperative writes below ───────────────────────────────────────────────
   *
   * `react/immutability` is disabled for exactly this block, and it is worth
   * being precise about why rather than blanket-disabling the file: the rule
   * exists to stop a component writing to something it does not own. A ref'd
   * `<video>` node IS the thing this hook exists to operate — `currentTime`,
   * `volume` and `muted` are the media element's own API, and setting them is
   * the only way to seek or unmute at all. There is no React state that would
   * make `video.currentTime` true instead.
   *
   * React state is still updated alongside every write, and that is not
   * duplication: the element is the source of truth for time and volume, the
   * state is what React renders from. Both are set together so they cannot
   * disagree on screen.
   *
   * NOTE: these are `oxlint` directives. This repo lints with oxlint, which
   * ignores `eslint-disable` comments entirely — an `eslint-disable` here
   * suppresses nothing at all while looking exactly like it worked.
   */
  /* oxlint-disable react/immutability */
  const seekTo = useCallback(
    (seconds) => {
      const video = videoRef?.current;
      if (!video) return;
      const target = Number(seconds);
      if (!Number.isFinite(target)) return;
      // Clamp into the real media range. Assigning past the end throws
      // InvalidStateError in some engines and silently snaps to the end in
      // others; `seekTime` bounds (5.7/7.10) clamp the gesture before it gets
      // here, so an out-of-range value here means a bug upstream, not a seek.
      const max = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : target;
      const clamped = Math.min(Math.max(0, target), max);
      video.currentTime = clamped;
      setCurrentTime(clamped);
    },
    [videoRef],
  );

  /**
   * Seek RELATIVE to where the video actually is (task.md 3.11).
   *
   * Based on `video.currentTime`, not on this hook's `currentTime` state, and
   * that distinction is load-bearing: the state only moves on `timeupdate`, so
   * it can be up to ~250ms stale. Tapping "-10s" five times in a row would then
   * compute five offsets from the same stale base and land 2.5s from where the
   * first tap started — a button that does something other than what it says.
   *
   * `seekTo` does the clamping, so a skip at the very start or the very end is
   * handled in one place. A zero or non-finite delta is ignored rather than
   * treated as "seek to now", which would silently restart the frame.
   */
  const skipBy = useCallback(
    (seconds) => {
      const video = videoRef?.current;
      if (!video) return;
      const delta = Number(seconds);
      if (!Number.isFinite(delta) || delta === 0) return;
      const from = Number(video.currentTime);
      seekTo((Number.isFinite(from) ? from : 0) + delta);
    },
    [videoRef, seekTo],
  );

  const setVolume = useCallback(
    (next) => {
      const video = videoRef?.current;
      if (!video) return;
      const value = Number(next);
      if (!Number.isFinite(value)) return;
      const clamped = Math.min(1, Math.max(0, value));
      video.volume = clamped;
      // Setting the volume while muted changes nothing audible, which reads as a
      // broken slider. Unmuting here is the behaviour every native player has.
      if (clamped > 0 && video.muted) video.muted = false;
      setVolumeState(clamped);
    },
    [videoRef],
  );

  const toggleMute = useCallback(() => {
    const video = videoRef?.current;
    if (!video) return;
    video.muted = !video.muted;
    setMutedState(video.muted);
  }, [videoRef]);

  /**
   * Set the mute state EXPLICITLY (task.md 3.12).
   *
   * `toggleMute` cannot express "unmute" — it can only flip, so a caller that
   * knows the player is muted and wants it audible has to check the state itself
   * and then guess which way the flip goes. That guess is the kind of thing that
   * is right until two callers disagree. The touch volume gesture needs exactly
   * this: dragging up while muted must unmute, and dragging up when already
   * audible must not mute.
   *
   * No level change here on purpose. Unmuting restores whatever level was already
   * set, which is what a viewer expects after silencing and restoring a video.
   */
  const setMuted = useCallback(
    (next) => {
      const video = videoRef?.current;
      if (!video) return;
      video.muted = Boolean(next);
      setMutedState(video.muted);
    },
    [videoRef],
  );
  /* oxlint-enable react/immutability */

  return {
    muted,
    volume,
    currentTime,
    duration,
    /* 3.14. Seconds, not a fraction: `duration` can change (a live stream, a
     * source swap) and a fraction captured against the old duration would be
     * quietly wrong afterwards. The scrubber does the division, against the
     * duration it is rendering with. */
    buffered,
    fullscreen,
    canFullscreen,
    play,
    pause,
    seekTo,
    skipBy,
    setVolume,
    setMuted,
    toggleMute,
    toggleFullscreen,
  };
}
