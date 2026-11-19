import { describe, it, expect } from "vitest";
import handler from "../../api/health.js";

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

describe("GET /api/health", () => {
  it("answers ok with a no-store response", async () => {
    const res = mockRes();

    await handler({ method: "GET", url: "/api/health", headers: {} }, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ ok: true, service: "streamly" });
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["access-control-allow-methods"]).toContain("GET");
  });

  it("answers CORS preflight without a body", async () => {
    const res = mockRes();

    await handler({ method: "OPTIONS", url: "/api/health", headers: {} }, res);

    expect(res.statusCode).toBe(204);
    expect(res.body).toBeNull();
  });

  it("rejects write methods", async () => {
    const res = mockRes();

    await handler({ method: "POST", url: "/api/health", headers: {} }, res);

    expect(res.statusCode).toBe(405);
    expect(res.body).toMatchObject({ ok: false, code: "method" });
  });
});
