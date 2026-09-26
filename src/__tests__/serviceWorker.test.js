// Drives the real public/sw.js fetch handler with stubbed Cache/self globals.
//
// This exists because of a production error: every /api/downloadify resolve/save
// POST produced
//   Uncaught (in promise) TypeError: Failed to execute 'put' on 'Cache':
//   Request method 'POST' is unsupported
// from the catch-all "cache-first for images and fonts" branch. Cache.put() only
// accepts GET, so any POST that reaches a caching branch is a guaranteed throw —
// and because those writes are fire-and-forget it surfaced as an unhandled
// rejection with nothing in the app's own code to blame.
import { describe, it, expect, beforeEach, vi } from "vitest";

const ORIGIN = "https://streamly.test";

let handlers;
let puts;
let respondWithCalls;
let fetchMock;

function makeRequest(url, { method = "GET", accept = "*/*", mode = "" } = {}) {
  return {
    url: url.startsWith("http") ? url : `${ORIGIN}${url}`,
    method,
    mode,
    destination: "",
    headers: new Headers(accept === "*/*" ? {} : { accept }),
    clone() {
      return this;
    },
  };
}

async function run(request) {
  const event = {
    request,
    respondWith(promise) {
      respondWithCalls.push(request);
      return promise;
    },
    waitUntil() {},
  };
  handlers.fetch(event);
  // Let any fire-and-forget cache write settle so a late rejection surfaces here.
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(async () => {
  vi.resetModules();
  handlers = {};
  puts = [];
  respondWithCalls = [];

  fetchMock = vi.fn(async () => new Response("body", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const cache = {
    match: vi.fn(async () => undefined),
    put: vi.fn(async (request) => {
      // Mirror the platform: Cache.put rejects a non-GET request.
      if (request.method && request.method !== "GET") {
        throw new TypeError("Failed to execute 'put' on 'Cache': Request method 'POST' is unsupported");
      }
      puts.push(request);
    }),
    addAll: vi.fn(async () => {}),
  };
  vi.stubGlobal("caches", {
    open: vi.fn(async () => cache),
    match: vi.fn(async () => undefined),
    keys: vi.fn(async () => []),
    delete: vi.fn(async () => true),
  });
  vi.stubGlobal("self", {
    addEventListener: (type, fn) => {
      handlers[type] = fn;
    },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => []) },
    location: { origin: ORIGIN },
  });

  await import("../../public/sw.js");
});

describe("service worker fetch routing", () => {
  it("never intercepts a POST, so Cache.put can never be handed one", async () => {
    for (const path of [
      "/api/downloadify",
      "/api/sync",
      "/api/auth",
      "/api/tmdb/movie/550",
      "/anything-else",
      "/some/path.js",
      "/",
    ]) {
      await run(makeRequest(path, { method: "POST" }));
    }
    expect(respondWithCalls).toEqual([]);
    expect(puts).toEqual([]);
  });

  it("never intercepts PUT/DELETE/PATCH/HEAD either", async () => {
    for (const method of ["PUT", "DELETE", "PATCH", "HEAD"]) {
      await run(makeRequest("/api/downloadify", { method }));
    }
    expect(respondWithCalls).toEqual([]);
    expect(puts).toEqual([]);
  });

  it("leaves same-origin /api/ GETs to the network (client owns failover)", async () => {
    await run(makeRequest("/api/tmdb/trending/all/week"));
    expect(respondWithCalls).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves other cross-origin GETs to the network", async () => {
    await run(makeRequest("https://api.themoviedb.org/3/movie/550"));
    expect(respondWithCalls).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still intercepts wsrv.nl images (the deliberate offline-poster exception)", async () => {
    await run(makeRequest("https://wsrv.nl/?url=example.com/a.jpg"));
    expect(respondWithCalls).toHaveLength(1);
  });

  it("serves a hashed asset from cache when present, without touching the network", async () => {
    const cache = await caches.open("x");
    const cached = new Response("cached-bytes");
    cache.match.mockResolvedValueOnce(cached);
    await run(makeRequest("/assets/HomePage-abc123.js"));
    expect(respondWithCalls).toHaveLength(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("caches a hashed asset on first fetch so the next visit is offline-capable", async () => {
    await run(makeRequest("/assets/HomePage-abc123.js"));
    const cache = await caches.open("x");
    expect(cache.put).toHaveBeenCalled();
    expect(puts).toHaveLength(1);
  });

  it("still caches images and fonts (the branch that used to throw on POST)", async () => {
    const imageResponse = new Response("img", { status: 200 });
    Object.defineProperty(imageResponse, "type", { value: "basic" });
    fetchMock.mockResolvedValueOnce(imageResponse);
    await run(makeRequest("/assets/poster.jpg"));
    expect(respondWithCalls).toHaveLength(1);
    expect(puts).toHaveLength(1);
  });

  it("survives a rejected cache write instead of failing the response", async () => {
    const cache = await caches.open("x");
    cache.put.mockRejectedValueOnce(new DOMException("quota", "QuotaExceededError"));
    const imageResponse = new Response("img", { status: 200 });
    Object.defineProperty(imageResponse, "type", { value: "basic" });
    fetchMock.mockResolvedValueOnce(imageResponse);
    await expect(run(makeRequest("/assets/other.jpg"))).resolves.toBeUndefined();
  });
});
