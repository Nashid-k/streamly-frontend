// Proof harness for the quality-switch DISPLAY defects found in NativePlayerView.
//
// The menu rows are built from the RESOLVER's `variants` (raw `v.height`, label
// via variantLabel), but a quality pick acts in two different universes:
//   · in-manifest master pin (`pickQuality` -> `hls.currentLevel = best`) picks
//     the manifest LEVEL whose height is CLOSEST to the clicked row's height,
//     then sets `manualHeight` to that MANIFEST height. When the manifest ladder
//     is coarser than the menu ladder (or resolver heights differ from STREAM-INF
//     RESOLUTION), the highlight compares `q.height === manualHeight` against
//     menu rows -> NO row lights up and the PLAYED rung may not be the clicked
//     one at all.
//   · clicking the rung hls.js's ABR already settled on pins `currentLevel` to
//     that SAME level -> no LEVEL_SWITCHED, no probe, no loadSource, no note.
//     The row flips a highlight and the video does not visibly change.
//   · full-reload switches (non-master ladders, dubs, `external` upgrades) run
//     `hls.loadSource()` directly and never call `setCurrentHeight`; they rely
//     on LEVEL_SWITCHED. A media playlist without RESOLUTION reports height 0,
//     so after the switch Auto's "Now" line renders "0p".
import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const hlsState = {
  levels: [],
  currentLevel: -1,
  loadSourceCalls: [],
  resolveCalls: [],
};

/* hls.js stand-in with an honest level set (drives the pin + LEVEL_SWITCHED)
   separate from the resolver's variant ladder (drives the menu rows).
   `levelSwitchedData` is what LEVEL_SWITCHED reports for the pinned level. */
vi.mock("hls.js", () => {
  class FakeHls {
    static isSupported() {
      return true;
    }
    static get Events() {
      return {
        MANIFEST_PARSED: "manifestParsed",
        ERROR: "error",
        LEVEL_SWITCHED: "levelSwitched",
        FRAG_BUFFERED: "fragBuffered",
        AUDIO_TRACKS_UPDATED: "audioTracks",
      };
    }
    constructor() {
      this.levels = JSON.parse(JSON.stringify(hlsState.levels));
      this.audioTracks = [];
      Object.defineProperty(this, "currentLevel", {
        get: () => hlsState.currentLevel,
        set: (v) => {
          hlsState.currentLevel = v;
          const lvl = v >= 0 && this.levels[v];
          const height = lvl?.height ?? null;
          setTimeout(() => this._fire("levelSwitched", { height }), 0);
        },
      });
      this.loadedSources = [];
      this._handlers = {};
    }
    loadSource(url) {
      this.loadedSources.push(url);
      hlsState.loadSourceCalls.push(url);
      setTimeout(() => this._fire("manifestParsed"), 0);
      setTimeout(() => this._fire("levelSwitched", { height: this.levels[this.levels.length ? 0 : -1]?.height ?? null }), 0);
    }
    on(evt, fn) {
      (this._handlers[evt] ||= []).push(fn);
    }
    off(evt, fn) {
      this._handlers[evt] = (this._handlers[evt] || []).filter((f) => f !== fn);
    }
    _fire(evt, data) {
      for (const fn of this._handlers[evt] || []) fn(evt, data || {});
    }
    once(evt, fn) {
      this.on(evt, fn);
    }
    destroy() {}
    attachMedia() {}
    startLoad() {}
    stopLoad() {}
  }
  return { default: FakeHls };
});

const MASTER_URL = "https://vidstuck.xyz/backend/servers/centaurus?zx=streamly&zv=master";
const FRENCH_DUB = "https://vidstuck.xyz/backend/servers/centaurus?zx=streamly&zv=master&zd=fr";

/* Menu ladder (resolver variants) is deliberately NOT identical to the manifest
   ladder the harness pins against — that asymmetry is the defect under test. */
function resolveFor({ multiLevelMaster, variantHeights }) {
  return {
    source: { kind: "hls", url: MASTER_URL, refUrl: "https://vidstuck.xyz/embed/movie/1101383", multiLevelMaster },
    variants: variantHeights.map((height, i) => ({
      uri: `https://vidstuck.xyz/m/${i}`,
      bandwidth: 2000000 + i * 100000,
      width: Math.round((height * 16) / 9),
      height,
      codecs: "hev1.1.6.L150.90",
    })),
    server: "centaurus",
    audioTracks: [],
  };
}

let RESOLVE_PAYLOAD = resolveFor({ multiLevelMaster: true, variantHeights: [1080, 720, 480] });

vi.mock("../api/streamResolve", async (orig) => {
  const actual = await orig();
  const zxc = (args) => {
    hlsState.resolveCalls.push(args);
    return actual.streamResolve.normalizeResolved(RESOLVE_PAYLOAD);
  };
  return {
    ...actual,
    streamResolve: {
      ...actual.streamResolve,
      resolve: zxc,
      resolveZxc: zxc,
    },
  };
});

vi.mock("../api/nativeHlsLoader", async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    createStreamlyLoader: () => ({ load: async () => "" }),
    probeSourcePlayable: async () => ({ ok: true }),
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
  hlsState.levels = [];
  hlsState.currentLevel = -1;
  hlsState.loadSourceCalls.length = 0;
  hlsState.resolveCalls.length = 0;
  RESOLVE_PAYLOAD = resolveFor({ multiLevelMaster: true, variantHeights: [1080, 720, 480] });
});

