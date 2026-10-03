import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDirectBlocks,
  clearPlaylistMemo,
  clearProbeCache,
  createStreamlyLoader,
  isRefererGated,
  probeDirectOrigin,
  probeSourcePlayable,
} from "../api/nativeHlsLoader";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
  clearProbeCache();
  clearDirectBlocks();
  clearPlaylistMemo();
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

  it("does not cache an aborted probe as a permanent 'not direct' verdict", async () => {
    // First probe runs against a load that then gets aborted — and the probe
    // shares that load's signal. It must not poison the per-origin cache,
    // or every later fragment rides the Vercel relay for the whole session
    // even though the CDN serves CORS happily.
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener?.("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        }),
      )
      .mockImplementationOnce(async () => rangeOkResponse());
    vi.stubGlobal("fetch", fetchMock);

    const controller = new AbortController();
    const first = probeDirectOrigin("https://paperorbit.top/vd/x/a.m4s", { signal: controller.signal });
    await Promise.resolve();
    controller.abort();
    const firstResult = await first;
    expect(firstResult.ok).toBe(false);
    fetchMock.mockClear();

    // A later load of the same origin re-probes instead of inheriting the
    // aborted { ok:false } verdict.
    const second = await probeDirectOrigin("https://paperorbit.top/vd/x/b.m4s");
    expect(second.ok).toBe(true);
  });
});

describe("isRefererGated", () => {
  it("flags VidCore's referer-gated CDN hosts (manifest + segment)", () => {
    expect(isRefererGated("https://moon.quietridge.top/vd/x/index-s1080p-v1-a1.m3u8")).toBe(true);
    expect(isRefererGated("https://palehive.top/vd/x/seg-1-s1080p-v1-a1.m4s")).toBe(true);
    expect(isRefererGated("https://sub.quietridge.top/vd/x/init-s720p-v1-a1.mp4")).toBe(true);
    // VidCore rotates its segment CDN — the 2026-09 rotation-2 hosts 403 a
    // bare fetch exactly like the originals (user console log).
    expect(isRefererGated("https://grandpearl.top/vd/x/seg-1-s1080p-v1-a1.m4s")).toBe(true);
    expect(isRefererGated("https://wisehive.top/vd/x/init-s720p-v1-a1.mp4")).toBe(true);
    // rotation-3 (Wild Robot session log): bare init-segment 403.
    expect(isRefererGated("https://hypergate.top/vd/x/init-s720p-v1-a1.mp4")).toBe(true);
    // rotation-4 (live-probed 2026-09): manifests still on moon.quietridge.top
    // now point segments at cybergate.top (TV) / lightgrove.top (movies). Both
    // gate on the browser's Origin header — a bare probe with Origin 403s.
    expect(isRefererGated("https://cybergate.top/vd/x/init-s1080p-v1-a1.mp4")).toBe(true);
    expect(isRefererGated("https://lightgrove.top/vd/x/seg-1-s1080p-v1-a1.m4s")).toBe(true);
  });  it("refuses transport calls with no target URL instead of ?url=undefined at the worker", async () => {
    // A per-quality source missing its variant uri used to reach the worker as
    // ?url=undefined (500 + CORS noise). The loader must fail via onError with
    // a real message so the player's failover runs, and no fetch may leave.
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();
    await expect(
      new Promise((resolve, reject) => {
        loader.load(
          { url: undefined },
          {},
          {
            onSuccess: (resp) => resolve(resp),
            onError: (err) => reject(new Error(err.text)),
          },
        );
      }),
    ).rejects.toThrow(/missing target URL/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves open-CORS hosts untouched", () => {
    expect(isRefererGated("https://paperorbit.top/vd/x/seg-1.m4s")).toBe(false);
    expect(isRefererGated("https://quietnexus.top/vd/x/seg-1.m4s")).toBe(false);
    expect(isRefererGated("https://cdn.example.com/seg-1.m4s")).toBe(false);
    expect(isRefererGated("not-a-url")).toBe(false);
  });
});

// Regression 2026-10-03 (Reacher tv 108978 s1e1): every ZXC playlist load hit
// the Cloudflare worker FIRST. A marker URL is not an upstream URL — only
// handlePlaylist can mint the token the provider requires — so the worker
// forwarded it unsigned and vidstuck.xyz answered 400 on the master, the
// media playlist and every reload. The loud 400s were survivable (the loader
// cascaded to /api/downloadify and got real bytes), but the wasted leg still
// cost a second upstream request per playlist against a rate-limited provider,
// so it accelerated the 429 that actually killed the session.
// A 429/503 is a throttle, not a dead source. hls.js re-requests the manifest,
// the level playlist and every audio rendition on a rolling basis, so a single
// refused refresh used to end an otherwise healthy session (and a refused probe
// abandoned the source outright) over a limit that clears on its own.
describe("throttled playlist loads", () => {
  const throttleBody = JSON.stringify({
    ok: false,
    error: "Playlist fetch failed: Upstream 429",
    code: "manifest-fetch-failed",
  });
  const okBody = "#EXTM3U\n#EXTINF:4,\nseg1.m4s\n";

  function throttleThenOk(okStatus = 200) {
    let calls = 0;
    const mock = vi.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 502,
          headers: { get: () => "application/json" },
          text: async () => throttleBody,
        };
      }
      return {
        ok: true,
        status: okStatus,
        headers: { get: () => "application/vnd.apple.mpegurl" },
        text: async () => okBody,
      };
    });
    return mock;
  }

  it("waits, then retries a throttled playlist instead of failing the load", async () => {
    const fetchMock = throttleThenOk();
    vi.stubGlobal("fetch", fetchMock);
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const response = await new Promise((resolve, reject) => {
      new Loader().load(
        { url: "https://vidcore.xyz/hls/master.m3u8" },
        {},
        { onSuccess: (r) => resolve(r), onError: (e) => reject(new Error(e.text)) },
      );
    });
    expect(response.data).toBe(okBody);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("still surfaces the error when the retry is throttled too", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => "application/json" },
      text: async () => throttleBody,
    });
    vi.stubGlobal("fetch", fetchMock);
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    await expect(
      new Promise((resolve, reject) => {
        new Loader().load(
          { url: "https://vidcore.xyz/hls/master.m3u8" },
          {},
          { onSuccess: (r) => resolve(r), onError: (e) => reject(new Error(e.text)) },
        );
      }),
    ).rejects.toThrow(/Upstream 429/);
    // Exactly one retry - never a spin.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a dead-CDN refusal", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => "application/json" },
      text: async () =>
        JSON.stringify({ ok: false, error: "Playlist fetch failed: Upstream 404", code: "manifest-fetch-failed" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    await expect(
      new Promise((resolve, reject) => {
        new Loader().load(
          { url: "https://vidcore.xyz/hls/master.m3u8" },
          {},
          { onSuccess: (r) => resolve(r), onError: (e) => reject(new Error(e.text)) },
        );
      }),
    ).rejects.toThrow(/Upstream 404/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rides out a throttled playability probe instead of dropping the source", async () => {
    const fetchMock = throttleThenOk();
    vi.stubGlobal("fetch", fetchMock);
    // The probe follows master -> media, so a 200 master means the segment sip
    // decides the verdict; the throttle must be spent on the FIRST leg.
    const probe = await probeSourcePlayable("https://vidcore.xyz/hls/master.m3u8", "https://vidcore.io/");
    expect(probe.ok).toBe(true);
  });
});

