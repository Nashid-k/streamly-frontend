import { afterEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { signSyncToken, verifySyncToken, SYNC_TOKEN_TTL_MS } from "../../server/syncToken.js";

const ORIGINAL_SECRET = process.env.SYNC_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";

afterEach(() => {
  if (ORIGINAL_SECRET) {
    process.env.SYNC_SECRET = ORIGINAL_SECRET;
  } else {
    delete process.env.SYNC_SECRET;
    delete process.env.GOOGLE_CLIENT_SECRET;
  }
});

describe("syncToken expiry", () => {
  it("issues tokens with a ~30 day expiry and verifies them", () => {
    process.env.SYNC_SECRET = "k";
    const token = signSyncToken("user-42");
    expect(token).toBeTruthy();
    const [, expiryMs] = token.split(".");
    expect(Number(expiryMs)).toBeGreaterThan(Date.now());
    expect(Number(expiryMs) - Date.now()).toBeLessThanOrEqual(SYNC_TOKEN_TTL_MS + 1000);
    expect(verifySyncToken("user-42", token)).toBe(true);
  });

  it("rejects an expired token", () => {
    process.env.SYNC_SECRET = "k";
    // Hand-craft an already-expired token using the same HMAC scheme.
    const expiryMs = Date.now() - 1000;
    const digest = createHmac("sha256", "k").update(`user-9.${expiryMs}`).digest("base64url");
    const expired = `user-9.${expiryMs}.${digest}`;
    expect(verifySyncToken("user-9", expired)).toBe(false);
  });

  it("rejects tokens whose subject doesn't match the accessed googleId", () => {
    process.env.SYNC_SECRET = "k";
    const token = signSyncToken("user-A");
    expect(verifySyncToken("user-B", token)).toBe(false);
  });

  it("rejects legacy 2-part tokens (no expiry segment)", () => {
    process.env.SYNC_SECRET = "k";
    const legacy = `user-7.${createHmac("sha256", "k").update("user-7").digest("base64url")}`;
    expect(verifySyncToken("user-7", legacy)).toBe(false);
  });

  it("returns null token and false verification when no secret is configured", () => {
    delete process.env.SYNC_SECRET;
    delete process.env.GOOGLE_CLIENT_SECRET;
    expect(signSyncToken("user-1")).toBeNull();
    expect(verifySyncToken("user-1", "x.1.y")).toBe(false);
  });
});