function armorVideo(container, playingState) {
  const video = container.querySelector("video");
  Object.defineProperty(video, "paused", {
    configurable: true,
    get: () => !playingState.playing,
  });
  Object.defineProperty(video, "readyState", {
    configurable: true,
    get: () => 3,
  });
  video.play = vi.fn(() => {
    playingState.playing = true;
    return Promise.resolve();
  });
  video.pause = vi.fn(() => {
    playingState.playing = false;
  });
  return video;
}

async function mountPlayer() {
  const playingState = { playing: false };
  const { container } = render(<NativePlayerView type="movie" id="1101383" title="The End of Oak Street" onClose={() => {}} />);
  await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(0), { timeout: 5000 });
  await waitFor(() => expect(hlsState.resolveCalls.length).toBeGreaterThan(0), { timeout: 5000 });
  const video = armorVideo(container, playingState);
  return { container, playingState, video };
}

const openVideoPanel = () => {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: /^Video Quality/i }));
};

describe("quality switch DISPLAY fixes", () => {
  it("coarser manifest ladder: 720p click plays the nearest 540p rung but HIGHLIGHTS the clicked row", async () => {
    // Resolver advertises 1080/720/480; the REAL master only carries 1080 + 540.
    hlsState.levels = [{ height: 1080 }, { height: 540 }];
    const { video } = await mountPlayer();
    const playingState = { playing: true };
    Object.defineProperty(video, "paused", { configurable: true, get: () => !playingState.playing });
    playingState.playing = true;

    openVideoPanel();
    fireEvent.click(screen.getByRole("button", { name: /^720p/ }));

    await waitFor(() => expect(hlsState.currentLevel).toBe(1), { timeout: 3000 });

    // The video lands on the manifest level nearest 720 (540p) - hls semantics -
    // but the menu now lights up the CLICKED row instead of leaving nothing selected.
    expect(hlsState.currentLevel).toBe(1);
    expect(hlsState.loadSourceCalls.length).toBe(1); // in-manifest pin: no reload
    expect(screen.getByRole("button", { name: /^720p/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("clicking the rung ABR already settled on is a no-op with the clicked row lit", async () => {
    // Manifest and menu agree (1080/720/480). ABR settles on 720p (level 1) at open.
    hlsState.levels = [{ height: 1080 }, { height: 720 }, { height: 480 }];
    const { video, playingState } = await mountPlayer();
    playingState.playing = true;
    hlsState.currentLevel = 1; // ABR already at 720p

    openVideoPanel();
    fireEvent.click(screen.getByRole("button", { name: /^720p/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /^720p/ })).toHaveAttribute("aria-pressed", "true"), { timeout: 3000 });

    // No probe, no playlist hit, no level move, no play(): the pick pinned the
    // SAME level ABR already chose, so playback never changes - the feedback is
    // the row highlight + the mode flip, never a dead-looking without-touch.
    expect(hlsState.loadSourceCalls.length).toBe(1);
    expect(hlsState.currentLevel).toBe(1);
    expect(video.play).not.toHaveBeenCalled();
    expect(video.pause).not.toHaveBeenCalled();
  });

  it("heightless media playlist: a non-master pick keeps a sane 'Now' line (no 0p)", async () => {
    // A non-master fixed ladder (multiLevelMaster:false). The provider's media
    // playlists carry NO RESOLUTION, so LEVEL_SWITCHED reports height 0 — but the
    // pick now seeds currentHeight from the chosen rung and the 0 is ignored.
    RESOLVE_PAYLOAD = resolveFor({ multiLevelMaster: false, variantHeights: [1080, 480] });
    hlsState.levels = [{ height: 0 }];
    const { playingState } = await mountPlayer();
    playingState.playing = true;

    openVideoPanel();
    fireEvent.click(screen.getByRole("button", { name: /^480p/ }));

    await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(1), { timeout: 3000 });
    expect(screen.getByRole("button", { name: /^480p/ })).toHaveAttribute("aria-pressed", "true");

    // Back to Auto: the summary shows the PICKED rung, not the manifest's 0.
    fireEvent.click(screen.getByRole("button", { name: /^Auto/ }));
    await waitFor(() => expect(screen.getByText("Now 480p · adjusts with your connection")).toBeInTheDocument(), { timeout: 3000 });
  });

  it("quality pick while a pinned dub plays shows an honest note instead of a dead click", async () => {
    // A dub is pinned (activeDubRef > 0) so a quality pick must be refused -
    // refuse WITH a visible reason (Switch audio back to Original...) rather
    // than the old silent early-return. Reproduced via a second playable audio
    // track and a manual dub pick puts activeDubRef > 0.
    RESOLVE_PAYLOAD = resolveFor({ multiLevelMaster: true, variantHeights: [1080, 720, 480] });
    RESOLVE_PAYLOAD.audioTracks = [{ label: "French dub", uri: FRENCH_DUB }];
    hlsState.levels = [{ height: 1080 }, { height: 720 }, { height: 480 }];
    const { playingState } = await mountPlayer();
    playingState.playing = true;

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /^Audio/i }));
    fireEvent.click(screen.getByRole("button", { name: /^French/i }));

    // Wait for the dub switch to land, then open the quality panel.
    await waitFor(() => expect(hlsState.loadSourceCalls).toContain(FRENCH_DUB), { timeout: 3000 });
    // The audio panel is still open; Settings toggles CLOSED while a panel is up
    // (NativePlayerView gear onClick), so a second press re-opens the root.
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /^Video Quality/i }));

    fireEvent.click(screen.getByRole("button", { name: /^720p/ }));

    expect(screen.getByText("Switch audio back to Original to change quality")).toBeInTheDocument();
    expect(hlsState.loadSourceCalls.filter((u) => !u.includes("&zd=fr")).length).toBe(1); // no reload for the refusal
  });
});