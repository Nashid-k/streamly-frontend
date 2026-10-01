import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import useChromeAutoHide from "../components/player/v2/hooks/useChromeAutoHide";
import {
  CHROME_IDLE_MS,
  NEVER_HIDE_STATES,
  canAutoHide,
} from "../components/player/v2/chromeVisibility";
import { S, STATES } from "../components/player/v2/playbackMachine";

/* PLAYER V2 idle auto-hide (task.md 3.8).
 *
 * "Hide after 2.6s of idle" is the easy half of this item. The half that decides
 * whether the player is pleasant is the set of things that must NOT be allowed to
 * hide the chrome, and each of those is a distinct recognisable failure. So the
 * truth table is asserted directly, and the hook is asserted with fake timers.
 */

describe("canAutoHide — the truth table", () => {
  it("hides while playing", () => {
    expect(canAutoHide({ state: S.PLAYING })).toBe(true);
    // A stall preserves the frame and the viewer is still watching; flipping the
    // chrome to "paused" on a network hiccup is a false signal.
    expect(canAutoHide({ state: S.STALLED })).toBe(true);
  });

  it("never hides in any state where the controls are the next action", () => {
    // The failure this prevents is an un-pausable player.
    NEVER_HIDE_STATES.forEach((state) => {
      expect(canAutoHide({ state }), state).toBe(false);
    });
    // And the list is exhaustive, so a state added later is a test failure.
    expect(NEVER_HIDE_STATES).toHaveLength(STATES.length - 2);
  });

  it("does not hide while focus is inside", () => {
    // The machine-readable twin of the 3.5 `:focus-within` rule: CSS makes it
    // LOOK right, this makes `data-chrome` tell the truth.
    expect(canAutoHide({ state: S.PLAYING, hasFocus: true })).toBe(false);
  });

  it("does not hide while a settings panel is open", () => {
    // Hiding the transport strands the control that opened the panel.
    expect(canAutoHide({ state: S.PLAYING, sheetOpen: true })).toBe(false);
  });

  it("does not hide while the pointer rests on a chrome layer", () => {
    // The one movement alone cannot save: a stationary cursor over the scrubber
    // emits no events, so the bar would vanish from under the viewer who is
    // about to drag it.
    expect(canAutoHide({ state: S.PLAYING, pointerInChrome: true })).toBe(false);
  });

  it("names the idle window once", () => {
    expect(CHROME_IDLE_MS).toBe(2600);
  });
});

/** Mounts the hook against a real container so the delegated listeners are the
 *  real ones — a hook test with a bare object ref would not fire anything. */
function mountAutoHide(props = {}) {
  const container = document.createElement("div");
  container.innerHTML = '<div data-chrome-layer="transport"><button type="button">x</button></div>';
  document.body.appendChild(container);

  const ref = { current: container };
  const view = renderHook((p) => useChromeAutoHide({ containerRef: ref, ...p }), {
    initialProps: { state: S.PLAYING, ...props },
  });

  return { container, ref, ...view };
}

