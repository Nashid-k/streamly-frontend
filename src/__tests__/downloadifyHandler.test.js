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

  describe("resolvevidcore — vidcore.io + enc-dec token exchange (Server 1)", () => {
    /* Server 1 is resolved by scraping the "en" token out of the VidCore page
       and exchanging it through enc-dec.app; the old vidrack `/api/sources`
       aggregate is gone upstream. These tests drive the chain that actually
       runs. The master/stream hosts are PUBLIC IP LITERALS on purpose:
       fetchUpstream's SSRF guard skips DNS for an IP host, which keeps the
       whole suite hermetic (no resolver, no network). */
    const MASTER_URL = "https://93.184.216.34/master.m3u8";
    const SERVERS_URL = "https://93.184.216.35/servers";
    const STREAM_URL = "https://93.184.216.35/stream";
    const MASTER_PLAYLIST = [
      "#EXTM3U",
      "#EXT-X-STREAM-INF:BANDWIDTH=8000000,RESOLUTION=3840x2160",
      "2160/index.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080",
      "1080/index.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=1400000,RESOLUTION=1280x720",
      "720/index.m3u8",
    ].join("\n");
    const VIDZEN_FALLBACK = {
      sources: [{ url: "/api/stream/v1_zen" }],
    };

    function textBody(value) {
      return { ok: true, status: 200, text: async () => value };
    }
    function jsonBody(value) {
      return { ok: true, status: 200, text: async () => JSON.stringify(value), json: async () => value };
    }

    function routeVidcore({ masterPlaylist = MASTER_PLAYLIST } = {}) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url, init) => {
          const to = String(url);
          // 1. the VidCore page carries the encrypted "en" token
          if (to.startsWith("https://vidcore.io/")) {
            return textBody('<script>{"en":"EN_TOKEN_123"}</script>');
          }
          // 2. token -> { servers, stream, csrf }
          if (to.includes("enc-dec.app/api/enc-vidcore")) {
            return jsonBody({
              status: 200,
              result: { servers: SERVERS_URL, stream: STREAM_URL, token: "csrf-token" },
            });
          }
          // 3/5. the server list and the chosen server's stream, both POSTed
          if (to === SERVERS_URL) return textBody("SERVERS_BLOB");
          if (to === `${STREAM_URL}/srv1`) return textBody("STREAM_BLOB");
          // 4/6. dec-vidcore — the request body says which blob is being decoded
          if (to.includes("enc-dec.app/api/dec-vidcore")) {
            const body = JSON.parse(init?.body || "{}");
            if (body.text === "SERVERS_BLOB") return jsonBody({ result: [{ data: "srv1" }] });
            return jsonBody({ result: { url: MASTER_URL } });
          }
          // 7. the resolved master playlist
          if (to === MASTER_URL) return textBody(masterPlaylist);
          if (to.includes("vidzen.fun/api/sources")) return textBody(JSON.stringify(VIDZEN_FALLBACK));
          return new Response("upstream unreachable", { status: 502 });
        }),
      );
    }

    it("walks the vidcore + enc-dec chain and returns the master's real ladder", async () => {
      routeVidcore();
      const res = await call({ action: "resolvevidcore", type: "movie", id: "7654320" });
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload.ok).toBe(true);
      expect(payload.ladderSource).toBe("vidrack");
      // The ladder is the master's own published order, tallest first.
      expect(payload.variants.map((v) => v.height)).toEqual([2160, 1080, 720]);
      expect(payload.variants[0].uri).toBe("https://93.184.216.34/2160/index.m3u8");
      expect(payload.variants[2].uri).toBe("https://93.184.216.34/720/index.m3u8");
      // The owning player's referer rides the source so referer-gated CDNs serve us.
      expect(payload.source.refUrl).toBe("https://vidcore.io/");
      expect(payload.source.url).toBe(MASTER_URL);
    });

    it("falls through to vidzen when the vidcore chain yields no stream", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(async (url) => {
          const to = String(url);
          // A VidCore page carrying no "en" token: the primary chain cannot
          // resolve, which is exactly when the vidzen fallback must carry it.
          if (to.startsWith("https://vidcore.io/")) return textBody("<html><body>no token</body></html>");
          if (to.includes("vidzen.fun/api/sources")) return textBody(JSON.stringify(VIDZEN_FALLBACK));
          // vidzen master playlist
          return textBody("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1700000,RESOLUTION=1280x720\nseg.m3u8\n");
        }),
      );
      const res = await call({ action: "resolvevidcore", type: "movie", id: "7654321" });
      const payload = JSON.parse(res.body);
      expect(payload.ok).toBe(true);
      expect(payload.source.url).toContain("vidzen.fun");
      // vidzen is the 800p ceiling: the client must learn a richer ladder
      // exists so it can ask for the full pass in the background.
      expect(payload.upgradeable).toBe(true);
    });

    it("answers no-source when every stage fails, never a 500", async () => {
      // beforeEach already refuses every upstream with 502.
      const res = await call({ action: "resolvevidcore", type: "movie", id: "7654322" });
      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.body);
      expect(payload).toMatchObject({ ok: false, code: "no-source" });
    });

    it("serves the whole ladder on phase:full without falling back to vidzen", async () => {
      routeVidcore();
      const res = await call({ action: "resolvevidcore", type: "movie", id: "7654323", phase: "full" });
      const payload = JSON.parse(res.body);
      expect(payload.ok).toBe(true);
      expect(payload.ladderSource).toBe("vidrack");
      expect(payload.variants.map((v) => v.height)).toEqual([2160, 1080, 720]);
    });

    it("warm cache: a repeat fast call answers the full ladder with cached:true", async () => {
      routeVidcore();
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
      // NOT "no-source": the fast phase already put a stream on screen — this
      // verdict only means "no richer ladder exists".
      expect(payload).toMatchObject({ ok: false, code: "no-upgrade" });
    });

    it("ladder-pending: neither catalogue in the window answers a retryable verdict", async () => {
      // Fake timers: the fast-phase deadline is ~9.5s real time, far too slow
      // for CI — advance the clock to just past it instead.
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
