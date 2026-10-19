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
  // Which server the fake backend says served the stream (echoed in the
  // response). Flipped by a test to model a picked server falling through.
  server: "orion",
  // Hold the playability probe open so the switching stage stays mounted long
  // enough to assert on. Cleared/resolved at the end of each test that sets it.
  deferProbe: false,
  releaseProbe: null,
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
    return { ...actual.streamResolve.normalizeResolved({ ...RESOLVE_PAYLOAD, server: hlsState.server }), server: hlsState.server };
  };
  return { ...actual, streamResolve: { ...actual.streamResolve, resolveZxc: zxc } };
});

vi.mock("../api/nativeHlsLoader", async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    createStreamlyLoader: () => ({ load: async () => "" }),
    probeSourcePlayable: async () => {
      if (hlsState.deferProbe) {
        return new Promise((resolve) => {
          hlsState.releaseProbe = () => resolve({ ok: true });
        });
      }
      return { ok: true };
    },
  };
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
  hlsState.server = "orion";
  hlsState.deferProbe = false;
  hlsState.releaseProbe = null;
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

/* Manual picks send `prefer` (not `server`): the picked backend is tried first
   and, when it has no source, the SAME round trip walks the health-ordered
   rotation. The response echoes whichever backend really served it, so the
   player re-derives the real row and tells the viewer a fallback happened. */
describe("manual server pick prefers then falls back fast", () => {
  const openServers = () => {
    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    fireEvent.click(screen.getByRole("button", { name: /servers/i }));
  };

  it("resolves a picked row with prefer (not server)", async () => {
    render(<NativePlayerView type="movie" id="12345" title="A Title" onClose={() => {}} />);
    await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(0), { timeout: 5000 });

    openServers();
    const dialog = screen.getByRole("dialog", { name: "Servers" });
    const server2 = [...dialog.querySelectorAll(".np-dialog-row")].find((r) => r.textContent.includes("Server 2"));
    fireEvent.click(server2);

    await waitFor(() => expect(hlsState.resolveCalls.length).toBeGreaterThan(1), { timeout: 3000 });
    const pick = hlsState.resolveCalls[1];
    expect(pick.prefer).toBe("valstrax");
    expect(pick.server).toBeUndefined();
    expect(pick.auto).toBeUndefined();
  });

  it("a picked server with no source falls through and says which one plays", async () => {
    render(<NativePlayerView type="movie" id="12345" title="A Title" onClose={() => {}} />);
    await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(0), { timeout: 5000 });

    // The picked row will be Server 2, but the backend serves Server 1 anyway —
    // the exact "no source on the server I picked" case.
    hlsState.server = "orion";
    hlsState.deferProbe = true; // hold the stage so the note is observable

    openServers();
    const dialog = screen.getByRole("dialog", { name: "Servers" });
    const server2 = [...dialog.querySelectorAll(".np-dialog-row")].find((r) => r.textContent.includes("Server 2"));
    fireEvent.click(server2);

    // The note starts as "Switching to Server 2…" and is replaced by the honest
    // fallback once the response names Server 1.
    await waitFor(() => expect(screen.getByText(/Server 2 has no stream/i)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/playing Server 1/i)).toBeInTheDocument();

    hlsState.deferProbe = false;
    hlsState.releaseProbe?.();
  });

  it("shows the horizontal loader on a server switch (not only the first cold open)", async () => {
    const { container } = render(<NativePlayerView type="movie" id="12345" title="A Title" onClose={() => {}} />);
    await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(0), { timeout: 5000 });

    // A first frame exists, so a later wait would normally use the round ring.
    container.querySelector("video").dispatchEvent(new Event("play"));
    hlsState.deferProbe = true;

    openServers();
    const dialog = screen.getByRole("dialog", { name: "Servers" });
    const server2 = [...dialog.querySelectorAll(".np-dialog-row")].find((r) => r.textContent.includes("Server 2"));
    fireEvent.click(server2);

    const stage = await screen.findByRole("status", { name: "Loading video" });
    expect(stage.querySelector(".np-loading-line > span")).toBeTruthy();
    expect(stage.querySelector(".np-tailspin")).toBeNull();

    hlsState.deferProbe = false;
    hlsState.releaseProbe?.();
  });
});

/* A same-media reload (server pick / source-quality pick / manual retry) tears
   the media element down, which resets currentTime to 0 — the reload carry
   must reposition the new run, or a mid-film switch restarted at the beginning. */
describe("server switch carries the playback position", () => {
  it("seeks back to the pre-switch time once the new source commits", async () => {
    const { container } = render(<NativePlayerView type="movie" id="12345" title="A Title" onClose={() => {}} />);
    await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(0), { timeout: 5000 });

    const video = container.querySelector("video");
    video.dispatchEvent(new Event("play"));
    video.currentTime = 321;

    fireEvent.click(screen.getByRole("button", { name: /^settings$/i }));
    fireEvent.click(screen.getByRole("button", { name: /servers/i }));
    const dialog = screen.getByRole("dialog", { name: "Servers" });
    const server2 = [...dialog.querySelectorAll(".np-dialog-row")].find((r) => r.textContent.includes("Server 2"));
    fireEvent.click(server2);
    // jsdom never runs the media-element load algorithm, so model the detach's
    // emptied reset by hand: without the carry, nothing would re-seek after it.
    video.currentTime = 0;

    await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(1), { timeout: 5000 });
    await waitFor(() => expect(video.currentTime).toBe(321), { timeout: 3000 });
  });
});
