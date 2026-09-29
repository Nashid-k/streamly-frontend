import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadService, createPauseController } from "../api/downloadService";

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

  it("passes season+episode through for TV titles", async () => {
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

  it("labels phase + upgrade metadata: a vidzen fast win carries upgradeable", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://vidzen.fun/api/stream/v1_zen", refUrl: "https://vidcore.io/" },
          variants: [{ uri: "https://vidzen.fun/api/stream/v1_zen", bandwidth: 2500000, height: 800 }],
          ladderSource: "vidzen",
          upgradeable: true,
        });
      }),
    );

    const resolved = await downloadService.resolveVidcore({ type: "movie", id: "603" }, { phase: "fast" });
    expect(capturedBody.phase).toBe("fast");
    expect(resolved.upgradeable).toBe(true);
    expect(resolved.ladderSource).toBe("vidzen");
  });

  it("re-asks once with phase:full when the fast pass is ladder-pending", async () => {
    const bodies = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        bodies.push(JSON.parse(init.body));
        if (bodies.length === 1) {
          return jsonResponse({ ok: false, error: "VidCore is still aggregating sources", code: "ladder-pending" });
        }
        return jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://api.dlproxy.com/v1/play/master.m3u8", refUrl: "https://vidcore.io/" },
          variants: [
            { uri: "https://api.dlproxy.com/v1/play/master.m3u8", bandwidth: 0, height: 0 },
            { uri: "https://api.dlproxy.com/v1/play/1080.m3u8", bandwidth: 6000000, height: 1080 },
          ],
          ladderSource: "vidrack",
        });
      }),
    );

    const resolved = await downloadService.resolveVidcore({ type: "movie", id: "603" });
    expect(bodies[0].phase).toBeUndefined();
    expect(bodies[1].phase).toBe("full");
    expect(resolved.variants).toHaveLength(2);
    expect(resolved.ladderSource).toBe("vidrack");
  });

  it("maps a failed full retry to no-source so rotation continues", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        n += 1;
        if (n === 1) return jsonResponse({ ok: false, code: "ladder-pending", error: "pending" });
        return jsonResponse({ ok: false, code: "no-upgrade", error: "VidCore full ladder unavailable" });
      }),
    );

    await expect(downloadService.resolveVidcore({ type: "movie", id: "603" })).rejects.toMatchObject({
      code: "no-source",
    });
  });
});

describe("downloadService.resolveNhd", () => {
  it("carries the sibling-URL dub audioTracks through to the player", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://nhdapi.streamfinder.st/api/hls?t=abc", refUrl: "" },
          variants: [{ uri: "https://nhdapi.streamfinder.st/api/hls?t=abc", bandwidth: 0, height: 0 }],
          provider: "meowtvru",
          audioTracks: [
            { label: "Original", uri: "https://nhdapi.streamfinder.st/api/hls?t=abc" },
            { label: "Hindi", uri: "https://nhdapi.streamfinder.st/api/hls?t=def" },
            { label: "Telugu", uri: "https://nhdapi.streamfinder.st/api/hls?t=ghi" },
          ],
        }),
      ),
    );

    const resolved = await downloadService.resolveNhd({ type: "movie", id: "579974" });
    // NHD serves ONE unlabeled rung (height 0 -> the honest "Auto" label), so the
    // ladder is not the interesting part — the dub list is.
    expect(resolved.variants.map((v) => v.label)).toEqual(["Auto"]);
    expect(resolved.audioTracks.map((t) => t.label)).toEqual(["Original", "Hindi", "Telugu"]);
    expect(resolved.audioTracks[1]).toEqual({
      label: "Hindi",
      uri: "https://nhdapi.streamfinder.st/api/hls?t=def",
    });
  });

  it("passes season+episode through for TV and drops dub-less extractions to an empty list", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://nhdapi.streamfinder.st/api/hls?t=tv", refUrl: "" },
          variants: [{ uri: "https://nhdapi.streamfinder.st/api/hls?t=tv", bandwidth: 0 }],
        });
      }),
    );

    const resolved = await downloadService.resolveNhd({ type: "tv", id: "1399", season: 2, episode: 3 });
    expect(capturedBody).toMatchObject({ action: "resolvenhd", type: "tv", id: "1399", season: "2", episode: "3" });
    expect(resolved.audioTracks).toEqual([]);
  });

  it("surfaces an honest no-source result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "No downloadable stream found via NHD", code: "no-source" })),
    );
    await expect(downloadService.resolveNhd({ type: "movie", id: "550" })).rejects.toMatchObject({
      code: "no-source",
    });
  });
});

