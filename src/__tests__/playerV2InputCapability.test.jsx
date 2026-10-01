import { describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import useInputCapability from "../components/player/v2/hooks/useInputCapability";
import {
  INPUT,
  MEDIA_QUERIES,
  classifyInput,
  readMediaCapabilities,
} from "../components/player/v2/inputCapability";

/* Live input capability (task.md 3.3-3.4).
 *
 * `NativePlayerView.jsx:140-143` computed `IS_TOUCH` once at module load and read
 * that frozen boolean in 37 places. These tests exist to prove the replacement
 * actually MOVES, because "reads a media query" and "reacts to the viewer
 * changing input" look identical in code review and are not the same claim.
 */

/** A controllable matchMedia, because jsdom answers `false` to everything. */
function installMatchMedia(initial = {}) {
  const state = { ...initial };
  const lists = [];
  const queries = new Map();

  window.matchMedia = vi.fn((query) => {
    if (!queries.has(query)) {
      const listeners = new Set();
      const list = {
        media: query,
        get matches() {
          return Boolean(state[query]);
        },
        addEventListener: (_type, fn) => listeners.add(fn),
        removeEventListener: (_type, fn) => listeners.delete(fn),
      };
      queries.set(query, { list, listeners });
      lists.push(list);
    }
    return queries.get(query).list;
  });

  return {
    /** Flip a query and fire `change`, as a real browser does on a media change. */
    set(query, matches) {
      state[query] = matches;
      const entry = queries.get(query);
      entry?.listeners.forEach((fn) => fn({ matches, media: query }));
    },
    listenerCount() {
      let n = 0;
      for (const entry of queries.values()) n += entry.listeners.size;
      return n;
    },
    calls: window.matchMedia,
  };
}

/* Fixtures exist in two shapes and conflating them is a trap:
 *   - *_Q is keyed by the media query STRING, for `matchMedia` stubs.
 *   - the bare names are the FACTS, which is what `classifyInput` takes.
 * Passing a query-keyed object to `classifyInput` yields `undefined` for every
 * fact, which silently classifies as FINE — i.e. it would have made these tests
 * pass for the wrong reason if the expectation had been "fine". */
const FINE_DESKTOP_Q = {
  [MEDIA_QUERIES.canHover]: true,
  [MEDIA_QUERIES.hasFine]: true,
  [MEDIA_QUERIES.hasCoarse]: false,
};
const TOUCH_ONLY_Q = {
  [MEDIA_QUERIES.canHover]: false,
  [MEDIA_QUERIES.hasFine]: false,
  [MEDIA_QUERIES.hasCoarse]: true,
};
const HYBRID_Q = {
  [MEDIA_QUERIES.canHover]: true,
  [MEDIA_QUERIES.hasFine]: true,
  [MEDIA_QUERIES.hasCoarse]: true,
};

const FINE_DESKTOP = { canHover: true, hasFine: true, hasCoarse: false };
const TOUCH_ONLY = { canHover: false, hasFine: false, hasCoarse: true };
const HYBRID = { canHover: true, hasFine: true, hasCoarse: true };

describe("classifyInput", () => {
  it("defaults to fine when nothing is known", () => {
    // Matches the old `IS_TOUCH` default of false, and is the safer layout:
    // a wrong guess toward desktop still leaves every control reachable.
    expect(classifyInput()).toBe(INPUT.FINE);
    expect(classifyInput({})).toBe(INPUT.FINE);
  });

  it("reads a touch-only device as coarse", () => {
    expect(classifyInput(TOUCH_ONLY)).toBe(INPUT.COARSE);
  });

  it("reads a desktop as fine", () => {
    expect(classifyInput(FINE_DESKTOP)).toBe(INPUT.FINE);
  });

  it("defaults a hybrid device to fine until it is touched", () => {
    // Both pointers report true. Nothing has happened yet, so the desktop layout
    // is the correct starting guess — and the next touch moves it.
    expect(classifyInput(HYBRID)).toBe(INPUT.FINE);
  });

  it("lets a real interaction override the media queries", () => {
    expect(classifyInput({ ...FINE_DESKTOP, lastPointerType: "touch" })).toBe(INPUT.COARSE);
    expect(classifyInput({ ...TOUCH_ONLY, lastPointerType: "mouse" })).toBe(INPUT.FINE);
  });

  it("treats a stylus as precise input, not as touch", () => {
    // A pen hovers and has a fine pointer. Calling it "touch" hides hover
    // affordances from someone holding a stylus a centimetre off the screen.
    expect(classifyInput({ ...TOUCH_ONLY, lastPointerType: "pen" })).toBe(INPUT.FINE);
  });
});

describe("readMediaCapabilities", () => {
  it("reads all three queries", () => {
    const mm = installMatchMedia(FINE_DESKTOP_Q);
    expect(readMediaCapabilities()).toEqual({ canHover: true, hasFine: true, hasCoarse: false });
    expect(mm.calls).toHaveBeenCalledWith(MEDIA_QUERIES.hasCoarse);
  });

  it("survives a missing window", () => {
    // SSR and some test environments have no matchMedia at all. Defaulting is
    // the right failure: it is the old boolean's answer, not a crash.
    expect(readMediaCapabilities(null)).toEqual({
      canHover: false,
      hasFine: false,
      hasCoarse: false,
    });
  });

  it("keeps the other queries when one throws", () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn((query) => {
      if (query === MEDIA_QUERIES.hasFine) throw new Error("unsupported");
      return { matches: query === MEDIA_QUERIES.canHover };
    });
    try {
      expect(readMediaCapabilities()).toEqual({
        canHover: true,
        hasFine: false,
        hasCoarse: false,
      });
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("useInputCapability", () => {
  it("starts from the current media state", () => {
    installMatchMedia(TOUCH_ONLY_Q);
    const { result } = renderHook(() => useInputCapability());
    expect(result.current.mode).toBe(INPUT.COARSE);
    expect(result.current.isTouch).toBe(true);
  });

  it("moves when a media query changes", () => {
    // The whole point of 3.3: the old frozen boolean could not do this.
    const mm = installMatchMedia(FINE_DESKTOP_Q);
    const { result } = renderHook(() => useInputCapability());
    expect(result.current.mode).toBe(INPUT.FINE);

    // Both pointers have to flip for this to be a device change. Setting only
    // `hasCoarse` describes a HYBRID device, which deliberately stays fine —
    // so this also pins that a hybrid is not mistaken for a tablet.
    act(() => mm.set(MEDIA_QUERIES.hasFine, false));
    act(() => mm.set(MEDIA_QUERIES.hasCoarse, true));

    expect(result.current.mode).toBe(INPUT.COARSE);
    // `canHover` tracks its own query and was never changed here — the hook
    // exposes the individual facts so a component can ask the precise question,
    // instead of every caller inferring capability from a layout decision.
    expect(result.current.canHover).toBe(true);
  });

  it("keeps a hybrid on the desktop layout until it is actually touched", () => {
    // Guards the precedence rule directly at the hook level: a laptop with a
    // touchscreen reports coarse=true, and treating that as touch-only would
    // hand every desktop viewer thumb zones the moment they open a title.
    const mm = installMatchMedia(HYBRID_Q);
    const { result } = renderHook(() => useInputCapability());
    expect(result.current.mode).toBe(INPUT.FINE);

    act(() => mm.set(MEDIA_QUERIES.hasCoarse, true));
    expect(result.current.mode).toBe(INPUT.FINE);
  });

  it("reclassifies a hybrid device on the next touch", () => {
    // A Surface / touchscreen laptop / iPad+keyboard. The media queries say
    // "both"; only the event knows which one the viewer just used.
    installMatchMedia(HYBRID_Q);
    const { result } = renderHook(() => useInputCapability());
    expect(result.current.mode).toBe(INPUT.FINE);

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
      // jsdom does not populate pointerType, so set it explicitly.
    });
    act(() => {
      const event = new Event("pointerdown");
      Object.defineProperty(event, "pointerType", { value: "touch" });
      window.dispatchEvent(event);
    });

    expect(result.current.lastPointerType).toBe("touch");
    expect(result.current.mode).toBe(INPUT.COARSE);
  });

  it("moves back to fine when a mouse is used again", () => {
    // The reverse direction matters just as much: a viewer who plugs in a mouse
    // should not keep getting thumb zones. A read-once boolean cannot do this in
    // either direction.
    installMatchMedia(HYBRID_Q);
    const { result } = renderHook(() => useInputCapability());

    act(() => {
      const touch = new Event("pointerdown");
      Object.defineProperty(touch, "pointerType", { value: "touch" });
      window.dispatchEvent(touch);
    });
    expect(result.current.mode).toBe(INPUT.COARSE);

    act(() => {
      const mouse = new Event("pointerdown");
      Object.defineProperty(mouse, "pointerType", { value: "mouse" });
      window.dispatchEvent(mouse);
    });
    expect(result.current.mode).toBe(INPUT.FINE);
    expect(result.current.lastPointerType).toBe("mouse");
  });

  it("listens passively so it cannot delay a drag", () => {
    // A non-passive pointerdown during a scrub is a dropped frame on every seek.
    installMatchMedia(FINE_DESKTOP_Q);
    const addSpy = vi.spyOn(window, "addEventListener");
    renderHook(() => useInputCapability());
    const call = addSpy.mock.calls.find(([type]) => type === "pointerdown");
    expect(call).toBeTruthy();
    expect(call[2]).toMatchObject({ passive: true });
    addSpy.mockRestore();
  });

  it("removes every listener on unmount", () => {
    const mm = installMatchMedia(FINE_DESKTOP_Q);
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useInputCapability());

    expect(mm.listenerCount()).toBe(3);

    unmount();

    // A MediaQueryList that keeps a `change` handler alive after the player
    // closes re-renders a dead component on every dock/undock and every
    // fold/unfold of the device.
    expect(mm.listenerCount()).toBe(0);
    const call = removeSpy.mock.calls.find(([type]) => type === "pointerdown");
    expect(call).toBeTruthy();
    removeSpy.mockRestore();
  });

  it("ignores a pointerdown with no pointerType", () => {
    installMatchMedia(TOUCH_ONLY_Q);
    const { result } = renderHook(() => useInputCapability());

    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });

    // Must not clear a classification it has no evidence to change.
    expect(result.current.lastPointerType).toBeNull();
    expect(result.current.mode).toBe(INPUT.COARSE);
  });
});
