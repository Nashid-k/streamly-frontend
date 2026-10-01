import { useCallback, useEffect, useRef, useState } from "react";
import { CHROME_IDLE_MS, canAutoHide } from "../chromeVisibility";

/**
 * Idle auto-hide for the chrome (task.md 3.8).
 *
 * Returns `visible`, which the shell stamps as `data-chrome`. All the judgement
 * is in `canAutoHide`; this file is only the wiring — the activity listeners and
 * one timer. That split is what makes the four "must not hide" gates assertable
 * as a truth table instead of as a pile of `setTimeout`s.
 *
 * ── What counts as activity ────────────────────────────────────────────────
 * Pointer movement, pointer down, key press, and focus entering. All of them
 * reveal INSTANTLY (the requirement is "instant return", not "return when the
 * timer next runs") and RESTART the idle window.
 *
 * `pointerdown` and `keydown` are included alongside `pointermove` because a
 * click or a keypress with no intervening mouse movement produces no
 * `pointermove` at all — a viewer using the keyboard exclusively would otherwise
 * never reset the timer, and the chrome would fade out under them mid-scrub.
 *
 * ── The timer is managed imperatively, and it has to be ────────────────────
 * This was a real bug before it was written this way. The first version armed
 * the timeout inside an effect whose dependencies were only the machine state,
 * and activity just called `setVisible(true)`. That re-rendered but changed no
 * dependency, so the ORIGINAL deadline survived every pointer move — and the
 * chrome yanked itself away 2.6s after playback began no matter what the viewer
 * was doing. The requirement is "2.6s of IDLE", not "2.6s after playing".
 *
 * So `recompute` reads the live refs, clears, and re-arms, and activity calls it
 * directly. No state is involved, so pointer movement re-arms the timer without
 * re-rendering the player. Only `visible` and a re-render of the one attribute
 * that actually changed.
 *
 * ── Why the gates are refs, and why that is safe here ─────────────────────
 * Focus and pointer-inside-chrome change rarely (unlike pointer movement, which
 * deliberately does not touch them), so refs are the right store: they must not
 * re-render on every move. Because `recompute` reads them at call time — both
 * when arming and when firing — nothing can be stale. The trap here would be
 * computing `canAutoHide` during render and trusting it inside the timeout; the
 * checks are re-read instead, so a gate that flipped between arming and firing
 * is always respected.
 */
export default function useChromeAutoHide({
  state,
  containerRef,
  sheetOpen = false,
  enabled = true,
  idleMs = CHROME_IDLE_MS,
}) {
  const [visible, setVisible] = useState(true);

  const hasFocus = useRef(false);
  const pointerInChrome = useRef(false);
  const timer = useRef(null);

  const clearTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  /** Re-evaluate the gates and (re)arm or cancel the idle window accordingly.
   *  Safe to call from a listener, from a gate change, or from an effect. */
  const recompute = useCallback(() => {
    clearTimer();
    const allowed = canAutoHide({
      state,
      hasFocus: hasFocus.current,
      sheetOpen,
      pointerInChrome: pointerInChrome.current,
    });
    if (!enabled || !allowed) {
      // Forced VISIBLE rather than merely "not hidden": the viewer paused a
      // moment after the bar faded, and leaving `visible === false` would strand
      // a paused video with nothing to press play from.
      setVisible(true);
      return;
    }
    timer.current = setTimeout(() => {
      timer.current = null;
      // Re-read the gates: focus or the pointer may have moved onto the chrome
      // since this was armed, without anything having re-run this effect.
      if (
        canAutoHide({
          state,
          hasFocus: hasFocus.current,
          sheetOpen,
          pointerInChrome: pointerInChrome.current,
        })
      ) {
        setVisible(false);
      }
    }, idleMs);
  }, [enabled, idleMs, sheetOpen, state]);

  /* Every gate change funnels through `recompute`, so a gate flipping re-arms the
   * window at that instant rather than leaving a stale deadline running. */
  useEffect(() => {
    recompute();
    return clearTimer;
  }, [recompute]);

  /** Reveal now and restart the window. Also the manual entry point for callers
   *  outside the container (3.11's touch zones). */
  const poke = useCallback(() => {
    setVisible(true);
    recompute();
  }, [recompute]);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return undefined;

    const onActivity = () => poke();

    /** `closest` on the event target rather than one listener per layer: the
     *  chrome is already several subtrees (status plate, transport) and 3.9/3.24
     *  add more. `data-chrome-layer` is the contract, so a new layer is covered
     *  without anyone remembering to register it. */
    const isChromeTarget = (target) => Boolean(target?.closest?.("[data-chrome-layer]"));

    const onPointerOver = (event) => {
      const inside = isChromeTarget(event.target);
      if (pointerInChrome.current === inside) return;
      pointerInChrome.current = inside;
      recompute();
    };

    const onPointerOut = (event) => {
      if (!pointerInChrome.current) return;
      // Moving between two children of one chrome layer also fires pointerout,
      // with a chrome `relatedTarget`. Treating that as "left" would start hiding
      // in the middle of a drag. jsdom only populates `relatedTarget` on
      // MouseEvent/PointerEvent, not a bare Event — hence the real constructor in
      // the tests as well as the defensive read here.
      const next = event.relatedTarget;
      if (next && isChromeTarget(next)) return;
      pointerInChrome.current = false;
      recompute();
    };

    const onFocusIn = () => {
      if (!hasFocus.current) {
        hasFocus.current = true;
        recompute();
      }
      // Focus landing is activity, so the window restarts here too.
      poke();
    };

    const onFocusOut = (event) => {
      // `relatedTarget` is where focus is going; null means it left the document,
      // which counts as "not inside". Reading it is what stops the timer running
      // while focus sits in the status line's dismiss button.
      const next = event.relatedTarget;
      if (next && container.contains(next)) return;
      if (!hasFocus.current) return;
      hasFocus.current = false;
      recompute();
    };

    container.addEventListener("pointermove", onActivity);
    container.addEventListener("pointerdown", onActivity);
    container.addEventListener("keydown", onActivity);
    container.addEventListener("focusin", onFocusIn);
    container.addEventListener("focusout", onFocusOut);
    container.addEventListener("pointerover", onPointerOver);
    container.addEventListener("pointerout", onPointerOut);

    return () => {
      container.removeEventListener("pointermove", onActivity);
      container.removeEventListener("pointerdown", onActivity);
      container.removeEventListener("keydown", onActivity);
      container.removeEventListener("focusin", onFocusIn);
      container.removeEventListener("focusout", onFocusOut);
      container.removeEventListener("pointerover", onPointerOver);
      container.removeEventListener("pointerout", onPointerOut);
    };
  }, [containerRef, poke, recompute]);

  return { visible, poke };
}
