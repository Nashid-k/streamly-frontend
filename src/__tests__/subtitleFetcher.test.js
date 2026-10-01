import { describe, it, expect, vi, afterEach } from "vitest";
import { SubtitleFetcher } from "../api/subtitleFetcher";
import { trackBadge } from "../components/player/v2/subtitleTracks";

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

  /* 3.29. These are the tests that would have caught the original defect, and they
   * belong HERE rather than in the panel's suite: the bug was in the fetcher's dedupe,
   * so a panel test asserting "an SDH badge renders" passes while the real pipeline
   * still never produces an SDH entry to render. */
  it("keeps the SDH and forced variants of one language instead of deduping them away", async () => {
    /* Every English result shares one `SubLanguageID`, so a map keyed on the language
     * (which is what this did) keeps exactly ONE English track and silently discards
     * the other two. The viewer was never offered a choice that existed upstream, and
     * nothing on screen indicated data had been dropped. */
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    stubFetch(async () =>
      jsonResponse([
        { SubFormat: "srt", LanguageName: "English", SubLanguageID: "en", SubDownloadLink: "https://x/plain", SubHearingImpaired: "0", SubForced: "0" },
        { SubFormat: "srt", LanguageName: "English", SubLanguageID: "en", SubDownloadLink: "https://x/sdh", SubHearingImpaired: "1", SubForced: "0" },
        { SubFormat: "srt", LanguageName: "English", SubLanguageID: "en", SubDownloadLink: "https://x/forced", SubHearingImpaired: "0", SubForced: "1" },
      ]),
    );

    const langs = await SubtitleFetcher.searchAvailableSubtitles("tt35538033", "Oppenheimer");

    expect(langs).toHaveLength(3);
    /* Plain first, SDH second, forced last — and the LINKS differ, which is the part
     * that matters: two rows pointing at the same file is a broken picker, not a
     * cosmetic ordering problem. */
    expect(langs.map((l) => l.downloadLink)).toEqual([
      "https://x/plain",
      "https://x/sdh",
      "https://x/forced",
    ]);
  });

  it("still collapses two files of the SAME variant, keeping the first", async () => {
    /* Upstream returns many candidates per track. Offering them all would fill the
     * sheet with duplicate rows, and the first is the highest rated — which is the
     * whole reason this dedupe existed before 3.29. */
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    stubFetch(async () =>
      jsonResponse([
        { SubFormat: "srt", LanguageName: "English", SubLanguageID: "en", SubDownloadLink: "https://x/best", SubHearingImpaired: "1", SubForced: "0" },
        { SubFormat: "srt", LanguageName: "English", SubLanguageID: "en", SubDownloadLink: "https://x/worse", SubHearingImpaired: "1", SubForced: "0" },
      ]),
    );

    const langs = await SubtitleFetcher.searchAvailableSubtitles("tt35538033", "Oppenheimer");

    expect(langs).toHaveLength(1);
    expect(langs[0].downloadLink).toBe("https://x/best");
  });

  it("carries the hearing-impaired and forced flags through as upstream sent them", async () => {
    /* Strings, deliberately. The REST API serialises these as "0"/"1" and the reducer
     * owns the comparison, so this layer must not coerce — `Boolean("0")` is true and
     * would badge every track. */
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    stubFetch(async () =>
      jsonResponse([
        { SubFormat: "srt", LanguageName: "English", SubLanguageID: "en", SubDownloadLink: DOWNLOAD, SubHearingImpaired: "1", SubForced: "0" },
      ]),
    );

    const [track] = await SubtitleFetcher.searchAvailableSubtitles("tt35538033", "Oppenheimer");

    expect(track.hearingImpaired).toBe("1");
    expect(track.forced).toBe("0");
  });

  it("treats absent flags as plain rather than as SDH", async () => {
    /* Older API responses and hand-built fixtures omit the fields entirely. `undefined`
     * must read as "no", or every response from a cached/legacy shape gets a badge. */
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    stubFetch(async () =>
      jsonResponse([
        { SubFormat: "srt", LanguageName: "English", SubLanguageID: "en", SubDownloadLink: DOWNLOAD },
      ]),
    );

    const [track] = await SubtitleFetcher.searchAvailableSubtitles("tt35538033", "Oppenheimer");
    expect(trackBadge(track)).toBeNull();
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
        arrayBuffer: async () => new TextEncoder().encode(srtBody()).buffer,
      };
    });

    const text = await SubtitleFetcher.downloadAndDecompress(DOWNLOAD);

    expect(calls).toEqual([`${RELAY}?url=${encodeURIComponent(DOWNLOAD)}`]);
    expect(text).toBe(srtBody());
  });

  it("gunzips a direct body that still carries content-encoding: gzip", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    const gzipped = await new Response(
      new Response(srtBody()).body.pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
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
        arrayBuffer: async () => gzipped.slice(0),
      };
    });

    const text = await SubtitleFetcher.downloadAndDecompress(DOWNLOAD);

    expect(calls).toEqual([`${RELAY}?url=${encodeURIComponent(DOWNLOAD)}`, DOWNLOAD]);
    expect(text).toBe(srtBody());
  });

  it("decompresses gzip bytes served WITHOUT content-encoding (the dl.opensubtitles.org shape)", async () => {
    // Live proof from the console: the .gz arrives 200 with no
    // content-encoding (the relay passes headers through), so a header-only
    // gunzip decision reads gzip bytes as text and finds zero cues.
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    const gzipped = await new Response(
      new Response(srtBody()).body.pipeThrough(new CompressionStream("gzip")),
    ).arrayBuffer();
    stubFetch(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      arrayBuffer: async () => gzipped.slice(0),
    }));

    await expect(SubtitleFetcher.downloadAndDecompress(DOWNLOAD)).resolves.toBe(srtBody());
  });

  it("falls back to a raw decode when the gzip header lies on an already-plain body", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    stubFetch(async () => ({
      ok: true,
      status: 200,
      headers: { get: (name) => (name === "content-encoding" ? "gzip" : null) },
      arrayBuffer: async () => new TextEncoder().encode(srtBody()).buffer,
    }));

    // Gunzipping plain text throws; the raw fallback still yields captions.
    await expect(SubtitleFetcher.downloadAndDecompress(DOWNLOAD)).resolves.toBe(srtBody());
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

  it("refuses a 200 body with no timestamp lines (relay error page, not captions)", async () => {
    vi.stubEnv("VITE_STREAMLY_RELAY_URL", RELAY);
    stubFetch(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      arrayBuffer: async () =>
        new TextEncoder().encode("<html><body>Attention Required! | Cloudflare</body></html>").buffer,
    }));

    // A track that "enables" with zero cues never renders — null keeps it Off
    // with a visible reason instead.
    await expect(SubtitleFetcher.downloadAndDecompress(DOWNLOAD)).resolves.toBeNull();
  });
});

describe("SubtitleFetcher.isSubtitleText", () => {
  it("accepts SRT and VTT timestamp lines", () => {
    expect(SubtitleFetcher.isSubtitleText(srtBody())).toBe(true);
    expect(
      SubtitleFetcher.isSubtitleText("WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello\n"),
    ).toBe(true);
  });

  it("rejects error pages, empty and binary-garbage bodies", () => {
    expect(SubtitleFetcher.isSubtitleText("")).toBe(false);
    expect(SubtitleFetcher.isSubtitleText(null)).toBe(false);
    expect(SubtitleFetcher.isSubtitleText("<html><body>error code: 1027</body></html>")).toBe(false);
    expect(SubtitleFetcher.isSubtitleText("\u001f\u008b\u0008\u0000garbage-bytes")).toBe(false);
  });
});
