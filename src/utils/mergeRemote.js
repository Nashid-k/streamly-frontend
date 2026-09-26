// src/utils/mergeRemote.js — timestamp-aware union merge for cloud pulls.
//
// Policy (the old local-first union by `id` dropped every remote UPDATE, so
// multi-device edits and last-watched never synced):
//   • missing locally  → appended, UNLESS remote carries a tombstone
//     (`deletedAt`): deletions must propagate instead of resurrecting.
//   • present locally  → the NEWER side wins by `updatedAt`/`deletedAt`; when
//     either side lacks a timestamp the newer remote data still lands.
//   • a tombstone on either side beats an older live copy, so a delete on one
//     device stays deleted after another syncs.
//   • `pruneTombstonesMs` drops tombstones past that window (final GC).
//
// Returns a NEW array; inputs are never mutated.

// Timestamps ride the wire as JSON numbers, but legacy local payloads carry
// string dates. Comparing raw strings against numbers silently wrong-orders
// merges (every string > every number in JS), so coerce before comparing.
function toMillis(value) {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

const timestampOf = (item) => toMillis(item?.deletedAt ?? item?.updatedAt ?? 0);

export function mergeListsById(local = [], remote = [], { limit, pruneTombstonesMs, sortBy } = {}) {
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
            // Brand-new remote tombstone: keep it so the id can't be re-added by an
            // even staler copy, unless GC asks to drop old ones. Live items append.
      if (item.deletedAt !== undefined) {
        if (typeof pruneTombstonesMs === "number") {
          if (Date.now() - item.deletedAt > pruneTombstonesMs) continue;
        }
        index.set(item.id, out.length);
        out.push(item);
        continue;
      }
      index.set(item.id, out.length);
      out.push(item);
    } else if (timestampOf(item) > timestampOf(out[existingIdx])) {
      out[existingIdx] = item;
    }
  }

    // Local-only tombstones get GC'd on merge too (30 days is the convention).
  const pruned =
    typeof pruneTombstonesMs === "number"
      ? out.filter(
          (item) =>
            item?.deletedAt === undefined || Date.now() - item.deletedAt <= pruneTombstonesMs,
        )
      : out;

    // Tombstone-safe cap: a delete marker must never be evicted by `limit` (a
    // sliced-away tombstone resurrects the title on the next merge). Cap the live
    // group only, then re-append surviving tombstones.
  const tombstones = [];
  const live = [];
  for (const item of pruned) {
    if (item?.deletedAt !== undefined) tombstones.push(item);
    else live.push(item);
  }

  if (typeof sortBy === "function") {
    live.sort((a, b) => sortBy(a, b) || timestampOf(b) - timestampOf(a));
  }

  const capped = typeof limit === "number" && live.length > limit ? live.slice(0, limit) : live;
  return [...capped, ...tombstones];
}
