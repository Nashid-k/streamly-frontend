import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDirectBlocks,
  clearProbeCache,
  createStreamlyLoader,
  probeDirectOrigin,
  probeSourcePlayable,
} from "../api/nativeHlsLoader";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
  clearProbeCache();
  clearDirectBlocks();
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

  it("falls back to serial chunking when the first relay slice is short", async () => {
    const FRAG = Math.floor(3.5 * 1024 * 1024);
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
      vi.fn().mockImplementation(async (url, init) => {
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
});
