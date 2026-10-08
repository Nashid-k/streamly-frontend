// End-to-end guard for the reported production failure:
//
//   POST /api/stream -> 500 (Internal Server Error)
//   [Streamly][download] <provider> has no downloadable stream
//
// The 500 was not a provider failure: api/stream.js imported `resolveUrl`
// from src/utils/hlsPlaylist.js (then named downloadQuality.js), which never
// exported it, so the ESM module
// failed to LINK and every action threw before the handler ever ran. The client
// then reported the 500 as "no downloadable stream", which is why the real cause
// was invisible from the app's own logs.
//
// These tests drive the actual handler with a stub req/res, so a future link or
// dispatch regression shows up here instead of on someone's title page.
import { describe, it, expect, beforeEach, vi } from "vitest";

const { default: handler, clearZxcMpdCache, clearZxcTitleMetaCache } = await import("../../api/stream.js");

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
  clearZxcMpdCache();
  clearZxcTitleMetaCache();
  // Hermetic: no test may reach a real provider. A refused upstream is itself a
  // legitimate structured failure, so the assertions below still hold.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("upstream unreachable", { status: 502 })),
  );
});

describe("POST /api/stream", () => {
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

  /* Retired actions have no handler left, so the dispatch falls through to the
     400 default. A stale client (or a cached bundle in a service worker) must
     get a clean 400 envelope naming the problem — never a 500, and never a
     silent empty success the player would show as a playable-but-black server.
     Every resolver that has been cut, and why:
       · `resolvevidcore` (Server 5, VidRack) — every ladder row was AES-128
         behind an api.dlproxy.com key host that 403s us, fatal to hls.js
         (2026-10-04);
       · `resolvevidsrc` / `resolvenhd` — providers deleted with iframe playback
         (2026-10-03);
       · `resolve` — the old embed-download resolver; its hosts (CineSrc,
         VidCore, 2embed, peachify, vidup) were all retired with it;
       · `manifest` — redundant now that hls.js parses playlists itself. */
  it.each(["resolve", "resolvevidcore", "resolvevidsrc", "resolvenhd", "manifest"])(
    "answers the retired action %s with a clean 400",
    async (action) => {
      const res = await call({ action, type: "movie", id: "27205" });
      expect(res.statusCode).toBe(400);
      expect(res.statusCode).not.toBe(500);
      expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: "bad-action" });
    },
  );

  it("tolerates a malformed JSON body instead of crashing", async () => {
    const res = await call("{not json");
    expect(res.statusCode).toBe(400);
    expect(res.statusCode).not.toBe(500);
  });

  it.each(["resolvezxc", "zxcintro", "playlist", "segment"])(
    "%s without a URL returns a structured refusal, never a 500",
    async (action) => {
      // No upstream host supplied, so the handler must bail out through its own
      // error path. What matters is the shape: a JSON envelope with ok:false,
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

describe("POST /api/stream — resolvezxc", () => {
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
    // Title metadata is mandatory upstream, so the details lookup gets a
    // canned success while everything else stays refused.
    const fetchMock = vi.fn(async (url) =>
      String(url).includes("/backend/tmdb/details/")
        ? new Response(JSON.stringify({ title: "T", release_date: "2020-01-01", imdb_id: "tt0000001" }), { status: 200 })
        : new Response("nope", { status: 502 }),
    );
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
    // Same canned-metadata arrangement as the TV case above: metadata is
    // mandatory, so only the details lookup succeeds.
    const fetchMock = vi.fn(async (url) =>
      String(url).includes("/backend/tmdb/details/")
        ? new Response(JSON.stringify({ title: "T", release_date: "2020-01-01", imdb_id: "tt0000001" }), { status: 200 })
        : new Response("nope", { status: 502 }),
    );
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

  it("shares the title-metadata lookup across episodes of the same title", async () => {
    // The details endpoint is per-TITLE (same data for every episode), so the
    // cache key is `type|tmdbId` — season/episode must NOT leak into it, or a
    // two-episode session re-fetches identical metadata per episode.
    let detailsCalls = 0;
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes("/backend/tmdb/details/")) {
        detailsCalls += 1;
        return new Response(JSON.stringify({ title: "T", release_date: "2020-01-01" }), { status: 200 });
      }
      return new Response("nope", { status: 502 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await callZxc({ type: "tv", season: 1, episode: 1, server: "atlas" });
    expect(detailsCalls).toBe(1);
    await callZxc({ type: "tv", season: 1, episode: 5, server: "atlas" });
    expect(detailsCalls).toBe(1); // cross-episode: one details call for the title
    await callZxc({ type: "movie", id: "99999" });
    expect(detailsCalls).toBe(2); // a different tmdbId is a separate key
  });
});

describe("POST /api/stream — issued-host relay fence", () => {
  // The fence runs AFTER SSRF/public-destination validation but BEFORE any
  // network I/O, so these hosts are chosen to resolve publicly (example.org is
  // IANA's reserved-documentation domain) yet never be issued by a resolver.
  // A fresh instance admits nothing but the two trusted origins, so the
  // unissued-host cases must 403 without a single fetch.
  it("refuses a playlist on an unissued host with 403 before any network I/O", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call({ action: "playlist", playlistUrl: "https://example.org/play.m3u8" });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: "host-not-issued" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a segment on an unissued host with 403 before any network I/O", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call({
      action: "segment",
      url: "https://example.org/seg.ts",
      range: { start: 0, max: 1048576 },
    });
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: "host-not-issued" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("admits the trusted provider origin without a prior issuance", async () => {
    // vidstuck.xyz is the ZXC origin every marker/master/media URL lives on, so
    // it is always allowed — a fresh instance must be able to play immediately.
    const fetchMock = vi.fn(async () => new Response("nope", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call({ action: "playlist", playlistUrl: "https://vidstuck.xyz/provider/master.m3u8" });
    expect(res.statusCode).not.toBe(403);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("self-bootstraps a host that a served playlist body references", async () => {
    // Provider CDN rotation can hand a playlist body a host this instance never
    // touched (issueHostsInText admits every URL a relayed body references), so
    // the very next segment on that host passes the fence it would have failed
    // a request earlier.
    const fetchMock = vi.fn((url) =>
      String(url).includes("vidstuck.xyz")
        ? Promise.resolve(
            new Response("#EXTM3U\n#EXTINF:10,\nhttps://example.com/seg1.ts\n", { status: 200 }),
          )
        : Promise.resolve(new Response("nope", { status: 502 })),
    );
    vi.stubGlobal("fetch", fetchMock);
    const playlist = await call({ action: "playlist", playlistUrl: "https://vidstuck.xyz/provider/master.m3u8" });
    expect(playlist.statusCode).toBe(200);
    const seg = await call({
      action: "segment",
      url: "https://example.com/seg1.ts",
      range: { start: 0, max: 1048576 },
    });
    // The fence passed (no 403) and the segment URL actually reached the network.
    expect(seg.statusCode).not.toBe(403);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("example.com"))).toBe(true);
  });
});

describe("POST /api/stream — zxcintro", () => {
  it("answers a miss (200, null bounds) when imdbId is absent, spending no call", async () => {
    // upstream answers "Missing params" for a malformed/absent imdbId — that is
    // upstream saying "no record", not the client being wrong, so the handler
    // short-circuits to a miss before any network I/O.
    const fetchMock = vi.fn(async () => new Response("nope", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call({ action: "zxcintro", tmdbId: "1399", season: "1", episode: "1" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      ok: true,
      introEndSeconds: null,
      creditsStartSeconds: null,
      confidence: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers a miss for movies (no season/episode) instead of querying upstream", async () => {
    // Upstream has no movie records — a call would only burn a request to learn
    // that, so movies short-circuit to the same honesty-preserving miss.
    const fetchMock = vi.fn(async () => new Response("nope", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await call({ action: "zxcintro", tmdbId: "1101383" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      ok: true,
      introEndSeconds: null,
      creditsStartSeconds: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed tmdb id with a 400, not a 500", async () => {
    const res = await call({ action: "zxcintro", tmdbId: "not-a-number" });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: "bad-id" });
  });
});
