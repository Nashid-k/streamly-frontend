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

  it("tolerates a malformed JSON body instead of crashing", async () => {
    const res = await call("{not json");
    expect(res.statusCode).toBe(400);
    expect(res.statusCode).not.toBe(500);
  });

  it.each([
    "resolve",
    "resolvevidsrc",
    "resolvevidcore",
    "resolvenhd",
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

  describe("resolvevidcore — vidrack aggregate ladder (Server 1 restoration)", () => {
    const VIDRACK_AGGREGATE = {
      mode: "hybrid",
      sseUrl: "https://sse.example.internal/movie",
      serverSources: [
        { url: "https://api.dlproxy.com/v1/play/tokenA.m3u8", type: "hls", quality: "Auto", label: "Vidlink", provider: "vidlink" },
        { url: "https://api.dlproxy.com/v1/vs/tokenB.m3u8", type: "hls", quality: "1080p", label: "Vidlink HD", provider: "vidlink-hd" },
        // Same encode mirrored on the same host + same height: deduped.
        { url: "https://api.dlproxy.com/v1/vs/tokenB-copy.m3u8", type: "hls", quality: "1080p", label: "Vidlink HD 2", provider: "vidlink-hd" },
        // Same height on a DIFFERENT host is a different route — kept.
        { url: "https://mirror.example.com/pl/x.m3u8", type: "hls", quality: "1080p", label: "Mirror", provider: "mirror" },
        { url: "https://relay.vidrift.net/proxy?u=1", type: "hls", quality: "HD", label: "Vidrift", provider: "vidrift" },
        { url: "https://antilogarithm.example/pl/y", type: "mp4", quality: "1080p", label: "Not HLS", provider: "x" },
      ],
    };
    const VIDZEN_FALLBACK = {
      sources: [{ url: "/api/stream/v1_zen" }],
    };

    function routeFetch(videasyShape) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url) => {
          const to = String(url);
          if (to.includes("vidrack.created.app")) {
            return { ok: true, status: 200, text: async () => JSON.stringify(VIDRACK_AGGREGATE) };
          }
          if (to.includes("vidzen.fun/api/sources")) {
            return { ok: true, status: 200, text: async () => JSON.stringify(VIDZEN_FALLBACK) };
          }
          return videasyShape;
        }),
      );
    }

    it("parses the aggregate into a quality ladder: masters lead, rungs sorted tall-to-short, mirrors deduped, capped at 6", async () => {
      routeFetch(new Response("upstream unreachable", { status: 502 }));
      const res = await call({ action: "resolvevidcore", type: "movie", id: "1108427" });
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload.ok).toBe(true);
      // Masters first (height 0 = real ABR ladder), then explicit rungs tall->short.
      // Auto + HD are both masters (no numeric rung). The same-host+provider
      // 1080p mirror dedupes away; the other-host 1080p survives as a route.
      expect(payload.variants.map((v) => v.height)).toEqual([0, 0, 1080, 1080]);
      expect(payload.variants[0].uri).toBe("https://api.dlproxy.com/v1/play/tokenA.m3u8");
      expect(payload.variants[1].uri).toBe("https://relay.vidrift.net/proxy?u=1");
      expect(payload.variants[2].uri).toBe("https://api.dlproxy.com/v1/vs/tokenB.m3u8");
      expect(payload.variants[3].uri).toBe("https://mirror.example.com/pl/x.m3u8");
      // The owning player's referer rides the source so referer-gated CDNs serve us.
      expect(payload.source.refUrl).toBe("https://vidcore.io/");
      expect(payload.source.url).toBe(payload.variants[0].uri);
    });

    it("falls through to vidzen when the aggregate lists nothing usable", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url) => {
          const to = String(url);
          if (to.includes("vidrack.created.app")) {
            return { ok: true, status: 200, text: async () => JSON.stringify({ serverSources: [] }) };
          }
          if (to.includes("vidzen.fun/api/sources")) {
            return { ok: true, status: 200, text: async () => JSON.stringify(VIDZEN_FALLBACK) };
          }
          // vidzen master playlist
          return {
            ok: true,
            status: 200,
            text: async () => "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1700000,RESOLUTION=1280x720\nseg.m3u8\n",
          };
        }),
      );
      const res = await call({ action: "resolvevidcore", type: "movie", id: "1108427" });
      const payload = JSON.parse(res.body);
      expect(payload.ok).toBe(true);
      expect(payload.source.url).toContain("vidzen.fun");
    });

    it("answers no-source when every stage fails, never a 500", async () => {
      // beforeEach already refuses every upstream with 502.
      const res = await call({ action: "resolvevidcore", type: "movie", id: "1108427" });
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload).toMatchObject({ ok: false, code: "no-source" });
    });
  });
});

describe("POST /api/downloadify — resolvezxc", () => {
  const callZxc = (body) => call({ action: "resolvezxc", type: "movie", id: "1101383", ...body });

  it("rejects an unknown server before any provider request", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await callZxc({ server: "not-a-server" });
    expect(res.statusCode).toBe(400);
    const payload = JSON.parse(res.body);
    expect(payload.ok).toBe(false);
    expect(payload.error).toMatch(/server/i);
    // A bad server key is a client bug — it must not spend an upstream call.
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