describe("downloadService.resolveZxc", () => {
  it("sends the chosen server so each ZXC row targets its own backend", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return jsonResponse({
          ok: true,
          source: {
            kind: "hls",
            url: "https://vidstuck.xyz/backend/servers/centaurus?zx=streamly",
            refUrl: "https://vidstuck.xyz/embed/movie/1101383",
            multiLevelMaster: true,
          },
          variants: [
            { uri: "https://vidstuck.xyz/backend/servers/centaurus?zv=media&zr=0", bandwidth: 2200000, width: 2592, height: 1080 },
            { uri: "https://vidstuck.xyz/backend/servers/centaurus?zv=media&zr=1", bandwidth: 1000000, width: 1728, height: 720 },
          ],
          server: "centaurus",
          audioTracks: [
            { label: "Original Audio", uri: "https://vidstuck.xyz/backend/servers/centaurus?zv=master&zd=en" },
            { label: "French dub", uri: "https://vidstuck.xyz/backend/servers/centaurus?zv=master&zd=fr" },
          ],
        });
      }),
    );

    const resolved = await downloadService.resolveZxc({ type: "movie", id: "1101383", server: "centaurus" });
    expect(capturedBody).toMatchObject({
      action: "resolvezxc",
      type: "movie",
      id: "1101383",
      server: "centaurus",
    });
    // A DASH ladder must keep multiLevelMaster so hls.js does ABR + mux itself.
    expect(resolved.source.multiLevelMaster).toBe(true);
    expect(resolved.variants.map((v) => v.height)).toEqual([1080, 720]);
    expect(resolved.audioTracks.map((t) => t.label)).toEqual(["Original Audio", "French dub"]);
  });

  it("carries season+episode for TV", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://vidstuck.xyz/x", refUrl: "" },
          variants: [{ uri: "https://vidstuck.xyz/x", bandwidth: 0 }],
        });
      }),
    );
    await downloadService.resolveZxc({ type: "tv", id: "1399", season: 2, episode: 3, server: "atlas" });
    expect(capturedBody).toMatchObject({ server: "atlas", type: "tv", id: "1399", season: "2", episode: "3" });
  });

  it("keeps a single-rung HLS server as an honest Auto entry with no fake ladder", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://vidstuck.xyz/backend/servers/atlas/edge?url=x", refUrl: "" },
          variants: [{ uri: "https://vidstuck.xyz/backend/servers/atlas/edge?url=x", bandwidth: 0, width: 0, height: 0 }],
          server: "atlas",
          audioTracks: [],
        }),
      ),
    );
    const resolved = await downloadService.resolveZxc({ type: "movie", id: "1101383", server: "atlas" });
    expect(resolved.variants.map((v) => v.label)).toEqual(["Auto"]);
    expect(resolved.source.multiLevelMaster).toBeUndefined();
    expect(resolved.audioTracks).toEqual([]);
  });

  it("surfaces an honest no-source result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "ZXC atlas has no source", code: "no-source" })),
    );
    await expect(
      downloadService.resolveZxc({ type: "movie", id: "550", server: "atlas" }),
    ).rejects.toMatchObject({ code: "no-source" });
  });
});

describe("downloadService.buildManifest", () => {
  it("posts the manifest action with the source referer and returns the segment list", async () => {
    let capturedBody = null;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return jsonResponse({
          ok: true,
          kind: "fmp4",
          initUrl: "https://cdn/i.mp4",
          segments: ["https://cdn/v0.m4s", "https://cdn/v1.m4s"],
          count: 2,
          duration: 12,
        });
      }),
    );

    const manifest = await downloadService.buildManifest(
      { refUrl: "https://vidcore.io/" },
      { uri: "https://cdn/video.m3u8" },
    );

    expect(capturedBody).toEqual({
      action: "manifest",
      playlistUrl: "https://cdn/video.m3u8",
      refUrl: "https://vidcore.io/",
    });
    expect(manifest.segments).toEqual(["https://cdn/v0.m4s", "https://cdn/v1.m4s"]);
    expect(manifest.count).toBe(2);
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
      `https://streamly-proxy.nashidk1999.workers.dev?url=${encodeURIComponent(SEGMENT)}&referer=${encodeURIComponent("https://vidcore.io/")}`,
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

  it("never probes referer-gated CDN hosts bare — every byte rides the relay", async () => {
    // VidCore's rotation-2 segment CDNs (grandpearl/wisehive) 403 a bare
    // browser fetch and a burst of probes trips their WAF. probeDirect must
    // skip them entirely so the download goes straight to the proxy (which
    // carries the source's referer) / Vercel.
    const SEGMENT = "https://grandpearl.top/vd/tok/seg-1-s1080p-v1-a1.m4s";
    const bareCalls = [];
    const proxyCalls = [];
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const to = String(url);
        // The proxy URL carries the gated host as its ?url= param, so test the
        // worker match FIRST — only a BARE origin hit lands in bareCalls.
        if (to.startsWith("https://grandpearl.top")) {
          // A BARE hit on the gated origin — the exact thing that must never
          // happen again. Record it; the assertions below fail if nonempty.
          bareCalls.push({ to, range: init?.headers?.range });
          return { ok: false, status: 403, headers: { get: () => "" } };
        }
        if (to.includes("workers.dev")) {
          proxyCalls.push({ to, range: init?.headers?.range });
          return {
            ok: true,
            status: 206,
            headers: { get: (name) => (name === "content-range" ? "bytes 0-2/3" : null) },
            arrayBuffer: async () => new Uint8Array([5, 6, 7]).buffer,
          };
        }
        return { ok: true, status: 200, headers: { get: () => "application/octet-stream" }, arrayBuffer: async () => new Uint8Array([1]).buffer };
      }),
    );
    const writable = { write: vi.fn().mockResolvedValue(undefined), close: vi.fn().mockResolvedValue(undefined) };

    const result = await downloadService.saveStream({
      manifest: { kind: "fmp4", initUrl: null, segments: [SEGMENT], count: 1 },
      source: { refUrl: "https://vidcore.io/" },
      baseName: "Gated Movie",
      writable,
    });

    expect(result.bytes).toBe(3);
    // Not a single bare request to the gated origin (no Range probe, no GET).
    expect(bareCalls.length).toBe(0);
    expect(proxyCalls.length).toBe(1);
    expect(proxyCalls[0].to).toContain(`referer=${encodeURIComponent("https://vidcore.io/")}`);
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
