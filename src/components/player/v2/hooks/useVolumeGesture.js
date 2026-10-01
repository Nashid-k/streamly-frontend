import { useCallback, useEffect, useRef, useState } from "react";
import {
  DRAG_ARM_PX,
  GESTURE,
  GESTURE_ZONE,
  classifyDrag,
  dragStartLevel,
  shouldUnmuteOnDrag,
  volumeFromDrag,
  zoneOf,
} from "../volumeGesture";

/**
 * The touch volume gesture (task.md 3.12).
 *
 * Path ONE of three. The other two are a persistent level indicator and a sheet
 * entry, and this hook is deliberately only the gesture: it owns the pointer
 * sequence and nothing else. It does not own the level (the shell does, via
 * `usePlayerControls`), does not own chrome visibility, and does not own the
 * indicator's lifetime.
 *
 * ── Why the gesture alone is not enough ──────────────────────────────────────
 * 3.12's complaint is precise: the legacy player had exactly this gesture and it
 * was undiscoverable and keyboard-unreachable. Building only the gesture would
 * reproduce the bug being fixed. The three paths are counted in
 * `playerV2Volume.test.jsx` so "one path" cannot pass as "three".
 *
 * ── Pointer events, not touch events ──────────────────────────────────────────
 * The legacy used `onTouchStart/Move/End` with `e.touches[0]`, which cannot
 * express a pointer cancel and has no `setPointerCapture`. Pointer events give
 * capture for free — so a drag that wanders off the element keeps working — and
 * `pointercancel`, which is what a system gesture (an incoming call, a system
 * back-swipe) actually delivers. Ignoring it leaves the gesture stuck "active"
 * with the volume frozen part-way.
 */
