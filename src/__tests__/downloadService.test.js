import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadService, createPauseController } from "../api/downloadService";
import * as fmp4Muxer from "../utils/fmp4Muxer";
import { CINESRC_RESOLVER_ORIGIN } from "../api/cinesrcResolver";

// saveStream muxing is orchestration — the track remapping is covered properly
// in fmp4Muxer.test.js with real box bytes. Here the muxer is stubbed to
// deterministic output so the tests assert WHEN/WHAT gets fetched and written.
vi.mock("../utils/fmp4Muxer", () => ({
  buildMuxedInit: vi.fn(() => ({
    init: new Uint8Array([9, 9, 9]),
    audioTrackId: 2,
  })),
  muxSegment: vi.fn((videoBytes, audioBytes, trackId) => new Uint8Array([
    100,
    trackId,
    ...videoBytes,
    ...audioBytes,
  ])),
}));

function jsonResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/json" },
    json: async () => body,
  };
}

function bufferResponse(bytes) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => "application/octet-stream" },
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  };
}

function relayError(code, message) {
  return {
    ok: false,
    status: 502,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify({ ok: false, code, error: message }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("downloadService.resolveVidsrc", () => {
  it("labels the qualities the VidSrc (Alt) ladder reports", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://vidsrc.buzz/stream/xyz" },
          variants: [
            { uri: "https://cdn/4k.m3u8", bandwidth: 16000000, width: 3840, height: 2160, hdr: true },
            { uri: "https://cdn/1080.m3u8", bandwidth: 8000000, width: 1920, height: 1080, hdr: false },
          ],
        }),
      ),
    );

    const { variants } = await downloadService.resolveVidsrc(
      { type: "movie", id: "550" },
    );
    expect(variants.map((v) => v.label)).toEqual(["4K HDR", "1080p"]);
  });

  it("passes season+episode through for TV titles", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://vidsrc.buzz/stream/tv-xyz" },
          variants: [
            { uri: "https://cdn/720.m3u8", bandwidth: 2800000, width: 1280, height: 720, hdr: false },
          ],
        });
      }),
    );

    await downloadService.resolveVidsrc({ type: "tv", id: "1399", season: 2, episode: 3 });

    expect(capturedBody).toMatchObject({ action: "resolvevidsrc", type: "tv", id: "1399", season: "2", episode: "3" });
  });

  it("throws a clear error when the serverless function is not deployed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => "text/html" },
        json: async () => ({}),
      }),
    );
    await expect(downloadService.resolveVidsrc({ type: "movie", id: "550" })).rejects.toMatchObject({
      code: "offline",
    });
  });

  it("surfaces the resolver's no-source result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "No downloadable stream found via VidSrc", code: "no-source" })),
    );
    await expect(downloadService.resolveVidsrc({ type: "movie", id: "550" })).rejects.toMatchObject({
      code: "no-source",
    });
  });
});

