// Why EVERY server stopped playing, and the two rules that keep it from coming back
// silently.
//
// Measured live against the real provider on 2026-10-05: `/backend/meow` ->
// `/backend/fuckyou` -> `/backend/fuckoffniggawtf`, again 2026-10-06 ->
// `/backend/fuckoffniggawtaf`, and again 2026-10-13 -> `/backend/scrapeurfckingmom`
// (that rename also rotated the `uo/up/ug/…` param names). All four rows (centaurus,
// andromeda, atlas, meow) mint their token through that ONE POST, so a rename
// takes out every row in the same instant and the player reports "no playable
// source" for all of them at once. That looks exactly like a network outage and
// four coincidental provider deaths, and it is neither.
//
// These tests pin the two things that actually broke:
//
//   1. The mint path. Asserted against the CURRENT path so the next rename fails
//      a test naming the string to change, instead of failing every title.
//   2. The metadata contract. title + year + date are MANDATORY: a matrix over
//      movie 27205 showed the servers endpoint answers 400 "missing params" if
//      any one is blank. The handler used to swallow a failed lookup and send
//      blanks, converting a flaky TMDB call into "no playable source" on all four
//      servers with the real cause nowhere in the message.
//
// Hermetic: fetch is stubbed, no test may reach a provider.
import { describe, it, expect, beforeEach, vi } from "vitest";

// Hermetic DNS: the SSRF pass resolves the provider origin through
// resolveUpstream, whose OS lookup cannot answer for that host in this
// environment. Every name resolves public here; the SSRF rules themselves are
// covered by ssrfGuard.test.js, and the fetch mock below is what this suite
// exercises. Same pattern as streamHandler.test.js.
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup, default: { lookup } }));

const { default: handler, clearZxcMpdCache, clearZxcTitleMetaCache, describeZxcContractChange, parseZxcRoster } = await import("../../api/stream.js");

/* The current mint path. If upstream renames it again, the failure is a 404 HTML
   page on every row; update this constant and ZXC_MINT_PATH together. */
const MINT_PATH = "/backend/scrapeurfckingdad";

const json = (payload) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });

let requests = [];
let details = { title: "Inception", release_date: "2010-07-15", imdb_id: "tt1375666" };
let serversResponse = { success: true, links: [] };

beforeEach(() => {
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
  requests = [];
  clearZxcMpdCache();
  clearZxcTitleMetaCache();
  details = { title: "Inception", release_date: "2010-07-15", imdb_id: "tt1375666" };
  serversResponse = {
    success: true,
    links: [{ link: Buffer.from("https://93.184.216.34/a.m3u8").toString("base64"), type: "hls", resolution: 0 }],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(typeof input === "string" ? input : input?.url || input);
      requests.push(url);
      if (url.includes("/backend/tmdb/details/")) {
        return details === null ? new Response("upstream unreachable", { status: 502 }) : json(details);
      }
      if (url.includes(MINT_PATH)) return json({ token: "tok", ts: "1700000000" });
      if (url.includes("/backend/servers/")) return json(serversResponse);
      if (url.includes(".m3u8")) {
        return new Response("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:13\n#EXTINF:12.0,\nhttps://93.184.216.34/s0\n#EXT-X-ENDLIST\n", {
          status: 200,
          headers: { "content-type": "application/vnd.apple.mpegurl" },
        });
      }
      return new Response("upstream unreachable", { status: 502 });
    }),
  );
});

function makeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    status(c) { res.statusCode = c; return res; },
    setHeader(k, v) { res.headers[k.toLowerCase()] = v; return res; },
    json(p) { res.body = p; return res; },
    send(p) { res.body = p; return res; },
    end() { return res; },
  };
  return res;
}

async function resolve({ type = "movie", season, episode, server = "centaurus" } = {}) {
  const res = makeRes();
  await handler(
    {
      method: "POST",
      body: { action: "resolvezxc", type, id: "27205", server, ...(season != null ? { season } : {}), ...(episode != null ? { episode } : {}) },
      headers: { "x-forwarded-for": "203.0.113.9" },
    },
    res,
  );
  return JSON.parse(res.body);
}

const serversUrl = () => requests.find((u) => u.includes("/backend/servers/")) || "";

