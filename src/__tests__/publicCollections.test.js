import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/publicCollections.js";
import { extractPublicCollections, findPublicCollection } from "../../api/lib/publicCollections.js";
import { fetchPublicCollections, fetchPublicCollection, ExploreError } from "../api/publicCollections";

const db = { instance: null };
const createdIndexes = [];
const lastQuery = { current: null };
const userDataCol = {
  find: (query) => {
    lastQuery.current = query;
    return userDataCol;
  },
  limit: () => userDataCol,
  toArray: () => {
    const docs = db.instance || [];
    const projected = [];
    for (const doc of docs) {
      const out = { collections: doc.collections || [] };
      if (doc._id !== undefined) out._id = doc._id;
      projected.push(out);
    }
    return Promise.resolve(projected);
  },
  createIndex: (spec) => {
    createdIndexes.push(spec);
    return Promise.resolve("idx");
  },
};

vi.mock("../../api/lib/db.js", () => ({
  connectToDatabase: () =>
    Promise.resolve({
      db: {
        collection: (name) => {
          if (name !== "userData") throw new Error(`Unexpected collection ${name}`);
          return userDataCol;
        },
      },
    }),
}));

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.headers = {};
  res.body = undefined;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.setHeader = (k, v) => {
    res.headers[k.toLowerCase()] = v;
  };
  res.send = (body) => {
    res.body = body;
    return res;
  };
  res.json = (obj) => {
    res.body = JSON.stringify(obj);
    return res;
  };
  res.end = () => res;
  return res;
}

const OTHER = {
  googleId: "g-other",
  collections: [
    { id: "col-1", name: "My Watchlist", visibility: "public", publicId: "pub-aaa", itemIds: ["movie-1", "movie-2", "tv-3"], updatedAt: 1000 },
    { id: "col-2", name: "Private Stash", visibility: "private", itemIds: ["movie-9"], updatedAt: 2000 },
  ],
};

const SECOND = {
  googleId: "g-second",
  collections: [
    { id: "col-3", name: "Tamil Gems", visibility: "public", publicId: "pub-bbb", itemIds: ["movie-7"], updatedAt: 1500 },
  ],
};

describe("api/lib/publicCollections helpers", () => {
  it("flattens only PUBLIC, deduped, newest-first, anonymous fields", () => {
    const result = extractPublicCollections([
      OTHER,
      SECOND,
      {
        googleId: "g-dup",
        collections: [
          { id: "x", name: "My Watchlist", visibility: "public", publicId: "pub-aaa", itemIds: [], updatedAt: 999 },
        ],
      },
    ]);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "Tamil Gems",
      publicId: "pub-bbb",
      itemCount: 1,
      updatedAt: 1500,
    });
    expect(result[1]).toEqual({
      name: "My Watchlist",
      publicId: "pub-aaa",
      itemCount: 3,
      updatedAt: 1000,
    });
    // No owner identity ever leaks.
    for (const c of result) {
      expect(c.googleId).toBeUndefined();
      expect(c.itemIds).toBeUndefined();
    }
  });

  it("skips public collections without a stable publicId and private ones", () => {
    const result = extractPublicCollections([
      { googleId: "g", collections: [
        { id: "a", name: "No PublicId", visibility: "public", itemIds: ["movie-1"], updatedAt: 5 },
        { id: "b", name: "Locked", visibility: "private", publicId: "pub-x", itemIds: ["movie-2"], updatedAt: 1 },
      ]},
    ]);
    expect(result).toHaveLength(0);
  });

  it("skips tombstoned (deleted) collections so un-publishing propagates", () => {
    const result = extractPublicCollections([
      { googleId: "g", collections: [
        { id: "a", name: "Gone", visibility: "public", publicId: "pub-gone", itemIds: ["movie-1"], updatedAt: 10, deletedAt: 20 },
        { id: "b", name: "Alive", visibility: "public", publicId: "pub-alive", itemIds: ["movie-2"], updatedAt: 5 },
      ]},
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].publicId).toBe("pub-alive");
  });

  it("looks up a public collection by publicId with itemIds", () => {
    const result = findPublicCollection([OTHER, SECOND], "pub-aaa");
    expect(result).toEqual({
      name: "My Watchlist",
      publicId: "pub-aaa",
      itemIds: ["movie-1", "movie-2", "tv-3"],
      updatedAt: 1000,
    });
  });

  it("returns null for missing / private / invalid / tombstoned publicId", () => {
    expect(findPublicCollection([OTHER, SECOND], "nope")).toBeNull();
    // col-2 is private; its publicId field is absent but try the private id anyway.
    expect(findPublicCollection([OTHER, SECOND], "col-2")).toBeNull();
    expect(findPublicCollection([OTHER, SECOND], "")).toBeNull();
    expect(
      findPublicCollection(
        [{ googleId: "g", collections: [{ id: "a", name: "Gone", visibility: "public", publicId: "pub-g", itemIds: [], updatedAt: 1, deletedAt: 2 }] }],
        "pub-g",
      ),
    ).toBeNull();
  });
});

