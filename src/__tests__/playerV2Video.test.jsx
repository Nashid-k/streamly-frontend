import { describe, expect, it, vi } from "vitest";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import usePlayerSource, {
  classifyResolve,
  extractPlayableUrl,
} from "../components/player/v2/hooks/usePlayerSource";
import PlayerVideo from "../components/player/v2/PlayerVideo";
import { OUTCOME } from "../components/player/v2/sourceLadder";
import { E } from "../components/player/v2/playbackMachine";

/* Phase 2 (task.md 6.3): the source ladder as a hook.
 *
 * Every resolver here is a local fake. The point of `sourceLadder.js` being pure
 * was that this file could exercise the whole ladder — including the paths that
 * are miserable to reproduce for real, like "every server 429s" — without a
 * network, a relay or a token.
 */

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

const PLAYABLE = {
  source: { url: "https://cdn.test/master.m3u8" },
  variants: [{ label: "1080p", height: 1080 }],
};

const MULTI = {
  source: { url: "https://cdn.test/master.m3u8", multiLevelMaster: true, refUrl: "https://cdn.test/one.m3u8" },
  variants: [{ label: "auto" }],
};

/** A source whose resolve behaviour is scripted per call. */
function fakeSource(key, behaviour) {
  return {
    key,
    label: `Server ${key}`,
    resolve: vi.fn(behaviour),
  };
}

describe("extractPlayableUrl", () => {
  it("uses source.url for a multi-level master", () => {
    // Backwards produces a manifest that 404s on its first segment, so this is
    // spelled out rather than collapsed into `url || refUrl`.
    expect(extractPlayableUrl(MULTI)).toBe("https://cdn.test/master.m3u8");
  });

  it("uses refUrl for a single rendition when refUrl is itself media", () => {
    // Some providers carry the manifest in refUrl, so it stays usable - but it
    // has to BE media. The old rule returned refUrl unconditionally, which put a
    // provider homepage into <video src> and produced a black player.
    expect(
      extractPlayableUrl({
        source: { url: "https://vidcore.io/", refUrl: "https://cdn.test/single.m3u8" },
        variants: [{}],
      }),
    ).toBe("https://cdn.test/single.m3u8");
  });

  it("never returns a page-shaped refUrl for a single rendition", () => {
    // The reported regression: `native playback {url: 'https://vidcore.io/'}`.
    expect(extractPlayableUrl({ source: { url: "u", refUrl: "https://vidcore.io/" }, variants: [{}] })).toBe(
      "",
    );
  });

  it("returns empty rather than undefined for an empty payload", () => {
    // These strings land in status text; "undefined" must never be one of them.
    expect(extractPlayableUrl({})).toBe("");
    expect(extractPlayableUrl(null)).toBe("");
    expect(extractPlayableUrl({ source: {} })).toBe("");
  });
});

describe("classifyResolve — one terminal case, everything else transient", () => {
  it("treats no-source as terminal", () => {
    // The only result meaning "this provider does not carry this title".
    const error = Object.assign(new Error("gone"), { code: "no-source" });
    expect(classifyResolve(null, error)).toBe(OUTCOME.OFF);
  });

  it("treats an empty catalogue response as retryable, not terminal", () => {
    // The legacy comment is explicit: empty comes back when the catalogue is
    // rate-flaky, NOT when the title is absent. Reading it as terminal would
    // abandon a server that was about to answer.
    expect(classifyResolve({ variants: [], source: {} })).toBe(OUTCOME.RETRY);
  });

  it("treats a payload with no URL as retryable", () => {
    expect(classifyResolve({ variants: [{ label: "x" }], source: {} })).toBe(OUTCOME.RETRY);
  });

  it("treats any other error as retryable", () => {
    expect(classifyResolve(null, new Error("500"))).toBe(OUTCOME.RETRY);
  });

  it("settles only with both variants and a URL", () => {
    expect(classifyResolve(PLAYABLE)).toBe(OUTCOME.SETTLED);
  });
});

