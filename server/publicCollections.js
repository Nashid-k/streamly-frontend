// server/publicCollections.js — pure helpers for the anonymous public surface.
//
// A "public" collection is any saved list whose storage attrs include
// `visibility: 'public'`, a stable `publicId`, and NO `deletedAt` tombstone.
// By recorded contract the surface is ANONYMOUS: callers receive ONLY
// name/publicId/count (list mode) or name/publicId/itemIds (single lookup) —
// never a googleId, email, profile, or any other owner identity.

export const MAX_PUBLIC_COLLECTIONS = 250;

// Flatten every user doc's `collections` array into the public list shape,
// deduped by publicId, newest-updated first, capped.
// Skips tombstoned (deleted) collections so an un-publish propagates.
export function extractPublicCollections(rows) {
  const out = [];
  const seen = new Set();
  for (const row of rows || []) {
    for (const c of row?.collections || []) {
      if (!c || c.deletedAt !== undefined) continue;
      if (c.visibility !== 'public' || !c.publicId) continue;
      if (seen.has(c.publicId)) continue;
      seen.add(c.publicId);
      out.push({
        name: c.name,
        publicId: c.publicId,
        itemCount: Array.isArray(c.itemIds) ? c.itemIds.length : 0,
        updatedAt: c.updatedAt || null,
      });
    }
  }
  out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return out.slice(0, MAX_PUBLIC_COLLECTIONS);
}

// Locate a single public collection by its opaque publicId (never a username).
// Returns { name, publicId, itemIds, updatedAt } or null.
export function findPublicCollection(rows, publicId) {
  if (!publicId) return null;
  for (const row of rows || []) {
    for (const c of row?.collections || []) {
      if (!c || c.deletedAt !== undefined) continue;
      if (c.visibility !== 'public' || c.publicId !== publicId) continue;
      return {
        name: c.name,
        publicId: c.publicId,
        itemIds: Array.isArray(c.itemIds) ? c.itemIds.slice(0, 300) : [],
        updatedAt: c.updatedAt || null,
      };
    }
  }
  return null;
}
