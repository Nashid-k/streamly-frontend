// ZXC plain-HLS servers (atlas, meow) return SEVERAL links, and they are
// NOT a quality ladder: atlas ships two media playlists for the same runtime
// (measured: identical #EXTINF total, different segment granularity/bitrate)
// and meow ships byte-identical mirrors of one encode. So the resolver
// must publish exactly ONE rendition, and must not die when the first link is
// dead while a mirror behind it still works.
import { describe, expect, it, beforeEach, vi } from "vitest";

// Each entry: the PLAYLIST TEXT for that link, or null to simulate a dead link.
// The handler base64-decodes `link`, so plain URLs are encoded here.
let links = [];

const b64 = (u) => Buffer.from(u, "utf8").toString("base64");

const mpd = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT20S" minBufferTime="PT4S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011">
  <Period id="P1" duration="PT20S">
    <AdaptationSet contentType="video" mimeType="video/mp4" segmentAlignment="true" startWithSAP="1">
      <Representation id="v0" bandwidth="800000" width="1920" height="1080" frameRate="24" codecs="avc1.4d401e">
        <SegmentTemplate timescale="24000" initialization="https://93.184.216.34/init-$RepresentationID$.m4s" media="https://93.184.216.34/$RepresentationID$/seg-$Number%05d$.m4s" startNumber="1">
          <SegmentTimeline><S t="0" d="120000" r="3"/><S d="120000" r="0"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

const mediaPlaylist = (segments, extinf = 12.012) => [
  "#EXTM3U",
  "#EXT-X-VERSION:3",
  "#EXT-X-TARGETDURATION:13",
  "#EXT-X-MEDIA-SEQUENCE:0",
  ...Array.from({ length: segments }, (_, i) => [`#EXTINF:${extinf.toFixed(6)},`, `https://93.184.216.34/a?y=seg${i}`]).flat(),
  "#EXT-X-ENDLIST",
  "",
].join("\n");

const masterPlaylist = (rungs) => [
  "#EXTM3U",
  "#EXT-X-VERSION:4",
  ...rungs.flatMap((r) => [`#EXT-X-STREAM-INF:BANDWIDTH=${r.bw},RESOLUTION=${r.w}x${r.h}`, r.uri]),
  "",
].join("\n");

const json = (payload) => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  links = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(typeof input === "string" ? input : input?.url || input);
      if (url.includes("/backend/fuckoffniggawtaf")) return json({ token: "tok", ts: "1700000000" });
      if (url.includes("/backend/tmdb/details/")) return json({ title: "Stub", release_date: "2024-01-01", imdb_id: "" });
      if (url.includes("/backend/servers/")) {
        return json({
          success: true,
          links: links.map((l) => ({ link: b64(l.url), type: "hls", resolution: l.resolution ?? 0 })),
        });
      }
      if (url.endsWith(".mpd") || url.includes("/mpd")) {
        return new Response(mpd, { status: 200, headers: { "content-type": "application/dash+xml" } });
      }
      const hit = links.find((l) => l.url === url);
      if (hit && hit.text) return new Response(hit.text, { status: 200, headers: { "content-type": "application/vnd.apple.mpegurl" } });
      return new Response("upstream unreachable", { status: 502 });
    }),
  );
});

const { default: handler } = await import("../../api/stream.js");

function makeRes() {
  const res = {
    statusCode: null, headers: {}, body: null,
    status(c) { res.statusCode = c; return res; },
    setHeader(k, v) { res.headers[k.toLowerCase()] = v; return res; },
    json(p) { res.body = p; return res; },
    send(p) { res.body = p; return res; },
    end() { return res; },
  };
  return res;
}

async function resolve(server) {
  const res = makeRes();
  await handler(
    { method: "POST", body: { action: "resolvezxc", type: "movie", id: "12345", server }, headers: { "x-forwarded-for": "203.0.113.9" } },
    res,
  );
  return JSON.parse(res.body);
}

describe("ZXC plain-HLS servers publish one rendition, with mirror fallback", () => {
  it("picks a single variant when atlas advertises two same-runtime encodes", async () => {
    // Two media playlists, same #EXTINF total (3582s), different segmentation.
    links = [
      { url: "https://93.184.216.34/atlas-hi.m3u8", text: mediaPlaylist(299, 12.012) },
      { url: "https://93.184.216.34/atlas-lo.m3u8", text: mediaPlaylist(896, 4.004) },
    ];
    const r = await resolve("atlas");
    expect(r.ok).toBe(true);
    // NOT three duplicate rungs in the quality menu — one playable rendition.
    expect(r.variants).toHaveLength(1);
    expect(r.source.kind).toBe("hls");
    expect(r.source.multiLevelMaster).toBeUndefined();
  });

  it("falls through to a working mirror when the first link is dead", async () => {
    links = [
      { url: "https://93.184.216.34/atlas-dead.m3u8", text: null },
      { url: "https://93.184.216.34/atlas-live.m3u8", text: mediaPlaylist(299, 12.012) },
    ];
    const r = await resolve("atlas");
    expect(r.ok).toBe(true);
    expect(r.source.url).toBe("https://93.184.216.34/atlas-live.m3u8");
  });

  it("skips a link that answers with something that is not a playlist", async () => {
    links = [
      { url: "https://93.184.216.34/atlas-html.m3u8", text: "<html>captive portal</html>" },
      { url: "https://93.184.216.34/atlas-ok.m3u8", text: mediaPlaylist(299, 12.012) },
    ];
    const r = await resolve("atlas");
    expect(r.ok).toBe(true);
    expect(r.source.url).toBe("https://93.184.216.34/atlas-ok.m3u8");
  });

  it("publishes a real ladder when a mirror is a multi-rung master", async () => {
    links = [
      { url: "https://93.184.216.34/mw-single.m3u8", text: masterPlaylist([{ bw: 500000, w: 640, h: 360, uri: "https://93.184.216.34/mw-360.m3u8" }]) },
      { url: "https://93.184.216.34/mw-ladder.m3u8", text: masterPlaylist([
        { bw: 500000, w: 640, h: 360, uri: "https://93.184.216.34/mw-360.m3u8" },
        { bw: 1200000, w: 1280, h: 720, uri: "https://93.184.216.34/mw-720.m3u8" },
        { bw: 3000000, w: 1920, h: 1080, uri: "https://93.184.216.34/mw-1080.m3u8" },
      ]) },
    ];
    const r = await resolve("meow");
    expect(r.ok).toBe(true);
    // The ladder wins over a single-rung mirror regardless of provider order.
    expect(r.variants).toHaveLength(3);
    expect(r.source.multiLevelMaster).toBe(true);
  });

  it("fails cleanly when every HLS link is dead", async () => {
    links = [
      { url: "https://93.184.216.34/a.m3u8", text: null },
      { url: "https://93.184.216.34/b.m3u8", text: null },
    ];
    const r = await resolve("atlas");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("no-source");
  });
});
