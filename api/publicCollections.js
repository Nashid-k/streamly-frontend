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

import { connectToDatabase } from './lib/db.js';
import { withLog } from './lib/logger.js';
import { extractPublicCollections, findPublicCollection } from './lib/publicCollections.js';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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

  try {
    const { db } = await connectToDatabase();
    const userDataCol = db.collection('userData');

    const rows = await userDataCol
      .find({}, { projection: { collections: 1, _id: 0 } })
      .toArray();

    const publicId = String(req.query?.publicId || '');

    if (publicId) {
      const collection = findPublicCollection(rows, publicId);
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