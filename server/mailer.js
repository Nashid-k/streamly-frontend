// server/mailer.js — transactional email over SMTP.
//
// nodemailer is imported lazily and the transport is built on first use. A
// module-level `createTransport` would connect during cold start and, with a
// bad credential, every function invocation would fail before the handler's
// own try/catch could answer — the same class of bug that server/db.js
// documents for Mongo. isMailConfigured() lets /api/register fail with a clean
// 503 instead of a Vercel "A server error has occurred".

import nodemailer from 'nodemailer';
import { withLog } from '../server/logger.js';
import { verificationEmail, welcomeEmail } from '../server/templates.js';

// Lazily read so tests can set env after import and so a rotated credential
// applies on the next send without a redeploy.
function cfg() {
  const user = (process.env.SMTP_USER || '').trim();
  // Gmail prints app passwords in four space-separated groups ("abcd efgh ijkl
  // mnop") and the leading space is significant when pasted into a normal
  // password field — SMTP auth rejects it. Strip all whitespace.
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
  const host = (process.env.SMTP_HOST || 'smtp.gmail.com').trim();
  const port = Number(process.env.SMTP_PORT) || 465;
  return {
    user,
    pass,
    host,
    port,
    // Port 465 is implicit TLS; 587 expects STARTTLS after a plain connect.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    from: (process.env.MAIL_FROM || user).trim(),
    fromName: (process.env.MAIL_FROM_NAME || 'Streamly').trim(),
    siteUrl: (process.env.SITE_URL || process.env.VITE_SITE_URL || '').replace(/\/+$/, ''),
    siteName: (process.env.SITE_NAME || 'Streamly').trim(),
  };
}

export function isMailConfigured() {
  const { user, pass, host } = cfg();
  return Boolean(user && pass && host);
}

/** True when SITE_URL is usable — without it the verify link cannot be built. */
export function isMailLinkConfigured() {
  return isMailConfigured() && Boolean(cfg().siteUrl);
}

let transport = null;
let transportKey = '';

function getTransport() {
  const { user, pass, host, port, secure } = cfg();
  const key = `${host}|${port}|${secure}|${user}`;
  if (transport && transportKey === key) return transport;
  transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    // Cap the handshake: a hanging SMTP server must not hold the function open
    // until Vercel kills it and the user sees a generic failure.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  transportKey = key;
  return transport;
}

/** Low-level send. Throws on failure; callers decide how loud that is. */
export async function sendMail({ to, subject, html, text }) {
  if (!isMailConfigured()) {
    throw new Error('Email is not configured: set SMTP_HOST/SMTP_USER/SMTP_PASS in the deployment environment.');
  }
  const { from, fromName } = cfg();
  return getTransport().sendMail({
    from: { name: fromName, address: from },
    to,
    subject,
    html,
    text,
  });
}

/** Absolute link the recipient clicks. */
export function buildVerifyUrl(token) {
  const { siteUrl } = cfg();
  if (!siteUrl) throw new Error('SITE_URL is not configured: cannot build a verification link.');
  return `${siteUrl}/verify-email?token=${encodeURIComponent(token)}`;
}

/**
 * Signup verification email. Throws — a signup whose mail did not go out must
 * NOT be reported as success, or the user waits 24h for a mail that never existed.
 * @returns {Promise<void>}
 */
export async function sendVerificationEmail({ to, name, token }) {
  const url = buildVerifyUrl(token);
  const mail = verificationEmail({ name, verifyUrl: url, siteName: cfg().siteName });
  await sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text });
}

/**
 * Post-verification welcome. Fire-and-forget: the account is already created,
 * so a mail failure must not turn a successful verification into an error.
 */
export const sendWelcomeEmail = withLog(async function sendWelcome({ to, name }) {
  try {
    const mail = welcomeEmail({ name, siteUrl: cfg().siteUrl, siteName: cfg().siteName });
    await sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (error) {
    throw error; // withLog records it; the caller ignores
  }
});


export const __test__ = { cfg };
