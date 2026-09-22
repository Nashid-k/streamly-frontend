// src/utils/mergeRemote.js — timestamp-aware union merge for cloud pulls.
//
// The old merge was local-first union by `id`: remote items were appended only
// when their id was missing locally, and a remote UPDATE to an existing item
// was silently dropped forever (multi-device edits/last-watched never synced).
//
// Policy:
//   • items missing locally   → appended, UNLESS remote carries a tombstone
//     (`deletedAt`) — deletions must propagate instead of resurrecting.
//   • items present locally   → the NEWER one wins by `updatedAt`/`deletedAt`;
//     if either side lacks a timestamp (legacy localStorage payloads) the
//     newer remote data still lands.
//   • a tombstone on either side wins over an older live copy, so removing a
//     collection on device A stays removed after device B syncs.
//   • optional `pruneTombstonesMs` → drops tombstones older than the window
//     (final GC once every device has certainly seen the delete).
//
// Returns a NEW array; inputs are never mutated.

// Timestamps ride the wire as JSON numbers, but legacy local payloads can
// carry string dates ("2024-01-01T12:00:00Z" or numeric strings). Comparing
// raw strings vs numbers silently wrong-orders merges (every string > every
// number in JS), so coerce before comparing.
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
      // Brand-new remote tombstone = "this was deleted on another device";
      // keep it (so the id can't be re-added by an even staler copy) unless
      // GC asks us to drop old ones. Live items always append.
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

  // Local-only tombstones get GC'd on merge too (they've done their job once
  // every synced device has pulled them; 30 days is the convention here).
  const pruned =
    typeof pruneTombstonesMs === "number"
      ? out.filter(
          (item) =>
            item?.deletedAt === undefined || Date.now() - item.deletedAt <= pruneTombstonesMs,
        )
      : out;

  // Tombstone-safe cap: a delete marker must never be evicted by the `limit`
  // (a sliced-away tombstone resurrects the title on the next merge). Split
  // the two groups, sort only the live items when a comparator is provided,
  // cap the live group, then re-append surviving tombstones.
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
