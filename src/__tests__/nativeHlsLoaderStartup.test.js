import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDirectBlocks,
  clearPlaylistMemo,
  clearProbeCache,
  createStreamlyLoader,
  probeSourcePlayable,
} from "../api/nativeHlsLoader";

const SLICE = Math.floor(3.5 * 1024 * 1024);
const REF = "https://vidcore.io/";
// quietridge.top is a referer-gated host: the loader must relay it.
const GATED = "https://moon.quietridge.top/vd/x";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  clearProbeCache();
  clearDirectBlocks();
  clearPlaylistMemo();
});

function jsonResponse(text) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => text,
    arrayBuffer: async () => new TextEncoder().encode(text).buffer,
  };
}

function sliceResponse(buf, more) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => (name === "x-streamly-more" ? (more ? "1" : "0") : null) },
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
}

function loadOnce(loader, context) {
  return new Promise((resolve) => {
    loader.load(context, {}, {
      onSuccess: (resp, stats) => resolve({ kind: "success", resp, stats }),
      onError: (err) => resolve({ kind: "error", text: err?.text || "" }),
      onTimeout: () => resolve({ kind: "timeout" }),
    });
  });
}

describe("playlist memo (startup latency)", () => {
  it("serves the loader the playlist the probe already fetched", async () => {
    const playlist =
      "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg-1.m4s\n#EXT-X-ENDLIST\n";
    let playlistPosts = 0;
    const fetchMock = vi.fn(async (input, init) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      if (body?.action === "playlist") {
        playlistPosts += 1;
        return jsonResponse(playlist);
      }
      if (body?.action === "segment") return sliceResponse(new Uint8Array(1024), false);
      // Direct one-byte probe on the gated host: refuse it.
      return { ok: false, status: 403, headers: { get: () => null }, body: { cancel: async () => {} } };
    });
    vi.stubGlobal("fetch", fetchMock);

    const probe = await probeSourcePlayable(`${GATED}/index.m3u8`, REF);
    expect(probe.ok).toBe(true);
    const afterProbe = playlistPosts;
    expect(afterProbe).toBe(1);

    const Loader = createStreamlyLoader({ getRefUrl: () => REF });
    const result = await loadOnce(new Loader(), { url: `${GATED}/index.m3u8` });

    expect(result.kind).toBe("success");
    // The duplicate serverless round trip is gone: hls.js is served the copy the
    // probe already paid for.
    expect(playlistPosts).toBe(afterProbe);
  });

  it("never memoizes a live manifest, which mutates behind one URL", async () => {
    // No #EXT-X-ENDLIST => a live playlist. Its segment window slides forward under a
    // single URL, so handing hls.js a cached copy would stall live edge updates.
    const live = "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg-1.m4s\n#EXTINF:6.0,\nseg-2.m4s\n";
    const fetchMock = vi.fn(async (input, init) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      if (body?.action === "playlist") return jsonResponse(live);
      return { ok: false, status: 403, headers: { get: () => null }, body: { cancel: async () => {} } };
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://streamsitegp.workers.dev/live.m3u8";
    await probeSourcePlayable(url, REF);
    const afterProbe = fetchMock.mock.calls.length;

    const Loader = createStreamlyLoader({ getRefUrl: () => REF });
    const result = await loadOnce(new Loader(), { url });

    expect(result.kind).toBe("success");
    expect(fetchMock.mock.calls.length).toBeGreaterThan(afterProbe);
  });

  it("checks the MEDIA playlist even when a master loaded first", async () => {
    // Cue tags live in the media playlist. A master carries only variants, so
    // reporting it would consume the one-shot flag and leave the manifest that
    // actually holds the tags unchecked — which is the shape most titles use.
    const master = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=640x360\nlow.m3u8\n";
    const media =
      "#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg-0.m4s\n" +
      "#EXT-X-CUE-OUT:DURATION=36\n#EXTINF:6.0,\nseg-1.m4s\n" +
      "#EXTINF:6.0,\nseg-2.m4s\n#EXT-X-CUE-IN\n#EXTINF:6.0,\nseg-3.m4s\n" +
      "#EXT-X-ENDLIST\n";
    const seen = [];
    const fetchMock = vi.fn(async (input, init) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      if (body?.action === "playlist") {
        return jsonResponse(String(body.playlistUrl).endsWith("master.m3u8") ? master : media);
      }
      return { ok: false, status: 403, headers: { get: () => null }, body: { cancel: async () => {} } };
    });
    vi.stubGlobal("fetch", fetchMock);

    const Loader = createStreamlyLoader({
      getRefUrl: () => REF,
      onCueBoundaries: (b) => seen.push(b),
    });

    const a = new Loader();
    await loadOnce(a, { url: "https://streamsitegp.workers.dev/master.m3u8" });
    const b = new Loader();
    await loadOnce(b, { url: "https://streamsitegp.workers.dev/low.m3u8" });

    // Master load reported nothing; the media load produced real boundaries.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ introEndSeconds: 18, creditsStartSeconds: null });
  });

  it("keeps memo entries per refUrl so a gated host never serves another referer's manifest", async () => {
    const fetchMock = vi.fn(async (input, init) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      if (body?.action === "playlist") return jsonResponse("#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg-1.m4s\n#EXT-X-ENDLIST\n");
      return { ok: false, status: 403, headers: { get: () => null }, body: { cancel: async () => {} } };
    });
    vi.stubGlobal("fetch", fetchMock);

    const url = "https://streamsitegp.workers.dev/watch.m3u8";
    await probeSourcePlayable(url, "https://vidcore.io/");
    const Loader = createStreamlyLoader({ getRefUrl: () => "https://other.example/" });
    const result = await loadOnce(new Loader(), { url });

    // Different referer => different key => a real fetch, never the memoized body.
    expect(result.kind).toBe("success");
    const playlistPosts = fetchMock.mock.calls.filter(
      ([, init]) => init?.body && JSON.parse(init.body).action === "playlist",
    );
    expect(playlistPosts.length).toBe(2);
  });
});

