// Regression guard for the ZXC DASH-server audio menu.
//
// The bug this pins: the player's quality/dub switch had a "master playlist"
// fast path that set `hls.currentLevel` instead of loading the requested URL.
// That is right for a QUALITY pick (the levels are in the loaded master), but
// wrong for a DUB pick â€” a dub is a whole sibling master URL, so pinning a
// level kept the ORIGINAL language playing while the UI said "French dub".
//
// ZXC Centaurus is what exposed it: its dubs are sibling masters, so the first
// dub switch on a multi-rung source silently did nothing.
import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const hlsState = {
  levels: [
    { height: 1080 },
    { height: 720 },
    { height: 480 },
  ],
  currentLevel: -1,
  loadSourceCalls: [],
  resolveCalls: [],
};

/* Minimal hls.js stand-in: the component only needs isSupported, Events, and
   the handful of methods the master path touches. */
vi.mock("hls.js", () => {
  class FakeHls {
    static isSupported() {
      return true;
    }
    static get Events() {
      return { MANIFEST_PARSED: "manifestParsed", ERROR: "error", LEVEL_SWITCHED: "levelSwitched", FRAG_BUFFERED: "fragBuffered", AUDIO_TRACKS_UPDATED: "audioTracks" };
    }
    constructor() {
      this.levels = hlsState.levels;
      this.audioTracks = [];
      // Backed by the shared state so a test can actually see the player PIN a
      // level â€” an instance-local field would hide the exact regression.
      Object.defineProperty(this, "currentLevel", {
        get: () => hlsState.currentLevel,
        set: (v) => {
          hlsState.currentLevel = v;
        },
      });
      this.loadedSources = [];
      this._handlers = {};
    }
    loadSource(url) {
      this.loadedSources.push(url);
      hlsState.loadSourceCalls.push(url);
      // The real hls.js parses asynchronously and fires MANIFEST_PARSED, which
      // is where the player publishes qualities + dub tracks. It must land on a
      // later tick: the player registers its own listener AFTER calling
      // loadSource, so a synchronous fire would be missed.
      setTimeout(() => this._fire("manifestParsed"), 0);
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
    addAudioTrack() {}
  }
  return { default: FakeHls };
});

const MASTER_URL = "https://vidstuck.xyz/backend/servers/centaurus?zx=streamly&zv=master";
const FRENCH_DUB = "https://vidstuck.xyz/backend/servers/centaurus?zx=streamly&zv=master&zd=fr";
const ESLA_DUB = "https://vidstuck.xyz/backend/servers/centaurus?zx=streamly&zv=master&zd=esla";

/* The ZXC resolve: a transcoded fMP4 master (multiLevelMaster) with two real
   dubs advertised as sibling masters. */
const ZXC_RESOLVE = {
  source: { kind: "hls", url: MASTER_URL, refUrl: "https://vidstuck.xyz/embed/movie/1101383", multiLevelMaster: true },
  variants: [
    { uri: "https://vidstuck.xyz/m/0", bandwidth: 2200000, width: 2592, height: 1080, framerate: 23.976, codecs: "hev1.1.6.L150.90" },
    { uri: "https://vidstuck.xyz/m/1", bandwidth: 1000000, width: 1728, height: 720, framerate: 23.976, codecs: "hev1.1.6.L120.90" },
    { uri: "https://vidstuck.xyz/m/2", bandwidth: 500000, width: 1152, height: 480, framerate: 23.976, codecs: "hev1.1.6.L90.90" },
  ],
  server: "centaurus",
  audioTracks: [
    { label: "French dub", uri: FRENCH_DUB },
    { label: "esla dub", uri: ESLA_DUB },
  ],
};

vi.mock("../api/downloadService", async (orig) => {
  const actual = await orig();
  const zxc = (args) => {
    hlsState.resolveCalls.push(args);
    return actual.downloadService.normalizeResolved(ZXC_RESOLVE);
  };
  return {
    ...actual,
    downloadService: {
      ...actual.downloadService,
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
  hlsState.currentLevel = -1;
  hlsState.loadSourceCalls.length = 0;
});

const openAudioPanel = () => {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: /^Audio/i }));
};

