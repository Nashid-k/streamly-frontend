// api/sync.js — Cloud synchronization endpoint for user library and preferences to MongoDB
import { connectToDatabase } from './lib/db.js';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const { db } = await connectToDatabase();
    const userDataCol = db.collection('userData');

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const { googleId, email, watchlist, watchHistory, preferences } = body;

      if (!googleId && !email) {
        res.status(400).json({ success: false, message: 'User identification (googleId or email) required.' });
        return;
      }

      const filter = googleId ? { googleId } : { email };
      const updateDoc = {
        $set: {
          ...(googleId ? { googleId } : {}),
          ...(email ? { email } : {}),
          updatedAt: new Date(),
        },
      };

      if (Array.isArray(watchlist)) updateDoc.$set.watchlist = watchlist;
      if (Array.isArray(watchHistory)) updateDoc.$set.watchHistory = watchHistory;
      if (preferences && typeof preferences === 'object') updateDoc.$set.preferences = preferences;

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
      const { googleId, email } = req.query || {};
      if (!googleId && !email) {
        res.status(400).json({ success: false, message: 'googleId or email query parameter required.' });
        return;
      }

      const query = googleId ? { googleId } : { email };
      const userData = await userDataCol.findOne(query);

      res.status(200).json({
        success: true,
        userData: userData || {
          watchlist: [],
          watchHistory: [],
          preferences: {},
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
}
