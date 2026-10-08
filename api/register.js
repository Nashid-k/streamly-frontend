// api/register.js — start an email signup.
//
// Writes NOTHING to Mongo. This handler hashes the password, packs the hash
// into a signed 24h token and mails it out; the `users` row is INSERTed later,
// by /api/verifyEmail, when the recipient proves they read the mail. See
// server/verifyToken.js for why the pending signup lives in the link.
//
// Rate limits are deliberately much tighter than /api/sync's: every call costs
// a real scrypt run and a real SMTP conversation, and an unthrottled endpoint
// here is a mail-bomb amplifier aimed at the operator's own Gmail quota.

import { connectToDatabase } from '../server/db.js';
import { withLog } from '../server/logger.js';
import { rateLimit, tooManyRequests, clientIp } from '../server/rateLimit.js';
import { logError } from '../src/utils/debugLogger.js';
import { hashPassword, validatePassword } from '../server/passwords.js';
import { signVerifyToken, isVerifyTokenEnabled } from '../server/verifyToken.js';
import { isMailConfigured, isMailLinkConfigured, sendVerificationEmail } from '../server/mailer.js';
import { isValidEmail, normalizeEmail } from '../server/users.js';

const MAX_NAME_CHARS = 80;

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
    // Fail closed BEFORE hashing: no point spending 100ms of scrypt if the
    // mail or the signing secret is missing and the mail can never be sent.
    if (!isVerifyTokenEnabled()) {
      res.status(503).json({
        success: false,
        message: 'Sign-up is not configured: set VERIFY_SECRET (or SYNC_SECRET) in the deployment environment.',
      });
      return;
    }
    if (!isMailConfigured() || !isMailLinkConfigured()) {
      res.status(503).json({
        success: false,
        message: 'Sign-up is not configured: set SMTP_HOST/SMTP_USER/SMTP_PASS and SITE_URL in the deployment environment.',
      });
      return;
    }

    const ip = clientIp(req);
    // Per-IP flood guard, then a much smaller per-address cap so one mailbox
    // cannot be spammed by rotating IPs.
    const ipLimit = rateLimit({ key: () => `register:${ip}`, limit: 5, windowMs: 10 * 60_000 });
    if (!ipLimit.ok) {
      tooManyRequests(res, ipLimit.retryAfterSec);
      return;
    }

    const body = parseBody(req);
    if (!body) {
      res.status(400).json({ success: false, message: 'Invalid JSON body.' });
      return;
    }

    const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_NAME_CHARS) : '';
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!isValidEmail(email)) {
      res.status(400).json({ success: false, message: 'Enter a valid email address.' });
      return;
    }

    const policy = validatePassword(password, { email });
    if (!policy.ok) {
      res.status(400).json({ success: false, message: policy.message });
      return;
    }

    const emailLimit = rateLimit({ key: () => `register-mail:${email}`, limit: 3, windowMs: 60 * 60_000 });
    if (!emailLimit.ok) {
      tooManyRequests(res, emailLimit.retryAfterSec);
      return;
    }

    // Read-only existence check. Reporting "already registered" is a small
    // account-existence oracle, but it is the difference between a user being
    // told to check their inbox and a user waiting 24h on a mail that will
    // never be accepted.
    const { db } = await connectToDatabase();
    const existing = await db.collection('users').findOne({ email }, { projection: { _id: 1 } });
    if (existing) {
      res.status(409).json({
        success: false,
        message: 'That email already has a Streamly account. Sign in instead.',
      });
      return;
    }

    const passwordHash = await hashPassword(password);
    const token = signVerifyToken({ email, name, passwordHash });
    if (!token) {
      res.status(503).json({ success: false, message: 'Could not create a verification link.' });
      return;
    }

    // A send failure must surface as a failure. Reporting success here would
    // leave the user watching a "check your inbox" screen for nothing.
    try {
      await sendVerificationEmail({ to: email, name, token });
    } catch (error) {
      logError('api', 'verification email send failed', { message: error?.message });
      res.status(502).json({
        success: false,
        message: 'Could not send the verification email. Please try again.',
      });
      return;
    }

    // 200, not 201: nothing was created.
    res.status(200).json({
      success: true,
      email,
      message: 'Check your inbox — we sent a verification link. Your account is created once you open it.',
    });
  } catch (error) {
    logError('api', 'register handler failed', { message: error?.message });
    res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});
