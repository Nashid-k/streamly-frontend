// Why EVERY server stopped playing, and the two rules that keep it from coming back
// silently.
//
// Measured live against the real provider on 2026-10-05: `/backend/meow` ->
// `/backend/fuckyou` -> `/backend/fuckoffniggawtf`. All four rows (centaurus,
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

const { default: handler } = await import("../../api/stream.js");

/* The current mint path. If upstream renames it again, the failure is a 404 HTML
   page on every row; update this constant and ZXC_MINT_PATH together. */
const MINT_PATH = "/backend/fuckoffniggawtf";

const json = (payload) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });

let requests = [];
let details = { title: "Inception", release_date: "2010-07-15", imdb_id: "tt1375666" };
let serversResponse = { success: true, links: [] };

beforeEach(() => {
  requests = [];
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
    // was the 2026-10-03 name. Both answer the Next.js HTML 404 page.
    for (const dead of ["/backend/meow\"", "/backend/fuckyou\""]) {
      expect(requests.some((u) => u.includes(dead))).toBe(false);
    }
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