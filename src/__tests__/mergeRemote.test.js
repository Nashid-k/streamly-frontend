import { describe, it, expect } from "vitest";
import { mergeListsById } from "../utils/mergeRemote";

describe("mergeListsById (timestamp-aware union)", () => {
  const local = [
    { id: "movie-1", title: "Local Title", updatedAt: 100 },
    { id: "movie-2", title: "Local Only", updatedAt: 300 },
  ];

  it("appends remote-only items", () => {
    const merged = mergeListsById(local, [{ id: "movie-3", title: "Remote Only", updatedAt: 500 }]);
    expect(merged.map((m) => m.id)).toEqual(["movie-1", "movie-2", "movie-3"]);
  });

  it("replaces a local item when the remote copy is newer", () => {
    const merged = mergeListsById(local, [
      { id: "movie-1", title: "Remote Newer", updatedAt: 200 },
    ]);
    expect(merged.find((m) => m.id === "movie-1").title).toBe("Remote Newer");
  });

  it("keeps the local copy when it is newer than remote", () => {
    const merged = mergeListsById(local, [
      { id: "movie-1", title: "Remote Stale", updatedAt: 50 },
    ]);
    expect(merged.find((m) => m.id === "movie-1").title).toBe("Local Title");
  });

  it("prefers remote when local item has no updatedAt (legacy data)", () => {
    const legacyLocal = [{ id: "movie-9", title: "Legacy", lastWatched: 999 }];
    const merged = mergeListsById(legacyLocal, [
      { id: "movie-9", title: "Fresh Remote", updatedAt: 123 },
    ]);
    expect(merged.find((m) => m.id === "movie-9").title).toBe("Fresh Remote");
  });

  it("does not mutate the input arrays", () => {
    const before = JSON.stringify(local);
    mergeListsById(local, [{ id: "movie-3", title: "X", updatedAt: 1 }]);
    expect(JSON.stringify(local)).toBe(before);
  });

  it("applies the optional limit cap after merging", () => {
    const merged = mergeListsById(local, [
      { id: "movie-3", updatedAt: 1 },
      { id: "movie-4", updatedAt: 1 },
    ], { limit: 2 });
    expect(merged).toHaveLength(2);
  });

  it("sorts live entries with sortBy but never lets the cap slice a tombstone", () => {
    const merged = mergeListsById(
      [
        { id: "gone", name: "Removed", deletedAt: 200, updatedAt: 200 },
        { id: "old", name: "Oldest", updatedAt: 100 },
        { id: "mid", name: "Middle", updatedAt: 300 },
        { id: "top", name: "Newest", updatedAt: 500 },
      ],
      [],
      { limit: 2, sortBy: (a, b) => b.updatedAt - a.updatedAt },
    );
    // Live entries sort newest-first and cap at 2; the tombstone rides along
    // so a later merge can't resurrect the removed id from a stale copy.
    expect(merged.map((m) => m.id)).toEqual(["top", "mid", "gone"]);
  });

  it("keeps a tombstone even when the live cap fills first", () => {
    const merged = mergeListsById([], [
      { id: "c1", name: "Newest", updatedAt: 500 },
      { id: "c2", name: "Old", updatedAt: 100 },
      { id: "gone", name: "Removed", deletedAt: 300, updatedAt: 300 },
    ], { limit: 1 });
    expect(merged.map((m) => m.id)).toEqual(["c1", "gone"]);
  });

  it("does not sort when sortBy is omitted (insertion order preserved)", () => {
    const merged = mergeListsById(local, [
      { id: "movie-3", title: "Remote Only", updatedAt: 100 },
      { id: "movie-4", title: "Remote Two", updatedAt: 200 },
    ]);
    expect(merged.map((m) => m.id)).toEqual(["movie-1", "movie-2", "movie-3", "movie-4"]);
  });

  it("ignores null/missing ids", () => {
    const merged = mergeListsById(local, [null, {}, { id: "movie-3", title: "OK", updatedAt: 1 }]);
    expect(merged).toHaveLength(3);
  });
});

