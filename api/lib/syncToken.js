// api/lib/syncToken.js — expiring HMAC proof-of-ownership for /api/sync.
//
// /api/auth returns a token = "<subject>.<expiryMs>.<base64url(hmac-sha256(subject.expiryMs))>".
// /api/sync requires `Authorization: Bearer <token>` and verifies the subject
// in the token matches the googleId being read/written AND that the token has
// not expired, so a leaked token stops working after TTL instead of granting
// permanent access (the old token lived forever until the operator rotated
// the whole secret, logging out every user).
//
// The signing key is never exposed to the client. If no secret is configured
// (SYNC_SECRET, falling back to GOOGLE_CLIENT_SECRET), sync is refused rather
// than silently downgraded.

import { createHmac, timingSafeEqual } from 'node:crypto';

// Read lazily so rotating the env var applies without a module reload (and so
// tests can configure the secret after import).
function getSecret() {
  return process.env.SYNC_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
}

// 30 days. /api/auth re-issues a fresh token on every Google sign-in, so an
// active user never notices; an abandoned device quietly loses cloud sync.
export const SYNC_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function isSyncEnabled() {
  return Boolean(getSecret());
}

function digest(subject, expiryMs) {
  return createHmac('sha256', getSecret())
    .update(`${String(subject)}.${String(expiryMs)}`)
    .digest('base64url');
}

export function signSyncToken(subject) {
  const SECRET = getSecret();
  if (!SECRET || !subject) return null;
  const expiryMs = Date.now() + SYNC_TOKEN_TTL_MS;
  return `${subject}.${expiryMs}.${digest(subject, expiryMs)}`;
}

export function verifySyncToken(subject, token) {
  const SECRET = getSecret();
  if (!SECRET || !subject || typeof token !== 'string') return false;
  const sep1 = token.lastIndexOf('.');
  if (sep1 <= 0) return false;
  const signature = token.slice(sep1 + 1);
  const head = token.slice(0, sep1);
  const sep2 = head.lastIndexOf('.');
  if (sep2 <= 0) return false;
  const tokenSubject = head.slice(0, sep2);
  const expiryMs = head.slice(sep2 + 1);
  if (tokenSubject !== String(subject)) return false;
  if (!/^\d+$/.test(expiryMs)) return false;
  if (Date.now() > Number(expiryMs)) return false; // expired
  const expected = digest(subject, expiryMs);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
