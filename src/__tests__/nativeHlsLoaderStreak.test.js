import { afterEach, describe, expect, it, vi } from "vitest";
import {
  _resetRelayStreakForTests,
  clearDirectBlocks,
  clearProbeCache,
  createStreamlyLoader,
} from "../api/nativeHlsLoader";
import { logDebug, logWarn } from "../utils/debugLogger";

vi.mock("../utils/debugLogger", () => ({
  logDebug: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
  _resetRelayStreakForTests();
  clearProbeCache();
  clearDirectBlocks();
});

const relayResponse = (bytes = [1, 2, 3, 4]) => ({
  ok: true,
  status: 200,
  headers: {
    get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream"),
  },
  arrayBuffer: async () => new Uint8Array(bytes).buffer,
});

function rangeOkResponse() {
  return {
    ok: true,
    status: 206,
    headers: {
      get: (name) => {
        if (name === "access-control-allow-origin") return "*";
        if (name === "content-range") return "bytes 0-0/4136495";
        return null;
      },
    },
    body: { cancel: async () => {} },
  };
}

function softFailResponse() {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    body: { cancel: async () => {} },
  };
}

function loadFrag(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(
      { url, frag: { sn: 1 } },
      {},
      {
        onSuccess: (resp) => resolve(resp),
        onError: (err) => reject(new Error(err.text)),
      },
    );
  });
}

describe("relay streak — module-scoped across per-fragment loader instances", () => {
  it("logs ONE warn per streak, not per fragment, when hls.js rebuilds a loader each time", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      if (init?.headers?.range) return softFailResponse();
      if (typeof url === "string" && url.includes("/api/stream")) return relayResponse();
      return { ok: false, status: 403, headers: { get: () => null } };
    });
    vi.stubGlobal("fetch", fetchMock);

    // hls.js constructs a FRESH loader instance for every fragment. Three
    // relayed fragments on three instances used to print three identical
    // "1 consecutive fragment(s)" warns; now it is one warn + two debugs.
    for (let n = 1; n <= 3; n += 1) {
      const loader = new (createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" }))();
      const response = await loadFrag(loader, `https://relayonly.example.com/vd/frag${n}.m4s`);
      expect(response.data.byteLength).toBe(4);
    }

    const streakWarns = logWarn.mock.calls.filter((call) =>
      String(call[1]).includes("consecutive fragment(s) via Vercel relay"),
    );
    expect(streakWarns.length).toBe(1);
    expect(String(streakWarns[0][1])).toContain("1 consecutive fragment(s)");
    expect(streakWarns[0][2]).toEqual({ url: "https://relayonly.example.com/vd/frag1.m4s" });

    const relayDebugs = logDebug.mock.calls.filter((call) =>
      String(call[1]).includes("Relayed fragment"),
    );
    expect(relayDebugs.length).toBe(2);

    const probePokes = fetchMock.mock.calls.filter(([_url, init]) => init?.headers?.range);
    expect(probePokes.length).toBe(1);
  });

  it("a direct hit resets the streak — the next relay re-warns at 1, not an inflated count", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      if (init?.headers?.range) {
        return String(url).includes("relaytwo.example.com") ? softFailResponse() : rangeOkResponse();
      }
      if (typeof url === "string" && url.includes("/api/stream")) return relayResponse([9]);
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([5, 6]).buffer,
      };
    });
    vi.stubGlobal("fetch", fetchMock);

    const loadedFrom = [];
    const Loader = createStreamlyLoader({
      getRefUrl: () => "https://vidcore.io/",
      onDirectPath: () => loadedFrom.push("direct"),
      onRelayPath: () => loadedFrom.push("relay"),
    });

    // Direct success first — this must zero the module streak.
    await loadFrag(new Loader(), "https://direct.example.com/vd/a.m4s");
    expect(loadedFrom).toEqual(["direct"]);

    // Relay after a direct hit (probe is cached per origin, so a different
    // soft-failing origin forces the relay leg).
    await loadFrag(new Loader(), "https://relaytwo.example.com/vd/b.m4s");
    expect(loadedFrom).toEqual(["direct", "relay"]);

    const streakWarns = logWarn.mock.calls.filter((call) =>
      String(call[1]).includes("consecutive fragment(s) via Vercel relay"),
    );
    expect(streakWarns.length).toBe(1);
    expect(String(streakWarns[0][1])).toContain("1 consecutive fragment(s)");
  });
});