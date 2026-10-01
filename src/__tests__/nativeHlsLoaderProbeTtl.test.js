import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearDirectBlocks,
  clearProbeCache,
  probeDirectOrigin,
} from "../api/nativeHlsLoader";

/* task.md S1.5 — a cached negative probe verdict must not outlive the parking it
   caused.

   The bug: `directBlockedUntil` expires an origin after DIRECT_BLOCK_MS (5 min),
   and the code's own comment calls that the point where the origin gets another
   chance. But `probeCache` stored the {ok:false} verdict with no TTL, so
   `probeDirectOrigin` short-circuited on the stale entry and the retry never
   happened. Any origin that 403s once stays relay-only until a page reload. */

const SEG = "https://cdn.recoverable.test/vd/seg-1.m4s";
const OTHER = "https://cdn.other.test/vd/seg-1.m4s";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  clearProbeCache();
  clearDirectBlocks();
});

/* Counts bare range probes only — the fragment pulls are not under test here.
   `verdictFor(url, probesSoFar)` branches per origin so the two TTLs can be
   exercised side by side. */
function probeCountingFetch(verdictFor) {
  let probes = 0;
  const fetchMock = vi.fn().mockImplementation(async (url, init) => {
    if (!init?.headers?.range) {
      return { ok: false, status: 500, headers: { get: () => null } };
    }
    probes += 1;
    return verdictFor(String(url), probes);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, probeCount: () => probes };
}

const refuses = () => ({ ok: false, status: 403, headers: { get: () => null } });
const servesCors = () => ({
  ok: true,
  status: 206,
  headers: {
    get: (name) =>
      name === "access-control-allow-origin" ? "*" : name === "content-range" ? "bytes 0-0/4096" : null,
  },
  body: { cancel: async () => {} },
});

describe("probe verdict TTL (S1.5)", () => {
  it("concurrent callers share one probe (the reason the verdict is cached at all)", async () => {
    const { probeCount } = probeCountingFetch(() => servesCors());
    const [a, b, c] = await Promise.all([
      probeDirectOrigin(SEG),
      probeDirectOrigin(SEG),
      probeDirectOrigin(SEG),
    ]);
    expect(probeCount()).toBe(1);
    expect(a.ok && b.ok && c.ok).toBe(true);
  });

  it("re-probes while the verdict is still fresh, so the CDN is not re-poked", async () => {
    const { probeCount } = probeCountingFetch(() => servesCors());
    await probeDirectOrigin(SEG);
    await probeDirectOrigin(SEG);
    await probeDirectOrigin(SEG);
    expect(probeCount()).toBe(1);
  });

  it("a refusal parks the origin and the cooldown answers from memory", async () => {
    const { probeCount } = probeCountingFetch(() => refuses());
    const first = await probeDirectOrigin(SEG);
    expect(first.ok).toBe(false);
    expect(first.status).toBe(403);
    // Parked: every further call is answered from the cooldown, no network.
    await probeDirectOrigin(SEG);
    await probeDirectOrigin(SEG);
    expect(probeCount()).toBe(1);
  });

  it("re-probes once the park AND the cached verdict have expired", async () => {
    const { probeCount } = probeCountingFetch((_url, n) => (n === 1 ? refuses() : servesCors()));
    vi.useFakeTimers();
    try {
      expect((await probeDirectOrigin(SEG)).ok).toBe(false);
      expect(probeCount()).toBe(1);

      // Still parked 5 min minus a tick: answered from the cooldown, no network.
      vi.advanceTimersByTime(4 * 60 * 1000);
      expect((await probeDirectOrigin(SEG)).ok).toBe(false);
      expect(probeCount()).toBe(1);

      // Past DIRECT_BLOCK_MS the park is gone. The cached negative verdict must
      // be gone too, or the origin is stuck relay-only for the session.
      vi.advanceTimersByTime(2 * 60 * 1000);
      const recovered = await probeDirectOrigin(SEG);
      expect(probeCount()).toBe(2);
      // The CDN recovered: direct is available again.
      expect(recovered.ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the two TTLs are asymmetric: a refusal expires at DIRECT_BLOCK_MS, a yes does not", async () => {
    const { probeCount } = probeCountingFetch((url) => (url === OTHER ? servesCors() : refuses()));
    vi.useFakeTimers();
    try {
      expect((await probeDirectOrigin(SEG)).ok).toBe(false);
      expect((await probeDirectOrigin(OTHER)).ok).toBe(true);
      expect(probeCount()).toBe(2);

      clearDirectBlocks();
      vi.advanceTimersByTime(6 * 60 * 1000);

      // OTHER said yes, so its verdict is still good and it is NOT re-probed.
      expect((await probeDirectOrigin(OTHER)).ok).toBe(true);
      expect(probeCount()).toBe(2);

      // SEG's refusal outlived nothing: it expires with the park, so it re-probes.
      await probeDirectOrigin(SEG);
      expect(probeCount()).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});