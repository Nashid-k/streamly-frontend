// The provider (zxcstream.cc) sits behind a WAF that 502s every /backend* call
// from datacenter IPs, so the deployed function cannot mint a stream directly.
// When ZXC_RELAY_URL is configured, server/net.js routes those TEXT fetches
// through an external relay (a Google Apps Script web app on an allowed egress
// IP). These tests drive the real handler and prove:
//   1. provider-host text fetches go THROUGH the relay, never direct, when set;
//   2. they go direct, unchanged, when it is not;
//   3. the `capabilities` action truthfully reports whether native is possible.
//
// Hermetic: DNS is mocked and global fetch is stubbed, so no real provider is
// ever touched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup, default: { lookup } }));

const { default: handler, clearZxcMpdCache, clearZxcTitleMetaCache } = await import("../../api/stream.js");

const RELAY_URL = "https://script.google.com/macros/s/TEST/exec?token=secret";

function makeRes() {
  const res = {
    statusCode: null,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader() {
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
    send(payload) {
      res.body = payload;
      return res;
    },
    end() {
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

const callZxc = (body) => call({ action: "resolvezxc", type: "movie", id: "1101383", ...body });

/* A relay response envelope: the provider's status/content-type/body wrapped in
   the JSON contract apps-script/zxc-relay.gs emits. */
function relayEnvelope(upstreamBody, { status = 200, contentType = "application/json" } = {}) {
  return new Response(
    JSON.stringify({ status, contentType, body: upstreamBody }),
    { status: 200 },
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
  clearZxcMpdCache();
  clearZxcTitleMetaCache();
  delete process.env.ZXC_RELAY_URL;
});

afterEach(() => {
  delete process.env.ZXC_RELAY_URL;
});

describe("ZXC relay routing (server/net.js fetchUpstream)", () => {
  it("routes provider text fetches through the relay when ZXC_RELAY_URL is set", async () => {
    process.env.ZXC_RELAY_URL = RELAY_URL;
    const fetchMock = vi.fn(async () =>
      relayEnvelope(JSON.stringify({ title: "T", release_date: "2020-01-01", imdb_id: "tt0000001" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callZxc({ type: "tv", season: 1, episode: 1, server: "orion" });

    const relayCalls = fetchMock.mock.calls.filter(([u]) => String(u).startsWith(RELAY_URL));
    expect(relayCalls.length).toBeGreaterThan(0);
    const relayTargets = relayCalls.map(([u]) => new URL(u).searchParams.get("url"));
    expect(
      relayTargets.some((target) => String(target).includes("/backend/tmdb/details/")),
    ).toBe(true);
    // Every relay request carries the provider URL, never the relay URL again.
    expect(relayTargets.every((target) => String(target).startsWith("https://zxcstream.cc/"))).toBe(true);
    // Nothing reached the provider directly (every call went to script.google.com).
    expect(fetchMock.mock.calls.every(([u]) => new URL(u).hostname === "script.google.com")).toBe(true);
  });

  it("forwards the method and body so the POST token mint still mints", async () => {
    process.env.ZXC_RELAY_URL = RELAY_URL;
    const fetchMock = vi.fn(async () =>
      relayEnvelope(JSON.stringify({ title: "T", release_date: "2020-01-01" })),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callZxc({ type: "movie", server: "orion" });

    const mintCall = fetchMock.mock.calls.find(([u]) => {
      if (!String(u).startsWith(RELAY_URL)) return false;
      return String(new URL(u).searchParams.get("url")).includes("/backend/fucku");
    });
    expect(mintCall).toBeTruthy();
    const [mintUrl, mintInit] = mintCall;
    const params = new URL(mintUrl).searchParams;
    expect(mintInit.method).toBe("GET");
    expect(params.get("method")).toBe("POST");
    expect(typeof params.get("body")).toBe("string");
    expect(params.get("ctype")).toBe("application/json");
    expect(params.get("referer")).toContain("zxcstream.cc");
  });

  it("hits the provider directly when no relay is configured", async () => {
    const fetchMock = vi.fn(async (url) =>
      String(url).includes("/backend/tmdb/details/")
        ? new Response(JSON.stringify({ title: "T", release_date: "2020-01-01" }), { status: 200 })
        : new Response("nope", { status: 502 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callZxc({ type: "tv", season: 1, episode: 1, server: "atlas" });

    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes("zxcstream.cc/backend/tmdb/details/")),
    ).toBe(true);
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes("script.google.com"))).toBe(true);
  });
});

describe("POST /api/stream — capabilities", () => {
  it("reports zxcNative true when a relay is configured", async () => {
    process.env.ZXC_RELAY_URL = RELAY_URL;
    const res = await call({ action: "capabilities" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, zxcNative: true });
  });

  it("reports zxcNative false when no relay is configured", async () => {
    const res = await call({ action: "capabilities" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, zxcNative: false });
  });

  it("treats a blank ZXC_RELAY_URL as unset", async () => {
    process.env.ZXC_RELAY_URL = "   ";
    const res = await call({ action: "capabilities" });
    expect(JSON.parse(res.body)).toEqual({ ok: true, zxcNative: false });
  });
});
