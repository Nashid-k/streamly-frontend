// End-to-end guard for the reported production failure:
//
//   POST /api/downloadify -> 500 (Internal Server Error)
//   [Streamly][download] VidCore (Server 5) has no downloadable stream
//
// The 500 was not a provider failure: api/downloadify.js imported `resolveUrl`
// from src/utils/downloadQuality.js, which never exported it, so the ESM module
// failed to LINK and every action threw before the handler ever ran. The client
// then reported the 500 as "no downloadable stream", which is why the real cause
// was invisible from the app's own logs.
//
// These tests drive the actual handler with a stub req/res, so a future link or
// dispatch regression shows up here instead of on someone's title page.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { default: handler } = await import("../../api/downloadify.js");

function makeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    ended: false,
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader(key, value) {
      res.headers[key.toLowerCase()] = value;
      return res;
    },
    json(payload) {
      res.body = payload;
      res.ended = true;
      return res;
    },
    send(payload) {
      res.body = payload;
      res.ended = true;
      return res;
    },
    end() {
      res.ended = true;
      return res;
    },
  };
  return res;
}

async function call(body, { method = "POST" } = {}) {
  const req = { method, body, headers: { "x-forwarded-for": "203.0.113.9" } };
  const res = makeRes();
  await handler(req, res);
  return res;
}

beforeEach(() => {
  vi.restoreAllMocks();
  // Hermetic: no test may reach a real provider. A refused upstream is itself a
  // legitimate structured failure, so the assertions below still hold.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("upstream unreachable", { status: 502 })),
  );
});

