import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VERIFY_TOKEN_TTL_MS, isVerifyTokenEnabled, signVerifyToken, verifyVerifyToken } from "../../server/verifyToken.js";
import { signSyncToken, verifySyncToken } from "../../server/syncToken.js";

const ORIGINAL = process.env.SYNC_SECRET;

const PENDING = {
  email: "nashidk1999@gmail.com",
  name: "Nashid",
  passwordHash: "scrypt$16384$8$1$c2FsdHNhbHQ$2a2fa8f9c1b0d3e4",
};

beforeEach(() => {
  process.env.SYNC_SECRET = "verify-secret-for-tests";
  delete process.env.VERIFY_SECRET;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.SYNC_SECRET;
  else process.env.SYNC_SECRET = ORIGINAL;
  delete process.env.VERIFY_SECRET;
});

describe("verify token", () => {
  it("round-trips the pending signup", () => {
    const token = signVerifyToken(PENDING);
    const result = verifyVerifyToken(token);
    expect(result.ok).toBe(true);
    expect(result.email).toBe(PENDING.email);
    expect(result.name).toBe(PENDING.name);
    expect(result.passwordHash).toBe(PENDING.passwordHash);
  });

  it("round-trips an empty display name", () => {
    const result = verifyVerifyToken(signVerifyToken({ ...PENDING, name: "" }));
    expect(result.ok).toBe(true);
    expect(result.name).toBe("");
  });

  it("expires 24 hours out", () => {
    const token = signVerifyToken(PENDING);
    const [, expiryRaw] = token.split(".");
    expect(Number(expiryRaw)).toBeGreaterThan(Date.now() + VERIFY_TOKEN_TTL_MS - 60_000);
    expect(VERIFY_TOKEN_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("refuses a tampered payload", () => {
    const token = signVerifyToken(PENDING);
    const [payloadB64, expiry, sig] = token.split(".");
    // Swap in another address — the signature no longer covers it.
    const forged = Buffer.from(JSON.stringify({ ...PENDING, email: "attacker@evil.com" }), "utf8").toString("base64url");
    expect(verifyVerifyToken(`${forged}.${expiry}.${sig}`).ok).toBe(false);
    // Flip one character of the real signature.
    const flipped = sig[0] === "A" ? `B${sig.slice(1)}` : `A${sig.slice(1)}`;
    expect(verifyVerifyToken(`${payloadB64}.${expiry}.${flipped}`).ok).toBe(false);
  });

  it("refuses an expiry that was stretched forward", () => {
    const token = signVerifyToken(PENDING);
    const [payloadB64, , sig] = token.split(".");
    const farFuture = String(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
    expect(verifyVerifyToken(`${payloadB64}.${farFuture}.${sig}`).ok).toBe(false);
  });

  it("reports an expired token distinctly from a malformed one", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
      const token = signVerifyToken(PENDING);
      vi.setSystemTime(new Date("2026-01-02T00:00:01Z"));
      expect(verifyVerifyToken(token)).toEqual({ ok: false, reason: "expired" });
    } finally {
      vi.useRealTimers();
    }
    expect(verifyVerifyToken("garbage")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyVerifyToken("")).toEqual({ ok: false, reason: "malformed" });
    expect(verifyVerifyToken(undefined)).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects a payload carrying a non-scrypt hash", () => {
    // Signed but nonsense — the guard is domain-level, not just signature-level.
    const token = signVerifyToken({ ...PENDING, passwordHash: "plaintext-leaked" });
    expect(verifyVerifyToken(token)).toEqual({ ok: false, reason: "unsupported" });
  });

  it("fails closed when no secret is configured", () => {
    delete process.env.SYNC_SECRET;
    delete process.env.VERIFY_SECRET;
    expect(isVerifyTokenEnabled()).toBe(false);
    expect(signVerifyToken(PENDING)).toBeNull();
    expect(verifyVerifyToken("anything.at.all").ok).toBe(false);
  });

  it("will not sign without an email or a password hash", () => {
    expect(signVerifyToken({ email: "", passwordHash: PENDING.passwordHash })).toBeNull();
    expect(signVerifyToken({ email: PENDING.email, passwordHash: "" })).toBeNull();
  });

  it("is domain-separated from the sync token", () => {
    // A verification link must never double as a Bearer credential for
    // /api/sync, in either direction.
    const verify = signVerifyToken(PENDING);
    expect(verifySyncToken(PENDING.email, verify)).toBe(false);
    const sync = signSyncToken(PENDING.email);
    expect(verifyVerifyToken(sync).ok).toBe(false);
  });

  it("prefers VERIFY_SECRET over SYNC_SECRET", () => {
    process.env.VERIFY_SECRET = "a-different-secret";
    const token = signVerifyToken(PENDING);
    process.env.VERIFY_SECRET = "rotated";
    expect(verifyVerifyToken(token).ok).toBe(false);
    process.env.VERIFY_SECRET = "a-different-secret";
    expect(verifyVerifyToken(token).ok).toBe(true);
  });
});
