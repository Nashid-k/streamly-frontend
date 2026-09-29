import { afterEach, describe, expect, it, vi } from "vitest";

const { countUsage, flushUsage, todayCounts, _resetUsageForTests } = await import(
  "../../server/usage.js"
);
const handler = (await import("../../api/usage.js")).default;

function mockRes() {
  const headers = new Map();
  return {
    statusCode: null,
    body: null,
    headers,
    setHeader: (k, v) => headers.set(k, v),
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {},
  };
}

afterEach(() => {
  _resetUsageForTests();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("server/usage ledger", () => {
  it("counts per scope and exposes today's local counts", () => {
    countUsage("dl");
    countUsage("dl");
    countUsage("party");
    const { day, local } = todayCounts();
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(local.dl).toBe(2);
    expect(local.party).toBe(1);
  });

  it("ignores invalid scopes (never trusts request-shaped data)", () => {
    countUsage("");
    countUsage("x".repeat(30));
    countUsage(null);
    expect(Object.keys(todayCounts().local)).toEqual([]);
  });

  it("flushes an $inc upsert per UTC day and clears the window", async () => {
    countUsage("dl");
    countUsage("dl");
    const updateOne = vi.fn().mockResolvedValue();
    const listCollections = vi.fn();
    vi.doMock("../../server/db.js", () => ({
      connectToDatabase: async () => ({
        db: { collection: () => ({ updateOne, listCollections }) },
      }),
    }));
    await flushUsage(true);
    expect(updateOne).toHaveBeenCalledTimes(1);
    const [filter, updateDoc, opts] = updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: "daily" });
    expect(opts.upsert).toBe(true);
    const day = todayCounts().day;
    expect(updateDoc.$inc[`days.${day}.dl`]).toBe(2);
    expect(todayCounts().local.dl).toBeUndefined();
  });

  it("retains counts when the flush fails and retries them next time", async () => {
    countUsage("party");
    const updateOne = vi.fn().mockRejectedValueOnce(new Error("mongo down"));
    vi.doMock("../../server/db.js", () => ({
      connectToDatabase: async () => ({ db: { collection: () => ({ updateOne }) } }),
    }));
    await flushUsage(true);
    expect(todayCounts().local.party).toBe(1); // given back, not lost
    await flushUsage(true);
    expect(updateOne).toHaveBeenCalledTimes(2);
    expect(todayCounts().local.party).toBeUndefined();
  });
});

describe("GET /api/usage", () => {
  it("answers scopes with counts, budgets and percentages", async () => {
    vi.doMock("../../server/db.js", () => ({
      connectToDatabase: async () => ({
        db: {
          collection: () => ({
            findOne: async () => {
              const day = new Date().toISOString().slice(0, 10);
              return { _id: "daily", days: { [day]: { dl: 34000, party: 5000 } } };
            },
          }),
        },
      }),
    }));
    vi.resetModules();
    const usageHandler = (await import("../../api/usage.js")).default;
    const res = mockRes();
    await usageHandler({ method: "GET" }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.scopes.dl.count).toBe(34000);
    expect(res.body.scopes.dl.pct).toBe(34);
    expect(res.body.scopes.party.pct).toBe(25);
    expect(res.body.scopes.tmdb.count).toBe(0);
  });

  it("degrades to an honest empty answer when Mongo is unreachable", async () => {
    vi.doMock("../../server/db.js", () => ({
      connectToDatabase: async () => {
        throw new Error("connection refused");
      },
    }));
    vi.resetModules();
    const usageHandler = (await import("../../api/usage.js")).default;
    const res = mockRes();
    await usageHandler({ method: "GET" }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.degraded).toBe(true);
    expect(res.body.scopes).toEqual({});
  });

  it("rejects non-GET methods", async () => {
    const res = mockRes();
    await handler({ method: "POST" }, res);
    expect(res.statusCode).toBe(405);
  });
});
