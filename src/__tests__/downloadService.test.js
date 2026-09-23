import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadService } from "../api/downloadService";

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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("downloadService.resolveDownload", () => {
  it("labels the variants the resolver reports", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://cdn/master.m3u8" },
          variants: [
            { uri: "https://cdn/4k.m3u8", bandwidth: 16000000, width: 3840, height: 2160, hdr: true },
            { uri: "https://cdn/1080.m3u8", bandwidth: 8000000, width: 1920, height: 1080, hdr: false },
          ],
        }),
      ),
    );

    const { variants } = await downloadService.resolveDownload("https://vidlink.pro/movie/550");
    expect(variants.map((v) => v.label)).toEqual(["4K HDR", "1080p"]);
    expect(variants[0].index).toBe(0);
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
    await expect(downloadService.resolveDownload("https://vidlink.pro/movie/550")).rejects.toMatchObject({
      code: "offline",
    });
  });

  it("surfaces the resolver's no-source result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "No downloadable stream found", code: "no-source" })),
    );
    await expect(downloadService.resolveDownload("https://vidlink.pro/movie/550")).rejects.toMatchObject({
      code: "no-source",
    });
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
});