describe("ZXC replay-marker playlists", () => {
  const MARKER_MASTER =
    "https://vidstuck.xyz/backend/servers/centaurus?title=Reacher&year=2022&season=1&episode=1&zx=streamly&zv=master";
  const MARKER_MEDIA =
    "https://vidstuck.xyz/backend/servers/centaurus?title=Reacher&year=2022&season=1&episode=1&zx=streamly&zv=master&zi=1080";

  async function loadOk(loader, url) {
    return new Promise((resolve, reject) => {
      loader.load(
        { url },
        {},
        {
          onSuccess: (resp) => resolve(resp),
          onError: (err) => reject(new Error(err.text)),
        },
      );
    });
  }

  it("never sends a ZXC marker playlist to the Cloudflare worker", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/vnd.apple.mpegurl" },
      text: async () => "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\n1080.m3u8\n",
    });
    vi.stubGlobal("fetch", fetchMock);
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidstuck.xyz/embed/tv/108978-1-1" });
    await loadOk(new Loader(), MARKER_MASTER);
    // Exactly one leg, and it is our handler.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0];
    expect(String(calledUrl)).not.toContain("workers.dev");
    expect(String(calledUrl)).toContain("/api/downloadify");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      action: "playlist",
      playlistUrl: MARKER_MASTER,
      refUrl: "https://vidstuck.xyz/embed/tv/108978-1-1",
    });
  });

  it("still routes a ZXC media rendition straight to the handler", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => "application/vnd.apple.mpegurl" },
      text: async () => "#EXTM3U\n#EXTINF:4,\nseg1.m4s\n",
    });
    vi.stubGlobal("fetch", fetchMock);
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidstuck.xyz/embed/tv/108978-1-1" });
    await loadOk(new Loader(), MARKER_MEDIA);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("workers.dev");
  });

  it("keeps the worker as the first leg for ordinary (non-marker) playlists", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    const seen = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const to = String(url);
        seen.push(to);
        if (to.includes("workers.dev")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/vnd.apple.mpegurl" },
            text: async () => "#EXTM3U\n#EXTINF:4,\nseg1.m4s\n",
          };
        }
        return { ok: false, status: 500, headers: { get: () => null } };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    await loadOk(new Loader(), "https://vidcore.xyz/hls/master.m3u8");
    // One call, and it is the worker — the marker rule must not narrow the
    // normal path (VidCore and friends still get their off-Vercel leg).
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain("workers.dev");
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
          onSuccess: (resp, stats) => resolve({ resp, stats }),
          onError: (err) => reject(new Error(err.text)),
        },
      );
    });
    // Relative playlist URLs must keep resolving against the upstream host,
    // never the relay endpoint.
    expect(response.resp.url).toBe("https://moon.quietridge.top/vd/x/index-s2160p-v1-a1.m3u8");
    expect(response.resp.data).toContain("#EXTM3U");
    // Regression: hls.js writes stats.parsing.start (and reads
    // stats.loading/buffering) inside its own onSuccess — a partial stats
    // object crashes with "Cannot set properties of undefined (setting
    // 'start')", which is exactly what killed Interstellar playback.
    for (const group of ["loading", "parsing", "buffering"]) {
      expect(response.stats[group]).toBeTypeOf("object");
      expect(response.stats[group].start).toBeTypeOf("number");
    }
    // Regression 2: hls.js fragment-loader grabs `loader.stats` directly
    // (`loader.stats.retry = …; frag.stats = loader.stats`) — it must always
    // be a full shape, never undefined, or every fragment load throws.
    for (const group of ["loading", "parsing", "buffering"]) {
      expect(loader.stats[group]).toBeTypeOf("object");
    }
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

  it("streams progress callbacks while a direct fragment arrives", async () => {
    const chunks = [new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])];
    let reads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (init?.headers?.range) return rangeOkResponse();
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => (name === "content-length" ? "5" : null) },
          body: {
            getReader: () => ({
              read: async () => {
                if (reads < chunks.length) return { done: false, value: chunks[reads++] };
                return { done: true, value: undefined };
              },
            }),
          },
        };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();
    const seen = [];
    const response = await new Promise((resolve, reject) => {
      loader.load(
        { url: "https://paperorbit.top/vd/x/seg-1.m4s", frag: { sn: 1 } },
        {},
        {
          onSuccess: (resp, stats) => resolve({ resp, stats }),
          onError: (err) => reject(new Error(err.text)),
          onProgress: (stats, _ctx, data) => seen.push({ loaded: stats.loaded, chunk: data.length }),
        },
      );
    });
    expect(response.resp.data.byteLength).toBe(5);
    // Progress fired per read with an accumulating loaded count.
    expect(seen.map((s) => s.loaded)).toEqual([2, 5]);
    expect(response.stats.loaded).toBe(5);
    expect(response.stats.total).toBe(5);
  });

  it("tags relay failures with the real code so the player can re-resolve", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (init?.headers?.range) {
          return { ok: true, status: 206, headers: { get: () => null }, body: { cancel: async () => {} } };
        }
        return {
          ok: false,
          status: 502,
          headers: { get: () => "application/json" },
          text: async () => JSON.stringify({ ok: false, code: "segment-fetch-failed", error: "Segment fetch failed: Upstream 403" }),
        };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();
    const err = await new Promise((resolve) => {
      loader.load(
        { url: "https://cdn.example.com/seg-1.m4s", frag: { sn: 1 } },
        {},
        {
          onSuccess: () => resolve(null),
          onError: (e) => resolve(e),
        },
      );
    });
    expect(err.text).toContain("[relay:segment-fetch-failed]");
  });

  it("names an upstream quota refusal (proxy 429 passthrough) in the fragment error", async () => {
    // Live shape, verified 2026-09-29: vidzen's bypass workers answer 429
    // "error code: 1027" (Cloudflare daily quota) with NO CORS headers; the
    // browser logs an opaque CORS error while the relay hands the player the
    // real 429. The error text must say WHAT the upstream did, not just 429.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (init?.headers?.range) {
          return { ok: true, status: 206, headers: { get: () => null }, body: { cancel: async () => {} } };
        }
        return {
          ok: false,
          status: 429,
          headers: { get: () => "text/plain" },
          text: async () => "error code: 1027",
        };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const err = await new Promise((resolve) => {
      new Loader().load(
        { url: "https://cdn.example.com/seg-1.m4s", frag: { sn: 1 } },
        {},
        { onSuccess: () => resolve(null), onError: (e) => resolve(e) },
      );
    });
    expect(err.text).toContain("upstream 429");
    expect(err.text).toContain("provider quota or gate");
  });

  it("unwraps the Vercel leg's 502 envelope when the upstream quota refusal rides inside", async () => {
    // downloadify wraps any segment-fetch failure as 502 segment-fetch-failed;
    // vidzen's 429 only survives inside the message text. The annotation must
    // read it out so both relay legs name the quota death identically.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (init?.headers?.range) {
          return { ok: true, status: 206, headers: { get: () => null }, body: { cancel: async () => {} } };
        }
        return {
          ok: false,
          status: 502,
          headers: { get: () => "application/json" },
          text: async () =>
            JSON.stringify({ ok: false, code: "segment-fetch-failed", error: "Segment fetch failed: Upstream 429" }),
        };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const err = await new Promise((resolve) => {
      new Loader().load(
        { url: "https://cdn.example.com/seg-1.m4s", frag: { sn: 1 } },
        {},
        { onSuccess: () => resolve(null), onError: (e) => resolve(e) },
      );
    });
    expect(err.text).toContain("[relay:segment-fetch-failed]");
    expect(err.text).toContain("upstream 429");
  });

  it("reports each fragment's transport path to the player (direct vs relay)", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]).buffer;
    const seen = { direct: 0, relay: 0 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (init?.headers?.range) return rangeOkResponse();
        if (typeof url === "string" && url.startsWith("https://direct.example.com")) {
          return { ok: true, status: 200, headers: { get: () => null }, arrayBuffer: async () => bytes };
        }
        if (typeof url === "string" && url.includes("downloadify")) {
          return {
            ok: true,
            status: 200,
            headers: { get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream") },
            arrayBuffer: async () => bytes,
          };
        }
        return { ok: false, status: 403, headers: { get: () => null } };
      }),
    );
    const Loader = createStreamlyLoader({
      getRefUrl: () => "https://vidcore.io/",
      onDirectPath: () => {
        seen.direct += 1;
      },
      onRelayPath: () => {
        seen.relay += 1;
      },
    });
    const loadFrag = (loader, url) =>
      new Promise((resolve, reject) => {
        loader.load(
          { url, frag: { sn: 1 } },
          {},
          { onSuccess: (resp) => resolve(resp), onError: (err) => reject(new Error(err.text)) },
        );
      });
    await loadFrag(new Loader(), "https://direct.example.com/vd/a.m4s");
    await loadFrag(new Loader(), "https://relay.example.com/vd/b.m4s");
    expect(seen.direct).toBe(1);
    expect(seen.relay).toBe(1);
  });

  it("fan-outs a fragment's relay ranges in parallel and reassembles in order", async () => {
    const FRAG = Math.floor(3.5 * 1024 * 1024);
    const relayCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (init?.headers?.range) return rangeOkResponse();
        if (typeof url === "string" && !url.includes("downloadify")) {
          return { ok: false, status: 403, headers: { get: () => null } };
        }
        const body = JSON.parse(init?.body || "{}");
        const start = Math.floor(Number(body.range?.start) || 0);
        const idx = start / FRAG;
        relayCalls.push(start);
        const overflow = start >= 4 * FRAG;
        const last = idx >= 3;
        const bytes = new Uint8Array(overflow ? 0 : FRAG);
        for (let i = 0; i < bytes.length; i += 4096) bytes[i] = Math.round(idx);
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => (name === "x-streamly-more" ? (last ? "0" : "1") : "application/octet-stream") },
          arrayBuffer: async () => bytes.buffer,
        };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();
    const response = await new Promise((resolve, reject) => {
      loader.load(
        { url: "https://cdn.example.com/vd/big.m4s", frag: { sn: 1 } },
        {},
        {
          onSuccess: (resp) => resolve(resp),
          onError: (err) => reject(new Error(err.text)),
        },
      );
    });
    expect(response.data.byteLength).toBe(4 * FRAG);
    // The parallel fan-out strides the remaining 3 ranges AND over-requests one
    // boundary range (empty = EOF marker) — the whole fragment resolves in
    // roughly one relay latency instead of four serial ones.
    expect(relayCalls).toEqual([0, FRAG, 2 * FRAG, 3 * FRAG, 4 * FRAG]);
  });

  it("streams whole fragments through the Cloudflare proxy relay when configured", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    const SEGMENT = "https://cdn.example.com/vd/whole.m4s";
    const proxyCalls = [];
    const vercelCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (init?.headers?.range === "bytes=0-0") return rangeOkResponse();
        const body = JSON.parse(init?.body || "null");
        const to = String(url);
        if (!body && !init?.headers?.range) {
          // direct CDN pull fails (no range header honored by the mock)
          return { ok: false, status: 403, headers: { get: () => null }, body: { cancel: async () => {} } };
        }
        if (to.includes("workers.dev")) {
          proxyCalls.push({ to, range: init?.headers?.range });
          const bytes = new Uint8Array([9, 8, 7]);
          return {
            ok: true,
            status: 206,
            headers: { get: (name) => (name === "content-range" ? "bytes 0-2/3" : null) },
            arrayBuffer: async () => bytes.buffer,
          };
        }
        vercelCalls.push(body);
        return { ok: false, status: 500, headers: { get: () => null }, body: { cancel: async () => {} } };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();
    const response = await new Promise((resolve, reject) => {
      loader.load(
        { url: SEGMENT, frag: { sn: 1 } },
        {},
        {
          onSuccess: (resp) => resolve(resp),
          onError: (err) => reject(new Error(err.text)),
        },
      );
    });
    // ONE proxy request for the whole fragment — no Vercel fan-out — because
    // the proxy has no serverless response cap (60MB slice ceiling).
    expect(proxyCalls.length).toBe(1);
    expect(proxyCalls[0].to).toBe(
      `https://streamly-proxy.nashidk1999.workers.dev?url=${encodeURIComponent(SEGMENT)}&referer=${encodeURIComponent("https://vidcore.io/")}`,
    );
    expect(proxyCalls[0].range).toBe(`bytes=0-${60 * 1024 * 1024 - 1}`);
    expect(vercelCalls.length).toBe(0);
    expect([...new Uint8Array(response.data)]).toEqual([9, 8, 7]);
  });

  it("asks the proxy relay for the playlist URL, never ?url=undefined", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    const MANIFEST = "https://moon.quietridge.top/vd/x/index-s1080p-v1-a1.m3u8";
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        calls.push(String(url));
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/vnd.apple.mpegurl" },
          text: async () => MEDIA_PLAYLIST,
        };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const response = await new Promise((resolve, reject) => {
      new Loader().load({ url: MANIFEST }, {}, {
        onSuccess: (resp) => resolve(resp),
        onError: (err) => reject(new Error(err.text)),
      });
    });
    // Regression: playlists carry `playlistUrl`, fragments carry `url`. Reading
    // the wrong one asked the worker for `?url=undefined`, and its 200 landing
    // page was accepted as a playlist — every source then failed the playability
    // probe with "not a playlist" while downloads kept working.
    expect(calls[0]).toBe(
      `https://streamly-proxy.nashidk1999.workers.dev?url=${encodeURIComponent(MANIFEST)}&referer=${encodeURIComponent("https://vidcore.io/")}`,
    );
    expect(calls[0]).not.toContain("undefined");
    expect(response.data).toContain("#EXTM3U");
  });

  it("falls back to the Vercel function when the proxy answers 200 without a playlist", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    const MANIFEST = "https://moon.quietridge.top/vd/x/index-s1080p-v1-a1.m3u8";
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const to = String(url);
        calls.push(to);
        // The worker answers a bad ?url= (or a CDN WAF block) with 200 HTML.
        if (to.includes("workers.dev")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "text/html" },
            text: async () => "Streamly Proxy is Running!",
          };
        }
        const body = JSON.parse(init.body);
        expect(body.playlistUrl).toBe(MANIFEST);
        // A playlist is a full-text GET: it must not carry a fragment range.
        expect(body.range).toBeUndefined();
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/vnd.apple.mpegurl" },
          text: async () => MEDIA_PLAYLIST,
        };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const response = await new Promise((resolve, reject) => {
      new Loader().load({ url: MANIFEST }, {}, {
        onSuccess: (resp) => resolve(resp),
        onError: (err) => reject(new Error(err.text)),
      });
    });
    expect(calls.some((to) => to.includes("workers.dev"))).toBe(true);
    expect(calls.some((to) => to.includes("downloadify"))).toBe(true);
    expect(response.data).toContain("#EXTM3U");
  });

  it("cascades a refused playlist (worker 429 passthrough) to the Vercel function", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    const MANIFEST = "https://vidzen.fun/api/stream/v1_abc";
    const calls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const to = String(url);
        calls.push(to);
        if (to.includes("workers.dev")) {
          // The real pasted failure: vidzen's quota-dead bypass chain answers
          // 429 (Cloudflare error 1027) THROUGH our healthy worker — the browser
          // reported it as an opaque CORS error (no ACAO on the refusal).
          return {
            ok: false,
            status: 429,
            headers: { get: () => "text/html" },
            text: async () => "error code: 1027",
            body: { cancel: async () => {} },
          };
        }
        const body = JSON.parse(init.body);
        expect(body.playlistUrl).toBe(MANIFEST);
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/vnd.apple.mpegurl" },
          text: async () => MEDIA_PLAYLIST,
        };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const response = await new Promise((resolve, reject) => {
      new Loader().load({ url: MANIFEST }, {}, {
        onSuccess: (resp) => resolve(resp),
        onError: (err) => reject(new Error(err.text)),
      });
    });
    // The refusal must NOT kill the source: the Vercel leg answered instead.
    expect(calls.filter((to) => to.includes("downloadify")).length).toBe(1);
    expect(response.data).toContain("#EXTM3U");
  });

  it("surfaces the last refusal when every playlist leg fails", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    const MANIFEST = "https://vidzen.fun/api/stream/v1_dead";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        const to = String(url);
        if (to.includes("workers.dev")) {
          return { ok: false, status: 429, headers: { get: () => "text/html" }, text: async () => "error code: 1027", body: { cancel: async () => {} } };
        }
        return {
          ok: false,
          status: 502,
          headers: { get: (name) => (name === "content-type" ? "application/json" : null) },
          text: async () => JSON.stringify({ ok: false, error: "Segment fetch failed: upstream gone", code: "segment-fetch-failed" }),
        };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const errorText = await new Promise((resolve, reject) => {
      new Loader().load({ url: MANIFEST }, {}, {
        onSuccess: (resp) => reject(new Error(`should not succeed: ${resp.data}`)),
        onError: (err) => resolve(err.text),
      });
    });
    // The relay's real envelope survives (code relayed in the text) instead of
    // the load dying as a generic "not a playlist".
    expect(errorText).toContain("[relay:segment-fetch-failed]");
    expect(errorText).toContain("upstream gone");
  });

  it("never pokes a referer-gated host direct — fragment goes straight to the relay with the referer", async () => {
    const GATED = "https://palehive.top/vd/x/seg-1-s1080p-v1-a1.m4s";
    const directCalls = [];
    const proxyCalls = [];
    const vercelCalls = [];
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const to = String(url);
        if (to.startsWith("https://palehive.top") || to.startsWith("https://moon.quietridge.top")) {
          // A bare browser probe/pull of these hosts is a guaranteed 403 AND a
          // WAF trip — the fix must mean this NEVER happens.
          directCalls.push(to);
          return { ok: false, status: 403, headers: { get: () => null }, body: { cancel: async () => {} } };
        }
        const body = JSON.parse(init?.body || "null");
        if (body && body.action === "segment") {
          vercelCalls.push(body);
          return {
            ok: true,
            status: 200,
            headers: { get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream") },
            arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
          };
        }
        if (to.includes("workers.dev")) {
          proxyCalls.push(to);
          return { ok: false, status: 403, headers: { get: () => null }, body: { cancel: async () => {} } };
        }
        return { ok: true, status: 206, headers: { get: (name) => (name === "content-range" ? "bytes 0-3/4" : null) }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();
    const response = await new Promise((resolve, reject) => {
      loader.load(
        { url: GATED, frag: { sn: 1 } },
        {},
        {
          onSuccess: (resp) => resolve(resp),
          onError: (err) => reject(new Error(err.text)),
        },
      );
    });
    // No direct probe, no direct pull — the bare app-referer request never fires.
    expect(directCalls.length).toBe(0);
    // The proxy attempt carried the owning player's referer (so a redeployed
    // worker can serve it); its 403 cascades to the Vercel relay, which served.
    expect(proxyCalls.length).toBe(1);
    expect(proxyCalls[0]).toBe(
      `https://streamly-proxy.nashidk1999.workers.dev?url=${encodeURIComponent(GATED)}&referer=${encodeURIComponent("https://vidcore.io/")}`,
    );
    expect(vercelCalls.length).toBe(1);
    expect([...new Uint8Array(response.data)]).toEqual([1, 2, 3, 4]);
  });

  it("falls back to the Vercel relay when the proxy is down", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    const vercelCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (init?.headers?.range === "bytes=0-0") return rangeOkResponse();
        const body = JSON.parse(init?.body || "null");
        const to = String(url);
        if (!body && !init?.headers?.range) {
          return { ok: false, status: 403, headers: { get: () => null }, body: { cancel: async () => {} } };
        }
        if (to.includes("workers.dev")) {
          return { ok: false, status: 503, headers: { get: () => null }, body: { cancel: async () => {} } };
        }
        vercelCalls.push(body);
        const bytes = new Uint8Array([1, 2, 3, 4]);
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream") },
          arrayBuffer: async () => bytes.buffer,
        };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();
    const response = await new Promise((resolve, reject) => {
      loader.load(
        { url: "https://cdn.example.com/vd/whole.m4s", frag: { sn: 1 } },
        {},
        {
          onSuccess: (resp) => resolve(resp),
          onError: (err) => reject(new Error(err.text)),
        },
      );
    });
    // The failed proxy GET cascaded to the Vercel function, which delivered
    // the fragment — playback survives a broken proxy deploy.
    expect(vercelCalls.length).toBe(1);
    expect(vercelCalls[0].range.max).toBe(3.5 * 1024 * 1024);
    expect([...new Uint8Array(response.data)]).toEqual([1, 2, 3, 4]);
  });

  it("falls back to serial chunking when the first relay slice is short", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (init?.headers?.range) return rangeOkResponse();
        if (typeof url === "string" && !url.includes("downloadify")) {
          return { ok: false, status: 403, headers: { get: () => null } };
        }
        const body = JSON.parse(init?.body || "{}");
        const start = Math.floor(Number(body.range?.start) || 0);
        if (start === 0) {
          const bytes = new Uint8Array(1024);
          bytes[0] = 7;
          return {
            ok: true,
            status: 200,
            headers: { get: (name) => (name === "x-streamly-more" ? "1" : "application/octet-stream") },
            arrayBuffer: async () => bytes.buffer,
          };
        }
        const bytes = new Uint8Array([1, 2, 3, 4]);
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream") },
          arrayBuffer: async () => bytes.buffer,
        };
      }),
    );
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();
    const response = await new Promise((resolve, reject) => {
      loader.load(
        { url: "https://cdn.example.com/vd/tail.m4s", frag: { sn: 1 } },
        {},
        {
          onSuccess: (resp) => resolve(resp),
          onError: (err) => reject(new Error(err.text)),
        },
      );
    });
    expect(response.data.byteLength).toBe(1028);
  });

  it("parks a throttled origin on relay-only cooldown (no repeated direct pokes)", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      if (init?.headers?.range) return rangeOkResponse();
      if (typeof url === "string" && url.includes("downloadify")) {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream") },
          arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
        };
      }
      // Direct segment pull: throttled.
      return { ok: false, status: 403, headers: { get: () => null } };
    });
    vi.stubGlobal("fetch", fetchMock);
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });

    const loadFrag = (loader, url) =>
      new Promise((resolve, reject) => {
        loader.load(
          { url, frag: { sn: 1 } },
          {},
          {
            onSuccess: (resp) => resolve(resp),
            onError: (err) => reject(new Error(err.text)),
          },
        );
      });

    // First fragment: probe + doomed direct attempt, then relay saves it.
    await loadFrag(new Loader(), "https://throttle.example.com/vd/a.m4s");
    const directFirst = fetchMock.mock.calls.filter(([url, init]) => (
      typeof url === "string" && url.startsWith("https://throttle.example.com") && !init?.headers?.range
    ));
    expect(directFirst.length).toBe(1);

    // Second fragment, same origin: NO direct attempt at all — straight relay.
    fetchMock.mockClear();
    await loadFrag(new Loader(), "https://throttle.example.com/vd/b.m4s");
    const directSecond = fetchMock.mock.calls.filter(([url]) => (
      typeof url === "string" && url.startsWith("https://throttle.example.com")
    ));
    expect(directSecond.length).toBe(0);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("re-tries direct after the throttle cooldown expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    let directThrottled = true;
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      if (init?.headers?.range) return rangeOkResponse();
      if (typeof url === "string" && url.includes("downloadify")) {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream") },
          arrayBuffer: async () => new Uint8Array([9]).buffer,
        };
      }
      if (directThrottled) return { ok: false, status: 429, headers: { get: () => null } };
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([7, 8]).buffer,
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loadFrag = (loader, url) =>
      new Promise((resolve, reject) => {
        loader.load(
          { url, frag: { sn: 1 } },
          {},
          { onSuccess: (resp) => resolve(resp), onError: (err) => reject(new Error(err.text)) },
        );
      });

    await loadFrag(new Loader(), "https://burst.example.com/vd/a.m4s");
    directThrottled = false;
    fetchMock.mockClear();
    vi.setSystemTime(5 * 60 * 1000 + 1);
    const response = await loadFrag(new Loader(), "https://burst.example.com/vd/b.m4s");
    const directAgain = fetchMock.mock.calls.filter(([url, init]) => (
      typeof url === "string" && url.startsWith("https://burst.example.com") && !init?.headers?.range
    ));
    expect(directAgain.length).toBe(1);
    expect(response.data.byteLength).toBe(2);
  });

  it("times out a hung load and reports onTimeout instead of spinning forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();
    const calls = { success: 0, error: 0, timeout: 0 };
    const loadPromise = new Promise((resolve) => {
      loader.load(
        { url: "https://moon.quietridge.top/vd/x/index.m3u8" },
        { timeout: 100 },
        {
          onSuccess: () => {
            calls.success += 1;
          },
          onError: () => {
            calls.error += 1;
          },
          onTimeout: () => {
            calls.timeout += 1;
            resolve();
          },
        },
      );
    });
    // A fetch that never resolves previously left the spinner up forever: no
    // error, no backoff, no failover. The watchdog must fire and hand control
    // back to hls.js's timeout policy.
    await vi.advanceTimersByTimeAsync(200);
    await loadPromise;
    expect(calls.timeout).toBe(1);
    expect(calls.success).toBe(0);
    expect(calls.error).toBe(0);
  });

  it("reuses a loader instance after abort — the abort flag resets per load", async () => {
    let hanging = true;
    const abortable = (_url, init) => {
      const signal = init?.signal;
      return new Promise((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        signal?.addEventListener?.(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
        if (!hanging) {
          resolve({ ok: true, status: 200, headers: { get: () => "text" }, text: async () => "#EXTM3U\n#EXT-X-VERSION:3\n" });
        }
      });
    };
    vi.stubGlobal("fetch", abortable);
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
    const loader = new Loader();

    loader.load(
      { url: "https://moon.quietridge.top/vd/x/index.m3u8" },
      {},
      { onSuccess: () => {}, onError: () => {} },
    );
    await Promise.resolve(); // let the first fetch register its abort listener
    loader.abort();

    // The same instance must be usable again: load() resets the abort flag,
    // or every later request's onSuccess would be swallowed (fragments never
    // reach MSE → endless loading after the first pause/seek).
    hanging = false;
    const response = await new Promise((resolve, reject) => {
      loader.load(
        { url: "https://moon.quietridge.top/vd/x/index.m3u8" },
        {},
        {
          onSuccess: (resp) => resolve(resp),
          onError: (err) => reject(new Error(err.text)),
        },
      );
    });
    expect(response.data).toContain("#EXTM3U");
  });
});