describe("usePlayerSource", () => {
  const args = { type: "movie", id: 42 };

  it("settles on the first server that works", async () => {
    const send = vi.fn();
    const good = fakeSource("good", async () => PLAYABLE);
    const { result } = renderHook(() =>
      usePlayerSource({ args, send, sources: [good], retries: 0 }),
    );

    await waitFor(() => expect(result.current.url).toBe("https://cdn.test/master.m3u8"));
    expect(send).toHaveBeenCalledWith(E.SOURCE_READY);
  });

  it("skips a server that reports no-source, and does not spend retries on it", async () => {
    const send = vi.fn();
    const missing = fakeSource("missing", async () => {
      throw Object.assign(new Error("nope"), { code: "no-source" });
    });
    const good = fakeSource("good", async () => PLAYABLE);

    const { result } = renderHook(() =>
      usePlayerSource({ args, send, sources: [missing, good], retries: 3 }),
    );

    await waitFor(() => expect(result.current.url).toBeTruthy());
    // Three retries were available. A terminal miss must consume exactly one
    // attempt, or every absent title costs a full retry budget.
    expect(missing.resolve).toHaveBeenCalledTimes(1);
    expect(good.resolve).toHaveBeenCalledTimes(1);
  });

  it("walks the whole ladder and reports exhaustion as a FAIL", async () => {
    const send = vi.fn();
    const sources = [
      // Deliberately NOT a 429: that flags an upstream rate limit, which changes
      // the final wording. This case is about a genuine "nobody has it".
      fakeSource("a", async () => { throw new Error("500 server error"); }),
      fakeSource("b", async () => ({ variants: [], source: {} })),
      fakeSource("c", async () => { throw new Error("503 unavailable"); }),
    ];

    const { result } = renderHook(() =>
      usePlayerSource({ args, send, sources, retries: 0 }),
    );

    await waitFor(() => expect(send).toHaveBeenCalledWith(E.FAIL, expect.any(Error)));
    expect(result.current.url).toBe("");
    const [, error] = send.mock.calls.find(([type]) => type === E.FAIL);
    expect(error.message).toMatch(/no server has this title/i);
  });

  it("honours a pinned server before rotation", async () => {
    const send = vi.fn();
    const first = fakeSource("first", async () => ({ variants: [], source: {} }));
    const pinned = fakeSource("pinned", async () => PLAYABLE);

    const { result } = renderHook(() =>
      usePlayerSource({ args, send, sources: [first, pinned], pinnedKey: "pinned", retries: 0 }),
    );

    await waitFor(() => expect(result.current.url).toBeTruthy());
    expect(pinned.resolve).toHaveBeenCalledTimes(1);
    // The pin short-circuits rotation for this pass.
    expect(first.resolve).not.toHaveBeenCalled();
  });

  it("never reaches the network without an id", async () => {
    const send = vi.fn();
    const source = fakeSource("a", async () => PLAYABLE);
    renderHook(() => usePlayerSource({ args: { type: "movie" }, send, sources: [source] }));

    // A request with no title is guaranteed to fail; firing it and reporting a
    // source problem would be a lie.
    expect(source.resolve).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("abandons a stale resolve when the title changes mid-flight", async () => {
    const send = vi.fn();
    // One resolver per run, kept separately. Releasing "the last one" would
    // resolve the CURRENT run and dispatch legitimately, which proves nothing.
    const resolvers = [];
    const first = fakeSource("first", () => new Promise((resolve) => { resolvers.push(resolve); }));

    const { rerender } = renderHook(
      ({ id }) => usePlayerSource({ args: { type: "movie", id }, send, sources: [first] }),
      { initialProps: { id: 1 } },
    );
    expect(resolvers).toHaveLength(1);

    rerender({ id: 2 });
    expect(resolvers).toHaveLength(2);

    await act(async () => {
      resolvers[0](PLAYABLE); // episode 1 finally answers, far too late
    });

    // Episode 1's answer must not claim the machine for a title that has moved on.
    expect(send).not.toHaveBeenCalledWith(E.SOURCE_READY);
    expect(send).not.toHaveBeenCalledWith(E.FAIL);
  });
});

describe("PlayerVideo", () => {
  it("hands the source to the streaming engine", () => {
    // Not to a `src` attribute: only Safari can play HLS that way, and the
    // element is driven imperatively instead. See useHlsSource.
    render(<PlayerVideo src="https://cdn.test/master.m3u8" />);
    expect(hlsMock.instances.at(-1).loaded).toEqual(["https://cdn.test/master.m3u8"]);
  });

  it("attaches nothing at all without a source", () => {
    const before = hlsMock.instances.length;
    render(<PlayerVideo />);
    const video = document.querySelector("video");
    expect(video).toBeTruthy();
    expect(video.hasAttribute("src")).toBe(false);
    // A `<video src="">` resolves to the document URL and fires a bogus load, so
    // no engine may be built and nothing may be attached.
    expect(hlsMock.instances.length).toBe(before);
  });

  it("translates a real DOM event into a machine action", () => {
    const onAction = vi.fn();
    render(<PlayerVideo state="opening" onAction={onAction} />);
    const video = document.querySelector("video");

    act(() => {
      video.dispatchEvent(new Event("loadstart"));
    });

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onAction.mock.calls[0][0]).toEqual({ type: E.ATTACHED });
  });

  it("ignores an event the mapping says carries no meaning", () => {
    const onAction = vi.fn();
    render(<PlayerVideo state="playing" onAction={onAction} />);
    const video = document.querySelector("video");

    // `ratechange` says nothing about whether playback is healthy.
    act(() => {
      video.dispatchEvent(new Event("ratechange"));
      video.dispatchEvent(new Event("timeupdate"));
    });
    expect(onAction).not.toHaveBeenCalled();
  });

  it("stops listening once unmounted", () => {
    const onAction = vi.fn();
    const { unmount } = render(<PlayerVideo state="playing" onAction={onAction} />);
    const video = document.querySelector("video");

    unmount();
    act(() => {
      video.dispatchEvent(new Event("loadstart"));
    });
    // A leaked listener on a detached element is a leak that outlives the player.
    expect(onAction).not.toHaveBeenCalled();
  });

  it("forwards its ref, so the shell can drive play()", () => {
    const ref = { current: null };
    render(<PlayerVideo ref={ref} />);
    expect(ref.current).toBe(document.querySelector("video"));
  });
});
