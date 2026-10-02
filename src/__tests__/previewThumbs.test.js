import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logWarn } from "../utils/debugLogger.js";

/* Preview thumbnail pipeline (task.md 5.6).
 *
 * No test file covered `previewThumbs.js` directly before this one, which is
 * how two of its three defects survived: an uncached failure re-ran the whole
 * mount+seek on every pass over the same position, and a `toBlob` that never
 * called back wedged the module-level capture `chain` FOREVER — every later
 * preview queued behind it and the feature died for the session.
 *
 * hls.js, the canvas and FileReader are all stubbed so the tests exercise our
 * pipeline, not jsdom's missing codec.
 */

const state = vi.hoisted(() => ({ behavior: "ok", instances: [] }));

vi.mock("hls.js", () => {
  class FakeHls {
    constructor() {
      this.handlers = {};
      state.instances.push(this);
    }
    loadSource() {}
    attachMedia() {
      setTimeout(() => {
        if (state.behavior === "ok") this.emit("manifestParsed");
        else this.emit("error", { fatal: true, details: "manifestLoadError" });
      }, 0);
    }
    on(event, callback) {
      (this.handlers[event] = this.handlers[event] || []).push(callback);
    }
    off(event, callback) {
      if (this.handlers[event]) {
        this.handlers[event] = this.handlers[event].filter((fn) => fn !== callback);
      }
    }
    emit(event, data) {
      for (const callback of (this.handlers[event] || []).slice()) callback(event, data);
    }
    destroy() {}
  }
  FakeHls.Events = { ERROR: "error", MANIFEST_PARSED: "manifestParsed" };
  return { default: FakeHls };
});

vi.mock("../api/nativeHlsLoader.js", () => ({ createStreamlyLoader: () => ({}) }));
vi.mock("../utils/debugLogger.js", () => ({ logWarn: vi.fn() }));

import {
  clearPreviewCache,
  getPreviewThumb,
  resetPreviewPipeline,
} from "../api/previewThumbs";

const DATA_URL = "data:image/jpeg;base64,AAAA";

let toBlobImpl;
let savedCanvas;
let savedCurrentTime;

beforeEach(() => {
  vi.useFakeTimers();
  state.behavior = "ok";
  state.instances.length = 0;
  resetPreviewPipeline();
  logWarn.mockClear();

  toBlobImpl = (callback) => callback({ size: 1 });

  savedCanvas = {
    getContext: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext"),
    toBlob: Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "toBlob"),
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: vi.fn() }));
  HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => toBlobImpl(callback));

  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.load = vi.fn();

  /* A seek resolves as soon as `currentTime` is written, like a decoded frame
   * that is already buffered. */
  savedCurrentTime = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "currentTime");
  Object.defineProperty(HTMLMediaElement.prototype, "currentTime", {
    configurable: true,
    get() {
      return this.__previewTime || 0;
    },
    set(value) {
      this.__previewTime = value;
      this.dispatchEvent(new Event("seeked"));
    },
  });

  class FakeFileReader {
    readAsDataURL() {
      this.result = DATA_URL;
      Promise.resolve().then(() => this.onload && this.onload());
    }
  }
  vi.stubGlobal("FileReader", FakeFileReader);
});

afterEach(() => {
  if (savedCanvas.getContext) {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", savedCanvas.getContext);
  }
  if (savedCanvas.toBlob) {
    Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", savedCanvas.toBlob);
  }
  if (savedCurrentTime) {
    Object.defineProperty(HTMLMediaElement.prototype, "currentTime", savedCurrentTime);
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const request = (seconds, sourceKey = "s1") =>
  getPreviewThumb({ url: "https://example/master.m3u8", refUrl: "https://example", seconds, sourceKey });

async function run(promise) {
  await vi.runAllTimersAsync();
  return promise;
}

describe("previewThumbs (task.md 5.6)", () => {
  it("captures a frame and serves the next request for it from the cache", async () => {
    await expect(run(request(10))).resolves.toBe(DATA_URL);

    await expect(run(request(10))).resolves.toBe(DATA_URL);

    expect(state.instances).toHaveLength(1);
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledTimes(1);
  });

  it("negatively caches a failure without re-mounting or re-logging", async () => {
    state.behavior = "fatal";

    await expect(run(request(20, "s2"))).resolves.toBeNull();
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(state.instances).toHaveLength(1);

    await expect(run(request(20, "s2"))).resolves.toBeNull();
    expect(logWarn).toHaveBeenCalledTimes(1);
    expect(state.instances).toHaveLength(1);
  });

  it("times out a hung toBlob instead of wedging the capture chain", async () => {
    toBlobImpl = () => {}; // never calls back

    await expect(run(request(30, "s3"))).resolves.toBeNull();
    expect(logWarn).toHaveBeenCalledWith(
      "native",
      "Scrubber preview unavailable",
      expect.objectContaining({ message: "preview-encode-timeout" }),
    );

    // A later, different position must still run: the chain was not wedged.
    toBlobImpl = (callback) => callback({ size: 1 });
    await expect(run(request(40, "s3"))).resolves.toBe(DATA_URL);
  });

  it("drops negative entries on clearPreviewCache so a new source can retry", async () => {
    state.behavior = "fatal";
    await expect(run(request(50, "s4"))).resolves.toBeNull();

    clearPreviewCache("s4");
    state.behavior = "ok";
    await expect(run(request(50, "s4"))).resolves.toBe(DATA_URL);
  });
});
