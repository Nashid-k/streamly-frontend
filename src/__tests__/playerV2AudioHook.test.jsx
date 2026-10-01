import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

/* `useAudioTracks` takes its event names from `Hls.Events`, the same way
 * `useHlsSource` does. Mocking the module here proves the hook reads the library
 * constants rather than reflecting them off the engine's constructor — a version of
 * that code passes against a fake engine and fails against a real one. */
vi.mock("hls.js", () => ({
  default: {
    Events: {
      ERROR: "hlsError",
      AUDIO_TRACKS_UPDATED: "hlsAudioTracksUpdated",
      AUDIO_TRACK_SWITCHED: "hlsAudioTrackSwitched",
    },
  },
}));

const { default: useAudioTracks } = await import(
  "../components/player/v2/hooks/useAudioTracks"
);

/**
 * The engine plumbing (task.md R4.1).
 *
 * The pure model is tested in playerV2AudioTracks.test.js. What is tested HERE is
 * the part that only exists at runtime: the engine is created elsewhere, replaced on
 * every source change, and announces its own changes through events.
 */

/** A hls.js stand-in: the accessors `useAudioTracks` touches, plus an event bus. */
function fakeEngine(tracks = [], currentIndex = -1) {
  const listeners = new Map();
  const stats = { registered: 0, removed: 0 };
  return {
    stats,
    audioTracks: tracks,
    audioTrack: currentIndex,
    on(event, fn) {
      stats.registered += 1;
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
    },
    off(event, fn) {
      stats.removed += 1;
      listeners.get(event)?.delete(fn);
    },
    emit(event) {
      for (const fn of listeners.get(event) ?? []) fn();
    },
    listenerCount() {
      let total = 0;
      for (const set of listeners.values()) total += set.size;
      return total;
    },
  };
}

const eng = (over = {}) => ({
  index: 0,
  name: "",
  lang: "",
  groupId: "aac",
  default: false,
  characteristics: [],
  ...over,
});

describe("useAudioTracks — no engine", () => {
  it("returns a single-track model when the ref is empty", () => {
    /* Native-HLS mode before a source resolves, and Safari in general. */
    const { result } = renderHook(() => useAudioTracks({ current: null }));
    expect(result.current.audio.kind).toBe("single");
    expect(result.current.audio.selectable).toBe(false);
  });

  it("selectAudio is a safe no-op with no engine, not a throw", () => {
    /* The panel can still be mounted; a press must not crash the player. */
    const { result } = renderHook(() => useAudioTracks({ current: null }));
    expect(() => act(() => result.current.selectAudio(1))).not.toThrow();
  });
});

describe("useAudioTracks — with an engine", () => {
  it("reports the tracks the engine already has, on first read", () => {
    /* A warm source has already parsed its manifest before the hook mounts, so both
     * events have already fired. Reading only on the events would report "one
     * soundtrack" for every title — the exact wrong answer. */
    const engine = fakeEngine([eng({ name: "English" }), eng({ index: 1, name: "Tamil" })], 0);
    const { result } = renderHook(() => useAudioTracks({ current: engine }));
    expect(result.current.audio.kind).toBe("tracks");
    expect(result.current.audio.selectable).toBe(true);
    expect(result.current.audio.selectedIndex).toBe(0);
  });

  it("picks up tracks that arrive AFTER mount", () => {
    const engine = fakeEngine([], -1);
    const { result } = renderHook(() => useAudioTracks({ current: engine }));
    expect(result.current.audio.selectable).toBe(false);

    engine.audioTracks = [eng({ name: "English" }), eng({ index: 1, name: "Tamil" })];
    act(() => engine.emit("hlsAudioTracksUpdated"));

    expect(result.current.audio.selectable).toBe(true);
    expect(result.current.audio.tracks.map((t) => t.label)).toEqual(["English", "Tamil"]);
  });

  it("follows a switch the ENGINE makes on its own", () => {
    /* Not every switch is one the viewer asked for: hls.js moves the selection
     * itself when a rendition fails. The panel must not keep showing a stale
     * checkmark. */
    const engine = fakeEngine([eng({ name: "English" }), eng({ index: 1, name: "Tamil" })], 0);
    const { result } = renderHook(() => useAudioTracks({ current: engine }));
    expect(result.current.audio.selectedIndex).toBe(0);

    engine.audioTrack = 1;
    act(() => engine.emit("hlsAudioTrackSwitched"));

    expect(result.current.audio.selectedIndex).toBe(1);
  });

  it("writes the index back to the engine on select", () => {
    const engine = fakeEngine([eng({ name: "English" }), eng({ index: 1, name: "Tamil" })], 0);
    const { result } = renderHook(() => useAudioTracks({ current: engine }));
    act(() => result.current.selectAudio(1));
    expect(engine.audioTrack).toBe(1);
  });

  it("unsubscribes on unmount, so a destroyed engine is not called back", () => {
    /* The engine is destroyed on every source change. A listener left behind would
     * fire into a torn-down instance — and keep the whole engine alive. */
    const engine = fakeEngine([eng({ name: "English" }), eng({ index: 1, name: "Tamil" })]);
    const { unmount } = renderHook(() => useAudioTracks({ current: engine }));
    expect(engine.listenerCount()).toBeGreaterThan(0);
    unmount();
    expect(engine.listenerCount()).toBe(0);
  });

  it("survives a destroyed engine instead of throwing", () => {
    /* A destroyed hls.js keeps its accessors, and reading `audioTracks` off it can
     * throw. Losing the track list is survivable; crashing the sheet is not. */
    const engine = fakeEngine([eng({ name: "English" }), eng({ index: 1, name: "Tamil" })]);
    Object.defineProperty(engine, "audioTracks", {
      get() {
        throw new Error("engine destroyed");
      },
    });
    const { result } = renderHook(() => useAudioTracks({ current: engine }));
    expect(result.current.audio.kind).toBe("single");
  });

  it("does not re-register its listeners when events fire", () => {
    /* `version` is bumped BY these handlers. Depending on it in the effect would not
     * produce a visible loop — the listener COUNT stays flat, because the effect
     * unsubscribes before it subscribes again. So asserting the count proves nothing:
     * mutation testing showed a `version` dependency surviving a count-based test.
     * What actually breaks is churn — every AUDIO_TRACK_SWITCHED tears down and
     * rebuilds both subscriptions, which is work that grows with player duration. So
     * this asserts on the number of REGISTRATIONS, not the number of live listeners. */
    const engine = fakeEngine([eng({ name: "English" }), eng({ index: 1, name: "Tamil" })]);
    const { result } = renderHook(() => useAudioTracks({ current: engine }));
    const baseline = engine.stats.registered;

    for (let i = 0; i < 5; i += 1) {
      act(() => engine.emit("hlsAudioTracksUpdated"));
      act(() => engine.emit("hlsAudioTrackSwitched"));
    }

    expect(engine.stats.registered).toBe(baseline);
    expect(engine.stats.removed).toBe(0);
    expect(engine.listenerCount()).toBeGreaterThan(0);
    expect(result.current.audio.tracks).toHaveLength(2);
  });
});

