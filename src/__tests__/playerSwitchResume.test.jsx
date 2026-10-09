// Verification harness for the user report: "on switching quality or audio the
// video stays paused and I need to explicitly play it."
//
// The player's switch paths must not pause a PLAYING session, and a switch made
// while PAUSED is documented design (the "paused switch feels instant" rule in
// pickQuality): it records `wasPaused` and only resumes (`video.play()`) when it
// was NOT paused. This test makes both contracts observable on a mounted player:
//   · in-manifest quality pick (hls.currentLevel)  -> touches nothing
//   · full-reload source swap (dub/audio) playing   -> video.play() IS called
//   · full-reload source swap while paused          -> play() NOT called (design)
// The resume play() runs outside the click gesture (after the manifest reload +
// canplay), so a strict autoplay policy CAN reject it; pickQuality must not
// swallow that silently - it logs and arms a one-shot resume so the next
// interaction starts playback again.
import { describe, expect, it, beforeAll, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

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
  audioTracks: [{ label: "French dub", uri: FRENCH_DUB }],
};

vi.mock("../api/streamResolve", async (orig) => {
  const actual = await orig();
  const zxc = (args) => {
    hlsState.resolveCalls.push(args);
    return actual.streamResolve.normalizeResolved(ZXC_RESOLVE);
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
  hlsState.currentLevel = -1;
  hlsState.loadSourceCalls.length = 0;
  hlsState.resolveCalls.length = 0;
});

/* Arm the rendered <video> so the player's reads/writes are observable:
   control `paused` (jsdom pins it true), skip the canplay wait with a fixed
   readyState of 3, and record play()/pause() calls. Pass rejectPlay to model
   the browser refusing an unmuted play() outside a user gesture; rejectOnce
   refuses only the FIRST play() (a strict-policy block followed by a granted
   in-gesture replay). */
function armorVideo(container, playingState, { rejectPlay = false, rejectOnce = false } = {}) {
  const video = container.querySelector("video");
  Object.defineProperty(video, "paused", {
    configurable: true,
    get: () => !playingState.playing,
  });
  Object.defineProperty(video, "readyState", {
    configurable: true,
    get: () => 3,
  });
  let rejectsLeft = rejectPlay ? (rejectOnce ? 1 : Infinity) : 0;
  video.play = vi.fn(() => {
    playingState.playAttempts = (playingState.playAttempts || 0) + 1;
    if (rejectsLeft > 0) {
      rejectsLeft -= 1;
      playingState.playRejects = (playingState.playRejects || 0) + 1;
      // The browser refuses the unmuted play() (NotAllowedError) and the
      // element stays PAUSED - model that honestly.
      playingState.playing = false;
      const err = new Error("The play() request was interrupted by a call to pause(), or autoplay policy");
      err.name = "NotAllowedError";
      return Promise.reject(err);
    }
    playingState.playing = true;
    return Promise.resolve();
  });
  video.pause = vi.fn(() => {
    playingState.playing = false;
  });
  return video;
}

async function mountPlayer({ rejectPlay = false, rejectOnce = false } = {}) {
  const playingState = { playing: false };
  const { container } = render(<NativePlayerView type="movie" id="1101383" title="The End of Oak Street" onClose={() => {}} />);
  await waitFor(() => expect(hlsState.loadSourceCalls.length).toBeGreaterThan(0), { timeout: 5000 });
  await waitFor(() => expect(hlsState.resolveCalls.length).toBeGreaterThan(0), { timeout: 5000 });
  const video = armorVideo(container, playingState, { rejectPlay, rejectOnce });
  return { container, playingState, video };
}

const openSettings = () => {
  fireEvent.click(screen.getByRole("button", { name: "Settings" }));
};
const openAudioPanel = () => {
  openSettings();
  fireEvent.click(screen.getByRole("button", { name: /^Audio/i }));
};

describe("switch while PLAYING must never leave the video needing a manual play", () => {
  it("in-manifest quality pick touches neither play() nor pause()", async () => {
    const { playingState, video } = await mountPlayer();
    playingState.playing = true;

    openSettings();
    fireEvent.click(screen.getByRole("button", { name: /^Video Quality/i }));
    fireEvent.click(screen.getByRole("button", { name: "720p" }));

    video.play.mockClear();
    video.pause.mockClear();

    await waitFor(() => expect(hlsState.currentLevel).not.toBe(-1), { timeout: 3000 });

    expect(hlsState.currentLevel).toBe(hlsState.levels.indexOf(hlsState.levels[1]));
    expect(video.play).not.toHaveBeenCalled();
    expect(video.pause).not.toHaveBeenCalled();
    expect(hlsState.loadSourceCalls.length).toBe(1); // no full-source reload
  });

  it("dub/audio switch (full reload) while playing resumes to PLAYING", async () => {
    const { playingState, video } = await mountPlayer();
    playingState.playing = true;

    openAudioPanel();
    const french = screen.getByRole("button", { name: /^French/i });
    expect(french).toBeInTheDocument();

    video.play.mockClear();
    video.pause.mockClear();

    fireEvent.click(french);

    await waitFor(() => expect(hlsState.loadSourceCalls).toContain(FRENCH_DUB), { timeout: 3000 });

    await waitFor(() => expect(video.play).toHaveBeenCalled(), { timeout: 3000 });
    expect(video.pause).not.toHaveBeenCalled();
    // The resume play() RESOLVED -> the element is genuinely playing again.
    expect(playingState.playing).toBe(true);
  });

  it("dub/audio switch while playing can be left PAUSED if the browser rejects the resume play()", async () => {
    // The resume play() runs outside the click gesture (after the manifest
    // reload + canplay), so a strict autoplay policy can reject it. The switch
    // must not self-retry inside itself (that would loop on the same blocked
    // call) - the video ends PAUSED, armed for a one-shot resume on the next
    // interaction. This pins the intermediate state as real: BEFORE the next
    // interaction the element is paused with exactly one play() attempt.
    const { playingState, video } = await mountPlayer({ rejectPlay: true });
    playingState.playing = true;

    openAudioPanel();
    const french = screen.getByRole("button", { name: /^French/i });
    expect(french).toBeInTheDocument();

    video.play.mockClear();
    video.pause.mockClear();

    fireEvent.click(french);

    await waitFor(() => expect(hlsState.loadSourceCalls).toContain(FRENCH_DUB), { timeout: 3000 });
    await waitFor(() => expect(video.play).toHaveBeenCalled(), { timeout: 3000 });

    // Exactly one attempt - no self-healing retry inside the switch.
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.pause).not.toHaveBeenCalled();
    // The rejection left the element PAUSED, but armed for the next gesture.
    expect(playingState.playing).toBe(false);
  });

  it("a strict-policy rejection arms a one-shot resume on the NEXT interaction", async () => {
    const { container, playingState, video } = await mountPlayer({ rejectPlay: true, rejectOnce: true });
    playingState.playing = true;

    openAudioPanel();
    const french = screen.getByRole("button", { name: /^French/i });
    expect(french).toBeInTheDocument();

    fireEvent.click(french);

    await waitFor(() => expect(hlsState.loadSourceCalls).toContain(FRENCH_DUB), { timeout: 3000 });
    await waitFor(() => expect(video.play).toHaveBeenCalled(), { timeout: 3000 });
    expect(playingState.playing).toBe(false); // blocked -> paused, resume armed

    // The next interaction starts playback even when it lands somewhere that
    // does NOT toggle the video (settings panel, chrome): the pointerdown
    // listener re-drives play() itself, deferred past the press so the video's
    // own click-to-toggle still wins whenever it fires.
    video.play.mockClear();
    fireEvent.pointerDown(container.querySelector(".np-root"));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(video.play).toHaveBeenCalledTimes(1);
    expect(video.pause).not.toHaveBeenCalled();
    expect(playingState.playing).toBe(true);
  });
});

describe("switch while PAUSED keeps it paused (documented design)", () => {
  it("dub/audio switch (full reload) while paused does NOT call video.play()", async () => {
    const { playingState, video } = await mountPlayer();
    playingState.playing = false;

    openAudioPanel();
    const french = screen.getByRole("button", { name: /^French/i });
    expect(french).toBeInTheDocument();

    video.play.mockClear();
    video.pause.mockClear();

    fireEvent.click(french);

    await waitFor(() => expect(hlsState.loadSourceCalls).toContain(FRENCH_DUB), { timeout: 3000 });

    expect(video.play).not.toHaveBeenCalled();
    expect(video.pause).not.toHaveBeenCalled();
  });
});