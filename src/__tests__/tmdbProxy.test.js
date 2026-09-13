import { afterEach, describe, expect, it, vi } from "vitest";
import handler from "../../api/tmdb/[...path].js";

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
    res.headers[k] = v;
  };
  res.send = (body) => {
    res.body = body;
    return res;
  };
  res.json = (obj) => {
    res.body = JSON.stringify(obj);
    return res;
  };
  return res;
}

afterEach(() => vi.unstubAllGlobals());

describe("api/tmdb proxy", () => {
  it("forwards path + query to TMDB and passes status/body through", async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => '{"results":[]}',
    });
    vi.stubGlobal("fetch", fetch);

    const res = mockRes();
    await handler(
      { method: "GET", query: { path: ["trending", "all", "week"], api_key: "K" } },
      res,
    );

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.themoviedb.org/3/trending/all/week?api_key=K",
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"results":[]}');
  });

  it("rejects non-GET and path traversal", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    const post = mockRes();
    await handler({ method: "POST", query: { path: ["movie", "1"] } }, post);
    expect(post.statusCode).toBe(405);

    const traversal = mockRes();
    await handler({ method: "GET", query: { path: ["..", "secret"] } }, traversal);
    expect(traversal.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});
