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

const { default: handler, clearZxcMpdCache, clearZxcTitleMetaCache, zxcContractSeed } = await import("../../api/stream.js");

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
      relayTargets.some((target) => String(target).includes(zxcContractSeed().detailsPath)),
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
      // Read the seed, not a frozen literal: a provider rename must not strand
      // this suite (the seed is what the handler mints through first).
      return String(new URL(u).searchParams.get("url")).includes(zxcContractSeed().mintPath);
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
      String(url).includes(zxcContractSeed().detailsPath)
        ? new Response(JSON.stringify({ title: "T", release_date: "2020-01-01" }), { status: 200 })
        : new Response("nope", { status: 502 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await callZxc({ type: "tv", season: 1, episode: 1, server: "atlas" });

    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes(`zxcstream.cc${zxcContractSeed().detailsPath}`)),
    ).toBe(true);
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes("script.google.com"))).toBe(true);
  });
});

describe("NetMirror relay routing", () => {
  it("sends NewTV JSON through the relay with its catalogue + fingerprint headers", async () => {
    process.env.ZXC_RELAY_URL = RELAY_URL;
    const MASTER = [
      "#EXTM3U",
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="eng",DEFAULT=YES,URI="https://s20.freecdn1.top/files/70131314/a/0/0.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1080,AUDIO="aud"',
      "https://s0022.freecdn4.top/files/70131314/1080p/1080p.m3u8",
    ].join("\n");
    const AUDIO = [
      "#EXTM3U",
      "#EXT-X-TARGETDURATION:8",
      "#EXTINF:8.0,",
      "7596_000.js",
      "#EXT-X-ENDLIST",
    ].join("\n");

    const fetchMock = vi.fn(async (url) => {
      const relayUrl = String(url);
      if (!relayUrl.startsWith(RELAY_URL)) {
        throw new Error(`direct provider call: ${relayUrl}`);
      }
      const target = String(new URL(relayUrl).searchParams.get("url"));
      if (target.includes("/newtv/search.php")) {
        return relayEnvelope(
          JSON.stringify({ searchResult: [{ id: "70131314", t: "Inception" }] }),
        );
      }
      if (target.includes("/newtv/player.php")) {
        return relayEnvelope(
          JSON.stringify({
            video_link: "https://tv.imgcdn.kim/newtv/hls/master.m3u8",
            referer: "https://net52.cc",
          }),
        );
      }
      if (target.endsWith("/master.m3u8")) return relayEnvelope(MASTER);
      if (target.includes("freecdn1.top")) return relayEnvelope(AUDIO);
      return relayEnvelope("nope", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await call({
      action: "resolveNetmirror",
      type: "movie",
      id: "27205",
      title: "Inception",
    });
    const body = JSON.parse(res.body);
    expect(body.ok).toBe(true);
    expect(body.provider).toBe("NetMirror");
    expect(body.audioTrackCount).toBeGreaterThan(0);

    const relayCalls = fetchMock.mock.calls.map(([u]) => new URL(String(u)));
    expect(relayCalls.length).toBeGreaterThan(0);
    const searchCall = relayCalls.find((u) =>
      String(u.searchParams.get("url")).includes("/newtv/search.php"),
    );
    expect(searchCall).toBeTruthy();
    expect(["nf", "pv", "hs"]).toContain(searchCall.searchParams.get("ott"));
    expect(searchCall.searchParams.get("xrw")).toBe("NetmirrorNewTV v1.0");
    expect(searchCall.searchParams.get("ua")).toContain("GatuNewTV");
    // The audio manifest lives on a rotated freecdn host; it must ride the same
    // relay with the net52 referer, or the resolver rejects the title as silent.
    const audioCall = relayCalls.find((u) =>
      String(u.searchParams.get("url")).includes("freecdn1.top"),
    );
    expect(audioCall).toBeTruthy();
    expect(audioCall.searchParams.get("referer")).toBe("https://net52.cc");
    // Nothing reached a provider host directly; every text leg used the relay.
    expect(fetchMock.mock.calls.every(([u]) => new URL(String(u)).hostname === "script.google.com")).toBe(true);
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
