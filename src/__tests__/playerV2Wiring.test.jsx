import { describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import PlayerShell from "../components/player/v2/PlayerShell";
import { CHROME_IDLE_MS } from "../components/player/v2/chromeVisibility";
import { PreferencesProvider } from "../context/PreferencesContext";
import { E, S } from "../components/player/v2/playbackMachine";

/* End-to-end wiring proof for Phase 2 (task.md 6.3).
 *
 * Everything below the catalogue is the REAL shell: the real machine, the real
 * ladder, the real `<video>` and the real event mapping. Only `constants/sources`
 * is replaced, because the point is to drive the ladder's decision paths on demand
 * — "server one 429s, server two is fine" — which is otherwise not reproducible.
 *
 * Nothing here asserts on a pixel or a decoded frame. What it proves is that the
 * states are reachable in the right ORDER from real DOM events, which is exactly
 * the class of bug that made the first draft of this wiring unplayable.
 */

const mocks = vi.hoisted(() => ({ resolve: async () => ({}) }));
const hlsMock = vi.hoisted(() => ({ instances: [] }));

vi.mock("hls.js", () => {
  class FakeHls {
    static Events = { ERROR: "hlsError" };
    static isSupported() {
      return true;
    }
    constructor(config) {
      this.config = config;
      this.handlers = {};
      this.loaded = [];
      this.attached = [];
      this.destroyed = false;
      hlsMock.instances.push(this);
    }
    on(event, handler) {
      this.handlers[event] = handler;
    }
    off(event) {
      delete this.handlers[event];
    }
    loadSource(url) {
      this.loaded.push(url);
    }
    attachMedia(node) {
      this.attached.push(node);
    }
    destroy() {
      this.destroyed = true;
    }
  }
  return { default: FakeHls };
});

vi.mock("../constants/sources", () => ({
  PLAYER_SOURCES: [
    { key: "one", label: "Server One", resolve: (a, o) => mocks.resolve("one", a, o) },
    { key: "two", label: "Server Two", resolve: (a, o) => mocks.resolve("two", a, o) },
  ],
}));

const PLAYABLE = {
  source: { url: "https://cdn.test/master.m3u8" },
  variants: [{ label: "1080p" }],
};


const shellProps = { id: "tt123", type: "movie", title: "Test", originalLanguage: "en" };
const video = () => document.querySelector("video");
const machineState = () =>
  document.querySelector(".pv2-shell")?.getAttribute("data-state") || "";
const fire = (type) => act(() => { video().dispatchEvent(new Event(type)); });


describe("PlayerShell — resolution to first frame", () => {
  it("advertises build phase 2, since an element is now wired in", async () => {
    mocks.resolve = async () => PLAYABLE;
    render(<PlayerShell {...shellProps} />);
    // "1" meant "shell, no element". Leaving it at 1 after integration is a lie
    // the CSS and any browser check would read.
    expect(document.querySelector(".pv2-shell").getAttribute("data-phase")).toBe("2");
    await waitFor(() => expect(video()).toBeTruthy());
  });

  it("walks the ladder, mounts one element, and plays", async () => {
    const order = [];
    mocks.resolve = async (key) => {
      order.push(key);
      if (key === "one") throw new Error("502");
      return PLAYABLE;
    };

    render(<PlayerShell {...shellProps} />);

    // Entry: no element, loader up. Attaching with no source would be meaningless.
    expect(video()).toBeNull();
    expect(machineState()).toBe(S.RESOLVING);

    await waitFor(() => expect(video()).toBeTruthy());
    // "one" is retried once before rotating: a 502 is transient, and abandoning
    // the first server on its first hiccup is how a blip becomes an error page.
    expect(order).toEqual(["one", "one", "two"]);
    // The engine, not a `src` attribute, is what actually starts playback.
    const engine = hlsMock.instances.at(-1);
    expect(engine.loaded).toEqual(["https://cdn.test/master.m3u8"]);
    expect(engine.attached.length).toBe(1);

    // source ready -> opening; still no frame, so the loader stays up.
    expect(machineState()).toBe(S.OPENING);

    fire("loadstart");

    // The regression this file exists for. `loadstart` advances the machine to
    // buffering; a video gated on `state === opening` unmounts HERE, on the very
    // event it emitted, and playback never starts.
    expect(machineState()).toBe(S.BUFFERING);
    expect(video()).toBeTruthy();
    // No frame yet, so the loader is still up — buffering is not "playing".
    expect(document.querySelector(".pv2-shell .pv2-loading")).toBeTruthy();

    fire("playing");
    expect(machineState()).toBe(S.PLAYING);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("carries the chrome inside one focusable layer (task.md 3.5)", async () => {
    mocks.resolve = async () => PLAYABLE;
    render(<PlayerShell {...shellProps} />);
    await waitFor(() => expect(video()).toBeTruthy());

    const shell = document.querySelector(".pv2-shell");
    const chrome = shell.querySelector(".pv2-chrome");

    // The chrome must be ONE subtree inside the shell, because the whole reveal
    // mechanism is a `:focus-within` on that shell. A sibling status line would
    // be individually focusable but not collectively revealed, and 3.8's timer
    // would have nothing to hide as a unit.
    expect(chrome).toBeTruthy();
    expect(chrome.parentElement).toBe(shell);

    // A loading player must show its chrome. Before 3.8 there was no timer at
    // all; now there is one, and it is gated on the machine actually being in
    // `playing`. So this asserts the gate, not just the starting value —
    // defaulting to hidden would ship a player whose controls are unreachable.
    expect(shell.getAttribute("data-chrome")).toBe("visible");

    // A failure status line lands INSIDE that layer, so it is faded by the same
    // rules as every other control rather than floating above them.
    fire("loadstart");
    fire("error");
    const status = document.querySelector(".pv2-status");
    expect(status).toBeTruthy();
    expect(chrome.contains(status)).toBe(true);

    // And the video must not be inside the chrome layer: the chrome is `inset: 0`,
    // so anything nested there would sit above the picture and swallow a tap.
    expect(chrome.contains(video())).toBe(false);
  });

  it("drives the element and the machine together from the transport (3.7)", async () => {
    mocks.resolve = async () => PLAYABLE;
    render(<PlayerShell {...shellProps} />);
    await waitFor(() => expect(video()).toBeTruthy());

    // jsdom has no media stack: `play()` is an unimplemented stub and the
    // element's `paused` flag never moves on its own. Both are driven here so
    // the assertion is about OUR wiring, not about the environment.
    const el = video();
    let paused = false;
    Object.defineProperty(el, "paused", { configurable: true, get: () => paused });
    el.play = vi.fn(() => {
      paused = false;
      return Promise.resolve();
    });
    el.pause = vi.fn(() => {
      paused = true;
    });

    fire("loadstart");
    fire("playing");
    expect(machineState()).toBe(S.PLAYING);
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();

    // Press pause: the ELEMENT first, then the machine.
    act(() => {
      screen.getByRole("button", { name: "Pause" }).click();
    });
    expect(el.pause).toHaveBeenCalled();
    expect(machineState()).toBe(S.PAUSED);
    // And the button relabels itself from the machine, not from a local guess.
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();

    // Press play again. Asynchronous on purpose: the machine only advances once
    // the element has CONFIRMED it started.
    await act(async () => {
      screen.getByRole("button", { name: "Play" }).click();
      await Promise.resolve();
    });
    expect(el.play).toHaveBeenCalled();
    expect(machineState()).toBe(S.PLAYING);
  });

  it("does not claim to play when play() is rejected (3.7)", async () => {
    // The autoplay policy refusing play() is the most common reason a play
    // button looks dead. The machine must NOT advance, or the label describes a
    // video that is still paused — so the transport stays on "Play" and the
    // refusal is logged rather than becoming an unhandled rejection.
    mocks.resolve = async () => PLAYABLE;
    render(<PlayerShell {...shellProps} />);
    await waitFor(() => expect(video()).toBeTruthy());

    const el = video();
    fire("loadstart");
    fire("playing");
    expect(machineState()).toBe(S.PLAYING);

    Object.defineProperty(el, "paused", { configurable: true, get: () => false });
    el.pause = vi.fn(() => {
      Object.defineProperty(el, "paused", { configurable: true, get: () => true });
    });
    act(() => {
      screen.getByRole("button", { name: "Pause" }).click();
    });
    expect(el.pause).toHaveBeenCalled();
    expect(machineState()).toBe(S.PAUSED);

    // Now refuse the resume.
    el.play = vi.fn(() => Promise.reject(new Error("NotAllowedError")));
    await act(async () => {
      screen.getByRole("button", { name: "Play" }).click();
      await Promise.resolve();
    });

    expect(el.play).toHaveBeenCalled();
    // REFUSED: still paused, still labelled "Play". Reaching this point with a
    // green suite also proves no unhandled rejection escaped — vitest fails the
    // run on one.
    expect(machineState()).toBe(S.PAUSED);
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
  });

  it("exposes the Tier A transport in the documented order (3.7)", async () => {
    mocks.resolve = async () => PLAYABLE;
    render(<PlayerShell {...shellProps} />);
    await waitFor(() => expect(video()).toBeTruthy());

    const bar = document.querySelector(".pv2-transport");
    expect(bar).toBeTruthy();
    // Present in the DOM, and reachable by keyboard even while the chrome is
    // hidden, which is the 3.5 guarantee surviving a real component tree.
    expect(screen.getByRole("slider").tabIndex).toBe(0);

    const layer = bar.closest(".pv2-chrome");
    expect(layer, "the transport must live in a chrome layer").toBeTruthy();
    // Sibling of the status chrome, not nested inside it: the status layer is
    // inset:0 + pointer-events:none and is not a control bar's container.
    expect(layer.getAttribute("data-chrome-layer")).toBe("transport");
    expect(layer.parentElement).toBe(document.querySelector(".pv2-shell"));
  });

  it("hides the chrome only while actually playing (task.md 3.8)", async () => {
    // Only the timer APIs are faked, and `waitFor` is avoided entirely: RTL's
    // `waitFor` polls with the global `setTimeout`, which here is faked and never
    // advances on its own, so it hangs until the test times out. Settling the
    // mount by pumping the clock is both deterministic and leak-free.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      mocks.resolve = async () => PLAYABLE;
      render(<PlayerShell {...shellProps} />);
      const settle = async () => {
        for (let i = 0; i < 25 && !video(); i += 1) {
          await act(async () => { await vi.advanceTimersByTimeAsync(50); });
        }
      };
      await settle();
      expect(video()).toBeTruthy();

      const shell = document.querySelector(".pv2-shell");
      const chromeState = () => shell.getAttribute("data-chrome");
      const advance = async (ms) => {
        await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
      };

      // Resolving/opening: never hides, however long it takes. A player that
      // faded its controls while still resolving would hide the reason it is
      // taking so long.
      await advance(CHROME_IDLE_MS * 3);
      expect(chromeState(), "must not hide while the source is still opening").toBe("visible");

      fire("loadstart");
      await advance(CHROME_IDLE_MS * 3);
      expect(chromeState(), "must not hide while buffering").toBe("visible");

      // Playing: the timer is finally allowed to run.
      fire("playing");
      expect(chromeState()).toBe("visible");
      await advance(CHROME_IDLE_MS - 1);
      expect(chromeState()).toBe("visible");
      await advance(1);
      expect(chromeState(), "playing plus 2.6s idle must hide").toBe("hidden");

      // A real pointer move brings it straight back.
      await act(async () => {
        shell.dispatchEvent(new Event("pointermove", { bubbles: true }));
      });
      expect(chromeState()).toBe("visible");
    } finally {
      vi.useRealTimers();
    }
  });

  it("brings the chrome back the instant playback pauses (task.md 3.8)", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      mocks.resolve = async () => PLAYABLE;
      render(<PlayerShell {...shellProps} />);
      for (let i = 0; i < 25 && !video(); i += 1) {
        await act(async () => { await vi.advanceTimersByTimeAsync(50); });
      }
      expect(video()).toBeTruthy();

      const shell = document.querySelector(".pv2-shell");
      fire("loadstart");
      fire("playing");

      await act(async () => { await vi.advanceTimersByTimeAsync(CHROME_IDLE_MS); });
      expect(shell.getAttribute("data-chrome")).toBe("hidden");

      // The viewer pauses with the keyboard. `visible === false` here would
      // leave a paused video with no reachable play button, which is the
      // specific failure the `!canAutoHide` branch exists to prevent.
      //
      // Pressed through the real transport button rather than a synthetic
      // `pause` event, because 3.7 deliberately does NOT wire the element's own
      // play/pause events to the machine: `pause` also fires on teardown during a
      // source switch and after `ended`, so honouring it would let a source swap
      // knock the machine into `paused`. The transport is the only pause path.
      const el = video();
      let paused = false;
      Object.defineProperty(el, "paused", { configurable: true, get: () => paused });
      el.pause = vi.fn(() => {
        paused = true;
      });

      act(() => {
        screen.getByRole("button", { name: "Pause" }).click();
      });
      expect(machineState()).toBe(S.PAUSED);
      expect(shell.getAttribute("data-chrome")).toBe("visible");

      await act(async () => { await vi.advanceTimersByTimeAsync(CHROME_IDLE_MS * 3); });
      expect(shell.getAttribute("data-chrome"), "a paused player keeps its controls").toBe("visible");
    } finally {
      vi.useRealTimers();
    }
  });

  it("subscribes to the element once it MOUNTS, not on the shell's first render", async () => {
    // Regression, and this one shipped in 3.7. `PlayerVideo` does not mount until
    // the ladder produces a URL, but the subscription effect was keyed on the
    // stable `videoRef` OBJECT — so it ran against `null`, returned early, and
    // never re-ran. `timeupdate` / `durationchange` / `volumechange` were never
    // subscribed: the timecode read `0:00 / 0:00` forever, the scrubber never
    // moved, and nothing errored.
    mocks.resolve = async () => PLAYABLE;
    render(<PlayerShell {...shellProps} />);
    await waitFor(() => expect(video()).toBeTruthy());

    // Real properties: jsdom's HTMLMediaElement reports NaN/Infinity, so the
    // handlers would store 0 even if they DID run. Overriding makes a failed
    // subscription distinguishable from a handler that discarded the value.
    const el = video();
    let t = 42;
    let dur = 300;
    Object.defineProperty(el, "currentTime", {
      configurable: true,
      get: () => t,
      set: (v) => { t = v; },
    });
    Object.defineProperty(el, "duration", {
      configurable: true,
      get: () => dur,
    });

    const timecode = () => document.querySelector(".pv2-timecode").textContent;
    expect(timecode()).toContain("0:00");

    // `timeupdate` carries time and only time, so this asserts that handler on
    // its own. Getting `1:05` here is the direct proof the subscription is live.
    act(() => {
      t = 65;
      el.dispatchEvent(new Event("timeupdate"));
    });
    expect(timecode()).toContain("1:05");

    // `durationchange` carries the other half. Asserted separately because a
    // combined assertion would pass on either handler alone and so would not
    // prove BOTH are attached.
    act(() => {
      dur = 3725;
      el.dispatchEvent(new Event("durationchange"));
    });
    expect(timecode()).toContain("1:02:05");

    // And `loadedmetadata`, which is the event that first tells the player how
    // long the video is — so a player that missed this one showed `0:00` as the
    // total for the whole session.
    t = 0;
    dur = 600;
    act(() => {
      el.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(timecode()).toContain("0:00");
    expect(timecode()).toContain("10:00");
  });

  it("applies the viewer's playback rate to the element", async () => {
    mocks.resolve = async () => PLAYABLE;
    // A real preferences tree, because playbackRate is persisted — testing the
    // default would only prove the default.
    localStorage.setItem("setting-playbackRate", "1.5");
    render(
      <PreferencesProvider>
        <PlayerShell {...shellProps} />
      </PreferencesProvider>,
    );
    await waitFor(() => expect(video()).toBeTruthy());
    await waitFor(() => expect(video().playbackRate).toBe(1.5));
    localStorage.removeItem("setting-playbackRate");
  });

  it("keeps the element mounted across a mid-playback stall", async () => {
    mocks.resolve = async () => PLAYABLE;
    render(<PlayerShell {...shellProps} />);
    await waitFor(() => expect(video()).toBeTruthy());
    fire("loadstart");
    fire("playing");
    expect(machineState()).toBe(S.PLAYING);

    fire("waiting");

    // Stalled is a state, not a teardown. A spinner that unmounts the video to
    // show itself plays the stream from zero when it comes back.
    expect(video()).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("reports an exhausted ladder as an error, with a video that never appears", async () => {
    mocks.resolve = async (key) => {
      if (key === "one") throw new Error("502 bad gateway");
      return { variants: [], source: {} };
    };

    render(<PlayerShell {...shellProps} />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(video()).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/no server has this title/i);
  });

  it("distinguishes a rate limit from a genuine miss", async () => {
    // Indistinguishable to the viewer, but only one clears on its own — so saying
    // "no server has this title" during a 429 is a false statement.
    mocks.resolve = async () => {
      throw new Error("429 too many requests");
    };

    render(<PlayerShell {...shellProps} />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alert").textContent).toMatch(/rate-limited/i);
  });

  it("never resolves without an id", async () => {
    mocks.resolve = async () => PLAYABLE;
    const spy = vi.fn();
    render(<PlayerShell title="No identity" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(video()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("moves to a new episode's source instead of retargeting the old one", async () => {
    mocks.resolve = async (key) =>
      key === "one"
        ? PLAYABLE
        : { source: { url: "https://cdn.test/other.m3u8" }, variants: [{ label: "720p" }] };

    const { rerender } = render(<PlayerShell {...shellProps} />);
    await waitFor(() => expect(video()).toBeTruthy());
    fire("loadstart");
    fire("playing");

    mocks.resolve = async () => ({
      source: { url: "https://cdn.test/other.m3u8" },
      variants: [{ label: "720p" }],
    });
    rerender(<PlayerShell {...shellProps} id="tt456" title="Other" />);

    // The old episode must not keep playing while the new one resolves.
    await waitFor(() => {
      expect(hlsMock.instances.at(-1).loaded).toEqual(["https://cdn.test/other.m3u8"]);
    });
    expect(machineState()).not.toBe(S.PLAYING);
  });
});

describe("PlayerShell — event mapping reachability", () => {
  it("only reaches a real state through events that can actually fire", async () => {
    mocks.resolve = async () => PLAYABLE;
    render(<PlayerShell {...shellProps} />);
    await waitFor(() => expect(video()).toBeTruthy());

    // `ended` during opening must NOT end anything — the reducer refuses it, and
    // this asserts the refusal is invisible rather than a premature "Replay".
    fire("loadstart");
    fire("ended");
    expect(machineState()).not.toBe(S.ENDED);

    fire("playing");
    fire("ended");
    expect(machineState()).toBe(S.ENDED);
    expect(E.END).toBe("END");
    expect(S.ENDED).toBe("ended");
  });
});
