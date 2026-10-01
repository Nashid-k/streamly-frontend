import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDirectBlocks,
  clearProbeCache,
  createStreamlyLoader,
} from "../api/nativeHlsLoader";

/* task.md S1.2 — the consecutive-relay counter is shared, not per-loader-instance.
   Before this it lived in the StreamlyLoader constructor, and hls.js builds one
   loader per fragment, so it could only ever read 1 and the "consecutive
   fragment(s)" warning fired on EVERY relayed segment. That was the console
   flood, and it made a genuinely failing relay indistinguishable from the
   normal relay-only steady state. */

const { logWarnMock, logDebugMock } = vi.hoisted(() => ({
  logWarnMock: vi.fn(),
  logDebugMock: vi.fn(),
}));

vi.mock("../utils/debugLogger", () => ({
  logInfo: vi.fn(),
  logWarn: logWarnMock,
  logError: vi.fn(),
  logDebug: logDebugMock,
  logEmptyData: vi.fn(),
  reportQueryError: vi.fn(),
  logBootDiagnostics: vi.fn(),
  initGlobalErrorLogging: vi.fn(),
}));

const RELAY_FRAG = 4096;

/* A relay-only origin: the bare range probe 403s (no access-control-allow-origin),
   which is exactly VidCore's rotated workers.dev CDN. Every fragment therefore
   falls through to the Vercel relay. */
function stubRelayOnlyCdn() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async (url, init) => {
      if (init?.headers?.range) return { ok: false, status: 403, headers: { get: () => null } };
      if (typeof url === "string" && !url.includes("downloadify")) {
        return { ok: false, status: 403, headers: { get: () => null } };
      }
      const body = JSON.parse(init?.body || "{}");
      const start = Number(body?.range?.start || 0);
      const bytes = new Uint8Array(start === 0 ? RELAY_FRAG : 0);
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream") },
        arrayBuffer: async () => bytes.buffer,
      };
    }),
  );
}

const streakLogs = () =>
  logWarnMock.mock.calls.filter(([, message]) => /consecutive fragment/.test(String(message)));
const streakOf = (call) => call[2]?.streak;

beforeEach(() => {
  logWarnMock.mockClear();
  logDebugMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  clearProbeCache();
  clearDirectBlocks();
});

/* A FRESH Loader per fragment, mirroring hls.js. This is the whole point: the
   old per-instance counter died with each loader. */
function loadFragmentWithFreshLoader(url) {
  const Loader = createStreamlyLoader({ getRefUrl: () => "https://vidcore.io/" });
  return new Promise((resolve, reject) => {
    new Loader().load(
      { url, frag: { sn: 1 } },
      {},
      { onSuccess: resolve, onError: (err) => reject(new Error(err.text)) },
    );
  });
}

describe("consecutive relay streak is shared across fragment loaders (S1.2)", () => {
  it("counts consecutive relayed fragments instead of resetting at 1 each time", async () => {
    stubRelayOnlyCdn();
    await loadFragmentWithFreshLoader("https://cdn.streamly.test/vd/1.m4s");
    await loadFragmentWithFreshLoader("https://cdn.streamly.test/vd/2.m4s");
    await loadFragmentWithFreshLoader("https://cdn.streamly.test/vd/3.m4s");

    const logs = streakLogs();
    // Exactly one warning — at the FIRST fallback. The old code warned 3 times.
    expect(logs).toHaveLength(1);
    expect(streakOf(logs[0])).toBe(1);
    // ...and the later two fragments were demoted to debug, proving they were
    // relayed on the same streak rather than restarting it.
    expect(streakOf(logs[0])).toBe(1);
    expect(
      logDebugMock.mock.calls.filter(([, message]) => /Relayed fragment/.test(String(message))),
    ).toHaveLength(2);
  });

  it("counts separately per origin, so a new CDN does not inherit the last one's streak", async () => {
    stubRelayOnlyCdn();
    await loadFragmentWithFreshLoader("https://cdn-a.streamly.test/vd/1.m4s");
    await loadFragmentWithFreshLoader("https://cdn-a.streamly.test/vd/2.m4s");
    await loadFragmentWithFreshLoader("https://cdn-b.streamly.test/vd/1.m4s");

    const logs = streakLogs();
    // cdn-a first fragment (1) + cdn-b first fragment (1). The cdn-a second
    // fragment is NOT a warn, so the third warn proves the streak reset by
    // origin instead of rolling 1,2,3 across two CDNs.
    expect(logs.map(streakOf)).toEqual([1, 1]);
  });

  it("a direct success clears the streak for that origin", async () => {
    /* This is the only path that can reset a streak: a direct success requires
       probe.ok, so the origin must be CORS-capable. The reachable shape is a
       CDN whose probe passes but whose pulls intermittently fail — a 500 does
       NOT park the origin (only 401/403/429 do), so it keeps trying direct and
       can succeed again later. That success is what must clear the count. */
    let failDirect = true;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url, init) => {
        if (init?.headers?.range) {
          // Probe always passes: this CDN does serve CORS headers.
          return {
            ok: true,
            status: 206,
            headers: {
              get: (name) =>
                name === "access-control-allow-origin"
                  ? "*"
                  : name === "content-range"
                    ? `bytes 0-0/${RELAY_FRAG}`
                    : null,
            },
            body: { cancel: async () => {} },
          };
        }
        if (typeof url === "string" && !url.includes("downloadify")) {
          if (failDirect) return { ok: false, status: 500, headers: { get: () => null } };
          return {
            ok: true,
            status: 200,
            headers: { get: (name) => (name === "content-length" ? String(RELAY_FRAG) : null) },
            arrayBuffer: async () => new Uint8Array(RELAY_FRAG).buffer,
          };
        }
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => (name === "x-streamly-more" ? "0" : "application/octet-stream") },
          arrayBuffer: async () => new Uint8Array(RELAY_FRAG).buffer,
        };
      }),
    );

    // Two relayed fragments: one warn at streak 1, then demoted to debug.
    await loadFragmentWithFreshLoader("https://cdn.streamly.test/vd/1.m4s");
    await loadFragmentWithFreshLoader("https://cdn.streamly.test/vd/2.m4s");
    expect(streakLogs()).toHaveLength(1);
    expect(streakOf(streakLogs()[0])).toBe(1);

    // A direct success must not warn, and must clear the count.
    failDirect = false;
    await loadFragmentWithFreshLoader("https://cdn.streamly.test/vd/3.m4s");
    expect(streakLogs()).toHaveLength(1);

    // Direct fails again. Without the reset this is streak 3 and stays at
    // debug; with it the streak restarts at 1 and warns again.
    failDirect = true;
    await loadFragmentWithFreshLoader("https://cdn.streamly.test/vd/4.m4s");
    expect(streakLogs()).toHaveLength(2);
    expect(streakOf(streakLogs()[1])).toBe(1);
  });
});