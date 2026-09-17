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