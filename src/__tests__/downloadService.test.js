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

describe("downloadService.resolveZxc", () => {
  /* Sibling-URL dub tracks are NOT an NHD-only convenience: ZXC Centaurus is the
     one LIVE multi-audio server, and it ships its dubs the same way — a list of
     full sibling masters rather than #EXT-X-MEDIA rows. This coverage moved here
     when NHD was retired on 2026-10-03. */
  it("carries the sibling-URL dub audioTracks through to the player", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          ok: true,
          source: { kind: "hls", url: "https://vidstuck.xyz/zxc/centaurus/master.m3u8" },
          variants: [{ uri: "https://vidstuck.xyz/zxc/centaurus/master.m3u8", bandwidth: 0, height: 0 }],
          audioTracks: [
            { label: "Original", uri: "https://vidstuck.xyz/zxc/centaurus/master.m3u8" },
            { label: "Hindi", uri: "https://vidstuck.xyz/zxc/centaurus/hi.m3u8" },
            { label: "Telugu", uri: "https://vidstuck.xyz/zxc/centaurus/te.m3u8" },
          ],
        }),
      ),
    );

    const resolved = await downloadService.resolveZxc({ type: "movie", id: "579974", server: "centaurus" });
    // Centaurus ships ONE unlabeled rung (height 0 -> the honest "Auto" label),
    // so the ladder is not the interesting part — the dub list is.
    expect(resolved.variants.map((v) => v.label)).toEqual(["Auto"]);
    expect(resolved.audioTracks.map((t) => t.label)).toEqual(["Original", "Hindi", "Telugu"]);
    expect(resolved.audioTracks[1]).toEqual({
      label: "Hindi",
      uri: "https://vidstuck.xyz/zxc/centaurus/hi.m3u8",
    });
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
    await expect(downloadService.resolveZxc({ type: "movie", id: "550", server: "centaurus" })).rejects.toMatchObject({
      code: "offline",
    });
  });
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
