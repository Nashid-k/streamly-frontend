import { afterEach, describe, expect, it, vi } from "vitest";
import tmdb from "../api/tmdbClient";

function jsonResponse(body, { status = 200, contentType = "application/json" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": contentType }),
    json: async () => body,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("tmdbClient transport", () => {
  it("falls back to direct TMDB when the same-origin proxy answers plain-text 404 (no function deployed)", async () => {
    const calls = [];
    const fetch = vi.fn().mockImplementation(async (url) => {
      calls.push(url);
      if (String(url).includes("/api/tmdb")) {
        return jsonResponse("404: NOT_FOUND", { status: 404, contentType: "text/plain" });
      }
      return jsonResponse({ results: [{ id: 1, media_type: "movie", title: "Direct" }] });
    });
    vi.stubGlobal("fetch", fetch);

    const data = await tmdb("/trending/all/week");

    expect(data.results).toHaveLength(1);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("/api/tmdb/trending/all/week");
    expect(calls[1]).toContain("api.themoviedb.org/3/trending/all/week");
  });

  it("falls back to direct TMDB when the proxy serves the SPA fallback HTML", async () => {
    const calls = [];
    const fetch = vi.fn().mockImplementation(async (url) => {
      calls.push(url);
      if (String(url).includes("/api/tmdb")) {
        return jsonResponse("<!doctype html><html></html>", { status: 200, contentType: "text/html" });
      }
      return jsonResponse({ results: [] });
    });
    vi.stubGlobal("fetch", fetch);

    const data = await tmdb("/trending/all/week");

    expect(data.results).toHaveLength(0);
    expect(calls).toHaveLength(2);
  });

  it("uses the proxy response when it is TMDB-shaped JSON, even on error statuses", async () => {
    const fetch = vi.fn().mockResolvedValue(
      jsonResponse({ status_message: "Invalid API key", status_code: 7 }, { status: 401 }),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(tmdb("/trending/all/week")).rejects.toMatchObject({ status: 401 });
    // No direct retry: the proxy works, the key is bad — direct would 401 too.
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
