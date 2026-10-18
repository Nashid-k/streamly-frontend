import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RELAY_URL, deriveSliceMore, relayProxyConfig } from "../api/relayProxy";

afterEach(() => {
  vi.unstubAllEnvs();
});

/* The zero-env contract: a deploy that sets NO VITE_STREAMLY_RELAY_URL must
   still get the fast whole-fragment worker leg — the unset state used to mean
   "Vercel /api/stream only", which made every relayed seek fragment and every
   manifest reload a ~2s (or cold-start) serverless round trip. The loader and
   subtitle fetcher both build their relay candidate lists from this. */
describe("relayProxyConfig resolution order", () => {
  it("defaults to the bundled worker when the env var is never set", () => {
    vi.unstubAllEnvs();
    const cfg = relayProxyConfig();
    expect(cfg?.base).toBe(DEFAULT_RELAY_URL);
    // Above the Vercel 4.5MB body cap on purpose: one request, whole fragment.
    expect(cfg?.slice).toBeGreaterThan(4.5 * 1024 * 1024);
  });

  it("honours an explicitly set custom worker URL (trailing slash trimmed)", () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "https://custom.example.workers.dev/");
    expect(relayProxyConfig()).toMatchObject({ base: "https://custom.example.workers.dev" });
  });

  it("treats an explicitly empty string as opt-out — Vercel /api/stream only", () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "   ");
    expect(relayProxyConfig()).toBeNull();
  });
});

describe("deriveSliceMore", () => {
  const resp = (headers) => ({ headers: { get: (k) => (k in headers ? headers[k] : null) } });

  it("trusts the x-streamly-more header when the Vercel leg sends it", () => {
    expect(deriveSliceMore(resp({ "x-streamly-more": "1" }), 10, 100)).toBe(true);
    expect(deriveSliceMore(resp({ "x-streamly-more": "0" }), 10, 100)).toBe(false);
  });

  it("derives continuation from content-range when the proxy adds no header", () => {
    expect(deriveSliceMore(resp({ "content-range": "bytes 0-99/250" }), 100, 100)).toBe(true);
    expect(deriveSliceMore(resp({ "content-range": "bytes 0-249/250" }), 250, 100)).toBe(false);
  });

  it("falls back to the slice ceiling when no header says otherwise", () => {
    expect(deriveSliceMore(resp({}), 100, 100)).toBe(true);
    expect(deriveSliceMore(resp({}), 99, 100)).toBe(false);
  });
});
