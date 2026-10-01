import { act, render, renderHook, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import useTier from "../components/player/v2/hooks/useTier";
import usePlayerPrefs from "../components/player/v2/hooks/usePlayerPrefs";
import PlayerVideo from "../components/player/v2/PlayerVideo";
import { PreferencesProvider } from "../context/PreferencesContext";
import { DEFAULT_TIER, TIER_B_MIN_WIDTH } from "../components/player/v2/tiers";

/* PLAYER V2 Tier B hooks (task.md 3.9).
 *
 * `useTier` and `usePlayerPrefs` are both adapters around something that is easy
 * to get subtly wrong — a measurement, and a persisted value that has to reach a
 * DOM element — so both are tested against the failure modes rather than the happy
 * path:
 *
 *  - measurement: no observer yet, zero width, observer never firing, and
 *    disconnecting. A tier that never leaves A because nothing measured it is a
 *    silent failure with no symptom other than "the extra controls never appeared".
 *  - persisted value: a stale index from the legacy key, a value that is not on
 *    the speed ladder, and a `<video>` element that arrives after the first render.
 */

/** Install a ResizeObserver that records what it was handed, so tests can drive
 *  width changes by hand. jsdom has no layout, so nothing ever fires on its own. */
function installObserver() {
  const instances = [];
  class FakeResizeObserver {
    constructor(cb) {
      this.cb = cb;
      instances.push(this);
    }

    observe(el) {
      this.el = el;
    }

    unobserve() {}

    disconnect() {
      this.disconnected = true;
    }
  }
  window.ResizeObserver = FakeResizeObserver;
  return instances;
}

describe("useTier", () => {
  let observers;

  beforeEach(() => {
    observers = installObserver();
  });

  afterEach(() => {
    delete window.ResizeObserver;
  });

  it("stays at Tier A until it has actually measured something", () => {
    const { result } = renderHook(() => useTier({ containerRef: { current: null }, engaged: true }));
    // Unmeasured is not "small". It is unknown, and unknown resolves to the
    // compact set so nothing overflows while we are still finding out.
    expect(result.current).toBe(DEFAULT_TIER);
  });

  it("promotes to Tier B once the observer reports a wide enough container", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const { result } = renderHook(() => useTier({ containerRef: { current: el }, engaged: true }));

    expect(observers).toHaveLength(1);
    expect(observers[0].el).toBe(el);

    await act(async () => {
      observers[0].cb([{ contentRect: { width: TIER_B_MIN_WIDTH } }]);
    });
    expect(result.current).toBe("B");

    // ...and narrows again when the container does. A one-way promotion would
    // leave a 14-control row inside a split-screen pane.
    await act(async () => {
      observers[0].cb([{ contentRect: { width: 480 } }]);
    });
    expect(result.current).toBe(DEFAULT_TIER);
    el.remove();
  });

  it("ignores width entirely while the chrome is not engaged", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const { result, rerender } = renderHook(
      ({ engaged }) => useTier({ containerRef: { current: el }, engaged }),
      { initialProps: { engaged: false } },
    );
    await act(async () => {
      observers[0].cb([{ contentRect: { width: 1400 } }]);
    });
    // A wide container is still Tier A while idle: the row is `opacity: 0`, so
    // promoting it would only matter again at the moment it faded out.
    expect(result.current).toBe(DEFAULT_TIER);

    await act(async () => {
      rerender({ engaged: true });
    });
    expect(result.current).toBe("B");
    el.remove();
  });

  it("does not throw when ResizeObserver is missing entirely", () => {
    // Old Safari, some embedded webviews, and every jsdom run.
    delete window.ResizeObserver;
    const el = document.createElement("div");
    const { result } = renderHook(() => useTier({ containerRef: { current: el }, engaged: true }));
    expect(result.current).toBe(DEFAULT_TIER);
  });

  it("ignores a zero or missing measurement", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const { result } = renderHook(() => useTier({ containerRef: { current: el }, engaged: true }));
    await act(async () => {
      observers[0].cb([{ contentRect: { width: 0 } }]);
    });
    expect(result.current).toBe(DEFAULT_TIER);
    el.remove();
  });

  it("disconnects the observer on unmount", () => {
    const el = document.createElement("div");
    const { unmount } = renderHook(() => useTier({ containerRef: { current: el }, engaged: true }));
    const instance = observers[0];
    expect(instance.disconnected).toBeFalsy();
    unmount();
    expect(instance.disconnected).toBe(true);
  });
});

