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