describe("ZXC DASH master â€” dub switching", () => {
  it("loads the dub's sibling master instead of pinning an hls level", async () => {
    render(<NativePlayerView type="movie" id="1101383" title="The End of Oak Street" onClose={() => {}} />);

    // Wait for the resolve + manifest-parse to commit the dub list.
    await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(0), { timeout: 5000 });
    await waitFor(() => expect(hlsState.resolveCalls.length).toBeGreaterThan(0), { timeout: 5000 });

    openAudioPanel();
    // The dub list must be the SIBLING-URL list (Original + every dub), not the
    // single in-manifest "eng" group the transcoded master carries.
    expect(screen.getByRole("button", { name: /Original/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^French/i })).toBeInTheDocument();
    // Labels are normalised for display: the provider's raw "French dub" is
    // shown as the language name alone. A viewer sees "French", never "Dub".
    expect(screen.queryByRole("button", { name: /French dub/i })).toBeNull();

    // The dub row is a sibling master URL, so switching to it must RELOAD the
    // source. Setting hls.currentLevel would keep the original language.
    fireEvent.click(screen.getByRole("button", { name: /^French/i }));

    // jsdom has no play(); the reload decision (loadSource) happens before the
    // resume, so assert on the load, not on playback.
    await waitFor(() => {
      expect(hlsState.loadSourceCalls).toContain(FRENCH_DUB);
    }, { timeout: 3000 });
    // The failure mode being guarded: quality-pinning instead of loading.
    expect(hlsState.currentLevel).not.toBe(0);
  });

  it("maps each dub row to ITS OWN label, not the next one over", async () => {
    // Row N is dubTracks[N-1] because row 0 is the original. Indexing both with
    // the same N played the wrong language under the clicked label â€” the
    // clickable row said "French dub" while esla was loaded.
    // The label shown is now the normalised name, so "esla dub" reads "Esla";
    // the mapping assertion below is unchanged, because a rename must never be
    // able to re-break the label->URI pairing.
    render(<NativePlayerView type="movie" id="1101383" title="The End of Oak Street" onClose={() => {}} />);
    await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(0), { timeout: 5000 });

    openAudioPanel();
    // The LAST dub must reach the LAST track, not run off the end.
    fireEvent.click(screen.getByRole("button", { name: /^Esla/i }));
    await waitFor(() => {
      expect(hlsState.loadSourceCalls).toContain(ESLA_DUB);
    }, { timeout: 3000 });
    expect(hlsState.loadSourceCalls).not.toContain(FRENCH_DUB);

    // ...and going back to the original drops the sibling dub parameter instead
    // of keeping a stale dub pinned. It restores via variants[0] (the
    // original-language entry), which is deliberately not the master URL.
    fireEvent.click(screen.getByRole("button", { name: /^Original/i }));
    await waitFor(() => {
      const last = hlsState.loadSourceCalls[hlsState.loadSourceCalls.length - 1];
      expect(last).not.toContain("zd=");
    }, { timeout: 3000 });
  });

  it("puts Audio in the transport row instead of burying it in Settings", async () => {
    // The point of the restructure: a multi-audio source must offer its dubs
    // from the transport row, where every other player puts audio, and must
    // offer them ONCE. Two routes to the same panel is how the two drift apart.
    render(<NativePlayerView type="movie" id="1101383" title="The End of Oak Street" onClose={() => {}} />);
    await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(0), { timeout: 5000 });
    await waitFor(() => expect(hlsState.resolveCalls.length).toBeGreaterThan(0), { timeout: 5000 });

    // Reachable without opening Settings at all.
    const audioBtn = screen.getByRole("button", { name: /^Audio/i });
    expect(audioBtn).toBeInTheDocument();

    // ...and opening Settings does NOT add a second route to it. The transport
    // bar stays mounted behind the sheet, so the invariant is "exactly one Audio
    // control exists", not "none": a duplicate is what would let the two drift.
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.queryAllByRole("button", { name: /^Audio/i })).toHaveLength(1);
    // Subtitles moved out too â€” at most one control, wherever it is placed. The
    // row itself only appears once a subtitle list exists, so do not assert a
    // count here; assert the absence of a duplicate.
    expect(screen.queryAllByRole("button", { name: /^Subtitles/i }).length).toBeLessThanOrEqual(1);
    // Servers stayed in Settings: it belongs to the stream, not the viewer. Both
    // the transport icon and the settings row are labelled "Servers", so a count
    // of two IS the assertion that the row survived the edit.
    expect(screen.queryAllByRole("button", { name: /^Servers/i }).length).toBeGreaterThanOrEqual(2);
  });
});