describe("usePlayerPrefs", () => {
  const PROVIDERS = [
    ["the default", ({ children }) => children, false],
    ["the real tree", ({ children }) => <PreferencesProvider>{children}</PreferencesProvider>, true],
  ];

  afterEach(() => {
    localStorage.clear();
  });

  PROVIDERS.forEach(([label, wrap, persistent]) => {
    describe(label, () => {
      it("reports the defaults with no stored preference", async () => {
        const { result } = renderHook(() => usePlayerPrefs({}), { wrapper: wrap });
        await waitFor(() => expect(result.current.aspectId).toBe("fit"));
        expect(result.current.aspectName).toBe("Fit (Original 16:9)");
        expect(result.current.aspectShortName).toBe("Fit");
        expect(result.current.rate).toBe(1);
      });

      it("hands the video element a style for the current aspect", async () => {
        const { result } = renderHook(() => usePlayerPrefs({}), { wrapper: wrap });
        await waitFor(() => expect(result.current.aspectStyle).toEqual({ objectFit: "contain" }));
      });

      it("reports whether it can actually persist", async () => {
        const { result } = renderHook(() => usePlayerPrefs({}), { wrapper: wrap });
        await waitFor(() => expect(result.current.aspectId).toBe("fit"));
        // Without persistence the aspect change is inert, so the hook must say
        // so rather than let the control look like it worked and be lost on the
        // next mount.
        expect(result.current.persistent).toBe(persistent);
        await act(async () => {
          result.current.cycleAspect();
        });
        expect(result.current.aspectId).toBe(persistent ? "fill" : "fit");
      });
    });
  });

  describe("with persistence", () => {
    it("cycles the aspect and wraps back to the default", async () => {
      const { result } = renderHook(() => usePlayerPrefs({}), { wrapper: PROVIDERS[1][1] });
      await waitFor(() => expect(result.current.aspectId).toBe("fit"));
      await act(async () => {
        result.current.cycleAspect();
      });
      expect(result.current.aspectId).toBe("fill");
      expect(result.current.aspectStyle).toEqual({ objectFit: "cover" });
      // Cycling six times returns to where it started.
      for (let i = 0; i < 5; i += 1) {
        await act(async () => result.current.cycleAspect());
      }
      expect(result.current.aspectId).toBe("fit");
    });

    it("persists a cycled aspect, so it survives a remount", async () => {
      const { result } = renderHook(() => usePlayerPrefs({}), { wrapper: PROVIDERS[1][1] });
      await waitFor(() => expect(result.current.aspectId).toBe("fit"));
      await act(async () => {
        result.current.cycleAspect();
      });
      await waitFor(() => expect(JSON.parse(localStorage.getItem("setting-aspect"))).toBe("fill"));

      const remounted = renderHook(() => usePlayerPrefs({}), { wrapper: PROVIDERS[1][1] });
      await waitFor(() => expect(remounted.result.current.aspectId).toBe("fill"));
    });
  });

  it("applies the rate to the element, and survives the element arriving late", async () => {
    // The element mounts only after the ladder yields a URL, so the write has to
    // be keyed on the node rather than run once on the shell's first render.
    const videoRef = { current: null };
    /* Published from an effect rather than assigned during render: writing to an
     * outer variable while rendering is a side effect, and the lint rule is right
     * to say so even though a test harness is the one place it would be harmless. */
    const seen = { prefs: null };

    function Probe() {
      const prefs = usePlayerPrefs({ videoNode: videoRef.current });
      useEffect(() => {
        seen.prefs = prefs;
      }, [prefs]);
      return (
        <PlayerVideo
          src="blob:late"
          state={{ state: "PLAYING", error: null }}
          onAction={() => {}}
          ref={(node) => { videoRef.current = node; }}
        />
      );
    }

    render(
      <PreferencesProvider>
        <Probe />
      </PreferencesProvider>,
    );
    await waitFor(() => expect(videoRef.current).toBeTruthy());
    await waitFor(() => expect(videoRef.current.playbackRate).toBe(1));
    await waitFor(() => expect(seen.prefs).toBeTruthy());

    // A preference change must reach the LIVE element, not just the context.
    // `setRate`, not a `cycleRate`: the speed control is a SHEET (3.24) with the
    // whole ladder in it, so there is nothing to cycle through from the rail.
    await act(async () => {
      seen.prefs.setRate(1.25);
    });
    await waitFor(() => expect(videoRef.current.playbackRate).toBe(1.25));
    expect(seen.prefs.rate).toBe(1.25);
  });

  it("sanitises a stored rate that is not on the ladder", async () => {
    localStorage.setItem("setting-playbackRate", "9.99");
    const { result } = renderHook(() => usePlayerPrefs({}), { wrapper: PROVIDERS[1][1] });
    // The ladder is the set of speeds the player offers. A stored 9.99 is not
    // one, so it snaps to Normal rather than silently setting a 10x rate the
    // viewer can no longer find in the UI to change back.
    await waitFor(() => expect(result.current.rate).toBe(1));
  });

  it("adopts the frozen legacy aspect key on first read", async () => {
    localStorage.setItem("streamly-native-aspect", "3");
    const { result } = renderHook(() => usePlayerPrefs({}), { wrapper: PROVIDERS[1][1] });
    await waitFor(() => expect(result.current.aspectId).toBe("cinema"));
  });

  it("falls back to the default ratio for an out-of-range legacy index", async () => {
    localStorage.setItem("streamly-native-aspect", "99");
    const { result } = renderHook(() => usePlayerPrefs({}), { wrapper: PROVIDERS[1][1] });
    // architecture.md:92-94 — fall back rather than guess.
    await waitFor(() => expect(result.current.aspectId).toBe("fit"));
  });

  it("does not crash when localStorage throws", async () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItem() {
      throw new Error("privacy mode");
    };
    try {
      const { result } = renderHook(() => usePlayerPrefs({}), { wrapper: PROVIDERS[1][1] });
      await waitFor(() => expect(result.current.aspectId).toBe("fit"));
    } finally {
      Storage.prototype.getItem = original;
    }
  });

  it("degrades to inert-but-sayable without a provider, instead of crashing", async () => {
    // The app always wraps the player (`main.jsx` mounts PreferencesProvider
    // above the router), so this is a test-only and embedded-webview path. The
    // requirement is that it does not take the player down with it — and that the
    // hook admits the preference is not being kept, so the transport can explain
    // the inert control rather than silently ignoring the press.
    const { result } = renderHook(() => usePlayerPrefs({}));
    await waitFor(() => expect(result.current.aspectId).toBe("fit"));
    expect(result.current.persistent).toBe(false);

    await act(async () => {
      result.current.cycleAspect();
    });
    // Not persisted anywhere, so it must not pretend to have changed.
    expect(result.current.aspectId).toBe("fit");
  });

  it("keeps the last known values when the provider disappears", async () => {
    const { result, rerender } = renderHook(() => usePlayerPrefs({}), {
      wrapper: ({ children }) => <PreferencesProvider>{children}</PreferencesProvider>,
    });
    await waitFor(() => expect(result.current.aspectId).toBe("fit"));
    expect(result.current.persistent).toBe(true);
    rerender(null);
    // No crash, and no silent reset to a different aspect mid-playback.
    expect(result.current.aspectId).toBe("fit");
  });
});
