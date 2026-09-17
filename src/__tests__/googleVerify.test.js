import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { verifyGoogleIdToken } from "../../api/lib/googleVerify";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const KID = "test-key-1";
const JWKS = [
  {
    kid: KID,
    kty: "RSA",
    use: "sig",
    alg: "RS256",
    n: Buffer.from(publicKey.export({ format: "jwk" }).n, "base64").toString("base64url").replace(/=+$/, ""),
    e: publicKey.export({ format: "jwk" }).e,
  },
];

function b64url(str) {
  return Buffer.from(str).toString("base64url");
}

function makeToken({ iss, aud, exp, kid = KID } = {}) {
  const header = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      iss: iss ?? "https://accounts.google.com",
      aud: aud ?? "client-123",
      exp: exp ?? Math.floor(Date.now() / 1000) + 600,
      sub: "10987654321",
      email: "user@example.com",
    })
  );
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

describe("verifyGoogleIdToken (local JWKS verification)", () => {
  it("returns claims for a valid token", async () => {
    const claims = await verifyGoogleIdToken(makeToken(), "client-123", JWKS);
    expect(claims).not.toBeNull();
    expect(claims.sub).toBe("10987654321");
    expect(claims.email).toBe("user@example.com");
  });

  it("rejects a token issued for a different client (aud mismatch)", async () => {
    const claims = await verifyGoogleIdToken(makeToken({ aud: "other-app" }), "client-123", JWKS);
    expect(claims).toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = Math.floor(Date.now() / 1000) - 3600;
    const claims = await verifyGoogleIdToken(makeToken({ exp: expired }), "client-123", JWKS);
    expect(claims).toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = makeToken();
    const tampered = `${token.slice(0, -2)}ab`;
    const claims = await verifyGoogleIdToken(tampered, "client-123", JWKS);
    expect(claims).toBeNull();
  });

  it("rejects a token signed by an unknown key (kid not in JWKS)", async () => {
    const claims = await verifyGoogleIdToken(makeToken({ kid: "unknown-key" }), "client-123", JWKS);
    expect(claims).toBeNull();
  });

  it("rejects garbage input without throwing", async () => {
    expect(await verifyGoogleIdToken("not.a.jwt", "client-123", JWKS)).toBeNull();
    expect(await verifyGoogleIdToken("", "client-123", JWKS)).toBeNull();
    expect(await verifyGoogleIdToken(null, "client-123", JWKS)).toBeNull();
    expect(await verifyGoogleIdToken(makeToken(), "", JWKS)).toBeNull();
  });
});