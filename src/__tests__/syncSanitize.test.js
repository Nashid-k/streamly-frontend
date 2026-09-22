import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import handler from "../../api/sync.js";

// Mock MongoDB — capture the update payload for sanitization assertions.
const state = { updateDoc: null, deleted: null };
const userDataCol = {
  updateOne: (filter, updateDoc) => {
    state.updateDoc = updateDoc;
    return Promise.resolve({ matchedCount: 1, upsertedId: null });
  },
  findOne: () => Promise.resolve(null),
  deleteOne: (filter) => {
    state.deleted = filter;
    return Promise.resolve({ deletedCount: 1 });
  },
};
const usersCol = {
  deleteOne: () => Promise.resolve({ deletedCount: 1 }),
};

vi.mock("../../api/lib/db.js", () => ({
  connectToDatabase: () =>
    Promise.resolve({
      db: {
        collection: (name) => (name === "userData" ? userDataCol : usersCol),
      },
    }),
}));

const SECRET = process.env.SYNC_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";

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
    res.body = obj;
    return res;
  };
  res.end = () => res;
  return res;
}

function makeToken(googleId) {
  // Reimplement the signature so tests don't depend on module import order.
  const expiryMs = Date.now() + 60_000;
  const digest = createHmac("sha256", "test-secret").update(`${googleId}.${expiryMs}`).digest("base64url");
  return `${googleId}.${expiryMs}.${digest}`;
}

beforeEach(() => {
  state.updateDoc = null;
  state.deleted = null;
  process.env.SYNC_SECRET = "test-secret";
  // Fresh rate-limit buckets per test (module-level Map can't be reset via
  // the public API; distinct IPs per test keep windows isolated).
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (SECRET) {
    process.env.SYNC_SECRET = SECRET;
  } else {
    delete process.env.SYNC_SECRET;
    delete process.env.GOOGLE_CLIENT_SECRET;
  }
});

describe("api/sync sanitization", () => {
  it("sanitizes a hostile collections payload (objects in name, huge arrays, unknown fields)", async () => {
    const res = mockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: `Bearer ${makeToken("user-1")}` },
        body: {
          googleId: "user-1",
          collections: [
            {
              id: "col-1",
              name: { malicious: true },
              visibility: "public",
              publicId: "pub-abc",
              itemIds: Array.from({ length: 5000 }, (_, i) => `movie-${i}`),
              injectedGoogleId: "victim-id",
              nested: { deep: true },
              updatedAt: 123,
            },
          ],
        },
        query: {},
      },
      res,
    );

    expect(res.statusCode).toBe(200);
    const saved = state.updateDoc.$set.collections;
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("Untitled collection");
    expect(saved[0].itemIds.length).toBeLessThanOrEqual(300);
    expect(saved[0].injectedGoogleId).toBeUndefined();
    expect(saved[0].nested).toBeUndefined();
    expect(saved[0].visibility).toBe("public");
    expect(saved[0].publicId).toBe("pub-abc");
  });

  it("drops publicId when visibility is not public", async () => {
    const res = mockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: `Bearer ${makeToken("user-2")}` },
        body: {
          googleId: "user-2",
          collections: [{ id: "c", name: "X", visibility: "private", publicId: "pub-leak", itemIds: [] }],
        },
        query: {},
      },
      res,
    );
    const saved = state.updateDoc.$set.collections;
    expect(saved[0].publicId).toBeUndefined();
  });

  it("sanitizes preferences to JSON-safe primitives only", async () => {
    const res = mockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: `Bearer ${makeToken("user-3")}` },
        body: {
          googleId: "user-3",
          preferences: {
            theme: "emerald",
            nested: { nope: true },
            oversized: "x".repeat(999),
          },
        },
        query: {},
      },
      res,
    );
    const saved = state.updateDoc.$set.preferences;
    expect(saved.theme).toBe("emerald");
    expect(saved.nested).toBeUndefined();
    expect(saved.oversized).toBe("x".repeat(300));
  });

  it("rejects invalid list shapes with 400", async () => {
    const res = mockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: `Bearer ${makeToken("user-4")}` },
        body: { googleId: "user-4", watchlist: "not-an-array" },
        query: {},
      },
      res,
    );
    expect(res.statusCode).toBe(400);
  });

  it("DELETE wipes the caller's cloud documents", async () => {
    const res = mockRes();
    await handler(
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${makeToken("user-5")}` },
        query: { googleId: "user-5" },
      },
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(state.deleted).toEqual({ googleId: "user-5" });
  });

  it("rejects a request without a valid token (401)", async () => {
    const res = mockRes();
    await handler(
      {
        method: "POST",
        headers: { authorization: "Bearer garbage" },
        body: { googleId: "user-6", collections: [] },
        query: {},
      },
      res,
    );
    expect(res.statusCode).toBe(401);
  });
});
