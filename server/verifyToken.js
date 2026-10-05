// server/verifyToken.js — the pending signup, carried in the email link itself.
//
// Requirement: "only save to db once the user verifies". The naive reading —
// insert a row with verified:false and flip it later — writes an unverified
// record for every signup attempt, which is exactly the write the requirement
// forbids and also lets anyone squat an address by never clicking.
//
// So instead the pending signup rides along INSIDE the emailed link as an
// HMAC-signed, expiring token: { email, name, passwordHash }. Nothing is
// persisted at /api/register time; the account row is INSERTed for the first
// time at /api/verifyEmail. A token is single-use by construction — verification
// inserts into `users` behind a unique index on email, so the second click hits
// a duplicate key and is refused.
//
// Carrying the password HASH (never the password) in the URL is deliberate:
// scrypt output is not a credential that can be replayed against /api/login,
// it is only useful for completing the signup the user just asked for. The
// alternative — a pending row — is the write we are avoiding.

import { createHmac, timingSafeEqual } from 'node:crypto';

// 24 hours: long enough to survive a weekend, short enough that a link found
// in a compromised mailbox has a small window.
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

// Domain-separated from the sync token so a verification link can never be
// replayed as a Bearer credential for /api/sync (and vice versa).
const PURPOSE = 'verify-email:v1';

function getSecret() {
  return process.env.VERIFY_SECRET || process.env.SYNC_SECRET || '';
}

export function isVerifyTokenEnabled() {
  return Boolean(getSecret());
}

function digest(payloadB64, expiryMs) {
  return createHmac('sha256', getSecret())
    .update(`${PURPOSE}.${payloadB64}.${expiryMs}`)
    .digest('base64url');
}

/**
 * Build the token embedded in the verification link.
 * @param {{ email: string, name?: string, passwordHash: string }} pending
 * @returns {string|null} null when no secret is configured (auth must fail closed)
 */
export function signVerifyToken({ email, name, passwordHash }) {
  const SECRET = getSecret();
  if (!SECRET || !email || !passwordHash) return null;
  const payload = { e: email, n: name || '', h: passwordHash };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const expiryMs = Date.now() + VERIFY_TOKEN_TTL_MS;
  return `${payloadB64}.${expiryMs}.${digest(payloadB64, expiryMs)}`;
}

/**
 * @param {string} token
 * @returns {{ ok: true, email: string, name: string, passwordHash: string, expiresAtMs: number }
 *         | { ok: false, reason: 'malformed' | 'expired' | 'unsupported' }}
 */
export function verifyVerifyToken(token) {
  const SECRET = getSecret();
  if (!SECRET || typeof token !== 'string' || !token) {
    return { ok: false, reason: 'malformed' };
  }
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [payloadB64, expiryRaw, signature] = parts;

  if (!/^\d+$/.test(expiryRaw)) return { ok: false, reason: 'malformed' };
  const expiryMs = Number(expiryRaw);

  const expected = digest(payloadB64, expiryMs);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: 'malformed' };
  }
  if (Date.now() > expiryMs) return { ok: false, reason: 'expired' };

  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!payload || typeof payload.e !== 'string' || typeof payload.h !== 'string') {
    return { ok: false, reason: 'malformed' };
  }
  if (!payload.h.startsWith('scrypt$')) return { ok: false, reason: 'unsupported' };

  return {
    ok: true,
    email: payload.e,
    name: typeof payload.n === 'string' ? payload.n : '',
    passwordHash: payload.h,
    expiresAtMs: expiryMs,
  };
}
