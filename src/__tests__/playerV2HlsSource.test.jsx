import { describe, expect, it, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import {
  MODE,
  canPlayNativeHls,
  choosePlaybackMode,
  isHlsUrl,
} from "../components/player/v2/hooks/useHlsSource";
import PlayerVideo from "../components/player/v2/PlayerVideo";
import { E } from "../components/player/v2/playbackMachine";

/* How a source reaches the element.
 *
 * This is the difference between the player working and not working, and it is
 * invisible in jsdom: `canPlayType` returns "" everywhere except Safari, so a
 * naive component test would happily pass while every Chrome viewer got a black
 * rectangle. The mode chooser is therefore a pure function of (url, capabilities)
 * and gets asserted branch by branch.
 */

const hlsMock = vi.hoisted(() => ({ instances: [], supported: true }));

vi.mock("hls.js", () => {
  class FakeHls {
    static Events = { ERROR: "hlsError" };

    static isSupported() {
      return hlsMock.supported;
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

    emit(event, data) {
      this.handlers[event]?.({}, data);
    }
  }
  return { default: FakeHls };
});

const HLS = "https://cdn.test/master.m3u8";
const MP4 = "https://cdn.test/movie.mp4";

describe("isHlsUrl", () => {
  it("recognises a playlist with a query or fragment", () => {
    expect(isHlsUrl(HLS)).toBe(true);
    expect(isHlsUrl("https://cdn.test/a.m3u8?token=abc")).toBe(true);
    expect(isHlsUrl("https://cdn.test/a.m3u8#frag")).toBe(true);
  });

  it("does not mistake a segment or a non-stream file for a playlist", () => {
    expect(isHlsUrl("https://cdn.test/seg0.ts")).toBe(false);
    expect(isHlsUrl(MP4)).toBe(false);
    expect(isHlsUrl("")).toBe(false);
    expect(isHlsUrl(null)).toBe(false);
  });
});

describe("canPlayNativeHls", () => {
  it("trusts a browser that claims HLS support", () => {
    expect(canPlayNativeHls({ canPlayType: () => "maybe" })).toBe(true);
  });

  it("treats an empty answer, or a missing method, as no support", () => {
    // Chrome and Firefox both answer "". jsdom answers "" for everything.
    expect(canPlayNativeHls({ canPlayType: () => "" })).toBe(false);
    expect(canPlayNativeHls({})).toBe(false);
    expect(canPlayNativeHls(null)).toBe(false);
  });
});

describe("choosePlaybackMode", () => {
  it("has nothing to play without a source", () => {
    expect(choosePlaybackMode("")).toBe(MODE.NONE);
  });

  it("hands a non-HLS file straight to the element", () => {
    // No engine needed for an mp4, and pulling in hls.js for one is 600KB of
    // nothing.
    expect(choosePlaybackMode(MP4, { canPlayNative: false, hlsSupported: false })).toBe(MODE.NATIVE);
  });

  it("uses native playback when the browser can do HLS", () => {
    expect(choosePlaybackMode(HLS, { canPlayNative: true, hlsSupported: true })).toBe(MODE.NATIVE);
  });

  it("falls back to hls.js when the browser cannot do HLS", () => {
    // The load-bearing branch: this is every non-Safari viewer.
    expect(choosePlaybackMode(HLS, { canPlayNative: false, hlsSupported: true })).toBe(MODE.HLSJS);
  });

  it("admits defeat only when neither path exists", () => {
    expect(choosePlaybackMode(HLS, { canPlayNative: false, hlsSupported: false })).toBe(
      MODE.UNSUPPORTED,
    );
  });
});

describe("useHlsSource", () => {
  const renderWithVideo = (url) => {
    const ref = { current: null };
    render(<PlayerVideo ref={ref} src={url} />);
    return ref.current;
  };

  it("drives the element through hls.js when the browser needs it", () => {
    hlsMock.supported = true;
    renderWithVideo(HLS);
    const hls = hlsMock.instances.at(-1);
    expect(hls.loaded).toEqual([HLS]);
    // Attaching a media element is what actually starts playback; loading a
    // source alone does nothing at all.
    expect(hls.attached.length).toBe(1);
  });

  it("uses a plain src when the browser plays HLS natively", () => {
    hlsMock.supported = true;
    // jsdom's canPlayType returns "", so stub the one capability under test.
    const original = HTMLMediaElement.prototype.canPlayType;
    HTMLMediaElement.prototype.canPlayType = () => "maybe";
    const before = hlsMock.instances.length;
    try {
      const node = renderWithVideo(HLS);
      expect(node.getAttribute("src")).toContain(HLS);
      // No engine may be constructed at all: two players on one element fight,
      // and it is 600KB the viewer never needed.
      expect(hlsMock.instances.length).toBe(before);
    } finally {
      HTMLMediaElement.prototype.canPlayType = original;
    }
  });

  it("reports a failure instead of spinning forever when nothing can play it", async () => {
    hlsMock.supported = false;
    const onAction = vi.fn();
    render(<PlayerVideo src={HLS} state="opening" onAction={onAction} />);
    await waitFor(() => expect(onAction).toHaveBeenCalled());
    expect(onAction.mock.calls[0][0].type).toBe(E.FAIL);
  });

  it("reports a URL that is not media, rather than returning silently", async () => {
    /* `choosePlaybackMode` correctly answers MODE.NONE for a provider PAGE, and
     * `playerV2UnplayableUrl.test.js` pins that. But the hook returned on that
     * answer BEFORE reaching the branch that reports it, so in the component the
     * guard produced silence: spinner over blackness, no error. The pure test
     * could not see it because it never renders the hook. */
    hlsMock.supported = true;
    const onAction = vi.fn();
    render(<PlayerVideo src="https://vidcore.io/" state="opening" onAction={onAction} />);
    await waitFor(() => expect(onAction).toHaveBeenCalled());
    expect(onAction.mock.calls[0][0].type).toBe(E.FAIL);
    expect(onAction.mock.calls[0][0].error.message).toMatch(/playable video file/i);
    // And no engine was built for a page.
    expect(hlsMock.instances.some((h) => h.loaded.includes("https://vidcore.io/"))).toBe(false);
  });

  it("surfaces only fatal engine errors", () => {
    hlsMock.supported = true;
    const onAction = vi.fn();
    render(<PlayerVideo src={HLS} state="playing" onAction={onAction} />);
    const hls = hlsMock.instances.at(-1);

    act(() => hls.emit("hlsError", { fatal: false, details: "fragLoadError" }));
    // hls.js retries these itself; raising an error banner over a stream that is
    // quietly recovering is a lie to the viewer.
    expect(onAction).not.toHaveBeenCalled();

    act(() => hls.emit("hlsError", { fatal: true, details: "manifestLoadError" }));
    expect(onAction.mock.calls[0][0].type).toBe(E.FAIL);
    expect(onAction.mock.calls[0][0].error.message).toMatch(/manifestLoadError/);
  });

  it("destroys the engine when the player closes", () => {
    hlsMock.supported = true;
    const { unmount } = render(<PlayerVideo src={HLS} />);
    const hls = hlsMock.instances.at(-1);
    expect(hls.destroyed).toBe(false);

    unmount();

    // A surviving engine keeps polling a dead playlist forever. This is the most
    // common leak in a video player and no component test catches it by accident.
    expect(hls.destroyed).toBe(true);
  });

  it("swaps engines cleanly when the source changes", async () => {
    hlsMock.supported = true;
    const { rerender } = render(<PlayerVideo src={HLS} />);
    const first = hlsMock.instances.at(-1);

    rerender(<PlayerVideo src="https://cdn.test/other.m3u8" />);
    await waitFor(() => expect(hlsMock.instances.length).toBeGreaterThan(1));
    const second = hlsMock.instances.at(-1);

    expect(first.destroyed).toBe(true);
    expect(second.destroyed).toBe(false);
    expect(second.loaded).toEqual(["https://cdn.test/other.m3u8"]);
  });
});

describe("PlayerVideo — the element itself", () => {
  it("never sets an m3u8 as a src attribute", () => {
    // jsdom cannot play HLS, but this asserts the ATTRIBUTE is absent, which is
    // the thing that makes a native attach even possible.
    render(<PlayerVideo src={HLS} />);
    expect(document.querySelector("video").hasAttribute("src")).toBe(false);
  });

  it("holds the resolved source only in the engine, not on the node", () => {
    hlsMock.supported = true;
    render(<PlayerVideo src={HLS} />);
    expect(hlsMock.instances.at(-1).loaded).toEqual([HLS]);
  });
});
