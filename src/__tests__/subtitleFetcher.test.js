import { describe, it, expect, vi, afterEach } from "vitest";
import { SubtitleFetcher } from "../api/subtitleFetcher";

const RELAY = "https://streamly-proxy.nashidk1999.workers.dev";
const SEARCH = "https://rest.opensubtitles.org/search/imdbid-35538033";
const DOWNLOAD = "https://dl.opensubtitles.org/en/download/src-api/vrf-abc/filead/1.gz";

/* OpenSubtitles is the one upstream a browser cannot serve alone: the search
   API intermittently answers without CORS headers, and the .gz download 401s
   unless the legacy TemporaryUserAgent rides along (JS cannot set User-Agent).
   Both calls are relay-first with a direct fallback. */

function srtBody() {
  return "1\n00:00:01,000 --> 00:00:04,000\nHello\n";
}

function stubFetch(handler) {
  const spy = vi.fn(handler);
  vi.stubGlobal("fetch", spy);
  return spy;
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => payload,
    body: { cancel: async () => {} },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("SubtitleFetcher.searchAvailableSubtitles", () => {
  it("asks the Cloudflare relay first so CORS can never block the search", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    const calls = [];
    stubFetch(async (url) => {
      calls.push(String(url));
      return jsonResponse([
        { SubFormat: "srt", LanguageName: "English", SubLanguageID: "en", SubDownloadLink: DOWNLOAD },
        { SubFormat: "srt", LanguageName: "Arabic", SubLanguageID: "ar", SubDownloadLink: "https://x/ar.gz" },
        { SubFormat: "sub", LanguageName: "Ignored", SubLanguageID: "x", SubDownloadLink: "https://x/i.sub" },
      ]);
    });

    const langs = await SubtitleFetcher.searchAvailableSubtitles("tt35538033", "Oppenheimer");

    expect(calls).toHaveLength(1);
    expect(calls[0]).toBe(`${RELAY}?url=${encodeURIComponent(SEARCH)}`);
    // srt only, sorted by language name
    expect(langs.map((l) => l.language)).toEqual(["Arabic", "English"]);
  });

  it("falls back to a direct fetch when the relay refuses", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    const calls = [];
    stubFetch(async (url) => {
      const to = String(url);
      calls.push(to);
      if (to.includes("workers.dev")) {
        return { ok: false, status: 500, headers: { get: () => null }, body: { cancel: async () => {} } };
      }
      return jsonResponse([
        { SubFormat: "srt", LanguageName: "English", SubLanguageID: "en", SubDownloadLink: DOWNLOAD },
      ]);
    });

    const langs = await SubtitleFetcher.searchAvailableSubtitles("tt35538033", "Oppenheimer");

    expect(calls).toEqual([`${RELAY}?url=${encodeURIComponent(SEARCH)}`, SEARCH]);
    expect(langs).toHaveLength(1);
    expect(langs[0].language).toBe("English");
  });

  it("goes direct when no relay is configured", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", "");
    const calls = [];
    stubFetch(async (url) => {
      calls.push(String(url));
      return jsonResponse([]);
    });

    const langs = await SubtitleFetcher.searchAvailableSubtitles("tt35538033", "Oppenheimer");

    expect(calls).toEqual([SEARCH]);
    expect(langs).toEqual([]);
  });

  it("never throws when both legs fail — the player continues without subtitles", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    stubFetch(async (url) => {
      if (String(url).includes("workers.dev")) throw new TypeError("Failed to fetch");
      throw new TypeError("Failed to fetch");
    });

    await expect(SubtitleFetcher.searchAvailableSubtitles("tt35538033", "Oppenheimer")).resolves.toEqual([]);
  });
});

describe("SubtitleFetcher.downloadAndDecompress", () => {
  it("reads a relay body as plain text — the worker strips content-encoding after decompressing", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    const calls = [];
    stubFetch(async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => srtBody(),
      };
    });

    const text = await SubtitleFetcher.downloadAndDecompress(DOWNLOAD);

    expect(calls).toEqual([`${RELAY}?url=${encodeURIComponent(DOWNLOAD)}`]);
    expect(text).toBe(srtBody());
  });

  it("gunzips a direct body that still carries content-encoding: gzip", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    const gzipped = new Response(new Response(srtBody()).body.pipeThrough(new CompressionStream("gzip")));
    const calls = [];
    stubFetch(async (url) => {
      const to = String(url);
      calls.push(to);
      if (to.includes("workers.dev")) {
        // Relay down → direct answer, still gzip-encoded.
        return { ok: false, status: 502, headers: { get: () => null }, body: { cancel: async () => {} } };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: (name) => (name === "content-encoding" ? "gzip" : null) },
        body: gzipped.body,
        text: async () => srtBody(),
      };
    });

    const text = await SubtitleFetcher.downloadAndDecompress(DOWNLOAD);

    expect(calls).toEqual([`${RELAY}?url=${encodeURIComponent(DOWNLOAD)}`, DOWNLOAD]);
    expect(text).toBe(srtBody());
  });

  it("returns null when the download is refused (e.g. relay without the UA injection)", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    stubFetch(async (url) => {
      if (String(url).includes("workers.dev")) {
        return { ok: false, status: 401, headers: { get: () => null }, body: { cancel: async () => {} } };
      }
      return { ok: false, status: 401, headers: { get: () => null } };
    });

    await expect(SubtitleFetcher.downloadAndDecompress(DOWNLOAD)).resolves.toBeNull();
  });
});