describe("ZXC mint endpoint", () => {
  it("mints through the current path, not a retired one", async () => {
    await resolve({ server: "centaurus" });
    const mints = requests.filter((u) => u.includes("/backend/") && !u.includes("/backend/tmdb/") && !u.includes("/backend/servers/"));
    expect(mints.length).toBeGreaterThan(0);
    expect(mints.every((u) => u.includes(MINT_PATH))).toBe(true);
  });

  it("never asks a path that is known to be retired", async () => {
    await resolve({ server: "andromeda" });
    // `/backend/meow` is a SERVER name ("Ursa"), never an endpoint; `fuckyou`
    // was the 2026-10-03 name, `fuckoffniggawtf` the 2026-10-05 name, and
    // `fuckoffniggawtaf` the 2026-10-06 name. All
    // three answer the Next.js HTML 404 page.
    for (const dead of ["/backend/meow\"", "/backend/fuckyou\"", "/backend/fuckoffniggawtf\"", "/backend/fuckoffniggawtaf\""]) {
      expect(requests.some((u) => u.includes(dead))).toBe(false);
    }
  });
});

describe("resolve latency (the mint runs concurrently with the metadata lookup)", () => {
  /* The token mint depends only on type/id/server/season/episode — never on
     /backend/tmdb/details — so the handler issues it ALONGSIDE the metadata
     lookup instead of after it, folding one upstream round trip out of the
     critical path of every cold resolve. This test HOLDS the metadata response
     open and proves the mint was already issued while metadata was still
     pending. It is a gate, not a stopwatch, so there is no timing flake. */
  it("issues the mint before the metadata lookup resolves", async () => {
    let releaseDetails;
    const detailsGate = new Promise((r) => { releaseDetails = r; });
    let detailsSettled = false;
    let mintWhileDetailsPending = false;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input) => {
        const url = String(typeof input === "string" ? input : input?.url || input);
        requests.push(url);
        if (url.includes("/backend/tmdb/details/")) {
          await detailsGate;
          detailsSettled = true;
          return json(details);
        }
        if (url.includes(MINT_PATH)) {
          if (!detailsSettled) mintWhileDetailsPending = true;
          return json({ token: "tok", ts: "1700000000" });
        }
        if (url.includes("/backend/servers/")) return json(serversResponse);
        if (url.includes(".m3u8")) {
          return new Response(
            "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:13\n#EXTINF:12.0,\nhttps://93.184.216.34/s0\n#EXT-X-ENDLIST\n",
            { status: 200, headers: { "content-type": "application/vnd.apple.mpegurl" } },
          );
        }
        return new Response("upstream unreachable", { status: 502 });
      }),
    );

    const pending = resolve({ server: "centaurus" });
    // Let the handler reach its first await: metadata is now parked on the gate.
    await new Promise((r) => setTimeout(r, 20));
    expect(mintWhileDetailsPending).toBe(true);
    releaseDetails();
    const r = await pending;
    expect(r.ok).toBe(true);
  });
});