describe("downloadService.resolveCinesrc", () => {
  it("labels the qualities the CineSrc ladder reports", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://cinesrc.st/api/playlist/xyz" },
          audio: [
            { groupId: "audio", name: "(DKS) LINE", language: "en", default: true, url: "https://cinesrc.st/en.m3u8" },
            { groupId: "audio", name: "(DKS) LINE (2)", language: "spa", default: false, url: "https://cinesrc.st/spa.m3u8" },
          ],
          variants: [
            { uri: "https://cinesrc.st/api/playlist/a0815", bandwidth: 5692000, width: 1920, height: 1080, hdr: false },
            { uri: "https://cinesrc.st/api/playlist/b0815", bandwidth: 2628000, width: 1280, height: 720, hdr: false },
          ],
        }),
      ),
    );

    const resolved = await downloadService.resolveCinesrc(
      { type: "movie", id: "1423191" },
    );
    expect(resolved.variants.map((v) => v.label)).toEqual(["1080p", "720p"]);
    expect(resolved.audio.map((a) => a.language)).toEqual(["en", "spa"]);
  });

  it("passes season+episode through for TV titles", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://cinesrc.st/api/playlist/t" },
          variants: [
            { uri: "https://cinesrc.st/api/playlist/e", bandwidth: 2800000, width: 1280, height: 720, hdr: false },
          ],
        });
      }),
    );

    await downloadService.resolveCinesrc({ type: "tv", id: "1399", season: 2, episode: 3 });

    expect(capturedBody).toMatchObject({ action: "resolvecinesrc", type: "tv", id: "1399", season: "2", episode: "3" });
  });

  it("sends the resolver origin with the request body (trailing slash trimmed)", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://cinesrc.st/api/playlist/t" },
          variants: [
            { uri: "https://cinesrc.st/api/playlist/e", bandwidth: 2628000, width: 1280, height: 720, hdr: false },
          ],
        });
      }),
    );

    await downloadService.resolveCinesrc({ type: "movie", id: "1423191" }, {
      resolverUrl: "https://resolver.example.com/",
    });

    expect(capturedBody).toMatchObject({
      action: "resolvecinesrc",
      id: "1423191",
      resolverUrl: "https://resolver.example.com",
    });
  });

  it("sends the shipped CINESRC_RESOLVER_ORIGIN by default", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://cinesrc.st/api/playlist/t" },
          variants: [
            { uri: "https://cinesrc.st/api/playlist/e", bandwidth: 2628000, width: 1280, height: 720, hdr: false },
          ],
        });
      }),
    );

    await downloadService.resolveCinesrc({ type: "movie", id: "1423191" });

    expect(capturedBody).toMatchObject({
      action: "resolvecinesrc",
      id: "1423191",
      resolverUrl: CINESRC_RESOLVER_ORIGIN,
    });
  });

  it("omits resolverUrl when the resolver origin is blank", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://cinesrc.st/api/playlist/t" },
          variants: [
            { uri: "https://cinesrc.st/api/playlist/e", bandwidth: 2628000, width: 1280, height: 720, hdr: false },
          ],
        });
      }),
    );

    await downloadService.resolveCinesrc({ type: "movie", id: "1423191" }, { resolverUrl: "" });

    expect(capturedBody).toMatchObject({ action: "resolvecinesrc", id: "1423191" });
    expect(capturedBody.resolverUrl).toBeUndefined();
  });

  it("throws a clear error when the resolver Chrome service is not deployed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "CineSrc resolver not configured", code: "resolver-unavailable" })),
    );
    await expect(downloadService.resolveCinesrc({ type: "movie", id: "550" })).rejects.toMatchObject({
      code: "resolver-unavailable",
    });
  });

  it("surfaces the resolver's no-source result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "No downloadable stream found via CineSrc", code: "no-source" })),
    );
    await expect(downloadService.resolveCinesrc({ type: "movie", id: "550" })).rejects.toMatchObject({
      code: "no-source",
    });
  });
});

describe("downloadService.resolveVidcore", () => {
  it("labels the quality ladder VidCore's sources serve (incl. 4K)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://moon.quietridge.top/vd/x/index-s2160p-v1-a1.m3u8", refUrl: "https://vidcore.io/" },
          variants: [
            { uri: "https://moon.quietridge.top/vd/x/index-s2160p-v1-a1.m3u8", bandwidth: 16000000, height: 2160 },
            { uri: "https://moon.quietridge.top/vd/x/index-s1080p-v1-a1.m3u8", bandwidth: 6000000, height: 1080 },
            { uri: "https://moon.quietridge.top/vd/x/index-s720p-v1-a1.m3u8", bandwidth: 2500000, height: 720 },
          ],
        }),
      ),
    );

    const resolved = await downloadService.resolveVidcore({ type: "movie", id: "693134" });
    expect(resolved.variants.map((v) => v.label)).toEqual(["4K", "1080p", "720p"]);
    expect(resolved.source.refUrl).toBe("https://vidcore.io/");
  });

  it("passes season+episode through for TV titles and sends no resolverUrl", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://moon.quietridge.top/vd/x/index-s1080p-v1-a1.m3u8", refUrl: "https://vidcore.io/" },
          variants: [
            { uri: "https://moon.quietridge.top/vd/x/index-s1080p-v1-a1.m3u8", bandwidth: 6000000, height: 1080 },
          ],
        });
      }),
    );

    await downloadService.resolveVidcore({ type: "tv", id: "1396", season: 1, episode: 1 });

    expect(capturedBody).toMatchObject({ action: "resolvevidcore", type: "tv", id: "1396", season: "1", episode: "1" });
    expect(capturedBody.resolverUrl).toBeUndefined();
  });

  it("surfaces an honest no-source result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "No downloadable stream found via VidCore", code: "no-source" })),
    );
    await expect(downloadService.resolveVidcore({ type: "movie", id: "550" })).rejects.toMatchObject({
      code: "no-source",
    });
  });
});

