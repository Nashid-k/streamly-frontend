// api/lib/googleVerify.js — local verification of Google ID tokens.
//
// Google's own docs call the `tokeninfo` endpoint "not suitable for use in
// production code — requests may be throttled or otherwise subject to
// intermittent errors", and it adds a network hop to every cold-start login.
// Instead we verify the JWT signature locally with node:crypto against
// Google's public JWKS, validating:
//   • signature (RS256, key matched by `kid`)
//   • `iss`   in { https://accounts.google.com, accounts.google.com }
//   • `aud`   equals our OAuth client id
//   • `exp`   not expired (with small clock-skew grace)
// The JWKS changes rarely (~daily); it is cached per warm container, so the
// steady-state path is pure local crypto — zero network, zero throttle risk.

import { createPublicKey, verify } from 'node:crypto';

const GOOGLE_CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);
const CERTS_TTL_MS = 6 * 60 * 60 * 1000; // Google rotates keys ~daily
const CLOCK_SKEW_SEC = 60;
const FETCH_TIMEOUT_MS = 8000;

let jwksCache = { keys: null, fetchedAt: 0 };

async function fetchGoogleJwks() {
  if (jwksCache.keys && Date.now() - jwksCache.fetchedAt < CERTS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(GOOGLE_CERTS_URL, {
    signal: AbortController.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google JWKS fetch failed with status ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data?.keys)) throw new Error('Google JWKS response malformed');
  jwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function base64UrlToBuffer(b64) {
  const base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

function decodeSegment(b64) {
  return JSON.parse(base64UrlToBuffer(b64).toString('utf8'));
}

/**
 * Verifies a Google ID token and returns its claims, or null if invalid.
 * @param {string} idToken
 * @param {string} clientId  expected `aud`
 * @param {Array|null} [jwksOverrides] injectable JWKS for hermetic tests
 * @returns {Promise<object|null>}
 */
export async function verifyGoogleIdToken(idToken, clientId, jwksOverrides = null) {
  if (!idToken || !clientId) return null;
  const parts = idToken.split('.');
  if (parts.length !== 3) return null;

  try {
    const [header, payload, signature] = parts;
    const headerObj = decodeSegment(header);
    const payloadObj = decodeSegment(payload);

    if (!GOOGLE_ISSUERS.has(payloadObj.iss)) return null;
    if (payloadObj.aud !== clientId) return null;
    if (
      typeof payloadObj.exp !== 'number' ||
      Date.now() / 1000 > payloadObj.exp + CLOCK_SKEW_SEC
    ) {
      return null;
    }
    if (headerObj.alg !== 'RS256' || !headerObj.kid) return null;

    const keys = jwksOverrides || (await fetchGoogleJwks());
    const jwk = keys.find((k) => k.kid === headerObj.kid && k.kty === 'RSA' && k.n && k.e);
    if (!jwk) return null;

    const publicKey = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
    const data = Buffer.from(`${header}.${payload}`, 'utf8');
    const sig = base64UrlToBuffer(signature);
    if (!verify('RSA-SHA256', data, publicKey, sig)) return null;

    return payloadObj;
  } catch {
    return null;
  }
}