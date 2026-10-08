// server/users.js — email-account persistence.
//
// One place that knows how an account row is shaped, so /api/register,
// /api/verifyEmail and /api/login cannot drift apart. The unique index on
// `email` is the mechanism that makes a verification token single-use: two
// concurrent clicks race to INSERT and exactly one wins with E11000.

import { connectToDatabase } from './db.js';

/** Emails are compared case-insensitively; Gmail treats them that way anyway. */
export function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Deliberately permissive: the only authority on whether an address can receive
// mail is the verification link itself. This rejects the shapes that would let a
// caller smuggle headers/CRLF or nonsense into the database.
const EMAIL_SHAPE = /^[^\s@,;:<>"']{1,64}@[^\s@,;:<>"'.]{1,63}\.[a-z]{2,24}$/i;

export function isValidEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length > 254) return false;
  return EMAIL_SHAPE.test(normalized);
}

/**
 * Create the unique index if absent. Idempotent and race-tolerant: two cold
 * starts can call this at once, and an already-existing index is not an error.
 */
export async function ensureEmailUniqueIndex(db) {
  try {
    await db.collection('users').createIndex({ email: 1 }, { unique: true, name: 'email_unique' });
  } catch (error) {
    // IndexOptionsConflict (85) / IndexKeySpecsConflict (86) mean it already
    // exists under different options — fine. Anything else (e.g. no Mongo
    // configured) propagates so the caller can answer 500 rather than silently
    // running without uniqueness, which would allow duplicate accounts.
    const code = error?.code;
    if (code !== 85 && code !== 86) throw error;
  }
}

export async function findUserByEmail(db, email) {
  return db.collection('users').findOne({ email: normalizeEmail(email) });
}

/**
 * Insert the account. Throws MongoServerError 11000 when the address is taken,
 * which callers translate into "already verified, sign in instead".
 */
export async function insertUser(db, { email, name, passwordHash }) {
  const normalized = normalizeEmail(email);
  const doc = {
    email: normalized,
    name: name || '',
    provider: 'email',
    passwordHash,
    emailVerified: true,
    verifiedAt: new Date(),
    createdAt: new Date(),
    lastLogin: new Date(),
  };
  const result = await db.collection('users').insertOne(doc);
  return { ...doc, _id: result.insertedId };
}

/**
 * Ensure the library document exists. Separate from the users row so that
 * deleting the profile cannot orphan data, and vice versa (see api/sync.js
 * DELETE, which wipes both).
 */
export async function ensureUserDataDoc(db, accountId, email) {
  const key = String(accountId);
  const existing = await db.collection('userData').findOne({ accountId: key });
  if (existing) return existing;
  const doc = {
    accountId: key,
    email: normalizeEmail(email),
    watchlist: [],
    watchHistory: [],
    collections: [],
    preferences: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  try {
    await db.collection('userData').insertOne(doc);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    // Lost an insert race — the other writer's doc is equivalent.
    return db.collection('userData').findOne({ accountId: key });
  }
  return doc;
}

/**
 * The only shape of a userData document that leaves the server.
 *
 * Kept in one place because /api/login and /api/verifyEmail both hand a library
 * to the client and an ad-hoc `{ ...doc }` in either one would eventually start
 * shipping `email` (and whatever the next field to be added) to the browser.
 */
export function toPublicLibrary(library) {
  return {
    watchlist: library?.watchlist || [],
    watchHistory: library?.watchHistory || [],
    collections: library?.collections || [],
    preferences: library?.preferences || {},
    lastSyncedAt: library?.updatedAt || new Date(),
  };
}

/** Shape sent to the browser. Never includes passwordHash. */
export function toPublicUser(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    accountId: String(doc._id),
    email: doc.email,
    name: doc.name || '',
    picture: doc.picture || '',
    provider: doc.provider || 'email',
  };
}

/** Convenience for handlers that need a connected db. */
export async function getDb() {
  const { db } = await connectToDatabase();
  return db;
}