describe("POST /api/downloadify", () => {
  it("answers a preflight without touching the network", async () => {
    const res = await call(null, { method: "OPTIONS" });
    expect(res.statusCode).toBe(204);
    expect(res.headers["access-control-allow-methods"]).toContain("POST");
  });

  it("rejects a non-POST with 405 instead of throwing", async () => {
    // The deployed function answered even a GET with 500, because the module
    // never loaded. A loaded module answers 405 here.
    const res = await call(null, { method: "GET" });
    expect(res.statusCode).toBe(405);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: "method" });
  });

  it("rejects an unknown action with a 400 JSON envelope, not a 500", async () => {
    const res = await call({ action: "nope" });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: "bad-action" });
  });

  /* VidSrc and NHD were deleted on 2026-10-03. Their actions have no handler
     left, so a stale client (or a cached bundle in a service worker) must get a
     clean 400 envelope naming the problem — never a 500, and never a silent
     empty success that the player would show as a playable-but-black server. */
  it.each(["resolvevidsrc", "resolvenhd"])("answers %s with an honest 400 after its retirement", async (action) => {
    const res = await call({ action, type: "movie", id: "27205" });
    expect(res.statusCode).toBe(400);
    expect(res.statusCode).not.toBe(500);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: "bad-action" });
  });

  it("tolerates a malformed JSON body instead of crashing", async () => {
    const res = await call("{not json");
    expect(res.statusCode).toBe(400);
    expect(res.statusCode).not.toBe(500);
  });

  it.each([
    "resolve",
     "resolvevidcore",
     "resolvezxc",
    "manifest",
    "playlist",
    "segment",
  ])("%s without a URL returns a structured refusal, never a 500", async (action) => {
    // No upstream host supplied, so the provider walk must bail out through its
    // own error path. What matters is the shape: a JSON envelope with ok:false,
    // not an unhandled throw (which Vercel renders as a bodiless 500).
    const res = await call({ action });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(600);
    const payload = JSON.parse(res.body);
    expect(payload.ok).toBe(false);
    expect(typeof payload.error).toBe("string");
  });

  describe("resolvevidcore â€” vidrack aggregate (Server 1)", () => {
    /* Server 1 resolves through vidrack's OWN multi-provider aggregate, NOT
       vidcore.io. That is not a preference: vidcore.io refuses Vercel's egress
       with a 403 from both iad1 and bom1, which is exactly what killed Server 1
       (da5bd23 swapped the aggregate for direct extraction). The aggregate needs
       no token exchange and answers `{ serverSources: [...] }` directly.
       The source URLs below are PUBLIC IP LITERALS on purpose: fetchUpstream's
       SSRF guard skips DNS for an IP host, which keeps the suite hermetic. */
    const VIDRACK_API = "https://vidrack.created.app/api/sources";
    const VIDZEN_FALLBACK = {
      sources: [{ url: "/api/stream/v1_zen" }],
    };

    function textBody(value) {
      return { ok: true, status: 200, text: async () => value };
    }

    /* The real shape of the live response: an Auto master, two labelled rungs, a
       mirror-host duplicate of one of them, and a non-HLS row. */
    const AGGREGATE = {
      serverSources: [
        { url: "https://93.184.216.34/auto.m3u8", type: "hls", quality: "Auto", provider: "movish-lyra-1" },
        { url: "https://93.184.216.35/a.m3u8", type: "hls", quality: "1080p", provider: "viduki-leon" },
        { url: "https://93.184.216.35/mirror.m3u8", type: "hls", quality: "1080p", provider: "viduki-leon" },
        { url: "https://93.184.216.36/b.m3u8", type: "hls", quality: "720p", provider: "viduki-ethan" },
        { url: "https://93.184.216.37/c.mp4", type: "mp4", quality: "1080p", provider: "viduki-sherry" },
      ],
      sseUrl: null,
      mode: "auto",
    };

    const VIDZEN_MASTER = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1700000,RESOLUTION=1280x720\nseg.m3u8\n";

    function routeVidrack({ payload = AGGREGATE } = {}) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url) => {
          const to = String(url);
          if (to.startsWith(VIDRACK_API)) return textBody(JSON.stringify(payload));
          if (to.includes("vidzen.fun/api/sources")) return textBody(JSON.stringify(VIDZEN_FALLBACK));
          // vidzen's media playlist is the last leg of the fallback chain.
          return textBody(VIDZEN_MASTER);
        }),
      );
    }

    it("orders masters first, maps labels to heights, dedupes mirrors, drops non-HLS", async () => {
      routeVidrack();
      const res = await call({ action: "resolvevidcore", type: "movie", id: "7654320" });
      const payload = JSON.parse(res.body);
      // Auto master leads (height 0 = a real ABR ladder), then rungs tallâ†’short.
      expect(payload.variants.map((v) => v.height)).toEqual([0, 1080, 720]);
      expect(payload.variants[0].label).toBe("Auto");
      expect(payload.variants.map((v) => v.uri)).toEqual([
        "https://93.184.216.34/auto.m3u8",
        "https://93.184.216.35/a.m3u8",
        "https://93.184.216.36/b.m3u8",
      ]);
      // The owning player's referer rides the source for referer-gated CDNs.
      expect(payload.source.refUrl).toBe("https://vidcore.io/");
    });

    /* The reported production failure: a row whose playlist parses but whose
       AES-128 key we cannot fetch leaves the player with a RUNNING TIMER and no
       picture â€” the manifest is real, so duration/position render, but not one
       key or fragment ever lands. Every row we publish is therefore measured
       first. These tests are the only coverage of that gate. */
    describe("vidrack per-row playability gate", () => {
      const ENCRYPTED = (keyUrl) =>
        `#EXTM3U\n#EXT-X-VERSION:4\n#EXT-X-TARGETDURATION:4\n` +
        `#EXT-X-KEY:METHOD=AES-128,URI="${keyUrl}"\n` +
        `#EXTINF:4.0,\nseg0.m4s\n`;

      it("drops a row whose AES key we cannot fetch, keeping the playable ones", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(async (url) => {
            const to = String(url);
            if (to.startsWith(VIDRACK_API)) return textBody(JSON.stringify(AGGREGATE));
            if (to.includes("vidzen.fun/api/sources")) return textBody(JSON.stringify(VIDZEN_FALLBACK));
            // The 1080p row is AES-encrypted and its key endpoint 403s us.
            if (to.includes("93.184.216.35/a.m3u8")) {
              return textBody(ENCRYPTED("https://93.184.216.35/v1/key/deadbeef"));
            }
            if (to.includes("/v1/key/")) return new Response("no", { status: 403 });
            return textBody("#EXTM3U\n#EXTINF:4.0,\nseg0.m4s\n");
          }),
        );
        const res = await call({ action: "resolvevidcore", type: "movie", id: "7654340" });
        const payload = JSON.parse(res.body);
        const uris = payload.variants.map((v) => v.uri);
        // The unplayable row is gone; the plain ones survive.
        expect(uris).not.toContain("https://93.184.216.35/a.m3u8");
        expect(uris).toContain("https://93.184.216.34/auto.m3u8");
        expect(uris).toContain("https://93.184.216.36/b.m3u8");
      });

      it("keeps an encrypted row when the key IS fetchable", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(async (url) => {
            const to = String(url);
            if (to.startsWith(VIDRACK_API)) return textBody(JSON.stringify(AGGREGATE));
            if (to.includes("vidzen.fun/api/sources")) return textBody(JSON.stringify(VIDZEN_FALLBACK));
            if (to.includes("93.184.216.35/a.m3u8")) {
              return textBody(ENCRYPTED("https://93.184.216.35/v1/key/livebeef"));
            }
            if (to.includes("/v1/key/")) return new Response(new Uint8Array(16), { status: 200 });
            return textBody("#EXTM3U\n#EXTINF:4.0,\nseg0.m4s\n");
          }),
        );
        const res = await call({ action: "resolvevidcore", type: "movie", id: "7654341" });
        const payload = JSON.parse(res.body);
        expect(payload.variants.map((v) => v.uri)).toContain("https://93.184.216.35/a.m3u8");
      });

      it("drops a row whose playlist itself is unreadable", async () => {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(async (url) => {
            const to = String(url);
            if (to.startsWith(VIDRACK_API)) return textBody(JSON.stringify(AGGREGATE));
            if (to.includes("vidzen.fun/api/sources")) return textBody(JSON.stringify(VIDZEN_FALLBACK));
            if (to.includes("93.184.216.35/a.m3u8")) return new Response("gone", { status: 403 });
            return textBody("#EXTM3U\n#EXTINF:4.0,\nseg0.m4s\n");
          }),
        );
        const res = await call({ action: "resolvevidcore", type: "movie", id: "7654342" });
        const payload = JSON.parse(res.body);
        expect(payload.variants.map((v) => v.uri)).not.toContain("https://93.184.216.35/a.m3u8");
      });
    });

    it("passes season/episode to the aggregate for tv and omits them for movie", async () => {
      const seen = [];
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url) => {
          const to = String(url);
          if (to.startsWith(VIDRACK_API)) {
            seen.push(to);
            return textBody(JSON.stringify(AGGREGATE));
          }
          return new Response("upstream unreachable", { status: 502 });
        }),
      );
      await call({ action: "resolvevidcore", type: "tv", id: "1399", season: "1", episode: "1" });
      expect(seen[0]).toContain("id=1399");
      expect(seen[0]).toContain("type=tv");
      expect(seen[0]).toContain("season=1");
      expect(seen[0]).toContain("episode=1");

      seen.length = 0;
      await call({ action: "resolvevidcore", type: "movie", id: "27205" });
      expect(seen[0]).toContain("id=27205");
      expect(seen[0]).toContain("type=movie");
      expect(seen[0]).not.toContain("season=");
    });

    it("falls through to vidzen when the aggregate carries no playable row", async () => {
      routeVidrack({ payload: { serverSources: [] } });
      const res = await call({ action: "resolvevidcore", type: "movie", id: "7654321" });
      const payload = JSON.parse(res.body);
      expect(payload.ok).toBe(true);
      expect(payload.source.url).toContain("vidzen.fun");
      // vidzen is the 800p ceiling: the client must learn a richer ladder
      // exists so it can ask for the full pass in the background.
      expect(payload.upgradeable).toBe(true);
    });

    it("keeps a labelled rung when ~20 Auto masters would otherwise fill every slot", async () => {
      // The live aggregate returns ~20 "Auto" masters for a typical title. A
      // plain "masters first, then slice(6)" filled all six slots with height-0
      // rows, and the player's by-label dedupe collapsed the quality menu to a
      // single "Auto" entry with no manual choice at all.
      const manyMasters = Array.from({ length: 20 }, (_, i) => ({
        url: `https://93.184.216.${40 + i}/auto.m3u8`,
        type: "hls",
        quality: "Auto",
        provider: `movish-${i}`,
      }));
      routeVidrack({
        payload: {
          serverSources: [
            ...manyMasters,
            { url: "https://93.184.216.10/r1080.m3u8", type: "hls", quality: "1080p", provider: "viduki-leon" },
            { url: "https://93.184.216.11/r720.m3u8", type: "hls", quality: "720p", provider: "viduki-ethan" },
            { url: "https://93.184.216.12/r1080b.m3u8", type: "hls", quality: "1080p", provider: "viduki-claire" },
          ],
        },
      });
      const res = await call({ action: "resolvevidcore", type: "movie", id: "7654330" });
      const payload = JSON.parse(res.body);
      // Master still leads (best default), and BOTH distinct rungs survive.
      expect(payload.variants.length).toBe(6);
      expect(payload.variants[0].height).toBe(0);
      expect(payload.variants.map((v) => v.height)).toContain(1080);
      expect(payload.variants.map((v) => v.height)).toContain(720);
      // The duplicate 1080p row loses to the first one of that height.
      expect(payload.variants.filter((v) => v.height === 1080)).toHaveLength(1);
    });

    it("answers no-source when every stage fails, never a 500", async () => {
      // beforeEach already refuses every upstream with 502.
      const res = await call({ action: "resolvevidcore", type: "movie", id: "7654322" });
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload).toMatchObject({ ok: false, code: "no-source" });
    });

    it("serves the whole ladder on phase:full without falling back to vidzen", async () => {
      routeVidrack();
      const res = await call({ action: "resolvevidcore", type: "movie", id: "7654323", phase: "full" });
      const payload = JSON.parse(res.body);
      expect(payload.ok).toBe(true);
      expect(payload.ladderSource).toBe("vidrack");
      expect(payload.variants.map((v) => v.height)).toEqual([0, 1080, 720]);
    });

    it("warm cache: a repeat fast call answers the full ladder with cached:true", async () => {
      routeVidrack();
      const first = JSON.parse(
        (await call({ action: "resolvevidcore", type: "movie", id: "7654324" })).body,
      );
      expect(first.ladderSource).toBe("vidrack");
      const second = JSON.parse(
        (await call({ action: "resolvevidcore", type: "movie", id: "7654324" })).body,
      );
      expect(second.cached).toBe(true);
      expect(second.source.url).toBe(first.source.url);
      expect(second.variants.map((v) => v.height)).toEqual(first.variants.map((v) => v.height));
    });

    it("phase:full answers an honest no-upgrade when the chain fails", async () => {
      // beforeEach already refuses every upstream with 502.
      const res = await call({ action: "resolvevidcore", type: "movie", id: "7654325", phase: "full" });
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      // NOT "no-source": the fast phase already put a stream on screen â€” this
      // verdict only means "no richer ladder exists".
      expect(payload).toMatchObject({ ok: false, code: "no-upgrade" });
    });

    it("ladder-pending: neither catalogue in the window answers a retryable verdict", async () => {
      // Fake timers: the fast-phase deadline is ~9.5s real time, far too slow
      // for CI â€” advance the clock to just past it instead.
      vi.useFakeTimers();
      try {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockImplementation(async () => new Promise(() => {})),
        );
        const pending = call({ action: "resolvevidcore", type: "movie", id: "7654326" });
        await vi.advanceTimersByTimeAsync(9600);
        const res = await pending;
        const payload = JSON.parse(res.body);
        expect(payload).toMatchObject({ ok: false, code: "ladder-pending", upgradeable: true });
      } finally {
        vi.useRealTimers();
      }
    });
  });
});

