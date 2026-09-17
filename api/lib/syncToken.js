// api/lib/syncToken.js — short-lived HMAC proof-of-ownership for /api/sync.
//
// /api/auth returns a token = "<subject>.<base64url(hmac-sha256(subject))>".
// /api/sync requires `Authorization: Bearer <token>` and verifies the subject
// in the token matches the googleId being read/written, so an anonymous
// visitor can no longer overwrite another user's watchlist/preferences by
// guessing their googleId (the old /api/sync was an open write API).
//
// The signing key is never exposed to the client. If no secret is configured
// (SYNC_SECRET, falling back to GOOGLE_CLIENT_SECRET), sync is refused rather
// than silently downgraded.

import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET =
  process.env.SYNC_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';

export function isSyncEnabled() {
  return Boolean(SECRET);
}

function digest(subject) {
  return createHmac('sha256', SECRET).update(String(subject)).digest('base64url');
}

export function signSyncToken(subject) {
  if (!SECRET || !subject) return null;
  return `${subject}.${digest(subject)}`;
}

export function verifySyncToken(subject, token) {
  if (!SECRET || !subject || typeof token !== 'string') return false;
  const sep = token.lastIndexOf('.');
  if (sep <= 0) return false;
  const tokenSubject = token.slice(0, sep);
  const signature = token.slice(sep + 1);
  if (tokenSubject !== String(subject)) return false;
  const expected = digest(subject);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}