describe("relay fan-out integrity", () => {
  it("fails the load when a chunk dies, instead of returning a truncated fragment as success", async () => {
    const full = new Uint8Array(SLICE);
    const fetchMock = vi.fn(async (input, init) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      if (body?.action !== "segment") {
        return { ok: false, status: 403, headers: { get: () => null }, body: { cancel: async () => {} } };
      }
      const start = Number(body.range?.start || 0);
      if (start === 0) return sliceResponse(full, true);
      // Chunk 1 dies. Everything else settles cheaply as an empty tail.
      if (start === SLICE) throw new Error("relay chunk died mid-fragment");
      return sliceResponse(new Uint8Array(0), false);
    });
    vi.stubGlobal("fetch", fetchMock);

    const Loader = createStreamlyLoader({ getRefUrl: () => REF });
    const result = await loadOnce(new Loader(), { url: `${GATED}/seg-9.m4s`, frag: { sn: 1 } });

    // Prove the PARALLEL fan-out is what ran (chunk 0 plus a 4-wide window), not the
    // serial chain. The serial chain has no catch, so it would have failed this test
    // even before the fix and proved nothing.
    const segmentPosts = fetchMock.mock.calls.filter(
      ([, init]) => init?.body && JSON.parse(init.body).action === "segment",
    );
    expect(segmentPosts.length).toBeGreaterThanOrEqual(4);

    // A partial read handed to hls.js appends a corrupt segment and stutters. The
    // load must fail so hls.js can retry a fragment that may well succeed.
    expect(result.kind).toBe("error");
    expect(result.text).toContain("relay chunk died mid-fragment");
  });

  it("still succeeds when the fan-out completes cleanly", async () => {
    const full = new Uint8Array(SLICE);
    const tail = new Uint8Array(2048);
    const fetchMock = vi.fn(async (input, init) => {
      const body = init?.body ? JSON.parse(init.body) : null;
      if (body?.action !== "segment") {
        return { ok: false, status: 403, headers: { get: () => null }, body: { cancel: async () => {} } };
      }
      const start = Number(body.range?.start || 0);
      if (start === 0) return sliceResponse(full, true);
      if (start === SLICE) return sliceResponse(tail, false);
      return sliceResponse(new Uint8Array(0), false);
    });
    vi.stubGlobal("fetch", fetchMock);

    const Loader = createStreamlyLoader({ getRefUrl: () => REF });
    const result = await loadOnce(new Loader(), { url: `${GATED}/seg-9.m4s`, frag: { sn: 1 } });

    expect(result.kind).toBe("success");
    const bytes = new Uint8Array(result.resp.data);
    expect(bytes.length).toBe(SLICE + 2048);
  });
});