describe("ZXC metadata is mandatory, not advisory", () => {
  it("sends title, year and date on the servers request", async () => {
    await resolve({ server: "centaurus" });
    const url = serversUrl();
    // The obfuscated param names are positional contracts; assert on values,
    // which is what upstream actually validates.
    expect(url).toContain("Inception");
    expect(url).toContain("2010");
    expect(url).toContain("2010-07-15");
  });

  it("fails with a metadata error, not 'no playable source', when the lookup fails", async () => {
    details = null; // TMDB upstream refused
    const r = await resolve({ server: "centaurus" });
    expect(r.ok).toBe(false);
    // The distinction matters: `no-source` tells the viewer the title has no
    // stream anywhere, which is a lie when our own lookup broke.
    expect(r.code).toBe("upstream");
    expect(r.code).not.toBe("no-source");
    // And it must not have pretended to try with blank params.
    expect(serversUrl()).toBe("");
  });

  it("names the missing field instead of sending blanks", async () => {
    details = { title: "", release_date: "2010-07-15", imdb_id: "" };
    const r = await resolve({ server: "atlas" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("upstream");
    expect(r.error).toMatch(/title/);
  });

  it("reads title for TV too, and carries last_air_date as latestDate", async () => {
    // The provider normalises a series' `name` into `title`; an old movie-only
    // read would send a blank title for every episode and 400.
    details = { title: "Game of Thrones", release_date: "2011-04-17", last_air_date: "2019-05-19", imdb_id: "tt0944947" };
    await resolve({ type: "tv", season: 1, episode: 1, server: "centaurus" });
    const url = serversUrl();
    // URLSearchParams encodes the space as `+`, not `%20` — assert the
    // carried value in its on-the-wire form.
    expect(url).toContain("Game+of+Thrones");
    expect(url).toContain("2019-05-19");
  });
});

describe("ZXC roster discovery (self-healing server order)", () => {
  // The provider's shipped client bundle carries its OWN ordered roster as the
  // webpack export `["SERVERS",0,[…]]` (read live off chunk `2xxoeiej0kf6r.js`
  // on 2026-10-14; Orion leads, Ursa's path is `meow`). We read it so the menu
  // order, the default, and the auto rotation follow the provider instead of a
  // stale hand-copied seed.
  const liveChunk =
    '16508,e=>{"use strict";e.s(["SERVERS",0,['
    + '{name:"Orion",status:"queue",server:"orion",desc:"Multi Audio Support",dubSupport:!0,sources:[]},'
    + '{name:"Andromeda",status:"queue",server:"andromeda",desc:"Smooth Playback & HD",dubSupport:!1,sources:[]},'
    + '{name:"Centaurus",status:"queue",server:"centaurus",desc:"Multi Audio Support",dubSupport:!0,sources:[]},'
    + '{name:"Atlas",status:"queue",server:"atlas",desc:"Alternative",dubSupport:!1,sources:[]},'
    + '{name:"Ursa",status:"queue",server:"meow",desc:"Alternative",dubSupport:!1,sources:[]}'
    + "]])}";

  it("reads the ordered roster with its dubSupport flags", () => {
    const roster = parseZxcRoster([liveChunk]);
    expect(roster).toEqual([
      { name: "Orion", server: "orion", dubSupport: true },
      { name: "Andromeda", server: "andromeda", dubSupport: false },
      { name: "Centaurus", server: "centaurus", dubSupport: true },
      { name: "Atlas", server: "atlas", dubSupport: false },
      { name: "Ursa", server: "meow", dubSupport: false },
    ]);
  });

  it("keeps each entry inside its own object even if a field is missing", () => {
    // A malformed first entry (no dubSupport) must not swallow the second one's.
    const chunk = 'e.s(["SERVERS",0,[{name:"Ghost",status:"queue",server:"ghost",desc:"x"},'
      + '{name:"Orion",status:"queue",server:"orion",dubSupport:!0},'
      + '{name:"Atlas",status:"queue",server:"atlas",dubSupport:!1}]])';
    const roster = parseZxcRoster([chunk]);
    // The broken entry is skipped; the two well-formed ones survive in order.
    expect(roster).toEqual([
      { name: "Orion", server: "orion", dubSupport: true },
      { name: "Atlas", server: "atlas", dubSupport: false },
    ]);
  });

  it("returns null (keep the seed) unless at least two servers parse", () => {
    expect(parseZxcRoster(['e.s(["SERVERS",0,[{name:"Orion",server:"orion",dubSupport:!0}]])'])).toBeNull();
    expect(parseZxcRoster(["no roster here at all"])).toBeNull();
    expect(parseZxcRoster([null, 42, {}])).toBeNull();
  });

  it("scans past a chunk that does not carry the roster", () => {
    const roster = parseZxcRoster(["self.webpackChunk=1", liveChunk]);
    expect(roster?.[0]).toEqual({ name: "Orion", server: "orion", dubSupport: true });
  });
});

describe("ZXC contract change description (auto-sync commit messages)", () => {
  const contract = () => ({
    mintPath: "/backend/aaa",
    params: {
      tmdbId: "1", mediaType: "2", path: "3", season: "4", episode: "5",
      ts: "6", token: "7", title: "8", year: "9", date: "a",
    },
    imdbParam: "b",
    latestDateParam: "c",
  });

  it("names a mint rename first, in 'x -> y' form", () => {
    expect(describeZxcContractChange(contract(), { ...contract(), mintPath: "/backend/bbb" }))
      .toEqual(["mint /backend/aaa -> /backend/bbb"]);
  });

  it("lists every rotated param name, in contract order", () => {
    const to = contract();
    to.params.tmdbId = "zz";
    to.params.year = "yy";
    expect(describeZxcContractChange(contract(), to)).toEqual(["tmdbId 1 -> zz", "year 9 -> yy"]);
  });

  it("returns [] when nothing changed or either side is missing", () => {
    expect(describeZxcContractChange(contract(), contract())).toEqual([]);
    expect(describeZxcContractChange(null, contract())).toEqual([]);
    expect(describeZxcContractChange(contract(), null)).toEqual([]);
  });
});

describe("ZXC MPD cache", () => {
  // A minimal valid MPD that parseMpd accepts — one video representation with
  // two 5-second segments.
  const MPD_XML = "<MPD mediaPresentationDuration=\"PT10S\">"
    + "<Period duration=\"PT10S\">"
    + "<AdaptationSet contentType=\"video\" mimeType=\"video/mp4\">"
    + "<SegmentTemplate duration=\"5\" startNumber=\"1\" media=\"seg-$Number$.m4s\" initialization=\"init.m4s\"/>"
    + "<Representation id=\"1\" bandwidth=\"1000000\" width=\"1280\" height=\"720\" codecs=\"avc1.640028\"/>"
    + "</AdaptationSet></Period></MPD>";

  const DASH_URL = "https://93.184.216.34/a.mpd";

  beforeEach(() => {
    // Switch the servers response to a single DASH link.
    serversResponse = {
      success: true,
      links: [
        { link: Buffer.from(DASH_URL).toString("base64"), type: "dash", resolution: 720 },
      ],
    };
    vi.stubGlobal("fetch", vi.fn(async (input) => {
      const url = String(typeof input === "string" ? input : input?.url || input);
      requests.push(url);
      if (url.includes("/backend/tmdb/details/")) return json(details);
      if (url.includes(MINT_PATH)) return json({ token: "tok", ts: "1700000000" });
      if (url.includes("/backend/servers/")) return json(serversResponse);
      if (url.includes(DASH_URL)) return new Response(MPD_XML, { status: 200 });
      return new Response("upstream unreachable", { status: 502 });
    }));
  });

  it("does one mint+servers per resolve and caches the MPD across resolves", async () => {
    // The DASH path reuses the links the resolve already fetched, so a resolve
    // pays mint+servers ONCE instead of twice.
    const r1 = await resolve({ server: "centaurus" });
    expect(r1.ok).toBe(true);
    expect(requests.filter((u) => u.includes(MINT_PATH)).length).toBe(1);
    expect(requests.filter((u) => u.includes("/backend/servers/")).length).toBe(1);
    expect(requests.filter((u) => u.includes(DASH_URL)).length).toBe(1);

    // Reset request tracker but NOT the cache — the second resolve should reuse
    // the cached MPD.
    requests = [];

    // Second resolve of the SAME title: zxcDashManifest hits the cache.
    const r2 = await resolve({ server: "centaurus" });
    expect(r2.ok).toBe(true);
    // Only the servers-lookup mint ran; the manifest is cached.
    expect(requests.filter((u) => u.includes(MINT_PATH)).length).toBe(1);
    // No redundant MPD fetch.
    expect(requests.filter((u) => u.includes(DASH_URL)).length).toBe(0);
  });

  it("re-fetches the MPD after the cache is cleared (TTL expiry path)", async () => {
    await resolve({ server: "centaurus" });
    expect(requests.filter((u) => u.includes(DASH_URL)).length).toBe(1);

    requests = [];
    clearZxcMpdCache();
    await resolve({ server: "centaurus" });
    // Cache was cleared — the manifest is fetched again.
    expect(requests.filter((u) => u.includes(DASH_URL)).length).toBe(1);
  });

  it("lists dubs without minting or fetching a manifest per dub", async () => {
    serversResponse = {
      success: true,
      links: [
        { link: Buffer.from(DASH_URL).toString("base64"), type: "dash", resolution: 720 },
      ],
      dubs: [
        { lanCode: "hi", lanName: "Hindi", type: 0 },
        { lanCode: "ta", lanName: "Tamil", type: 0 },
      ],
    };
    const r1 = await resolve({ server: "centaurus" });
    expect(r1.ok).toBe(true);
    expect(r1.audioTracks.length).toBe(2);
    // ONE mint (the servers lookup) and ONE MPD fetch (the base manifest).
    // The old per-dub verification added another mint+fetch for EACH dub, the
    // request amplification that got the ip throttled and cascaded into TV
    // metadata 429s. Dubs now ride the advertised list unverified.
    expect(requests.filter((u) => u.includes(MINT_PATH)).length).toBe(1);
    expect(requests.filter((u) => u.includes("/backend/servers/")).length).toBe(1);
    expect(requests.filter((u) => u.includes(DASH_URL)).length).toBe(1);

    requests = [];
    const r2 = await resolve({ server: "centaurus" });
    expect(r2.ok).toBe(true);
    expect(r2.audioTracks.length).toBe(2);
    // Only the servers-lookup mint runs; the base manifest is cached.
    expect(requests.filter((u) => u.includes(MINT_PATH)).length).toBe(1);
    expect(requests.filter((u) => u.includes(DASH_URL)).length).toBe(0);
  });

  it("title metadata is cached across servers with same tmdbId", async () => {
    /* Same tmdbId, different servers - the /backend/tmdb/details/ endpoint
       should be hit only once across all rows, not once per server. */
    requests = [];
    const r1 = await resolve({ server: "centaurus", type: "movie", tmdbId: "27205" });
    expect(r1.ok).toBe(true);
    expect(requests.filter((u) => u.includes("/backend/tmdb/details/")).length).toBe(1);

    requests = [];
    const r2 = await resolve({ server: "andromeda", type: "movie", tmdbId: "27205" });
    expect(r2.ok).toBe(true);
    // Cached: no second metadata fetch for the same tmdbId.
    expect(requests.filter((u) => u.includes("/backend/tmdb/details/")).length).toBe(0);
  });
});