describe("useAudioTracks — engine swap", () => {
  let engine;
  beforeEach(() => {
    engine = fakeEngine([eng({ name: "English" }), eng({ index: 1, name: "Tamil" })], 0);
  });
  afterEach(() => {
    engine = null;
  });

  it("re-reads from the new engine when the source changes", () => {
    /* The old engine is destroyed and a new one built. Reading a stale ref would
     * show the previous title's languages. */
    const ref = { current: engine };
    const { result, rerender } = renderHook(() => useAudioTracks(ref));
    expect(result.current.audio.selectedIndex).toBe(0);

    const next = fakeEngine([eng({ name: "Hindi" }), eng({ index: 1, name: "Marathi" })], 1);
    ref.current = next;
    rerender();

    expect(result.current.audio.tracks.map((t) => t.label)).toEqual(["Hindi", "Marathi"]);
    expect(result.current.audio.selectedIndex).toBe(1);
    /* The old engine must not be left holding listeners. */
    expect(engine.listenerCount()).toBe(0);
  });

  it("writes to the NEW engine after a swap", () => {
    const ref = { current: engine };
    const { result, rerender } = renderHook(() => useAudioTracks(ref));
    const next = fakeEngine([eng({ name: "Hindi" }), eng({ index: 1, name: "Marathi" })], 0);
    ref.current = next;
    rerender();

    act(() => result.current.selectAudio(1));
    expect(next.audioTrack).toBe(1);
    expect(engine.audioTrack).toBe(0);
  });
});

describe("useAudioTracks — a ref that is never stable", () => {
  it("does not tear down the engine when the ref object changes identity", () => {
    /* Documented contract on `useHlsSource`: the engine's lifetime is bound to the
     * node and url, never to the caller's ref object. A fresh ref each render must
     * not restart playback from zero mid-view. */
    const engine = fakeEngine([eng({ name: "English" }), eng({ index: 1, name: "Tamil" })]);
    const { result, rerender } = renderHook(() => useAudioTracks({ current: engine }));
    rerender();
    rerender();
    expect(result.current.audio.tracks).toHaveLength(2);
  });
});

describe("useAudioTracks — selection failure", () => {
  it("does not throw when the engine refuses the write", () => {
    const engine = fakeEngine([eng({ name: "English" }), eng({ index: 1, name: "Tamil" })], 0);
    Object.defineProperty(engine, "audioTrack", {
      get: () => 0,
      set: () => {
        throw new Error("manifest has no such group");
      },
    });
    const { result } = renderHook(() => useAudioTracks({ current: engine }));
    expect(() => act(() => result.current.selectAudio(1))).not.toThrow();
  });

  it("logs through the debugLogger rather than swallowing silently", () => {
    /* AGENTS.md: no silent failures. The diagnostic is a log, not a throw, because
     * a viewer cannot act on a rejected track switch and the player must keep going. */
    const engine = fakeEngine([eng({ name: "English" }), eng({ index: 1, name: "Tamil" })], 0);
    Object.defineProperty(engine, "audioTrack", {
      get: () => 0,
      set: () => {
        throw new Error("nope");
      },
    });
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { result } = renderHook(() => useAudioTracks({ current: engine }));
    act(() => result.current.selectAudio(1));
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0]?.[0] ?? "")).toMatch(/PlayerSource:audio/);
    spy.mockRestore();
  });
});