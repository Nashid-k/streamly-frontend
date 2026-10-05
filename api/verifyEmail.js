// api/verifyEmail.js — the first and only write of an email account.
//
// Consumes the signed token from the emailed link and, only then, INSERTs the
// `users` row. Everything before this point (password hashing, the pending
// signup) lived only in the link, so a signup that is never confirmed leaves
// nothing behind in the database.
//
// POST-only on purpose. Mail clients and corporate link scanners fetch URLs on
// their own; a GET that completed the verification would burn the token before
// the human ever saw the page. The /verify-email route renders a button that
// calls this endpoint.
//
// Single-use: verification inserts into `users` behind a unique index on email,
// so a second click hits E11000 and is answered with "already verified,
// sign in". The token is never extended or re-issued — resend means sign up again.

import { connectToDatabase } from '../server/db.js';
import { signSyncToken, isSyncEnabled } from '../server/syncToken.js';
import { withLog } from '../server/logger.js';
import { rateLimit, tooManyRequests, clientIp } from '../server/rateLimit.js';
import { verifyVerifyToken } from '../server/verifyToken.js';
import { sendWelcomeEmail } from '../server/mailer.js';
import {
  ensureEmailUniqueIndex,
  ensureUserDataDoc,
  findUserByEmail,
  insertUser,
  toPublicLibrary,
  toPublicUser,
} from '../server/users.js';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
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
    res.status(405).json({
      success: false,
      message: 'Use POST to confirm an email. Verification links must be opened by a person, not a mail scanner.',
    });
    return;
  }

  try {
    if (!isSyncEnabled()) {
      res.status(503).json({
        success: false,
        message: 'Verification is not configured: set SYNC_SECRET in the deployment environment.',
      });
      return;
    }

    const limit = rateLimit({ key: () => `verify:${clientIp(req)}`, limit: 20, windowMs: 15 * 60_000 });
    if (!limit.ok) {
      tooManyRequests(res, limit.retryAfterSec);
      return;
    }

    const body = parseBody(req);
    if (!body || typeof body.token !== 'string' || !body.token) {
      res.status(400).json({ success: false, message: 'Missing verification token.' });
      return;
    }

    const result = verifyVerifyToken(body.token);
    if (!result.ok) {
      const status = result.reason === 'expired' ? 410 : 400;
      res.status(status).json({
        success: false,
        expired: result.reason === 'expired',
        message:
          result.reason === 'expired'
            ? 'This verification link has expired (they last 24 hours). Sign up again for a fresh one.'
            : 'This verification link is invalid or incomplete.',
      });
      return;
    }

    const { db } = await connectToDatabase();
    await ensureEmailUniqueIndex(db);

    // Pre-check for a friendlier answer than the raw duplicate-key error. The
    // insert below is still the authority — this is only about the message.
    const existing = await findUserByEmail(db, result.email);
    if (existing) {
      res.status(409).json({
        success: false,
        message: 'This email is already verified. Sign in instead.',
      });
      return;
    }

    let created;
    try {
      created = await insertUser(db, {
        email: result.email,
        name: result.name,
        passwordHash: result.passwordHash,
      });
    } catch (error) {
      if (error?.code === 11000) {
        // Two clicks raced; the loser gets the same message as a pre-check hit.
        res.status(409).json({
          success: false,
          message: 'This email is already verified. Sign in instead.',
        });
        return;
      }
      throw error;
    }

    // userData is included so the client's adopt path is byte-for-byte the same
    // after signup and after login. It is always the empty shell written above —
    // a new account has no library — but returning it keeps one code path
    // instead of a special case that silently drifts.
    const library = await ensureUserDataDoc(db, created._id, created.email);

    // Post-verification only. Fire-and-forget: the account already exists, so a
    // mail hiccup must not turn success into an error the user retries.
    sendWelcomeEmail({ to: created.email, name: created.name }).catch(() => {});

    res.status(201).json({
      success: true,
      user: toPublicUser(created),
      userData: toPublicLibrary(library),
      syncToken: signSyncToken(String(created._id)),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Internal server error in verifyEmail handler.',
    });
  }
});