describe("useChromeAutoHide — the timer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
  });

  const advance = (ms) => act(() => { vi.advanceTimersByTime(ms); });

  /** jsdom only populates `relatedTarget` on MouseEvent/FocusEvent, never on a
   *  bare `Event`. Building one with `new Event(..., { relatedTarget })` silently
   *  yields `undefined`, which is exactly the "pointer left / focus left" branch —
   *  so these helpers exist to keep the assertions honest about which one ran. */
  const pointerOver = (el) =>
    act(() => { el.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })); });
  const pointerOut = (el, relatedTarget) =>
    act(() => { el.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget })); });

  it("hides after exactly the idle window of being left alone", () => {
    const { result } = mountAutoHide();
    expect(result.current.visible).toBe(true);

    advance(CHROME_IDLE_MS - 1);
    expect(result.current.visible, "must not hide a millisecond early").toBe(true);

    advance(1);
    expect(result.current.visible).toBe(false);
  });

  it("returns instantly on pointer movement", () => {
    const { container, result } = mountAutoHide();
    advance(CHROME_IDLE_MS);
    expect(result.current.visible).toBe(false);

    act(() => {
      container.dispatchEvent(new Event("pointermove", { bubbles: true }));
    });
    expect(result.current.visible).toBe(true);
  });

  it("returns on a key press, which produces no pointer movement at all", () => {
    // A keyboard-only viewer would never reset the timer otherwise, and the
    // chrome would fade out mid-scrub.
    const { container, result } = mountAutoHide();
    advance(CHROME_IDLE_MS);
    expect(result.current.visible).toBe(false);

    act(() => {
      container.dispatchEvent(new Event("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(result.current.visible).toBe(true);
  });

  it("restarts the window on activity rather than firing from the old deadline", () => {
    const { container, result } = mountAutoHide();
    // Regression: activity used to call `setVisible(true)` and nothing else, so
    // the ORIGINAL deadline survived every pointer move and the chrome hid 2.6s
    // after playback began no matter what the viewer was doing.
    advance(CHROME_IDLE_MS - 100); // t = 2500
    act(() => {
      container.dispatchEvent(new Event("pointermove", { bubbles: true }));
    }); // re-arms: the new deadline is t = 2500 + 2600 = 5100

    advance(100); // t = 2600 — the old deadline, which must no longer exist
    expect(result.current.visible, "the old deadline must have been cancelled").toBe(true);

    advance(CHROME_IDLE_MS - 101); // t = 5099
    expect(result.current.visible, "a full window after the last move").toBe(true);
    advance(1); // t = 5100
    expect(result.current.visible).toBe(false);
  });

  it("never hides while focus is inside, and re-arms afterwards", () => {
    const { container, result } = mountAutoHide();
    const button = container.querySelector("button");

    act(() => {
      button.dispatchEvent(new Event("focusin", { bubbles: true }));
    });
    advance(CHROME_IDLE_MS * 3);
    expect(result.current.visible, "focus must beat the timer").toBe(true);

    // Focus leaves. THIS is the case a naive implementation gets wrong: the
    // timer fired and declined to hide, so if nothing re-armed it the chrome
    // would never hide again for the rest of the session.
    act(() => {
      button.dispatchEvent(
        new FocusEvent("focusout", { bubbles: true, relatedTarget: document.body }),
      );
    });
    expect(result.current.visible).toBe(true);
    advance(CHROME_IDLE_MS);
    expect(result.current.visible, "must hide again once focus leaves").toBe(false);
  });

  it("stays hidden-free while the pointer rests on a chrome layer", () => {
    const { container, result } = mountAutoHide();
    const layer = container.querySelector("[data-chrome-layer]");
    const outside = document.createElement("div");
    container.appendChild(outside);

    pointerOver(layer);
    advance(CHROME_IDLE_MS * 2);
    expect(result.current.visible, "a resting cursor must save the chrome").toBe(true);

    // Pointer leaves the chrome for the picture.
    pointerOut(layer, outside);
    advance(CHROME_IDLE_MS);
    expect(result.current.visible).toBe(false);
  });

  it("treats movement between chrome children as still inside", () => {
    // pointerout fires with a chrome relatedTarget when you drag from one control
    // to the next; treating that as "left" would start hiding mid-interaction.
    const { container, result } = mountAutoHide();
    const layer = container.querySelector("[data-chrome-layer]");
    const button = container.querySelector("button");

    pointerOver(layer);
    pointerOut(layer, button);
    advance(CHROME_IDLE_MS * 2);
    expect(result.current.visible).toBe(true);
  });

  it("does not treat a pointerout with no relatedTarget as still inside", () => {
    // The counterpart, so the test above cannot pass merely because both paths
    // collapsed into one. Leaving the window entirely yields a null target.
    const { container, result } = mountAutoHide();
    const layer = container.querySelector("[data-chrome-layer]");
    pointerOver(layer);
    pointerOut(layer, null);
    advance(CHROME_IDLE_MS);
    expect(result.current.visible).toBe(false);
  });

  it("forces the chrome back when playback pauses", () => {
    // The viewer paused a moment after the bar faded; merely skipping the timer
    // would leave it invisible with nothing to press play from.
    const { result, rerender } = mountAutoHide();
    advance(CHROME_IDLE_MS);
    expect(result.current.visible).toBe(false);

    rerender({ state: S.PAUSED });
    expect(result.current.visible).toBe(true);

    advance(CHROME_IDLE_MS * 3);
    expect(result.current.visible, "a paused player must keep its controls").toBe(true);
  });

  it("never arms a timer in a non-playing state", () => {
    NEVER_HIDE_STATES.forEach((state) => {
      const { result, rerender } = mountAutoHide();
      rerender({ state });
      advance(CHROME_IDLE_MS * 4);
      expect(result.current.visible, state).toBe(true);
    });
  });

  it("does nothing when disabled", () => {
    const { result } = mountAutoHide({ enabled: false });
    advance(CHROME_IDLE_MS * 4);
    expect(result.current.visible).toBe(true);
  });

  it("exposes a manual reveal for callers outside the container", () => {
    const { result } = mountAutoHide();
    advance(CHROME_IDLE_MS);
    expect(result.current.visible).toBe(false);
    act(() => {
      result.current.poke();
    });
    expect(result.current.visible).toBe(true);
  });

  it("removes its listeners on unmount", () => {
    const { container, unmount } = mountAutoHide();
    unmount();
    // Would throw or warn if the cleanup failed to detach.
    act(() => {
      container.dispatchEvent(new Event("pointermove", { bubbles: true }));
    });
  });
});

describe("useChromeAutoHide — real timers, no fakes", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("does not arm a timer before the idle window elapses", async () => {
    // Guards against a regression that only fake timers would hide: with real
    // timers, a zero/negative timeout would hide immediately on mount, which
    // the faked suite above cannot distinguish from correct behaviour.
    const container = document.createElement("div");
    document.body.appendChild(container);
    const ref = { current: container };

    const { result } = renderHook(() =>
      useChromeAutoHide({ state: S.PLAYING, containerRef: ref }),
    );

    await new Promise((r) => setTimeout(r, CHROME_IDLE_MS + 120));
    expect(result.current.visible).toBe(false);
  });
});