describe("mergeListsById (deletion tombstones)", () => {
  it("lets a remote tombstone beat an older live local copy", () => {
    const localList = [{ id: "col-1", name: "Old", updatedAt: 100 }];
    const merged = mergeListsById(localList, [
      { id: "col-1", name: "Old", deletedAt: 200, updatedAt: 200 },
    ]);
    expect(merged.find((c) => c.id === "col-1").deletedAt).toBe(200);
  });

  it("keeps a newer local live copy over a stale remote tombstone (un-delete case)", () => {
    const localList = [{ id: "col-1", name: "Revived", updatedAt: 500 }];
    const merged = mergeListsById(localList, [
      { id: "col-1", name: "Old", deletedAt: 200, updatedAt: 200 },
    ]);
    expect(merged.find((c) => c.id === "col-1").deletedAt).toBeUndefined();
  });

  it("appends a remote-only tombstone so the id can't be resurrected by staler copies", () => {
    const merged = mergeListsById([], [
      { id: "col-2", name: "Gone", deletedAt: 100, updatedAt: 100 },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].deletedAt).toBe(100);
  });

  // The tie case: a delete and a concurrent edit can land on the SAME
  // millisecond (or both sides can carry no timestamp at all, both → 0). A
  // plain `>` on one scalar had no tie-break, so the tombstone lost and the
  // item came back on the next sync.
  it("lets a remote tombstone win when its deletedAt ties the local updatedAt", () => {
    const merged = mergeListsById(
      [{ id: "col-5", name: "Local", updatedAt: 1000 }],
      [{ id: "col-5", name: "Local", deletedAt: 1000, updatedAt: 1000 }],
    );
    expect(merged.find((c) => c.id === "col-5").deletedAt).toBe(1000);
  });

  it("lets a remote tombstone win when neither side carries a timestamp", () => {
    const merged = mergeListsById(
      [{ id: "col-6", name: "Local" }],
      [{ id: "col-6", name: "Local", deletedAt: 0 }],
    );
    expect(merged.find((c) => c.id === "col-6").deletedAt).toBe(0);
  });

  it("does not let a stale remote tombstone beat a newer local live copy on a tie", () => {
    // The reverse precedence must still hold: an un-deleted item with a real
    // newer timestamp is not overwritten by an equally-or-older tombstone.
    const merged = mergeListsById(
      [{ id: "col-7", name: "Revived", updatedAt: 2000 }],
      [{ id: "col-7", name: "Old", deletedAt: 1500, updatedAt: 1500 }],
    );
    expect(merged.find((c) => c.id === "col-7").deletedAt).toBeUndefined();
  });

  it("GCs a tombstone whose deletedAt rides the wire as a string", () => {
    // Legacy payloads carry string dates; the GC compared the raw field, so
    // `Date.now() - "2020-01-01"` was NaN and the comparison was false — the
    // tombstone never aged out.
    const oldIso = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const merged = mergeListsById(
      [{ id: "col-8", name: "Ancient", deletedAt: oldIso, updatedAt: oldIso }],
      [],
      { pruneTombstonesMs: 30 * 24 * 60 * 60 * 1000 },
    );
    expect(merged).toHaveLength(0);
  });

  it("GCs tombstones older than pruneTombstonesMs", () => {
    const old = Date.now() - 40 * 24 * 60 * 60 * 1000; // 40 days ago
    const merged = mergeListsById(
      [{ id: "col-3", name: "Ancient", deletedAt: old, updatedAt: old }],
      [],
      { pruneTombstonesMs: 30 * 24 * 60 * 60 * 1000 },
    );
    expect(merged).toHaveLength(0);
  });

  it("keeps tombstones inside the prune window", () => {
    const recent = Date.now() - 5 * 24 * 60 * 60 * 1000; // 5 days ago
    const merged = mergeListsById(
      [{ id: "col-4", name: "Recent", deletedAt: recent, updatedAt: recent }],
      [],
      { pruneTombstonesMs: 30 * 24 * 60 * 60 * 1000 },
    );
    expect(merged).toHaveLength(1);
  });
});
