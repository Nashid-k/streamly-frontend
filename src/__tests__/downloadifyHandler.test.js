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

  it.each(["resolve", "resolvevidsrc", "resolvevidcore", "manifest", "playlist", "segment"])(
    "%s without a URL returns a structured refusal, never a 500",
    async (action) => {
      // No upstream host supplied, so the provider walk must bail out through its
      // own error path. What matters is the shape: a JSON envelope with ok:false,
      // not an unhandled throw (which Vercel renders as a bodiless 500).
      const res = await call({ action });
      expect(res.statusCode).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(600);
      const payload = JSON.parse(res.body);
      expect(payload.ok).toBe(false);
      expect(typeof payload.error).toBe("string");
    },
  );
});
