import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDirectBlocks,
  clearProbeCache,
  probeDirectOrigin,
  probeSourcePlayable,
} from "../api/nativeHlsLoader";

/* VidCore redirects vidzen.fun to a fresh segment host on every rotation, and
   every new host 403s a bare browser fetch. Verified live against the redirect
   target from the field report, v1.streamsitegp.workers.dev:

     HTTP/1.1 403 Forbidden        <- and NO access-control-allow-origin

   So a direct fetch can never work there, yet the origin was not in
   REFERER_GATED_HOST_SUFFIXES and the loader only parked an origin AFTER it had
   already tried a real direct pull. Consequences, all of them latency:
     - the playability probe paid a doomed direct sip on every title load
     - every fragment re-probed an origin that had already refused
     - the hardcoded suffix list needed extending for each new rotation
   Parking on the observed STATUS is general, so the next rotation needs no code
   change. These tests pin that behaviour, including the case that must NOT be
   parked, which is the one that would otherwise cause a silent regression. */

const MEDIA_PLAYLIST =
  "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg-0.m4s\n#EXT-X-ENDLIST\n";

function refused(status) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    headers: { get: () => null },
    body: { cancel: async () => {} },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  clearProbeCache();
  clearDirectBlocks();
});

describe("direct-probe origin parking", () => {
  it("parks a 403 origin so a later probe costs no request", async () => {
    // Non-workers.dev host on purpose: *.workers.dev is name-blocked outright
    // (see the fleet test below), so a status would never even be learned there.
    const mock = refused(403);
    vi.stubGlobal("fetch", mock);

    const first = await probeDirectOrigin("https://fresh.streamsitegp.example.com/seg.m4s");
    expect(first).toMatchObject({ ok: false, status: 403 });

    // Clearing the probe cache alone must not resurrect the request: the origin
    // is answered from the cooldown, which is what removes the repeat cost.
    clearProbeCache();
    mock.mockClear();
    const second = await probeDirectOrigin("https://fresh.streamsitegp.workers.dev/seg.m4s");
    expect(mock).not.toHaveBeenCalled();
    expect(second.ok).toBe(false);
  });

  it("parks a 429 origin the same way", async () => {
    const mock = refused(429);
    vi.stubGlobal("fetch", mock);
    await probeDirectOrigin("https://throttled.example.com/seg.m4s");

    clearProbeCache();
    mock.mockClear();
    await probeDirectOrigin("https://throttled.example.com/seg.m4s");
    expect(mock).not.toHaveBeenCalled();
  });

  it("does NOT park a host that merely omits CORS headers", async () => {
    // A 206 with no ACAO is a durable "the browser cannot read this" answer, not
    // a gate to park. Parking it would force the relay for the whole cooldown
    // even if that CDN added CORS later in the session, so this must stay
    // re-probeable. This is the case most likely to regress silently.
    const mock = vi.fn().mockResolvedValue({
      ok: true,
      status: 206,
      headers: { get: () => null },
      body: { cancel: async () => {} },
    });
    vi.stubGlobal("fetch", mock);

    const result = await probeDirectOrigin("https://nocors.example.com/seg.m4s");
    expect(result.ok).toBe(false);
    expect(result.status).toBe(206);

    clearProbeCache();
    mock.mockClear();
    await probeDirectOrigin("https://nocors.example.com/seg.m4s");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("still reports a usable status for a gated origin", async () => {
    vi.stubGlobal("fetch", refused(401));
    const result = await probeDirectOrigin("https://auth.example.com/seg.m4s");
    expect(result).toMatchObject({ ok: false, status: 401 });
  });
});

describe("playability probe reuses the shared origin decision", () => {
  it("accepts a plain 2xx direct pull that answers no content-range", async () => {
    // directFragment sends NO Range header, so a 200 without content-range is
    // still a usable direct path. Requiring range support here would push a
    // working direct source onto the relay for nothing.
    const directCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const to = String(url);
        if (typeof url === "string" && to.includes("downloadify")) {
          const body = JSON.parse(init.body);
          if (body.action === "playlist") {
            return { ok: true, status: 200, headers: { get: () => "text" }, text: async () => MEDIA_PLAYLIST };
          }
          return {
            ok: true,
            status: 200,
            headers: { get: (n) => (n === "x-streamly-more" ? "0" : "application/octet-stream") },
            arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
          };
        }
        directCalls.push(to);
        return { ok: true, status: 200, headers: { get: () => null }, body: { cancel: async () => {} } };
      }),
    );

    const probe = await probeSourcePlayable("https://norange.example.com/x/index.m3u8", "https://vidcore.io/");
    expect(probe).toMatchObject({ ok: true, via: "direct" });
    expect(directCalls.length).toBeGreaterThan(0);
  });

  it("skips the doomed direct sip for an origin parked earlier in the session", async () => {
    // Park it the way a real fragment load would, through the probe.
    vi.stubGlobal("fetch", refused(403));
    await probeDirectOrigin("https://parked.example.com/x/seg-0.m4s");

    const directCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const to = String(url);
        if (typeof url === "string" && to.includes("downloadify")) {
          const body = JSON.parse(init.body);
          if (body.action === "playlist") {
            return { ok: true, status: 200, headers: { get: () => "text" }, text: async () => MEDIA_PLAYLIST };
          }
          return {
            ok: true,
            status: 200,
            headers: { get: (n) => (n === "x-streamly-more" ? "0" : "application/octet-stream") },
            arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
          };
        }
        directCalls.push(to);
        return { ok: true, status: 200, headers: { get: () => null }, body: { cancel: async () => {} } };
      }),
    );
    clearProbeCache();

    const probe = await probeSourcePlayable("https://parked.example.com/x/index.m3u8", "https://vidcore.io/");
    expect(probe.ok).toBe(true);
    expect(directCalls).toEqual([]);
  });

  it("still uses its own relay sip when the origin is healthy", async () => {
    // Guards the other direction: the shared probe must not have made the
    // playability probe over-eager, or a fine source would lose its direct sip.
    const directCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const to = String(url);
        if (typeof url === "string" && to.includes("downloadify")) {
          const body = JSON.parse(init.body);
          if (body.action === "playlist") {
            return { ok: true, status: 200, headers: { get: () => "text" }, text: async () => MEDIA_PLAYLIST };
          }
          return {
            ok: true,
            status: 200,
            headers: { get: (n) => (n === "x-streamly-more" ? "0" : "application/octet-stream") },
            arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
          };
        }
        directCalls.push(to);
        return {
          ok: true,
          status: 206,
          headers: { get: (n) => (n === "access-control-allow-origin" ? "*" : n === "content-range" ? "bytes 0-0/4" : null) },
          body: { cancel: async () => {} },
        };
      }),
    );

    const probe = await probeSourcePlayable("https://healthy.example.com/x/index.m3u8", "https://vidcore.io/");
    expect(probe).toMatchObject({ ok: true, via: "direct" });
    expect(directCalls.length).toBeGreaterThan(0);
  });

  it("never probes a *.workers.dev segment host directly (browser-unreadable family)", async () => {
    // Verified live 2026-09-29: vidzen's segment fleet now lives on rotating
    // workers.dev subdomains (proxystream2.ms0oww2azhtm 429 "error code: 1027"
    // no ACAO; vidzen1-4.mu9*/odd-hill/steep-glitter/rapid-feather/odd-salad
    // 200 no ACAO). A bare direct fetch "succeeds" (200) but the browser cannot
    // read a byte, so the status-based parking above can never learn this
    // family — the block has to be by NAME in isDirectBlocked.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: { cancel: async () => {} },
    });
    vi.stubGlobal("fetch", fetchMock);

    const probe = await probeDirectOrigin("https://vidzen1.mu9ndxt2f8dr.workers.dev/?url=https%3A%2F%2Fcdn.example.com%2Fseg0.ts");
    expect(probe.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    // ...and the playability probe skips the direct sip for the whole family.
    // The playlist's segment URI is ABSOLUTE and points INTO the fleet, the way
    // vidzen's real media playlists read since the 2026-09 rotation (a relative
    // URI would resolve against the vidzen.fun manifest host instead).
    const FLEET_PLAYLIST =
      "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\n" +
      "https://vidzen1.mu9ndxt2f8dr.workers.dev/?url=https%3A%2F%2Fcdn.example.com%2Fseg0.ts\n" +
      "#EXT-X-ENDLIST\n";
    const directCalls = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        const to = String(url);
        if (typeof url === "string" && to.includes("downloadify")) {
          const body = JSON.parse(init.body);
          if (body.action === "playlist") {
            return { ok: true, status: 200, headers: { get: () => "text" }, text: async () => FLEET_PLAYLIST };
          }
          return {
            ok: true,
            status: 200,
            headers: { get: (n) => (n === "x-streamly-more" ? "0" : "application/octet-stream") },
            arrayBuffer: async () => new Uint8Array([1, 2]).buffer,
          };
        }
        directCalls.push(to);
        return { ok: true, status: 200, headers: { get: () => null }, body: { cancel: async () => {} } };
      }),
    );
    clearProbeCache();

    const playable = await probeSourcePlayable(
      "https://vidzen.fun/api/stream/v1_token",
      "https://vidcore.io/",
    );
    expect(playable).toMatchObject({ ok: true, via: "relay" });
    expect(directCalls).toEqual([]);
  });
});
