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
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "No stream found via VidSrc", code: "no-source" })),
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
      vi.fn().mockResolvedValue(jsonResponse({ ok: false, error: "No stream found via NHD", code: "no-source" })),
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