export default function useVolumeGesture({
  containerRef,
  enabled = false,
  /** The CURRENT level and mute state, read at press time only (see the note on
   *  `startVolume`). Passed in rather than owned so the shell stays the single
   *  owner of playback state — this hook is a view of it, not a second copy. */
  level = 0,
  muted = false,
  onVolume,
  onMuteChange,
  onStart,
  onEnd,
}) {
  const [active, setActive] = useState(false);
  /* Mirrors of the props, so the press handler can read the latest values
   * without being re-created (and without `handlePointerDown` changing identity
   * on every volume change, which would detach and re-attach the listener). */
  const levelRef = useRef(level);
  const mutedRef = useRef(muted);
  /* Written during render on purpose. The usual rule is that refs are for things
   * that do not affect rendering, and this is not that case: the refs hold the
   * LATEST props so the pointerdown handler can read them, and the alternative —
   * listing `level`/`muted` as dependencies — would rebuild `handlePointerDown`
   * on every volume change, i.e. on every frame of a drag.
   *
   * React 19 codifies the safe version of this: mutating a ref in an effect (or a
   * layout effect, which is what ordering actually requires here) rather than in
   * the render body, so no render can ever observe a half-updated pair. */
  useEffect(() => {
    levelRef.current = level;
    mutedRef.current = muted;
  }, [level, muted]);
  /* The in-flight gesture. A ref, not state: this changes on every pointermove,
   * and routing pointer movement through React state would re-render the player
   * 60 times a second to move one thing. The ONE piece of state is `active`,
   * because that genuinely changes what is rendered. */
  const dragRef = useRef(null);

  const end = useCallback(() => {
    const drag = dragRef.current;
    dragRef.current = null;
    setActive(false);
    if (drag) onEnd?.();
  }, [onEnd]);

  const handlePointerDown = useCallback(
    (event) => {
      if (!enabled) return;
      /* Buttons keep their own clicks. A press that starts on the transport must
       * not also become a volume drag, or tapping "−10s" would slide the volume
       * as it seeks. Checking `closest` rather than comparing against the
       * container is what makes this survive the chrome layers sitting between
       * the video and the shell root. */
      if (event.target?.closest?.("[data-chrome-layer]")) return;
      const rect = containerRef?.current?.getBoundingClientRect?.();
      if (!rect || rect.width <= 0) return;

      /* The level this drag starts FROM is captured at press time. Reading it
       * again on every move would make the gesture chase its own output: set
       * volume to 0.5, recompute from 0.5, set 0.6, recompute from 0.6. A drag
       * with feedback is an amplifier, which is why the base has to be frozen
       * for the duration. */
      const startVolume = dragStartLevel({ level: levelRef.current, muted: mutedRef.current });
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        totalDx: 0,
        totalDy: 0,
        armed: false,
        active: false,
        /* Captured at press time, never recomputed: a finger that starts in the
         * left third and slides across the middle is still a left-third gesture. */
        zone: zoneOf(rect, event.clientX),
        startVolume,
        startMuted: mutedRef.current,
        rectWidth: rect.width,
      };
    },
    [containerRef, enabled],
  );

  const handlePointerMove = useCallback(
    (event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      drag.totalDx = dx;
      drag.totalDy = dy;

      /* Arm on distance alone, before any axis or zone test. Arming is about
       * "this is a drag, not a tap"; deciding what KIND of drag is a separate
       * question with a separate answer. Conflating them is how a player ends up
       * unable to tap because the gesture that would have handled the tap was
       * rejected for the wrong reason. */
      if (!drag.armed) {
        if (Math.hypot(dx, dy) < DRAG_ARM_PX) return;
        drag.armed = true;
      }

      const kind = classifyDrag({
        startZone: drag.zone,
        totalDx: drag.totalDx,
        totalDy: drag.totalDy,
        armed: drag.armed,
      });
      /* A horizontal drag on the centre or right third is NOT ours. Leaving
       * `dragRef` populated would let the gesture keep claiming a pointer it has
       * disowned, so it is cleared rather than left to idle. */
      if (kind !== GESTURE.VOLUME) {
        if (armedAsNonGesture(drag)) {
          dragRef.current = null;
          return;
        }
        return;
      }

      if (!drag.active) {
        drag.active = true;
        /* Capture AFTER arming, so a tap is never captured and a press that began
         * on a control is never stolen. */
        try {
          containerRef?.current?.setPointerCapture?.(event.pointerId);
        } catch {
          /* Capture is an optimisation: without it the drag still works while the
           * finger stays over the element. Not worth failing a volume change over. */
        }
        setActive(true);
        onStart?.();
      }

      const next = volumeFromDrag({
        startX: drag.startX,
        clientX: event.clientX,
        containerWidth: drag.rectWidth,
        startVolume: drag.startVolume,
      });
      if (shouldUnmuteOnDrag({
        startLevel: drag.startVolume,
        nextLevel: next,
        muted: drag.startMuted,
      })) {
        onMuteChange?.(false);
      }
      onVolume?.(next);
    },
    [containerRef, onMuteChange, onStart, onVolume],
  );

  const handlePointerUp = useCallback(() => end(), [end]);
  const handlePointerCancel = useCallback(() => end(), [end]);

  return {
    active,
    /* Spread onto the shell root. `pointercancel` is not optional — see the note
     * in the module comment. */
    handlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
    },
  };
}

/**
 * Has an armed drag definitively disowned volume?
 *
 * The distinction that matters: an armed drag that is still VERTICAL may become
 * horizontal later — a finger that starts straight down and curves right should
 * still sweep volume. An armed HORIZONTAL drag in the wrong zone never will, so
 * it is released. Getting this backwards makes diagonal flicks feel broken;
 * getting it the other way makes left-third horizontal drags keep stealing the
 * pointer from the tap handler.
 */
function armedAsNonGesture(drag) {
  const { zone, totalDx, armed } = drag;
  if (!armed) return false;
  /* In the left zone, horizontal travel is ours and a vertical intent may still
   * turn into one, so the pointer is never disowned. */
  if (zone === GESTURE_ZONE.LEFT) return false;
  /* Elsewhere, a drag that has travelled far enough horizontally will not become
   * vertical again, and it was never ours to begin with. Releasing it hands the
   * pointer back to the tap and double-tap handlers. */
  return Math.abs(totalDx) >= DRAG_ARM_PX;
}