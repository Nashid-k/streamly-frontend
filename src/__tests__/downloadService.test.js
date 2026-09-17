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
    expect(result.bytes).toBe(6);
    expect(result.filename).toBe("Fight Club (1999) [1080p].mp4");
    expect(writable.write).toHaveBeenCalledTimes(1);
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
});
