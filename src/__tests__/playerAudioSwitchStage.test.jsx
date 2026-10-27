// In-manifest audio-track switches (hls.audioTrack) and the branded stage.
//
// Regression coverage for two user-visible bugs:
//  · picking an audio track showed nothing (the old sheet stayed open and the
//    player offered no loader), and
//  · startup audio loading fires AUDIO_TRACK_LOADED, which an ungated handler
//    treated as a completed USER switch and used to clear the cold-open/server
//    stage before the first frame.
//
// The second test would fail against the ungated handlers (they cleared the
// stage on any AUDIO_TRACK_LOADED). The first pins the pick → branded stage →
// confirmation lifecycle, plus the language preference surviving a server
// re-resolve.
import { describe, expect, it, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

const hlsState = {
  instances: [],
  loadSourceCalls: [],
  deferParse: false,
  deferSwitch: false,
  switchedInstance: null,
  failSwitchIndex: null,
};

const MASTER_URL = "https://vidstuck.xyz/backend/servers/centaurus?zx=streamly&zv=master";

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
        AUDIO_TRACKS_UPDATED: "audioTracksUpdated",
        AUDIO_TRACK_SWITCHING: "audioTrackSwitching",
        AUDIO_TRACK_SWITCHED: "audioTrackSwitched",
        AUDIO_TRACK_LOADED: "audioTrackLoaded",
      };
    }
    constructor() {
      this.levels = [{ height: 1080, width: 1920, bitrate: 2200000 }];
      this.audioTracks = [
        { name: "eng", lang: "eng" },
        { name: "tam", lang: "tam" },
      ];
      this._audioTrack = 0;
      this.manifestLevels = [];
      this.currentLevel = -1;
      this._handlers = {};
      hlsState.instances.push(this);
    }
    get audioTrack() {
      return this._audioTrack;
    }
    set audioTrack(value) {
      if (hlsState.failSwitchIndex === value) {
        hlsState.failSwitchIndex = null;
        throw new Error("audio switch refused");
      }
      this._audioTrack = value;
      hlsState.switchedInstance = this;
      this._fire("audioTrackSwitching", {});
      if (!hlsState.deferSwitch) {
        setTimeout(() => this._fire("audioTrackSwitched", {}), 0);
      }
    }
    loadSource(url) {
      hlsState.loadSourceCalls.push(url);
      if (!hlsState.deferParse) {
        setTimeout(() => this._fire("manifestParsed"), 0);
      }
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

const RESOLVE_PAYLOAD = {
  source: { kind: "hls", url: MASTER_URL, refUrl: "https://vidstuck.xyz/embed/movie/1101383", multiLevelMaster: true },
  variants: [{ uri: MASTER_URL, bandwidth: 2200000, width: 1920, height: 1080, codecs: "avc1.640028" }],
  server: "centaurus",
};

vi.mock("../api/streamResolve", async (orig) => {
  const actual = await orig();
  const resolve = () => actual.streamResolve.normalizeResolved(RESOLVE_PAYLOAD);
  return {
    ...actual,
    streamResolve: { ...actual.streamResolve, resolve, resolveZxc: resolve },
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
  vi.stubEnv("VITE_STREAMLY_RELAY_URL", "");
  hlsState.instances.length = 0;
  hlsState.loadSourceCalls.length = 0;
  hlsState.deferParse = false;
  hlsState.deferSwitch = false;
  hlsState.switchedInstance = null;
  hlsState.failSwitchIndex = null;
});

afterEach(() => {
  vi.useRealTimers();
});

async function mountPlayer() {
  const view = render(
    <NativePlayerView type="movie" id="1101383" title="The End of Oak Street" onClose={() => {}} />,
  );
  await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(0), { timeout: 5000 });
  // MANIFEST_PARSED is queued at 0ms by loadSource; wait for the commit render
  // that publishes the audio rows to the menu.
  await waitFor(() => expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument());
  return view;
}

const openAudioPanel = () => {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
  fireEvent.click(screen.getByRole("button", { name: /^Audio track/i }));
};

describe("in-manifest audio switch", () => {
  it("shows the branded loader on pick and clears it when the switch confirms", async () => {
    const { unmount } = await mountPlayer();
    hlsState.deferSwitch = true;

    openAudioPanel();
    fireEvent.click(screen.getByRole("button", { name: /^Tamil/i }));

    // Branded stage, not a bare spinner: the same note a server switch uses.
    expect(await screen.findByText("Switching audio…")).toBeInTheDocument();
    // The pick must claim the loader behind the sheet, so the sheet closes.
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /^Tamil/i })).not.toBeInTheDocument();
    });
    // Deferred confirmation: the loader is still up.
    expect(screen.getByText("Switching audio…")).toBeInTheDocument();

    const instance = hlsState.switchedInstance;
    expect(instance.audioTrack).toBe(1);
    instance._fire("audioTrackSwitched", {});

    await waitFor(() => {
      expect(screen.queryByText("Switching audio…")).not.toBeInTheDocument();
    });
    unmount();
  });

  it("startup AUDIO_TRACK_LOADED must not clear a server-switch stage", async () => {
    const { container, unmount } = await mountPlayer();
    const first = hlsState.instances[0];
    // The next run's playlist is held open so the stage stays armed long enough
    // to deliver the stray audio event.
    hlsState.deferParse = true;

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /^Servers/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Server 2/i }));

    await waitFor(() => expect(hlsState.instances.length).toBeGreaterThan(1), { timeout: 5000 });
    expect(await screen.findByText("Switching to Server 2…")).toBeInTheDocument();

    const next = hlsState.instances[hlsState.instances.length - 1];
    // hls.js loads audio groups while the new manifest is still opening. This is
    // NOT a user switch and must leave the server stage alone. Flush React (the
    // ungated handler also cleared `buffering`, which hides the stage via the
    // spinner effect) before reading the screen.
    await act(async () => {
      next._fire("audioTrackLoaded", {});
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(first).not.toBe(next);
    expect(screen.getByText("Switching to Server 2…")).toBeInTheDocument();

    // Let the run commit, then hand it a real frame: the branded stage now
    // comes down on the first decoded frame, not on MANIFEST_PARSED (which is
    // what made a switch flash black between the old and new pictures).
    await act(async () => {
      next._fire("manifestParsed", {});
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const video = container.querySelector("video");
    Object.defineProperty(video, "readyState", { configurable: true, get: () => 3 });
    await act(async () => {
      video.dispatchEvent(new Event("loadeddata"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await waitFor(() => {
      expect(screen.queryByText("Switching to Server 2…")).not.toBeInTheDocument();
    });
    unmount();
  });

  it("re-applies the chosen language after a server re-resolve", async () => {
    const { unmount } = await mountPlayer();

    openAudioPanel();
    fireEvent.click(screen.getByRole("button", { name: /^Tamil/i }));
    await waitFor(() => expect(hlsState.instances[0].audioTrack).toBe(1));
    // Let the confirmation land before switching servers.
    await waitFor(() => {
      expect(screen.queryByText("Switching audio…")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: /^Servers/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Server 2/i }));

    await waitFor(() => expect(hlsState.instances.length).toBeGreaterThan(1), { timeout: 5000 });
    // The new manifest publishes the same language list; attachAudio must pick
    // Tamil again instead of silently reverting to track 0 (English).
    await waitFor(() => {
      const next = hlsState.instances[hlsState.instances.length - 1];
      expect(next.audioTrack).toBe(1);
    });
    unmount();
  });

  it("rolls a timed-out pick back to the playing track and does not persist it", async () => {
    const { unmount } = await mountPlayer();
    hlsState.deferSwitch = true;
    // The 6s bound is armed by the pick, so it must be a fake timer.
    vi.useFakeTimers();

    openAudioPanel();
    fireEvent.click(screen.getByRole("button", { name: /^Tamil/i }));
    const instance = hlsState.switchedInstance;
    expect(instance.audioTrack).toBe(1);
    expect(screen.getByText("Switching audio…")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(7000);
    });

    // The stage is gone, the old track is playing again (hls.js makes a same-id
    // re-select a no-op, so leaving the target selected was not retryable), and
    // the failure is explained.
    expect(screen.queryByText("Switching audio…")).not.toBeInTheDocument();
    expect(instance.audioTrack).toBe(0);
    openAudioPanel();
    expect(screen.getByText(/didn't start/)).toBeInTheDocument();

    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: "Back to settings" }));
    fireEvent.click(screen.getByRole("button", { name: /^Servers/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Server 2/i }));

    await waitFor(() => expect(hlsState.instances.length).toBeGreaterThan(1), { timeout: 5000 });
    // The failed language must not be re-applied to the next resolve.
    await waitFor(() => {
      const next = hlsState.instances[hlsState.instances.length - 1];
      expect(next.audioTrack).toBe(0);
    });
    unmount();
  });

  it("restores the previous preference when the switch itself throws", async () => {
    const { unmount } = await mountPlayer();
    hlsState.failSwitchIndex = 1;

    openAudioPanel();
    fireEvent.click(screen.getByRole("button", { name: /^Tamil/i }));
    openAudioPanel();
    expect(screen.getByText(/couldn't be selected/)).toBeInTheDocument();
    expect(hlsState.instances[0].audioTrack).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Back to settings" }));
    fireEvent.click(screen.getByRole("button", { name: /^Servers/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Server 2/i }));

    await waitFor(() => expect(hlsState.instances.length).toBeGreaterThan(1), { timeout: 5000 });
    await waitFor(() => {
      const next = hlsState.instances[hlsState.instances.length - 1];
      expect(next.audioTrack).toBe(0);
    });
    unmount();
  });
});
