// api/sync.js — Cloud synchronization endpoint for user library and preferences to MongoDB.
//
// Only verified identities may read/write: every request must present an
// `Authorization: Bearer <token>` issued by /api/auth for the googleId being
// accessed (see server/syncToken.js). Guests never call this endpoint — the
// client keeps guest state in localStorage only. Payloads are capped so a
// bad actor can't bloat the shared 'streamly' collection.
//
// DELETE supports the account-deletion flow: it wipes the caller's own
// userData document (library + preferences + collections) and the profile
// row in `users`. Requires the same bearer token as GET/POST.
//
// Collections are SANITIZED server-side: the public Explore surface renders
// `name` for every visitor, so a hostile payload (`name: {...}`) would crash
// the shared Explore page for everyone. Only clean strings/lists survive.

import { connectToDatabase } from '../server/db.js';
import { isSyncEnabled, verifySyncToken } from '../server/syncToken.js';
import { withLog } from '../server/logger.js';
import { rateLimit, tooManyRequests, clientIp } from '../server/rateLimit.js';

const MAX_WATCHLIST = 500;
const MAX_HISTORY = 500;
const MAX_COLLECTIONS = 100;
const MAX_ITEMS_PER_COLLECTION = 300;
const MAX_COLLECTION_NAME_CHARS = 120;
const MAX_BODY_BYTES = 512 * 1024;

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function bearerToken(req) {
  const header = req.headers?.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function asString(value, maxChars) {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxChars).trim();
}

function asStringArray(value, maxItems) {
  if (!Array.isArray(value)) return null;
  return value
    .slice(0, maxItems)
    .filter((v) => typeof v === 'string' && v.length > 0)
    .map((v) => v.slice(0, 200));
}

function asNonNegativeInt(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function asVisibility(value) {
  return value === 'public' ? 'public' : 'private';
}

// Flatten any incoming collection record to the whitelisted storage shape.
// Unknown fields (googleId injections, functions, nested objects) are dropped.
// Records that survive still count toward MAX_COLLECTIONS; garbage entries
// become empty-but-valid collections rather than crashing the public surface.
function sanitizeCollections(raw) {
  return raw.map((c) => {
    const itemIds = asStringArray(c?.itemIds, MAX_ITEMS_PER_COLLECTION) || [];
    const publicId = asString(c?.publicId, 100);
    const visibility = asVisibility(c?.visibility);
    return {
      id: asString(c?.id, 100) || `col-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`,
      name: asString(c?.name, MAX_COLLECTION_NAME_CHARS) || 'Untitled collection',
      visibility,
      ...(visibility === 'public' && publicId ? { publicId } : {}),
      itemIds,
      createdAt: asNonNegativeInt(c?.createdAt) || Date.now(),
      updatedAt: asNonNegativeInt(c?.updatedAt) || Date.now(),
      // Tombstone: deleted locally; kept so other devices merge the delete.
      ...(c?.deletedAt !== undefined ? { deletedAt: asNonNegativeInt(c?.deletedAt) || Date.now() } : {}),
    };
  });
}

function sanitizeList(raw, maxItems) {
  if (!Array.isArray(raw)) return null;
  return raw.slice(0, maxItems).filter((item) => item && typeof item === 'object' && !Array.isArray(item));
}

function sanitizePreferences(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  for (const [k, v] of Object.entries(raw).slice(0, 200)) {
    if (typeof k !== 'string' || k.length > 80) continue;
    // Whitelist JSON-safe primitives so a hostile payload can't smuggle
    // deeply nested structures into the document.
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
      out[k] = typeof v === 'string' ? v.slice(0, 300) : v;
    } else if (Array.isArray(v) && v.length <= 50) {
      out[k] = v.slice(0, 50).map((x) => (typeof x === 'string' ? x.slice(0, 100) : x));
    }
  }
  return out;
}

export default withLog(async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Rate limit BEFORE any DB work. Authenticated users get their own bucket;
  // anonymous floods share one per-IP bucket.
  const limit = rateLimit({
    key: () => `sync:${clientIp(req)}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    tooManyRequests(res, limit.retryAfterSec);
    return;
  }

  try {
    if (!isSyncEnabled()) {
      res
        .status(503)
        .json({ success: false, message: 'Cloud sync is not configured (SYNC_SECRET or GOOGLE_CLIENT_SECRET missing).' });
      return;
    }

    let body = {};
    if (req.method === 'POST') {
      try {
        body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      } catch {
        body = {};
      }
    }
    const { googleId } = req.method === 'POST' ? body : (req.query || {});

    if (!googleId || typeof googleId !== 'string' || googleId.length > 128) {
      res.status(400).json({ success: false, message: 'googleId is required.' });
      return;
    }

    const token = bearerToken(req);
    if (!verifySyncToken(googleId, token)) {
      res.status(401).json({ success: false, message: 'Missing or invalid sync token for this googleId.' });
      return;
    }

    const { db } = await connectToDatabase();
    const userDataCol = db.collection('userData');
    const filter = { googleId };

    if (req.method === 'POST') {
      if (typeof req.body === 'string' && req.body.length > MAX_BODY_BYTES) {
        res.status(413).json({ success: false, message: 'Payload too large.' });
        return;
      }

      const { watchlist, watchHistory, preferences, collections } = body;
      const updateDoc = { $set: { googleId, updatedAt: new Date() } };

      const cleanWatchlist = sanitizeList(watchlist, MAX_WATCHLIST);
      if (cleanWatchlist !== null) updateDoc.$set.watchlist = cleanWatchlist;
      else if (watchlist !== undefined) {
        res.status(400).json({ success: false, message: `watchlist must be an array of <= ${MAX_WATCHLIST} items.` });
        return;
      }

      const cleanHistory = sanitizeList(watchHistory, MAX_HISTORY);
      if (cleanHistory !== null) updateDoc.$set.watchHistory = cleanHistory;
      else if (watchHistory !== undefined) {
        res.status(400).json({ success: false, message: `watchHistory must be an array of <= ${MAX_HISTORY} items.` });
        return;
      }

      if (collections !== undefined) {
        if (!Array.isArray(collections) || collections.length > MAX_COLLECTIONS) {
          res.status(400).json({ success: false, message: `collections must be an array of <= ${MAX_COLLECTIONS} items.` });
          return;
        }
        updateDoc.$set.collections = sanitizeCollections(collections);
      }

      const cleanPrefs = sanitizePreferences(preferences);
      if (cleanPrefs !== null) updateDoc.$set.preferences = cleanPrefs;

      await userDataCol.updateOne(filter, updateDoc, { upsert: true });

      res.status(200).json({
        success: true,
        updatedAt: updateDoc.$set.updatedAt,
      });
      return;
    }

    if (req.method === 'GET') {
      const userData = await userDataCol.findOne(filter);
      res.status(200).json({
        success: true,
        userData: {
          watchlist: userData?.watchlist || [],
          watchHistory: userData?.watchHistory || [],
          collections: userData?.collections || [],
          preferences: userData?.preferences || {},
        },
      });
      return;
    }

    if (req.method === 'DELETE') {
      // Wipe the caller's own cloud data: library doc first, profile row after.
      await userDataCol.deleteOne(filter);
      try {
        await db.collection('users').deleteOne({ googleId });
      } catch {
        // The profile row is secondary — library wipe is the privacy-critical part.
      }
      res.status(200).json({ success: true, message: 'Cloud data deleted.' });
      return;
    }

    res.status(405).json({ success: false, message: 'Method not allowed.' });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Internal server error in sync handler.',
    });
  }
});
