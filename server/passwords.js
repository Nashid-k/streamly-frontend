// server/passwords.js — password hashing for email accounts.
//
// scrypt from node:crypto rather than bcrypt/argon2: no new dependency, no
// native build step on Vercel, and it is memory-hard (an attacker who can
// afford to run it cannot amortise a GPU/ASIC table over it the way they can
// with a fast SHA-256 password hash). Every other crypto primitive in this
// repo is hand-rolled on node:crypto (see verifyToken.js, syncToken.js), so
// this keeps that pattern instead of introducing a foreign idiom.
//
// Stored format: "scrypt$N$r$p$<salt base64url>$<hash base64url>". The
// parameters live IN the string so raising the cost later re-hashes old
// passwords on next successful login instead of invalidating them.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

// N=16384 r=8 p=1 is the interactive-login profile (~64 MiB memory-hard).
// Node's default maxmem is 32 MiB, so maxmem is raised explicitly — without
// it scrypt throws ERR_CRYPTO_INVALID_SCRYPT_PARAMS.
export const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const KEYLEN = 64;
const SALT_BYTES = 16;

export const MIN_PASSWORD_LENGTH = 10;
// scrypt cost scales with input length, so an unbounded password is a cheap
// way to burn function CPU. 200 chars is far beyond any real passphrase.
export const MAX_PASSWORD_LENGTH = 200;

/**
 * Validate a candidate password against the signup policy.
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validatePassword(password, { email } = {}) {
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, message: 'Password is required.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
    };
  }
  // "nashidk1999@gmail.com" + the same string as the password would otherwise
  // pass a length check while being trivially guessable from the profile.
  if (typeof email === 'string' && email) {
    const local = email.split('@')[0];
    if (local && local.length >= 6 && password.toLowerCase().includes(local.toLowerCase())) {
      return { ok: false, message: 'Password must not contain your email address.' };
    }
  }
  return { ok: true };
}

/**
 * Hash a plaintext password. Returns a self-describing string.
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  if (typeof password !== 'string' || !password) {
    throw new Error('hashPassword requires a non-empty string');
  }
  const salt = randomBytes(SALT_BYTES);
  const { N, r, p } = SCRYPT_PARAMS;
  const derived = await scrypt(password.normalize('NFKC'), salt, KEYLEN, {
    N,
    r,
    p,
    maxmem: SCRYPT_MAXMEM,
  });
  const { N: costN, r: costR, p: costP } = SCRYPT_PARAMS;
  return [
    'scrypt',
    costN,
    costR,
    costP,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

/**
 * Verify a plaintext password against a stored hash. Never throws on a
 * malformed hash — a corrupt row must read as "wrong password", not as a 500
 * that tells an attacker the row exists.
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Refuse absurd cost parameters from a tampered row: N=2^30 would hang the
  // function instead of failing.
  if (N > 1024 * 1024 || r > 32 || p > 16) return false;

  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'base64url');
    expected = Buffer.from(parts[5], 'base64url');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * A real scrypt run against a throwaway hash. Called when an email is unknown
 * so that "no such account" and "wrong password" take the same wall-clock
 * time and cannot be told apart by an attacker enumerating addresses.
 */
export async function burnPasswordCompare() {
  const dummy = `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${randomBytes(16).toString('base64url')}$${randomBytes(8).toString('base64url')}`;
  await verifyPassword('not-a-real-password', dummy);
}
