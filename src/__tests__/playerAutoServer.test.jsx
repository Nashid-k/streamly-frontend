// The no-pick ("auto") path end to end: the player mounts without a selected
// server, resolves through AUTO_SOURCE (the backend picks one), and then maps
// the echoed server name back onto the real Servers-menu row — so the viewer
// sees WHICH server is actually playing, never a stale label.
import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const hlsState = {
  levels: [],
  currentLevel: -1,
  loadSourceCalls: [],
  resolveCalls: [],
};

vi.mock("hls.js", () => {
  class FakeHls {
    static isSupported() {
      return true;
    }
    static get Events() {
      return { MANIFEST_PARSED: "manifestParsed", ERROR: "error" };
    }
    constructor() {
      this.levels = hlsState.levels;
      this.audioTracks = [];
      this.currentLevel = -1;
    }
    on(evt, fn) {
      (this._h ||= {})[evt] = (this._h[evt] || []).concat(fn);
    }
    off() {}
    loadSource(url) {
      this.loadSourceCalls = [...(this.loadSourceCalls || []), url];
      hlsState.loadSourceCalls.push(url);
      setTimeout(() => (this._h?.manifestParsed || []).forEach((fn) => fn()), 0);
    }
    attachMedia() {}
    destroy() {}
  }
  return { default: FakeHls };
});

// The backend chose orion (the provider's Server 1) — the resolver echoes it.
const RESOLVE_PAYLOAD = {
  source: { kind: "hls", url: "https://vidstuck.xyz/backend/servers/orion?zx=streamly&zv=master", refUrl: "https://vidstuck.xyz/embed/movie/12345", multiLevelMaster: true },
  variants: [{ uri: "https://vidstuck.xyz/m/0", bandwidth: 2000000, width: 1920, height: 1080, codecs: "hev1.1.6.L150.90" }],
  server: "orion",
  audioTracks: [],
};

vi.mock("../api/streamResolve", async (orig) => {
  const actual = await orig();
  const zxc = (args) => {
    hlsState.resolveCalls.push(args);
    // mimic resolveZxc: normalize, then carry the server the backend used.
    return { ...actual.streamResolve.normalizeResolved(RESOLVE_PAYLOAD), server: RESOLVE_PAYLOAD.server };
  };
  return { ...actual, streamResolve: { ...actual.streamResolve, resolveZxc: zxc } };
});

vi.mock("../api/nativeHlsLoader", async (orig) => {
  const actual = await orig();
  return { ...actual, createStreamlyLoader: () => ({ load: async () => "" }), probeSourcePlayable: async () => ({ ok: true }) };
});

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
  hlsState.levels = [{ height: 1080 }];
  hlsState.currentLevel = -1;
  hlsState.loadSourceCalls.length = 0;
  hlsState.resolveCalls.length = 0;
});

describe("no-pick resolve uses auto and reflects the chosen server", () => {
  it("resolves once with auto:true (no server named)", async () => {
    render(<NativePlayerView type="movie" id="12345" title="A Title" onClose={() => {}} />);
    await waitFor(() => expect(hlsState.resolveCalls.length).toBeGreaterThan(0), { timeout: 5000 });
    expect(hlsState.resolveCalls[0].auto).toBe(true);
    expect(hlsState.resolveCalls[0].server).toBeUndefined();
    // One resolve, not a five-row client walk.
    expect(hlsState.resolveCalls.length).toBe(1);
  });

  it("highlights the resolved backend's row in the Servers menu", async () => {
    render(<NativePlayerView type="movie" id="12345" title="A Title" onClose={() => {}} />);
    await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(0), { timeout: 5000 });

    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    // The Servers row's sub-line names the server that is actually playing.
    expect(screen.getByRole("button", { name: /servers/i }).textContent).toContain("Server 1");
    fireEvent.click(screen.getByRole("button", { name: /servers/i }));

    const dialog = screen.getByRole("dialog", { name: "Servers" });
    const rows = [...dialog.querySelectorAll(".np-dialog-row")];
    const server1 = rows.find((r) => r.textContent.includes("Server 1"));
    const server5 = rows.find((r) => r.textContent.includes("Server 5"));
    expect(server1).toHaveAttribute("aria-pressed", "true");
    expect(server5).not.toHaveAttribute("aria-pressed");
  });
});