const MEDIA_PLAYLIST = "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg-0.m4s\n#EXT-X-ENDLIST\n";
const MASTER_PLAYLIST = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360\nlow.m3u8\n";

describe("probeSourcePlayable", () => {
  it("passes when the first segment flows direct", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url) => {
        if (typeof url === "string" && url.includes("downloadify")) {
          return { ok: true, status: 200, headers: { get: () => "text" }, text: async () => MEDIA_PLAYLIST };
        }
        return { ok: true, status: 206, headers: { get: () => null } };
      }),
    );
    const probe = await probeSourcePlayable("https://cdn.example.com/x/index.m3u8", "https://vidcore.io/");
    expect(probe).toMatchObject({ ok: true, via: "direct" });
  });

  it("follows a master to its first level playlist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (typeof url === "string" && url.includes("downloadify")) {
          const body = JSON.parse(init.body);
          const text = String(body.playlistUrl || "").endsWith("master.m3u8") ? MASTER_PLAYLIST : MEDIA_PLAYLIST;
          return { ok: true, status: 200, headers: { get: () => "text" }, text: async () => text };
        }
        return { ok: true, status: 206, headers: { get: () => null } };
      }),
    );
    const probe = await probeSourcePlayable("https://cdn.example.com/x/master.m3u8", "https://vidcore.io/");
    expect(probe).toMatchObject({ ok: true, via: "direct" });
  });

  it("probes a referer-gated source via the relay only (no direct sip)", async () => {
    const directCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const to = String(url);
        if (to.startsWith("https://palehive.top") && !to.includes("downloadify")) {
          directCalls.push(to);
          return { ok: false, status: 403, headers: { get: () => null } };
        }
        if (typeof to === "string" && to.includes("downloadify")) {
          const body = JSON.parse(init.body);
          if (body.action === "playlist") {
            return { ok: true, status: 200, headers: { get: () => "text" }, text: async () => MEDIA_PLAYLIST };
          }
          return {
            ok: true,
            status: 200,
            headers: { get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream") },
            arrayBuffer: async () => new Uint8Array([1]).buffer,
          };
        }
        return { ok: true, status: 206, headers: { get: (name) => (name === "content-range" ? "bytes 0-0/1" : null) } };
      }),
    );
    const probe = await probeSourcePlayable("https://palehive.top/vd/x/index.m3u8", "https://vidcore.io/");
    expect(probe).toMatchObject({ ok: true, via: "relay" });
    // The bare app-referer byte sip never fired — gated hosts are relay-only.
    expect(directCalls.length).toBe(0);
  });

  it("passes via relay when direct is throttled but the relay serves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (typeof url === "string" && url.includes("downloadify")) {
          const body = JSON.parse(init.body);
          if (body.action === "playlist") {
            return { ok: true, status: 200, headers: { get: () => "text" }, text: async () => MEDIA_PLAYLIST };
          }
          return {
            ok: true,
            status: 200,
            headers: { get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream") },
            arrayBuffer: async () => new Uint8Array([1]).buffer,
          };
        }
        return { ok: false, status: 429, headers: { get: () => null } };
      }),
    );
    const probe = await probeSourcePlayable("https://cdn.example.com/x/index.m3u8", "https://vidcore.io/");
    expect(probe).toMatchObject({ ok: true, via: "relay" });
  });

  it("fails when neither direct nor relay serve bytes (the vidzen black-screen case)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (typeof url === "string" && url.includes("downloadify")) {
          const body = JSON.parse(init.body);
          if (body.action === "playlist") {
            return { ok: true, status: 200, headers: { get: () => "text" }, text: async () => MEDIA_PLAYLIST };
          }
          return {
            ok: false,
            status: 502,
            headers: { get: () => "application/json" },
            text: async () => JSON.stringify({ ok: false, code: "segment-fetch-failed", error: "Upstream 429" }),
          };
        }
        return { ok: false, status: 429, headers: { get: () => null } };
      }),
    );
    const probe = await probeSourcePlayable("https://vidzen.fun/api/stream/x", "https://vidcore.io/");
    expect(probe.ok).toBe(false);
    expect(probe.reason).toBeTruthy();
  });

  it("survives a proxy 200 landing page - the 'not a playlist' regression", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://streamly-proxy.nashidk1999.workers.dev");
    const seen = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const to = String(url);
        seen.push(to);
        if (to.includes("workers.dev")) {
          // A bad ?url= (or a WAF block page) reaches the caller as 200 HTML.
          if (to.includes("%2F%2F") && !to.includes("url=undefined")) {
            return { ok: false, status: 403, headers: { get: () => null }, body: { cancel: async () => {} } };
          }
          return {
            ok: true,
            status: 200,
            headers: { get: () => "text/html" },
            text: async () => "Streamly Proxy is Running!",
          };
        }
        const body = JSON.parse(init.body);
        if (body.action === "playlist") {
          return { ok: true, status: 200, headers: { get: () => "text" }, text: async () => MEDIA_PLAYLIST };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream") },
          arrayBuffer: async () => new Uint8Array([1]).buffer,
        };
      }),
    );
    // The gate is referer-gated, so the probe skips the direct sip and relays.
    const probe = await probeSourcePlayable("https://palehive.top/vd/x/index.m3u8", "https://vidcore.io/");
    expect(seen.some((to) => to.includes("url=undefined"))).toBe(false);
    expect(probe).toMatchObject({ ok: true, via: "relay" });
  });
});
