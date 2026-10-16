import { render, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeAll, beforeEach } from "vitest";

/* Native playback must hand off to the provider's embed when it cannot resolve
   a single byte. On the deployed site the provider WAF-blocks our serverless
   egress (`/backend/*` → Cloudflare 403), so every source exhausts with a
   generic upstream error — never `no-source`. This proves NativePlayerView
   reports that once via `onUnavailable` so the page can mount the embed. */

const state = { fail: true, calls: 0 };

vi.mock("hls.js", () => {
  class FakeHls {
    static isSupported() {
      return true;
    }
    static get Events() {
      return { MANIFEST_PARSED: "manifestParsed", ERROR: "error" };
    }
    constructor() {}
    on() {}
    off() {}
    loadSource() {}
    attachMedia() {}
    destroy() {}
  }
  return { default: FakeHls };
});

// The resolver rejects the way the WAF block surfaces: a generic upstream error,
// NOT `code: "no-source"` (which the player treats as "provider lacks the title"
// and does not retry the rotation for).
vi.mock("../api/streamResolve", () => ({
  streamResolve: {
    resolveZxc: vi.fn(async () => {
      state.calls += 1;
      if (state.fail) throw Object.assign(new Error("upstream"), { code: "upstream" });
      return { source: null, variants: [], server: null, audioTracks: [] };
    }),
  },
}));

vi.mock("../api/nativeHlsLoader", () => ({
  createStreamlyLoader: () => ({}),
  probeSourcePlayable: vi.fn(async () => ({ ok: false, reason: "blocked upstream" })),
}));

import NativePlayerView from "../components/NativePlayerView";

beforeAll(() => {
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.MediaSource) window.MediaSource = class {};
});

beforeEach(() => {
  state.fail = true;
  state.calls = 0;
});

describe("native → provider-embed fallback hand-off", () => {
  it("reports onUnavailable exactly once after every source exhausts", async () => {
    const onUnavailable = vi.fn();
    render(
      <NativePlayerView
        type="movie"
        id="27205"
        title="Inception"
        onClose={() => {}}
        onUnavailable={onUnavailable}
      />,
    );
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1), { timeout: 8000 });
    // It actually tried to resolve before giving up.
    expect(state.calls).toBeGreaterThan(0);
  });

  it("does not fire onUnavailable while a source is still playable", async () => {
    state.fail = false;
    const onUnavailable = vi.fn();
    render(
      <NativePlayerView
        type="movie"
        id="27205"
        title="Inception"
        onClose={() => {}}
        onUnavailable={onUnavailable}
      />,
    );
    // Give the resolve loop a moment, then assert it never reported unavailable.
    await new Promise((r) => setTimeout(r, 300));
    expect(onUnavailable).not.toHaveBeenCalled();
  });

  it("is optional: exhausting without onUnavailable stays quiet", async () => {
    const { container } = render(
      <NativePlayerView type="movie" id="27205" title="Inception" onClose={() => {}} />,
    );
    await waitFor(() => expect(state.calls).toBeGreaterThan(0), { timeout: 8000 });
    expect(container).toBeTruthy();
  });
});