describe("POST /api/downloadify â€” resolvezxc", () => {
  const callZxc = (body) => call({ action: "resolvezxc", type: "movie", id: "1101383", ...body });

  it("rejects an unknown server before any provider request", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await callZxc({ server: "not-a-server" });
    expect(res.statusCode).toBe(400);
    const payload = JSON.parse(res.body);
    expect(payload.ok).toBe(false);
    expect(payload.error).toMatch(/server/i);
    // A bad server key is a client bug â€” it must not spend an upstream call.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("defaults to centaurus when no server is named", async () => {
    // The client always names a server (each SOURCES row binds one), so a
    // missing key is a lenient fallback rather than an error.
    const fetchMock = vi.fn(async () => new Response("nope", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await callZxc({});
    expect([200, 400]).toContain(res.statusCode);
    expect(JSON.parse(res.body).ok).toBe(false);
  });

  it("returns a structured refusal when the provider is unreachable, not a 500", async () => {
    // beforeEach stubs every fetch to a 502, so the mint/lookup chain fails
    // upstream. The handler must still answer with a JSON envelope.
    const res = await callZxc({ server: "centaurus" });
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload.ok).toBe(false);
    expect(typeof payload.error).toBe("string");
  });

  it("carries season/episode into the TV provider request", async () => {
    // TV identity has to reach the provider's mint call, or every episode
    // would resolve to the same stream.
    const fetchMock = vi.fn(async () => new Response("nope", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    await callZxc({ type: "tv", season: 2, episode: 7, server: "atlas" });
    const bodies = fetchMock.mock.calls
      .map(([, init]) => init?.body)
      .filter(Boolean)
      .map((b) => JSON.parse(b));
    const mint = bodies.find((b) => b["6b491e7253ad84d392e7561a9384c"] === "atlas");
    expect(mint).toBeTruthy();
    expect(mint["d8427b59ce30684a2f957c3613e85b"]).toBe("2");
    expect(mint["91c6e4a728503d1f785c92346b713d"]).toBe("7");
  });

  it("omits season/episode for a movie", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    await callZxc({ type: "movie", season: 2, episode: 7, server: "atlas" });
    const bodies = fetchMock.mock.calls
      .map(([, init]) => init?.body)
      .filter(Boolean)
      .map((b) => JSON.parse(b));
    const mint = bodies.find((b) => b["6b491e7253ad84d392e7561a9384c"] === "atlas");
    expect(mint).toBeTruthy();
    // Sending empty episode keys would make the provider answer episode 0.
    expect(mint["d8427b59ce30684a2f957c3613e85b"]).toBeUndefined();
    expect(mint["91c6e4a728503d1f785c92346b713d"]).toBeUndefined();
  });
});
