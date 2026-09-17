// src/utils/mergeRemote.js — timestamp-aware set-union merge for cloud pulls.
//
// The old merge was local-first union by `id`: remote items were appended only
// when their id was missing locally, and a remote UPDATE to an existing item
// was silently dropped forever (multi-device edits/last-watched never synced).
//
// Policy:
//   • items missing locally   → appended (remote item wins brand-new entries)
//   • items present locally   → the NEWER one wins by `updatedAt`; if either
//     side lacks `updatedAt` (legacy localStorage payloads) the timestamp is
//     treated as 0, so the newer remote data still lands.
//   • optional `limit`        → hard cap after merging (continue-watching).
//
// Returns a NEW array; inputs are never mutated.

export function mergeListsById(local = [], remote = [], { limit } = {}) {
  const out = Array.isArray(local) ? local.slice() : [];
  const index = new Map();
  out.forEach((item, i) => {
    if (item && item.id !== undefined && item.id !== null) index.set(item.id, i);
  });

  const remoteItems = Array.isArray(remote) ? remote : [];
  for (const item of remoteItems) {
    if (!item || item.id === undefined || item.id === null) continue;
    const existingIdx = index.get(item.id);
    if (existingIdx === undefined) {
      index.set(item.id, out.length);
      out.push(item);
    } else if ((item.updatedAt || 0) > (out[existingIdx].updatedAt || 0)) {
      out[existingIdx] = item;
    }
  }

  if (typeof limit === "number" && out.length > limit) return out.slice(0, limit);
  return out;
}