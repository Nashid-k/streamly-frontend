import { describe, it, expect, beforeEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { useState, useEffect } from "react";
import { useMyCollections } from "../hooks/useUserData";

// Minimal harness that re-renders with every state change so the hook's
// local state can be asserted (mirrors the useUserData storage pattern).
function Harness({ push }) {
  const api = useMyCollections();
  const [renderTick, setRenderTick] = useState(0);
  useEffect(() => {
    const bump = () => setRenderTick((t) => t + 1);
    window.addEventListener("aios_sync_collections", bump);
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener("aios_sync_collections", bump);
      window.removeEventListener("storage", bump);
    };
  }, []);
  push(api);
  return <div>{renderTick ? "tick" : "tick"}</div>;
}

function setup() {
  let latest;
  const push = (api) => {
    latest = api;
  };
  render(<Harness push={push} />);
  const read = () => latest;
  return read;
}

describe("useMyCollections", () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it("creates a collection and persists it to aios_my_collections", async () => {
    const read = setup();
    let id;
    await act(async () => {
      id = read().createCollection("Sci-Fi Picks");
    });
    expect(id).toBeTruthy();
    const stored = JSON.parse(localStorage.getItem("aios_my_collections"));
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("Sci-Fi Picks");
    expect(stored[0].itemIds).toEqual([]);
    expect(stored[0].updatedAt).toBeGreaterThan(0);
  });

  it("adds and removes titles by watchlist id", async () => {
    const read = setup();
    let id;
    await act(async () => {
      id = read().createCollection("Classics");
    });
    await act(async () => {
      read().addToCollection(id, ["movie-1", "movie-2"]);
    });
    expect(read().collections[0].itemIds.sort()).toEqual(["movie-1", "movie-2"]);

    await act(async () => {
      read().removeFromCollection(id, "movie-1");
    });
    expect(read().collections[0].itemIds).toEqual(["movie-2"]);
  });

  it("dedupes on add and trims whitespace in names", async () => {
    const read = setup();
    let id;
    await act(async () => {
      id = read().createCollection("  Trimmed  ");
    });
    expect(read().collections[0].name).toBe("Trimmed");

    await act(async () => {
      read().addToCollection(id, ["movie-1", "movie-1", "movie-2"]);
    });
    expect(read().collections[0].itemIds.sort()).toEqual(["movie-1", "movie-2"]);
  });

  it("renames and deletes a collection", async () => {
    const read = setup();
    let id;
    await act(async () => {
      id = read().createCollection("Old Name");
    });
    await act(async () => {
      read().renameCollection(id, "New Name");
    });
    expect(read().collections[0].name).toBe("New Name");

    await act(async () => {
      read().deleteCollection(id);
    });
    expect(read().collections).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem("aios_my_collections"))).toHaveLength(0);
  });

  it("toggles membership and ignores empty ids", async () => {
    const read = setup();
    let id;
    await act(async () => {
      id = read().createCollection("Pick");
    });
    await act(async () => {
      read().toggleInCollection(id, "movie-9");
    });
    expect(read().collections[0].itemIds).toEqual(["movie-9"]);
    await act(async () => {
      read().toggleInCollection(id, "movie-9");
    });
    expect(read().collections[0].itemIds).toEqual([]);

    await act(async () => {
      read().addToCollection(id, []);
    });
    expect(read().collections[0].itemIds).toEqual([]);
  });
});