describe("downloadService.resolveNetmirror", () => {
  it("returns a direct mp4 source plus the per-language audio dubs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          source: {
            kind: "mp4",
            url: "https://bcdnxw.hakunaymatata.com/convert-h264/d24cc4be271fffb5065d7723b7d6eafc.mp4?sign=abc",
            refUrl: "https://net27.cc/",
          },
          variants: [
            { uri: "https://bcdnxw.hakunaymatata.com/convert-h264/d24cc4be271fffb5065d7723b7d6eafc.mp4?sign=abc", bandwidth: 2500000, height: 720, direct: true },
            { uri: "https://bcdnxw.hakunaymatata.com/bt/ad04f2.mp4?sign=abc", bandwidth: 800000, height: 360, direct: true },
          ],
          audio: [
            { language: "Malayalam", url: "https://bcdnxw.hakunaymatata.com/convert-h264/d24cc4be271fffb5065d7723b7d6eafc.mp4?sign=abc" },
            { language: "Hindi", url: "https://bcdnxw.hakunaymatata.com/tran-audio/20250609/13e051e0028d6dff24783acf8e2c48da.mp4?sign=abc" },
            { language: "Tamil", url: "https://bcdnxw.hakunaymatata.com/bt/5f9023.mp4?sign=abc" },
          ],
        }),
      ),
    );

    const resolved = await downloadService.resolveNetmirror({ type: "movie", id: "1149791" });
    expect(resolved.variants.map((v) => v.label)).toEqual(["720p", "SD"]);
    expect(resolved.variants[0].direct).toBe(true);
    expect(resolved.source.kind).toBe("mp4");
    expect(resolved.audio.map((a) => a.language)).toEqual(["Malayalam", "Hindi", "Tamil"]);
    expect(resolved.audio[1].url).toContain("13e051e0028d6dff24783acf8e2c48da.mp4");
  });

  it("passes season+episode through for TV titles", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return jsonResponse({
          ok: true,
          source: { kind: "mp4", url: "https://bcdnxw.hakunaymatata.com/resource/x.mp4", refUrl: "https://net27.cc/" },
          variants: [{ uri: "https://bcdnxw.hakunaymatata.com/resource/x.mp4", bandwidth: 2500000, height: 720, direct: true }],
          audio: [{ language: "English", url: "https://bcdnxw.hakunaymatata.com/resource/x.mp4" }],
        });
      }),
    );

    await downloadService.resolveNetmirror({ type: "tv", id: "1396", season: 1, episode: 1 });
    expect(capturedBody).toMatchObject({ action: "resolvenetmirror", type: "tv", id: "1396", season: "1", episode: "1" });
  });

  it("surfaces an honest no-source result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "NetMirror stream unavailable", code: "no-source" })),
    );
    await expect(downloadService.resolveNetmirror({ type: "movie", id: "1149791" })).rejects.toMatchObject({
      code: "no-source",
    });
  });
});

describe("downloadService.buildManifest with CineSrc audio", () => {
  it("attaches the audio's fMP4 manifest so saveStream can mux it in", async () => {
    const audio = { groupId: "audio", name: "LINE", language: "en", url: "https://cdn/en.m3u8" };
    let manifestsRequested = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const parsed = JSON.parse(init.body);
        manifestsRequested.push(parsed.playlistUrl);
        if (parsed.playlistUrl === "https://cdn/en.m3u8") {
          return jsonResponse({
            ok: true,
            kind: "fmp4",
            initUrl: "https://cdn/en-init.mp4",
            segments: [{ url: "https://cdn/en0.m4s" }],
            count: 1,
            duration: 6,
          });
        }
        return jsonResponse({
          ok: true,
          kind: "fmp4",
          initUrl: "https://cdn/video-init.mp4",
          segments: [{ url: "https://cdn/v0.m4s" }],
          count: 1,
          duration: 6,
        });
      }),
    );

    const manifest = await downloadService.buildManifest(
      { refUrl: "https://cdn/master.m3u8" },
      { uri: "https://cdn/video.m3u8" },
      { audio },
    );

    expect(manifestsRequested).toEqual(["https://cdn/video.m3u8", "https://cdn/en.m3u8"]);
    expect(manifest.audioManifest).toBeDefined();
    expect(manifest.audioManifest.initUrl).toBe("https://cdn/en-init.mp4");
  });

  it("keeps the video manifest and warns when the rendition isn't fMP4", async () => {
    const audio = { groupId: "audio", language: "en", url: "https://cdn/ts-en.m3u8" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const parsed = JSON.parse(init.body);
        if (parsed.playlistUrl === "https://cdn/ts-en.m3u8") {
          return jsonResponse({ ok: true, kind: "ts", initUrl: null, segments: [{ url: "https://cdn/en0.ts" }], count: 1, duration: 6 });
        }
        return jsonResponse({ ok: true, kind: "fmp4", initUrl: "https://cdn/i.mp4", segments: [{ url: "https://cdn/v0.m4s" }], count: 1, duration: 6 });
      }),
    );

    const manifest = await downloadService.buildManifest(
      { refUrl: "https://cdn/master.m3u8" },
      { uri: "https://cdn/video.m3u8" },
      { audio },
    );

    expect(manifest.audioManifest).toBeUndefined();
  });

  it("degrades to a video-only download when the audio rendition fails to fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const parsed = JSON.parse(init.body);
        if (parsed.playlistUrl === "https://cdn/en.m3u8") {
          throw Object.assign(new Error("audio manifest 502"), { code: "manifest-fetch-failed" });
        }
        return jsonResponse({ ok: true, kind: "fmp4", initUrl: "https://cdn/i.mp4", segments: [{ url: "https://cdn/v0.m4s" }], count: 1, duration: 6 });
      }),
    );

    const manifest = await downloadService.buildManifest(
      { refUrl: "https://cdn/master.m3u8" },
      { uri: "https://cdn/video.m3u8" },
      { audio: { language: "en", url: "https://cdn/en.m3u8" } },
    );

    expect(manifest.audioManifest).toBeUndefined();
  });
});

