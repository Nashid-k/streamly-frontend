// api/login.js — email + password sign-in.
//
// Replaces the Google ID-token path. Same bearer contract as before: on success
// the caller gets a 30-day HMAC sync token (server/syncToken.js) which is what
// /api/sync checks, so the rest of the cloud-sync machinery is untouched.
//
// Enumeration hardening, in order of importance:
//   • One generic 401 for "no such account" and "wrong password" — the message
//     never reveals which.
//   • A throwaway scrypt run when the account is missing, so the two cases take
//     comparable wall-clock time.
//   • Per-address throttling on top of per-IP, so a distributed guess against
//     one mailbox still hits a wall.

import { connectToDatabase } from '../server/db.js';
import { signSyncToken, isSyncEnabled } from '../server/syncToken.js';
import { withLog } from '../server/logger.js';
import { rateLimit, tooManyRequests, clientIp } from '../server/rateLimit.js';
import { logError } from '../src/utils/debugLogger.js';
import { burnPasswordCompare, verifyPassword } from '../server/passwords.js';
import { ensureUserDataDoc, findUserByEmail, isValidEmail, normalizeEmail, toPublicLibrary, toPublicUser } from '../server/users.js';

const GENERIC_FAILURE = 'Incorrect email or password.';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseBody(req) {
  if (typeof req.body !== 'string') return req.body || {};
  try {
    return JSON.parse(req.body || '{}');
  } catch {
    return null;
  }
}

export default withLog(async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ success: false, message: 'Method not allowed.' });
    return;
  }

  try {
    if (!isSyncEnabled()) {
      res.status(503).json({
        success: false,
        message: 'Sign-in is not configured: set SYNC_SECRET in the deployment environment.',
      });
      return;
    }

    const ip = clientIp(req);
    const ipLimit = rateLimit({ key: () => `login:${ip}`, limit: 20, windowMs: 15 * 60_000 });
    if (!ipLimit.ok) {
      tooManyRequests(res, ipLimit.retryAfterSec);
      return;
    }

    const body = parseBody(req);
    if (!body) {
      res.status(400).json({ success: false, message: 'Invalid JSON body.' });
      return;
    }

    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!isValidEmail(email) || !password) {
      // Still burn comparable CPU so a malformed request is not distinguishable
      // from a valid one by timing alone.
      await burnPasswordCompare();
      res.status(401).json({ success: false, message: GENERIC_FAILURE });
      return;
    }

    // Per-address bucket. Keyed on the normalized address so casing tricks do
    // not buy extra attempts.
    const addressLimit = rateLimit({ key: () => `login-mail:${email}`, limit: 10, windowMs: 15 * 60_000 });
    if (!addressLimit.ok) {
      tooManyRequests(res, addressLimit.retryAfterSec);
      return;
    }

    const { db } = await connectToDatabase();
    const user = await findUserByEmail(db, email);

    if (!user) {
      await burnPasswordCompare();
      res.status(401).json({ success: false, message: GENERIC_FAILURE });
      return;
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ success: false, message: GENERIC_FAILURE });
      return;
    }

    const accountId = String(user._id);
    const library = await ensureUserDataDoc(db, accountId, user.email);

    res.status(200).json({
      success: true,
      user: toPublicUser(user),
      // Proof-of-ownership for /api/sync — scoped to this account, never to the
      // address, so changing the email does not invalidate a live session.
      syncToken: signSyncToken(accountId),
      userData: toPublicLibrary(library),
    });
  } catch (error) {
    logError('api', 'login handler failed', { message: error?.message });
    res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});
