import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "../../relays/cloudflare/relay-worker.js";

const WORKER = "https://streamly-proxy.example.workers.dev";

function relayTarget(target, init = {}) {
  return new Request(`${WORKER}/?url=${encodeURIComponent(target)}`, init);
}

function stubUpstream(responseFactory) {
  const spy = vi.fn(responseFactory);
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("relay worker protocol", () => {
  it("answers CORS preflight with the methods and headers the client sends", async () => {
    const res = await worker.fetch(
      new Request(WORKER, { method: "OPTIONS" })
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
    expect(
      res.headers.get("access-control-allow-headers").toLowerCase()
    ).toContain("content-type");
  });

  it("serves a plain health probe", async () => {
    const res = await worker.fetch(new Request(`${WORKER}/health`));

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects a missing url with CORS intact", async () => {
    const res = await worker.fetch(new Request(WORKER));

    expect(res.status).toBe(400);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("rejects non-https targets", async () => {
    const res = await worker.fetch(
      relayTarget("http://cdn.example.com/fragment.ts")
    );

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("https only");
  });

  it("injects TemporaryUserAgent for OpenSubtitles downloads", async () => {
    const fetchSpy = stubUpstream(
      async () =>
        new Response("srt", {
          status: 200,
          headers: { "content-type": "application/gzip" },
        })
    );

    await worker.fetch(
      relayTarget(
        "https://dl.opensubtitles.org/en/download/src-api/vrf-x/1.gz"
      )
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][1].headers["User-Agent"]).toBe(
      "TemporaryUserAgent"
    );
  });

  it("uses a browser user agent for provider CDNs", async () => {
    const fetchSpy = stubUpstream(
      async () => new Response("seg", { status: 200 })
    );

    await worker.fetch(
      relayTarget("https://cdn.example.com/video/segment.ts")
    );

    expect(fetchSpy.mock.calls[0][1].headers["User-Agent"]).toContain(
      "Mozilla/5.0"
    );
  });

  it("forwards Range and exposes slice headers to the browser", async () => {
    const fetchSpy = stubUpstream(
      async () =>
        new Response("ab", {
          status: 206,
          headers: {
            "content-type": "video/mp2t",
            "content-range": "bytes 0-1/100",
            "accept-ranges": "bytes",
            "etag": '"abc"',
            "content-length": "100",
            "content-encoding": "gzip",
          },
        })
    );

    const res = await worker.fetch(
      relayTarget("https://cdn.example.com/video/segment.ts", {
        headers: { Range: "bytes=0-1" },
      })
    );

    const upstreamHeaders = fetchSpy.mock.calls[0][1].headers;
    expect(upstreamHeaders.Range).toBe("bytes=0-1");

    expect(res.status).toBe(206);
    expect(res.headers.get("access-control-expose-headers")).toBe("*");
    expect(res.headers.get("content-range")).toBe("bytes 0-1/100");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("etag")).toBe('"abc"');
    // The runtime may already have decompressed the payload.
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(res.headers.get("content-length")).toBeNull();
  });

  it("forwards POST bodies with an allowlisted content type", async () => {
    const fetchSpy = stubUpstream(
      async () => new Response("{}", { status: 200 })
    );

    await worker.fetch(
      relayTarget("https://vidcore.io/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Custom": "drop-me" },
        body: JSON.stringify({ id: 1 }),
      })
    );

    const [target, init] = fetchSpy.mock.calls[0];
    expect(target).toBe("https://vidcore.io/servers");
    expect(init.method).toBe("POST");
    expect(init.headers["content-type"]).toBe("application/json");
    expect(init.headers["X-Custom"]).toBeUndefined();
    expect(new TextDecoder().decode(init.body)).toBe('{"id":1}');
  });

  it("returns CORS headers when the upstream fetch throws", async () => {
    stubUpstream(async () => {
      throw new Error("dns down");
    });

    const res = await worker.fetch(
      relayTarget("https://cdn.example.com/video/segment.ts")
    );

    expect(res.status).toBe(502);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.text()).toContain("dns down");
  });
});