describe("downloadService.saveStream", () => {
  it("writes every chunk to the provided writable and closes it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(bufferResponse([1, 2, 3, 4, 5, 6]));
    vi.stubGlobal("fetch", fetchMock);
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };

    const result = await downloadService.saveStream({
      manifest: {
        kind: "fmp4",
        initUrl: null,
        segments: ["https://cdn/a.m4s", "https://cdn/b.m4s"],
        count: 2,
      },
      source: { refUrl: "https://vidlink.pro/movie/550" },
      baseName: "Fight Club (1999) [1080p]",
      writable,
    });

    expect(result.method).toBe("fs");
    expect(result.bytes).toBe(12);
    expect(result.filename).toBe("Fight Club (1999) [1080p].mp4");
    expect(writable.write).toHaveBeenCalledTimes(2);
    expect(writable.close).toHaveBeenCalledTimes(1);
  });

  it("streams segment downloads through the Cloudflare proxy relay when configured", async () => {
    const SEGMENT = "https://cdn.example.com/vd/a.m4s";
    const proxyCalls = [];
    const vercelCalls = [];
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const headers = init?.headers || {};
        const to = String(url);
        if (!init?.method && headers.range === "bytes=0-0") {
          // direct probe: the CDN serves no CORS → relay
          return { ok: false, status: 404, headers: { get: () => "" } };
        }
        if (to.includes("workers.dev")) {
          proxyCalls.push({ to, range: headers.range });
          const bytes = new Uint8Array([5, 6, 7]);
          return {
            ok: true,
            status: 206,
            headers: { get: (name) => (name === "content-range" ? "bytes 0-2/3" : null) },
            arrayBuffer: async () => bytes.buffer,
          };
        }
        vercelCalls.push(to);
        return { ok: true, status: 200, headers: { get: () => "application/octet-stream" }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
      }),
    );
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };

    const result = await downloadService.saveStream({
      manifest: { kind: "fmp4", initUrl: null, segments: [SEGMENT], count: 1 },
      source: { refUrl: "https://vidcore.io/" },
      baseName: "Proxy Movie",
      writable,
    });

    expect(result.bytes).toBe(3);
    // ONE proxy request per segment (whole-fragment 60MB slice) — no Vercel.
    expect(proxyCalls.length).toBe(1);
    expect(proxyCalls[0].to).toBe(
      `https://streamly-proxy.nashidk1999.workers.dev?url=${encodeURIComponent(SEGMENT)}`,
    );
    expect(proxyCalls[0].range).toBe(`bytes=0-${60 * 1024 * 1024 - 1}`);
    expect(vercelCalls.length).toBe(0);
    const written = writable.write.mock.calls.map(([chunk]) => Array.from(chunk));
    expect(written).toEqual([[5, 6, 7]]);
  });

  it("falls back to Vercel for downloads when the proxy is down", async () => {
    const SEGMENT = "https://cdn.example.com/vd/a.m4s";
    const vercelBodies = [];
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const headers = init?.headers || {};
        const to = String(url);
        if (!init?.method && headers.range === "bytes=0-0") {
          return { ok: false, status: 404, headers: { get: () => "" } };
        }
        if (to.includes("workers.dev")) {
          return { ok: false, status: 503, headers: { get: () => null }, body: { cancel: async () => {} } };
        }
        vercelBodies.push(JSON.parse(init.body));
        return { ok: true, status: 200, headers: { get: () => "application/octet-stream" }, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
      }),
    );
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };

    const result = await downloadService.saveStream({
      manifest: { kind: "fmp4", initUrl: null, segments: [SEGMENT], count: 1 },
      source: { refUrl: "https://vidcore.io/" },
      baseName: "Fallback Movie",
      writable,
    });

    // The dead proxy cascaded to the Vercel function, re-sliced at the 3.5MB
    // serverless cap — the download survives a broken proxy deploy.
    expect(vercelBodies.length).toBe(1);
    expect(vercelBodies[0].range.max).toBe(3.5 * 1024 * 1024);
    expect(result.bytes).toBe(3);
    const written = writable.write.mock.calls.map(([chunk]) => Array.from(chunk));
    expect(written).toEqual([[1, 2, 3]]);
  });

  it("falls back to an <a download> click when no save picker exists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(bufferResponse([9, 9]));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    const result = await downloadService.saveStream({
      manifest: { kind: "ts", initUrl: null, segments: ["https://cdn/a.ts"], count: 1 },
      source: { refUrl: "https://vidlink.pro/movie/550" },
      baseName: "Episode",
    });

    expect(result.method).toBe("blob");
    expect(result.filename).toBe("Episode.ts");
    expect(clickSpy).toHaveBeenCalled();
  });

  it("mode:'browser' never opens the save picker and uses the <a download> path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(bufferResponse([1, 2, 3]));
    vi.stubGlobal("fetch", fetchMock);
    const pickSpy = vi.fn();
    window.showSaveFilePicker = pickSpy;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const writable = { write: vi.fn(), close: vi.fn() };

    const result = await downloadService.saveStream({
      manifest: { kind: "fmp4", initUrl: null, segments: ["https://cdn/a.m4s"], count: 1 },
      source: { refUrl: "https://vidlink.pro/movie/550" },
      baseName: "Alien",
      writable,
      mode: "browser",
    });

    expect(result.method).toBe("blob");
    expect(result.filename).toBe("Alien.mp4");
    expect(clickSpy).toHaveBeenCalled();
    expect(pickSpy).not.toHaveBeenCalled();
    expect(writable.write).not.toHaveBeenCalled();
  });

  it("fetches segments concurrently but writes them in order", async () => {
    // Slow first segment, fast second: segment B is fetched (and buffered)
    // while A is still in flight, but bytes hit the writer strictly in order.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      if (init?.method === "POST") {
        const parsed = JSON.parse(init.body);
        if (String(parsed.url).endsWith("/a.m4s")) {
          await sleep(30);
          return bufferResponse([1]);
        }
        return bufferResponse([2, 2]);
      }
      // Direct probe: not CORS-enabled, so fall back to the relay.
      return { ok: false, status: 404, headers: { get: () => "" } };
    });
    vi.stubGlobal("fetch", fetchMock);
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };

    await downloadService.saveStream({
      manifest: { kind: "fmp4", initUrl: null, segments: ["https://cdn/a.m4s", "https://cdn/b.m4s"], count: 2 },
      source: { refUrl: "https://vidlink.pro/movie/550" },
      baseName: "Order",
      writable,
    });

    const written = writable.write.mock.calls.map(([chunk]) => Array.from(chunk));
    expect(written).toEqual([[1], [2, 2]]);
    expect(fetchMock).toHaveBeenCalledTimes(3); // probe + relay(a) + relay(b)
  });

  it("reports network-arrival speed, not the disk-write burst", async () => {
    // Segment A is slow to arrive (50ms), segment B arrives instantly. Both
    // are flushed to the writer in one go — so a delta measured between
    // _write_ events would read like disk speed (hundreds of MB/s). The
    // reported speed must instead reflect the bytes arriving at network pace.
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const segmentResponse = (bytes, more) => ({
      ok: true,
      status: 200,
      headers: { get: (h) => (h === "x-streamly-more" ? (more ? "1" : "") : "") },
      arrayBuffer: async () => new Uint8Array(new Array(bytes).fill(7)).buffer,
    });
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      if (!init?.method) return { ok: false, status: 404, headers: { get: () => "" } };
      const parsed = JSON.parse(init.body);
      if (String(parsed.url).endsWith("/a.m4s")) {
        if (parsed.range.start === 0) {
          await sleep(50);
          return segmentResponse(2000, true);
        }
        return segmentResponse(0, false);
      }
      return segmentResponse(2000, false);
    });
    vi.stubGlobal("fetch", fetchMock);
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    const progressCalls = [];
    await downloadService.saveStream({
      manifest: { kind: "fmp4", initUrl: null, segments: ["https://cdn/a.m4s", "https://cdn/b.m4s"], count: 2 },
      source: { refUrl: "https://vidlink.pro/movie/550" },
      baseName: "Speed",
      writable,
      onProgress: (p) => progressCalls.push(p),
    });

    const last = progressCalls[progressCalls.length - 1];
    expect(last.bytes).toBe(4000);
    // 4000 bytes observed across the ~50ms the first segment took to arrive
    // → ~80 KB/s. Anything reading the write-burst delta would be absurdly
    // larger, so bound the assertion well above and below that pace.
    expect(last.speed).toBeGreaterThan(10000);
    expect(last.speed).toBeLessThan(150000);
  });

  it("caches the direct probe per origin instead of re-probing every segment", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      const probeRequest = !init?.method && init?.headers?.range === "bytes=0-0";
      if (probeRequest) {
        return {
          ok: true,
          status: 200,
          headers: {
            get: (h) =>
              h === "access-control-allow-origin" ? "*" :
              h === "content-range" ? "bytes 0-0/100" : "",
          },
          body: null,
          arrayBuffer: async () => new Uint8Array([0]).buffer,
        };
      }
      // Direct segment body (no streaming reader head available in jsdom).
      return {
        ok: true,
        status: 200,
        headers: { get: () => "" },
        body: null,
        arrayBuffer: async () => new Uint8Array([7, 8]).buffer,
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };

    await downloadService.saveStream({
      manifest: { kind: "fmp4", initUrl: null, segments: ["https://cdn/a.m4s", "https://cdn/b.m4s"], count: 2 },
      source: { refUrl: "https://vidlink.pro/movie/550" },
      baseName: "Probe",
      writable,
    });

    // One probe for the origin + one direct fetch per segment, no re-probes.
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("reports downloaded bytes live (throttled), not only at segment boundaries", async () => {
    // A whole-file direct stream used to report ONCE at 100% — the "x / y MB"
    // readout froze for the entire download while speed stayed current. With a
    // byte-level throttle the readout must move as chunks arrive.
    vi.useFakeTimers();
    try {
      const chunkBytes = [2, 2, 2, 3]; // totals 9 → totalBytes 9
      let chunkIndex = 0;
      // Each chunk arrives 400ms apart — PAST the 250ms throttle window — so
      // the file is still mid-flight when live ticks are expected.
      const delivery = () =>
        new Promise((resolve) => setTimeout(resolve, 400)); // fake-timer paced
      const body = new ReadableStream({
        async pull(controller) {
          if (chunkIndex >= chunkBytes.length) {
            controller.close();
            return;
          }
          if (chunkIndex > 0) await delivery(); // first chunk arrives on probe resume
          controller.enqueue(new Uint8Array(new Array(chunkBytes[chunkIndex]).fill(1)));
          chunkIndex += 1;
        },
      });
      const fetchMock = vi.fn().mockImplementation(async (url, init) => {
        if (!init?.method && init?.headers?.range === "bytes=0-0") {
          return {
            ok: true,
            status: 200,
            headers: {
              get: (h) =>
                h === "access-control-allow-origin" ? "*" :
                h === "content-range" ? "bytes 0-0/9" : "",
            },
            body: null,
            arrayBuffer: async () => new Uint8Array([0]).buffer,
          };
        }
        return { ok: true, status: 200, headers: { get: () => "" }, body, arrayBuffer: async () => new Uint8Array().buffer };
      });
      vi.stubGlobal("fetch", fetchMock);
      const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
      const progressCalls = [];
      const promise = downloadService.saveStream({
        manifest: { kind: "fmp4", initUrl: null, segments: ["https://cdn/movie.mp4"], count: 1 },
        source: { refUrl: "https://vidcore.io/" },
        baseName: "Live Progress",
        writable,
        totalBytes: 9,
        onProgress: (p) => progressCalls.push(p),
      });

      // Pace the stream through fake timers while the throttled reporter ticks.
      for (let i = 0; i < 14; i += 1) {
        await vi.advanceTimersByTimeAsync(250);
      }
      const result = await promise;
      expect(result.bytes).toBe(9);

      // Live reports appeared BETWEEN segment boundaries with growing bytes…
      const liveBytes = progressCalls.slice(0, -1).map((p) => p.bytes);
      expect(liveBytes.length).toBeGreaterThan(1);
      expect(Math.max(...liveBytes)).toBeLessThan(9);
      // …and the final boundary report still caps at 100%.
      expect(progressCalls[progressCalls.length - 1].ratio).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("pauses between segments until resumed, then keeps saving", async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      if (!init?.method) return { ok: false, status: 404, headers: { get: () => "" } };
      return bufferResponse([3, 3]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };

    const gate = createPauseController();
    gate.pause();

    const promise = downloadService.saveStream({
      manifest: { kind: "fmp4", initUrl: null, segments: ["https://cdn/a.m4s", "https://cdn/b.m4s"], count: 2 },
      source: { refUrl: "https://vidlink.pro/movie/550" },
      baseName: "Paused",
      writable,
      pause: gate,
    });

    // While paused the worker loops must not pull a single segment.
    await sleep(20);
    const segmentCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(segmentCalls.length).toBe(0);

    gate.resume();
    const result = await promise;
    expect(result.bytes).toBe(4);
    expect(writable.write).toHaveBeenCalledTimes(2);
    expect(writable.close).toHaveBeenCalledTimes(1);
  });

  it("re-mints once when a CineSrc token expires mid-file and resumes in place", async () => {
    // First mint: token dies between segments; the relay 502s with
    // code:"segment-fetch-failed". saveStream must re-mint exactly once and
    // pick up AT the failed segment — bytes already written stay put.
    // (Direct probe is deliberately not CORS-capable so every fetch hits the
    // relay and carries the fresh refUrl from the latest mint.)
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const refresh = vi.fn().mockImplementation(async () => {
      await sleep(10);
      return {
        source: { refUrl: "https://cinesrc.st/fresh-mint" },
        manifest: { kind: "fmp4", initUrl: null, segments: ["https://cdn/a.m4s", "https://cdn/b.m4s"], count: 2 },
      };
    });
    const writeCalls = [];
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      if (!init?.method) return { ok: false, status: 404, headers: { get: () => "" } };
      const parsed = JSON.parse(init.body);
      // Every segment with the STALE token is refused by the upstream…
      if (parsed.refUrl === "https://cinesrc.st/initial") {
        return relayError("segment-fetch-failed", "upstream refused segment");
      }
      // …but they stream fine once re-minted.
      const bytes = String(parsed.url).endsWith("/a.m4s") ? [1] : [2, 2];
      writeCalls.push({ url: parsed.url, refUrl: parsed.refUrl, bytes });
      return bufferResponse(bytes);
    });
    vi.stubGlobal("fetch", fetchMock);
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };

    const result = await downloadService.saveStream({
      manifest: { kind: "fmp4", initUrl: null, segments: ["https://cdn/a.m4s", "https://cdn/b.m4s"], count: 2 },
      source: { refUrl: "https://cinesrc.st/initial" },
      baseName: "Resume",
      writable,
      refresh,
    });

    // Concurrent workers sharing one expired token must trigger ONE re-mint.
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.bytes).toBe(3);
    expect(result.filename).toBe("Resume.mp4");
    // Both segments went through the re-minted source; nothing restarted.
    expect(writeCalls.map(({ url }) => url).toSorted()).toEqual(
      ["https://cdn/a.m4s", "https://cdn/b.m4s"].toSorted(),
    );
    for (const call of writeCalls) expect(call.refUrl).toBe("https://cinesrc.st/fresh-mint");
    expect(writable.close).toHaveBeenCalledTimes(1);
  });

  it("stops re-minting after the budget and surfaces the token error", async () => {
    // refresh returns a DIFFERENT but still-stale token; saveStream is bounded
    // (MAX_TOKEN_REFRESHES) and must reject with the relay's code, not loop.
    let minted = 0;
    const refresh = vi.fn().mockImplementation(async () => {
      minted += 1;
      return {
        source: { refUrl: `https://cinesrc.st/mint-${minted}` },
        manifest: { kind: "fmp4", initUrl: null, segments: ["https://cdn/a.m4s", "https://cdn/b.m4s"], count: 2 },
      };
    });
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      if (!init?.method) return { ok: false, status: 404, headers: { get: () => "" } };
      return relayError("segment-fetch-failed", "upstream refused segment");
    });
    vi.stubGlobal("fetch", fetchMock);
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };

    await expect(
      downloadService.saveStream({
        manifest: { kind: "fmp4", initUrl: null, segments: ["https://cdn/a.m4s"], count: 1 },
        source: { refUrl: "https://cinesrc.st/initial" },
        baseName: "Budget",
        writable,
        refresh,
      }),
    ).rejects.toMatchObject({ code: "segment-fetch-failed" });

    // Budget of 2 refreshes max, plus the initial attempt.
    expect(refresh).toHaveBeenCalledTimes(2);
    const relayCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(relayCalls.length).toBe(3); // initial + after refresh 1 + after refresh 2
    expect(writable.close).not.toHaveBeenCalled();
  });

  it("muxes the audio rendition into the file when both streams are fMP4", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      if (!init?.method) return { ok: false, status: 404, headers: { get: () => "" } };
      const parsed = JSON.parse(init.body);
      const p = parsed.url;
      if (p.endsWith("video-init")) return bufferResponse([11, 11]);
      if (p.endsWith("audio-init")) return bufferResponse([7, 7]);
      if (p.endsWith("/v0")) return bufferResponse([1]);
      if (p.endsWith("/v1")) return bufferResponse([2]);
      if (p.endsWith("/a0")) return bufferResponse([3]);
      if (p.endsWith("/a1")) return bufferResponse([4]);
      return bufferResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };
    const manifest = {
      kind: "fmp4",
      initUrl: "https://cdn/x.mp4/video-init",
      segments: ["https://cdn/x.mp4/v0", "https://cdn/x.mp4/v1"],
      count: 2,
    };
    manifest.audioManifest = {
      kind: "fmp4",
      initUrl: "https://cdn/x.mp4/audio-init",
      segments: ["https://cdn/x.mp4/a0", "https://cdn/x.mp4/a1"],
      count: 2,
    };

    await downloadService.saveStream({
      manifest,
      source: { refUrl: "https://cdn/master.m3u8" },
      baseName: "Muxed",
      writable,
    });

    // Both inits merged once into a single header, then every segment pair.
    expect(fmp4Muxer.buildMuxedInit).toHaveBeenCalledTimes(1);
    const [videoInit, audioInit] = fmp4Muxer.buildMuxedInit.mock.calls[0];
    expect(Array.from(videoInit)).toEqual([11, 11]);
    expect(Array.from(audioInit)).toEqual([7, 7]);
    expect(fmp4Muxer.muxSegment).toHaveBeenCalledTimes(2);
    for (const [, , trackId] of fmp4Muxer.muxSegment.mock.calls) expect(trackId).toBe(2);
    const written = writable.write.mock.calls.map(([chunk]) => Array.from(chunk));
    expect(written[0]).toEqual([9, 9, 9]); // muxed init written first
    expect(written[1]).toEqual([100, 2, 1, 3]); // seg0: marker, trackId, video, audio
    expect(written[2]).toEqual([100, 2, 2, 4]); // seg1
    expect(writable.close).toHaveBeenCalledTimes(1);
  });

  it("swaps the audio rendition lists onto the fresh mint when it resumes in place", async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const refresh = vi.fn().mockImplementation(async () => {
      await sleep(10);
      return {
        source: { refUrl: "https://cinesrc.st/fresh-mint" },
        manifest: {
          kind: "fmp4",
          initUrl: "https://cdn/x.mp4/video-init-2",
          segments: ["https://cdn/x.mp4/v2"],
          count: 1,
          audioManifest: {
            kind: "fmp4",
            initUrl: "https://cdn/x.mp4/audio-init-2",
            segments: ["https://cdn/x.mp4/a2"],
            count: 1,
          },
        },
      };
    });
    const audioUrlsSeen = [];
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      if (!init?.method) return { ok: false, status: 404, headers: { get: () => "" } };
      const parsed = JSON.parse(init.body);
      const p = parsed.url;
      if (p.endsWith("video-init") || p.endsWith("video-init-2")) return bufferResponse([11]);
      if (p.endsWith("audio-init") || p.endsWith("audio-init-2")) return bufferResponse([7]);
      // The stale token refuses every SEGMENT (video or audio) until re-minted.
      if (parsed.refUrl === "https://cinesrc.st/initial") {
        return relayError("segment-fetch-failed", "stale token");
      }
      if (p.endsWith("/a2")) {
        audioUrlsSeen.push(p);
        return bufferResponse([9]);
      }
      if (p.endsWith("/v2")) { return bufferResponse([1]); }
      if (p.endsWith("/a0")) { audioUrlsSeen.push(p); return bufferResponse([8]); }
      if (p.endsWith("/v0")) { return bufferResponse([2]); }
      return bufferResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };

    const result = await downloadService.saveStream({
      manifest: {
        kind: "fmp4",
        initUrl: "https://cdn/x.mp4/video-init",
        segments: ["https://cdn/x.mp4/v0"],
        count: 1,
        audioManifest: {
          kind: "fmp4",
          initUrl: "https://cdn/x.mp4/audio-init",
          segments: ["https://cdn/x.mp4/a0"],
          count: 1,
        },
      },
      source: { refUrl: "https://cinesrc.st/initial" },
      baseName: "AudioRefresh",
      writable,
      refresh,
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.bytes).toBeGreaterThan(0);
    // The segment that 403'd was retried via the freshened audio list, and the
    // audio bytes (9 from /a2, not the stale 8 from /a0) ended up in the file.
    expect(audioUrlsSeen).not.toContain("https://cdn/x.mp4/a0");
    expect(audioUrlsSeen).toContain("https://cdn/x.mp4/a2");
    expect(writable.close).toHaveBeenCalledTimes(1);
  });
});

describe("downloadService.fetchPlaylistText", () => {
  it("posts the playlist action and returns the raw m3u8 text", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/vnd.apple.mpegurl" },
          text: async () => "#EXTM3U\n#EXT-X-VERSION:3\n",
        };
      }),
    );

    const text = await downloadService.fetchPlaylistText(
      "https://moon.quietridge.top/vd/x/index-s2160p-v1-a1.m3u8",
      "https://vidcore.io/",
    );

    expect(capturedBody).toMatchObject({
      action: "playlist",
      playlistUrl: "https://moon.quietridge.top/vd/x/index-s2160p-v1-a1.m3u8",
      refUrl: "https://vidcore.io/",
    });
    expect(text).toContain("#EXTM3U");
  });

  it("surfaces the relay's real code when the playlist fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(relayError("manifest-fetch-failed", "Playlist fetch failed: Upstream 403")),
    );
    await expect(
      downloadService.fetchPlaylistText("https://cdn/x.m3u8", "https://vidcore.io/"),
    ).rejects.toMatchObject({ code: "manifest-fetch-failed" });
  });
});
