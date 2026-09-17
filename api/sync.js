// api/sync.js — Cloud synchronization endpoint for user library and preferences to MongoDB.
//
// Only verified identities may read/write: every request must present an
// `Authorization: Bearer <token>` issued by /api/auth for the googleId being
// accessed (see api/lib/syncToken.js). Guests never call this endpoint — the
// client keeps guest state in localStorage only. Payloads are capped so a
// bad actor can't bloat the shared 'streamly' collection.
import { connectToDatabase } from './lib/db.js';
import { isSyncEnabled, verifySyncToken } from './lib/syncToken.js';
import { withLog } from './lib/logger.js';

const MAX_WATCHLIST = 500;
const MAX_HISTORY = 500;
const MAX_BODY_BYTES = 512 * 1024;

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function bearerToken(req) {
  const header = req.headers?.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export default withLog(async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
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

    if (!googleId) {
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

      const { watchlist, watchHistory, preferences } = body;
      const updateDoc = { $set: { googleId, updatedAt: new Date() } };

      if (watchlist !== undefined) {
        if (!Array.isArray(watchlist) || watchlist.length > MAX_WATCHLIST) {
          res.status(400).json({ success: false, message: `watchlist must be an array of <= ${MAX_WATCHLIST} items.` });
          return;
        }
        updateDoc.$set.watchlist = watchlist;
      }
      if (watchHistory !== undefined) {
        if (!Array.isArray(watchHistory) || watchHistory.length > MAX_HISTORY) {
          res.status(400).json({ success: false, message: `watchHistory must be an array of <= ${MAX_HISTORY} items.` });
          return;
        }
        updateDoc.$set.watchHistory = watchHistory;
      }
      if (preferences && typeof preferences === 'object') {
        updateDoc.$set.preferences = preferences;
      }

      const result = await userDataCol.updateOne(filter, updateDoc, { upsert: true });

      res.status(200).json({
        success: true,
        matchedCount: result.matchedCount,
        upsertedId: result.upsertedId,
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
          preferences: userData?.preferences || {},
        },
      });
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