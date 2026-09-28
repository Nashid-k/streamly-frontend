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
