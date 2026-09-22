// api/publicCollections.js — anonymous, read-only public collections endpoint.
//
// The Explore Collections page needs to surface PUBLIC lists from EVERY user,
// not just the viewer's own device. The viewer's local aios_my_collections can
// only ever contain their own collections, so a publicId from another user
// never resolves client-side. This endpoint reads the same `userData`
// collection that /api/sync writes and flattens the PUBLIC subsets only.
//
// Read-only + anonymous by contract:
//   • GET /api/publicCollections            → { name, publicId, itemCount }[]
//   • GET /api/publicCollections?publicId=X → { name, publicId, itemIds }
// Never returns googleId/email/profile. No auth, no owner identity anywhere.
//
// Public collections live inside per-user userData documents, so a direct
// Mongo query on `collections.publicId` can't work as-is. We therefore query
// only documents that CONTAIN a public id via a projection-safe filter —
// `collections.visibility: 'public'` — and let the pure helpers do the exact
// publicId/tombstone narrowing. An index on that field keeps the scan bounded.

import { connectToDatabase } from './lib/db.js';
import { withLog } from './lib/logger.js';
import { extractPublicCollections, findPublicCollection } from './lib/publicCollections.js';
import { rateLimit, tooManyRequests, clientIp } from './lib/rateLimit.js';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// Best-effort index creation (no-op when it already exists). Collection-level
// queries can't be indexed directly, but the visibility filter narrows the
// candidate set; this also future-proofs the document shape.
async function ensureIndexes(col) {
  try {
    await col.createIndex({ 'collections.visibility': 1 });
  } catch {
    // Index creation is an optimization, never a request gate.
  }
}

export default withLog(async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ success: false, message: 'Method not allowed.' });
    return;
  }

  const limit = rateLimit({
    key: () => `pubcol:${clientIp(req)}`,
    limit: 60,
    windowMs: 60_000,
  });
  if (!limit.ok) {
    tooManyRequests(res, limit.retryAfterSec);
    return;
  }

  try {
    const { db } = await connectToDatabase();
    const userDataCol = db.collection('userData');
    await ensureIndexes(userDataCol);

    // Only documents that actually contain a public collection are read.
    // This bounds the scan to publishing users instead of the whole database.
    // _id desc = newest userData documents first, so the 500-doc window fetches
    // the freshest publishers; the pure helper then newest-firsts by
    // collection.updatedAt. (Without a Mongo sort the window was arbitrary and
    // could silently exclude the very newest collections.)
    const rows = await userDataCol
      .find(
        { collections: { $elemMatch: { visibility: 'public' } } },
        { projection: { collections: 1, _id: 0 } },
      )
      .sort({ _id: -1 })
      .limit(500)
      .toArray();

    const rawPublicId = String(req.query?.publicId || '');
    // Opaque ids are `pub-<base36>` — anything longer than 100 chars or with
    // weird characters was never issued by the client and can't match anyway.
    // A malformed value answers "missing" (collection: null), never an error —
    // it's indistinguishable from an unknown id.
    const hasPublicIdParam = rawPublicId.length > 0;
    const publicId = /^[A-Za-z0-9-]{1,100}$/.test(rawPublicId) ? rawPublicId : null;

    if (hasPublicIdParam) {
      const collection = publicId ? findPublicCollection(rows, publicId) : null;
      res.status(200).json({ success: true, collection });
      return;
    }

    const collections = extractPublicCollections(rows);
    res.status(200).json({ success: true, collections });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error?.message || 'Internal server error in publicCollections handler.',
    });
  }
});
