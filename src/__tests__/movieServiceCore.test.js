import { describe, expect, it } from "vitest";
import { settledWithConcurrency } from "../api/movieService/core";

describe("settledWithConcurrency", () => {
  it("keeps Promise.allSettled ordering while capping in-flight tasks", async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 8 }, (_, index) => async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return index;
    });

    const results = await settledWithConcurrency(tasks, 3);

    expect(peak).toBe(3);
    expect(results).toEqual(
      Array.from({ length: 8 }, (_, index) => ({ status: "fulfilled", value: index })),
    );
  });

  it("preserves rejected tasks as settled results", async () => {
    const error = new Error("TMDB failed");
    const results = await settledWithConcurrency(
      [() => Promise.resolve("ok"), () => Promise.reject(error)],
      2,
    );

    expect(results[0]).toEqual({ status: "fulfilled", value: "ok" });
    expect(results[1]).toEqual({ status: "rejected", reason: error });
  });
});