describe("api/publicCollections endpoint", () => {
  beforeEach(() => {
    db.instance = [OTHER, SECOND];
  });
  afterEach(() => {
    db.instance = null;
  });

  it("lists every public collection anonymously", async () => {
    const res = mockRes();
    await handler(
      { method: "GET", query: {} },
      res,
    );
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.collections).toHaveLength(2);
    expect(body.collections[0].name).toBe("Tamil Gems");
    expect(body.collections[0].publicId).toBe("pub-bbb");
    expect(body.collections[0].googleId).toBeUndefined();
    expect(body.collections[0].itemIds).toBeUndefined();
  });

  it("resolves a single collection by publicId", async () => {
    const res = mockRes();
    await handler(
      { method: "GET", query: { publicId: "pub-bbb" } },
      res,
    );
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.success).toBe(true);
    expect(body.collection).toEqual({
      name: "Tamil Gems",
      publicId: "pub-bbb",
      itemIds: ["movie-7"],
      updatedAt: 1500,
    });
    expect(body.collection.googleId).toBeUndefined();
  });

  it("returns collection:null for an unknown publicId", async () => {
    const res = mockRes();
    await handler(
      { method: "GET", query: { publicId: "does-not-exist" } },
      res,
    );
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.collection).toBeNull();
  });

  it("rejects non-GET with 405", async () => {
    const res = mockRes();
    await handler({ method: "POST" }, res);
    expect(res.statusCode).toBe(405);
  });

  it("answers OPTIONS with 204", async () => {
    const res = mockRes();
    await handler({ method: "OPTIONS" }, res);
    expect(res.statusCode).toBe(204);
  });

  it("queries only docs containing a public collection (elemMatch filter)", async () => {
    const res = mockRes();
    await handler({ method: "GET", query: {} }, res);
    expect(lastQuery.current).toEqual({ collections: { $elemMatch: { visibility: "public" } } });
    expect(createdIndexes.length).toBeGreaterThan(0);
  });

  it("rejects malformed publicId query values", async () => {
    const res = mockRes();
    await handler({ method: "GET", query: { publicId: "../evil" } }, res);
    const body = JSON.parse(res.body);
    expect(res.statusCode).toBe(200);
    expect(body.collection).toBeNull();
  });
});

describe("client api/publicCollections fetch helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  function jsonResponse(body, { status = 200 } = {}) {
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  }

  it("returns the public collection list", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, collections: [{ name: "Tamil Gems", publicId: "pub-bbb", itemCount: 1 }] }),
    );
    vi.stubGlobal("fetch", fetch);

    const list = await fetchPublicCollections();
    expect(list).toHaveLength(1);
    expect(list[0].publicId).toBe("pub-bbb");
    expect(fetch.mock.calls[0][0]).toContain("/api/publicCollections");
    expect(fetch.mock.calls[0][1]).toEqual({});
  });

  it("throws ExploreError (not silent empty) on a non-200 endpoint", async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ success: false }, { status: 503 }));
    vi.stubGlobal("fetch", fetch);

    await expect(fetchPublicCollections()).rejects.toBeInstanceOf(ExploreError);
  });

  it("throws ExploreError on network failure", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetch);

    await expect(fetchPublicCollections()).rejects.toBeInstanceOf(ExploreError);
  });

  it("returns null for a missing public collection", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ success: true, collection: null }),
    );
    vi.stubGlobal("fetch", fetch);

    const collection = await fetchPublicCollection("does-not-exist");
    expect(collection).toBeNull();
    expect(fetch.mock.calls[0][0]).toContain("/api/publicCollections?publicId=does-not-exist");
  });

  it("returns null without fetching when publicId is empty", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    expect(await fetchPublicCollection("")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});