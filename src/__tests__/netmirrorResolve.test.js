// NetMirror (net52.cc) is the roster's in-manifest multi-audio row: its master
// carries `EXT-X-MEDIA:TYPE=AUDIO` renditions (measured up to 22 languages on
// one episode), so the payload deliberately returns `audioTracks: []` and lets
// hls.js report the tracks to the Audio menu.
//
// The failure this suite exists for is the silent one: an audio rendition lives
// on its OWN CDN host, and about half of the hosts measured refuse our relay
// while the video host serves it. A resolver that offered those tracks anyway
// would play a picture with no sound and no error — so the handler fetches each
// candidate's audio host with the same referer the client's relay sends, and a
// title with nothing reachable answers `no-source`.
//
// Hermetic: fetch is stubbed, no test may reach a provider.
import { describe, it, expect, beforeEach, vi } from "vitest";

// Hermetic DNS — the SSRF pass resolves every upstream host (same pattern as
// streamHandler.test.js); the fetch mock below is what this suite exercises.
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup, default: { lookup } }));

const { default: handler, parseNetmirrorAudioRenditions } = await import("../../api/stream.js");

const MASTER = [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",DEFAULT=YES,LANGUAGE="eng",URI="https://subs.example/s/1.m3u8"',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",LANGUAGE="hin",NAME="Hindi",DEFAULT=NO,URI="https://audio-a.example/files/a/0/0.m3u8"',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",LANGUAGE="eng",NAME="English",DEFAULT=YES,URI="https://audio-a.example/files/a/1/1.m3u8"',
  "#EXT-X-STREAM-INF:BANDWIDTH=1000000,AUDIO=\"aac\",RESOLUTION=1920x1080",
  "https://video.example/files/1080p/1080p.m3u8",
  "#EXT-X-STREAM-INF:BANDWIDTH=600000,AUDIO=\"aac\",RESOLUTION=1280x720",
  "https://video.example/files/720p/720p.m3u8",
].join("\n");

function makeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    setHeader(name, value) {
      res.headers[String(name).toLowerCase()] = value;
      return res;
    },
    send(payload) {
      res.body = payload;
      return res;
    },
  };
  return res;
}

async function call(body) {
  const req = { method: "POST", body, headers: { "x-forwarded-for": "203.0.113.9" } };
  const res = makeRes();
  await handler(req, res);
  return res;
}

/* One fake upstream: the NewTV API plus the CDN it points at. `audioStatus` is
   what the AUDIO host answers — 200 with a real playlist, or a refused/404
   reply, which is exactly how the blocked hosts behaved when measured. */
function stubUpstream({ audioStatus = 200 } = {}) {
  const fetchMock = vi.fn(async (url) => {
    const href = String(url);
    if (href.includes("/newtv/search.php")) {
      return new Response(
        JSON.stringify({ searchResult: [{ t: "Inception", id: "tt1375666" }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (href.includes("/newtv/player.php")) {
      return new Response(
        JSON.stringify({ video_link: "https://video.example/master.m3u8", referer: "https://net52.cc" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (href.includes("video.example/master.m3u8")) {
      return new Response(MASTER, { status: 200 });
    }
    if (href.includes("audio-a.example")) {
      if (audioStatus !== 200) {
        return new Response("<html>Land Lele Mera MadarChod</html>", { status: audioStatus });
      }
      return new Response("#EXTM3U\n#EXTINF:5.0,\nseg-000.ts\n#EXT-X-ENDLIST", { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.restoreAllMocks();
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
});

describe("parseNetmirrorAudioRenditions", () => {
  it("keeps AUDIO renditions only, resolves their URIs and flags the default", () => {
    const tracks = parseNetmirrorAudioRenditions(MASTER, "https://video.example/master.m3u8");
    expect(tracks.map((t) => t.label)).toEqual(["Hindi", "English"]);
    expect(tracks.map((t) => t.lang)).toEqual(["hin", "eng"]);
    expect(tracks[1].isDefault).toBe(true);
    expect(tracks[0].isDefault).toBe(false);
    // Absolute in the manifest, kept as-is; a relative URI resolves against it.
    expect(tracks[0].uri).toBe("https://audio-a.example/files/a/0/0.m3u8");
    const relative = parseNetmirrorAudioRenditions(
      '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Tamil",LANGUAGE="tam",DEFAULT=NO,URI="a/5/5.m3u8"',
      "https://video.example/dir/master.m3u8",
    );
    expect(relative[0].uri).toBe("https://video.example/dir/a/5/5.m3u8");
  });

  it("ignores subtitle renditions and audio rows without a URI", () => {
    const tracks = parseNetmirrorAudioRenditions(
      [
        "#EXTM3U",
        '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="s",NAME="English",URI="https://x.example/s.m3u8"',
        '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",NAME="Muxed",LANGUAGE="eng"',
      ].join("\n"),
      "https://video.example/m.m3u8",
    );
    expect(tracks).toEqual([]);
  });
});

describe("POST /api/stream — resolveNetmirror", () => {
  it("returns the master with its in-manifest audio and no sibling tracks", async () => {
    stubUpstream();
    const res = await call({
      action: "resolveNetmirror",
      type: "movie",
      id: "27205",
      title: "Inception",
      originalLanguage: "en",
    });
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body);
    expect(payload).toMatchObject({
      ok: true,
      server: "netmirror",
      provider: "NetMirror",
      audioTracks: [],
      audioTrackCount: 2,
      // The master's own DEFAULT track is English; the player labels row 0 from it.
      audioOriginalLang: "en",
    });
    expect(payload.source).toMatchObject({
      kind: "hls",
      url: "https://video.example/master.m3u8",
      refUrl: "https://net52.cc",
      multiLevelMaster: true,
    });
    expect(payload.variants.map((v) => v.height)).toEqual([1080, 720]);
  });

  it("refuses a title whose audio hosts are unreachable instead of playing silent video", async () => {
    stubUpstream({ audioStatus: 403 });
    const res = await call({
      action: "resolveNetmirror",
      type: "movie",
      id: "27205",
      title: "Inception",
    });
    const payload = JSON.parse(res.body);
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("no-source");
    expect(String(payload.error)).toMatch(/audio/i);
  });

  it("answers a missing title as a client bug, not a title miss", async () => {
    const fetchMock = stubUpstream();
    const res = await call({ action: "resolveNetmirror", type: "movie", id: "27205" });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: "bad-request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports an empty catalogue honestly", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (String(url).includes("/newtv/search.php")) {
          return new Response(JSON.stringify({ searchResult: [] }), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const res = await call({
      action: "resolveNetmirror",
      type: "tv",
      id: "1399",
      title: "Game of Thrones",
      season: "1",
      episode: "1",
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, code: "no-source" });
  });
});
