import { describe, expect, it } from "vitest";
import { rateLimit, clientIp } from "../../server/rateLimit.js";

function uniqueKey() {
  return `test-${Math.random().toString(36).slice(2)}`;
}

describe("rateLimit", () => {
  it("allows hits under the limit and reports remaining", () => {
    const key = uniqueKey();
    expect(rateLimit({ key, limit: 3, windowMs: 1000 })).toMatchObject({ ok: true, remaining: 2 });
    expect(rateLimit({ key, limit: 3, windowMs: 1000 })).toMatchObject({ ok: true, remaining: 1 });
    expect(rateLimit({ key, limit: 3, windowMs: 1000 })).toMatchObject({ ok: true, remaining: 0 });
  });

  it("blocks the hit that exceeds the limit with a retry-after", () => {
    const key = uniqueKey();
    for (let i = 0; i < 3; i += 1) rateLimit({ key, limit: 3, windowMs: 60_000 });
    const blocked = rateLimit({ key, limit: 3, windowMs: 60_000 });
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it("resets after the window elapses", () => {
    const key = uniqueKey();
    for (let i = 0; i < 3; i += 1) rateLimit({ key, limit: 3, windowMs: 5 });
    const blocked = rateLimit({ key, limit: 3, windowMs: 5 });
    expect(blocked.ok).toBe(false);
    return new Promise((resolve) => {
      setTimeout(() => {
        expect(rateLimit({ key, limit: 3, windowMs: 5 }).ok).toBe(true);
        resolve();
      }, 15);
    });
  });

  it("isolates buckets by key", () => {
    const a = uniqueKey();
    const b = uniqueKey();
    for (let i = 0; i < 5; i += 1) rateLimit({ key: a, limit: 5, windowMs: 60_000 });
    expect(rateLimit({ key: a, limit: 5, windowMs: 60_000 }).ok).toBe(false);
    expect(rateLimit({ key: b, limit: 5, windowMs: 60_000 }).ok).toBe(true);
  });

  it("accepts a key resolver function", () => {
    const key = uniqueKey();
    expect(rateLimit({ key: () => key, limit: 1, windowMs: 60_000 }).ok).toBe(true);
    expect(rateLimit({ key: () => key, limit: 1, windowMs: 60_000 }).ok).toBe(false);
  });
});

describe("clientIp", () => {
  it("prefers the first x-forwarded-for hop", () => {
    expect(clientIp({ headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } })).toBe("1.2.3.4");
  });

  it("falls back to socket address then anon", () => {
    expect(clientIp({ headers: {}, socket: { remoteAddress: "9.9.9.9" } })).toBe("9.9.9.9");
    expect(clientIp({ headers: {} })).toBe("anon");
  });
});
