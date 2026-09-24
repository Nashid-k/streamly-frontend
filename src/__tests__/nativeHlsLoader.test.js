import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearProbeCache,
  createStreamlyLoader,
  probeDirectOrigin,
} from "../api/nativeHlsLoader";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearProbeCache();
});

function rangeOkResponse() {
  return {
    ok: true,
    status: 206,
    headers: {
      get: (name) => {
        if (name === "access-control-allow-origin") return "*";
        if (name === "content-range") return "bytes 0-0/4136495";
        return null;
      },
    },
    body: { cancel: async () => {} },
  };
}

describe("probeDirectOrigin", () => {
  it("reports direct-capable when CORS is open and Range answers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(rangeOkResponse()));
    const probe = await probeDirectOrigin("https://paperorbit.top/vd/x/seg-1.m4s");
    expect(probe.ok).toBe(true);
  });

  it("reports not-direct when CORS is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 206,
        headers: { get: () => null },
        body: { cancel: async () => {} },
      }),
    );
    const probe = await probeDirectOrigin("https://vidzen.fun/api/stream/x");
    expect(probe.ok).toBe(false);
  });

  it("caches the probe per origin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(rangeOkResponse());
    vi.stubGlobal("fetch", fetchMock);
    await probeDirectOrigin("https://paperorbit.top/vd/x/a.m4s");
    await probeDirectOrigin("https://paperorbit.top/vd/x/b.m4s");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("createStreamlyLoader", () => {
  it("loads playlists through the relay and answers with the original URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => "application/vnd.apple.mpegurl" },
        text: async () => "#EXTM3U\n#EXT-X-VERSION:3\n",
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();
    const response = await new Promise((resolve, reject) => {
      loader.load(
        { url: "https://moon.quietridge.top/vd/x/index-s2160p-v1-a1.m3u8" },
        {},
        {
          onSuccess: (resp) => resolve(resp),
          onError: (err) => reject(new Error(err.text)),
        },
      );
    });
    // Relative playlist URLs must keep resolving against the upstream host,
    // never the relay endpoint.
    expect(response.url).toBe("https://moon.quietridge.top/vd/x/index-s2160p-v1-a1.m3u8");
    expect(response.data).toContain("#EXTM3U");
  });

  it("loads fragments direct when the probe passes", async () => {
    const bytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (init?.headers?.range) return rangeOkResponse();
        return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => bytes };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();
    const response = await new Promise((resolve, reject) => {
      loader.load(
        { url: "https://paperorbit.top/vd/x/seg-1.m4s", frag: { sn: 1 } },
        {},
        {
          onSuccess: (resp) => resolve(resp),
          onError: (err) => reject(new Error(err.text)),
        },
      );
    });
    expect(response.data.byteLength).toBe(8);
  });

  it("falls back to the relay when direct fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (init?.headers?.range) {
          return { ok: true, status: 206, headers: { get: () => null }, body: { cancel: async () => {} } };
        }
        if (typeof url === "string" && url.includes("downloadify")) {
          return {
            ok: true,
            status: 200,
            headers: { get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream") },
            arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
          };
        }
        return { ok: false, status: 403, headers: { get: () => null } };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();
    const response = await new Promise((resolve, reject) => {
      loader.load(
        { url: "https://cdn.example.com/seg-1.m4s", frag: { sn: 1 } },
        {},
        {
          onSuccess: (resp) => resolve(resp),
          onError: (err) => reject(new Error(err.text)),
        },
      );
    });
    expect(response.data.byteLength).toBe(4);
  });
});
