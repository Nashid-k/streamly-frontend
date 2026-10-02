import { useCallback, useEffect, useMemo, useState } from "react";
import Hls from "hls.js";
import { describeAudio } from "../audioTracks";
import { logWarn } from "../../../../utils/debugLogger";

/**
 * Audio tracks, read off the live hls.js engine (task.md R4.1).
 *
 * ── Why the engine is a ref and not a value ────────────────────────────────────
 * The engine is created and destroyed inside `useHlsSource` on every source
 * change. Passing it down as state would re-render the shell — and tear down the
 * settings sheet — on each engine swap, which is exactly the moment a viewer is
 * most likely to be selecting a track. So it arrives as a ref and is read on the
 * events that actually change the answer.
 *
 * ── Why this listens instead of polling ───────────────────────────────────────
 * `hls.audioTracks` is populated when the manifest parses, which is AFTER mount
 * and often after the sheet is already open. Reading it once on mount would
 * therefore report "one soundtrack" for every title — the exact wrong answer the
 * single-track case is careful not to give. hls.js announces both moments:
 * AUDIO_TRACKS_UPDATED when the list appears, and AUDIO_TRACK_SWITCHED when the
 * selection moves (including when the engine moves it itself, which the viewer did
 * not ask for and which must not leave the sheet showing a stale checkmark).
 */

const SCOPE = "PlayerSource:audio";

/* The event names come from `Hls.Events` rather than from the engine instance.
 * Reflecting them off `engine.constructor.Events` was the first attempt and it is
 * wrong twice over: it only works because a real engine's constructor happens to
 * carry them, and it makes the subscription untestable against anything but a real
 * hls.js. `useHlsSource` already imports `Hls` for the same reason — the events are
 * library constants, not a property of the thing emitting them. */
const TRACK_EVENTS = Object.freeze([
  Hls.Events?.AUDIO_TRACKS_UPDATED,
  Hls.Events?.AUDIO_TRACK_SWITCHED,
]).filter(Boolean);

/** Reads `engine.audioTracks` defensively: a destroyed engine is still readable. */
function readTracks(engine) {
  try {
    return Array.isArray(engine?.audioTracks) ? engine.audioTracks : [];
  } catch (error) {
    /* A destroyed hls.js instance keeps its accessors, so this CAN throw. Losing
     * the track list is survivable; crashing the settings sheet over it is not. */
    logWarn(SCOPE, "engine track list unreadable", error);
    return [];
  }
}

function readCurrentIndex(engine) {
  try {
    return Number.isInteger(engine?.audioTrack) ? engine.audioTrack : null;
  } catch (error) {
    logWarn(SCOPE, "engine track index unreadable", error);
    return null;
  }
}

/**
 * @param {object|null} engine live hls.js instance, or null (native HLS, or not
 *   created yet). A VALUE, not a ref: `useHlsSource` reports the engine through
 *   a callback into shell state (R4.7), so it is a render input the hook can
 *   depend on honestly. Reading a ref written by an effect during render is what
 *   let the panel bind to nothing on every source.
 * @returns {{audio: object, selectAudio: (index: number) => void}}
 */
export default function useAudioTracks(engine) {
  const [version, setVersion] = useState(0);

  /* `version` is the only state, deliberately. The track list itself is NOT
   * mirrored into state: it is engine state, and copying it out would create a
   * second source of truth that drifts from the engine the moment something else
   * selects a track. A counter is enough to force the read to happen again. */
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    /* Native-HLS mode (Safari) has no hls.js at all, so there is nothing to
     * subscribe to and nothing to write to. Returning a stable empty model is
     * correct: the browser is playing whatever is in the stream and there is no
     * mechanism exposed to change it. The panel says so rather than pretending. */
    if (!engine || typeof engine.on !== "function") return undefined;

    const refresh = bump;

    /* NO initial refresh here, and the absence is deliberate. An earlier draft read
     * the engine inside this effect "for the warm-source case, where both events have
     * already fired". Mutation testing killed that line: removing it changed no test,
     * because the model is already built during RENDER from `engine.audioTracks`. The
     * render pass is the read. A forced extra render to re-read what was just read is
     * a wasted commit, and its comment claimed a guarantee it was not providing. */

    for (const event of TRACK_EVENTS) engine.on(event, refresh);
    return () => {
      for (const event of TRACK_EVENTS) {
        if (typeof engine.off === "function") engine.off(event, refresh);
      }
    };
    /* `version` is bumped BY these handlers, so making it a dependency would tear down
     * and rebuild both subscriptions on every AUDIO_TRACK_SWITCHED — churn that grows
     * with how long the player is left open, while the live listener count stays flat
     * and hides it. The engine's identity is the only real dependency. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bump, engine]);

  const audio = useMemo(
    () =>
      describeAudio(readTracks(engine), {
        currentIndex: readCurrentIndex(engine),
        engineAttached: Boolean(engine),
      }),
    /* `version` is the real dependency: the engine announces a change by bumping
     * the counter, and it cannot be a dep directly because it has no stable
     * identity to read. `engine` covers the swap on a source change.
     *
     * The rule below flags `version` as unnecessary because nothing inside the
     * callback READS it. It is an invalidation SIGNAL, not an input — the engine's
     * events cannot change React state by any other route, so this counter is the
     * only thing that can make the model be rebuilt when a track arrives or the
     * engine moves the selection. Dropping it would leave the panel showing whatever
     * the manifest happened to say at mount, which is the bug the whole hook
     * exists to prevent. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, version],
  );

  const selectAudio = useCallback(
    (index) => {
      /* No engine (native HLS, or already closed) is not an error the viewer can
       * act on, so this is a no-op rather than a thrown failure. */
      if (!engine) return;
      try {
        engine.audioTrack = index;
      } catch (error) {
        logWarn(SCOPE, "audio selection refused", error);
      }
      /* Re-read immediately so the checkmark moves with the press. Waiting for
       * AUDIO_TRACK_SWITCHED would leave the row looking unselected for as long
       * as the engine takes to honour it — and on a silent switch, potentially
       * not at all. */
      bump();
    },
    [bump, engine],
  );

  // `version` is consumed by the `useMemo` above; this comment marks that the
  // counter is load-bearing rather than leftover state.
  return { audio, selectAudio };
}