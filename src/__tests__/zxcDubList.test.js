// The provider's `original` row is served by the ZXC master itself, so the dub
// list must EXCLUDE it — otherwise the Audio menu shows "Original Audio" (ko,
// Korean for Reacher) as a dub row stacked on the player-flavoured Original row,
// and the true native language is lost. It also covers the movie case where en/0
// appears twice (once original, once "English dub") — same audio twice.
//
// This test drives the REAL handler over a stubbed global fetch (same approach
// as downloadifyHandler.test.js) so the production dedup path is what runs.
import { describe, expect, it, beforeEach, vi } from "vitest";

let dubs = [];
let links = [];

// A minimal but VALID MPD (SegmentTimeline form, as the real provider emits) so
// the transcoder yields one video rep and one audio adaptation set.
const MPD = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT20S" minBufferTime="PT4S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011">
  <Period id="P1" duration="PT20S">
    <AdaptationSet contentType="video" mimeType="video/mp4" segmentAlignment="true" startWithSAP="1">
      <Representation id="v-1080" bandwidth="800000" width="1920" height="1080" frameRate="24" codecs="avc1.4d401e">
        <SegmentTemplate timescale="24000" initialization="https://93.184.216.34/init-$RepresentationID$.m4s" media="https://93.184.216.34/$RepresentationID$/seg-$Number%05d$.m4s" startNumber="1">
          <SegmentTimeline><S t="0" d="120000" r="3"/><S d="120000" r="0"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="audio/mp4" lang="eng" segmentAlignment="true">
      <Representation id="a-eng" bandwidth="128000" audioSamplingRate="48000" codecs="mp4a.40.2">
        <SegmentTemplate timescale="48000" initialization="https://93.184.216.34/init-$RepresentationID$.m4s" media="https://93.184.216.34/$RepresentationID$/a-$Number%05d$.m4s" startNumber="1">
          <SegmentTimeline><S t="0" d="240000" r="3"/><S d="240000" r="0"/></SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

const json = (payload) => new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });

beforeEach(() => {
  dubs = [];
  // A public literal IP so the SSRF guard passes without DNS: this suite is
  // about the dub-dedup path, not about the guard (covered by ssrf.test.js).
  links = [{ link: Buffer.from("https://93.184.216.34/stub.mpd").toString("base64"), type: "dash", resolution: 1080 }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(typeof input === "string" ? input : input?.url || input);
      if (url.includes("/backend/meow")) return json({ token: "tok", ts: "1700000000" });
      if (url.includes("/backend/tmdb/details/")) return json({ title: "Stub", release_date: "2024-01-01", imdb_id: "" });
      if (url.includes("/backend/servers/")) return json({ success: true, links, dubs });
      if (url.endsWith(".mpd") || url.includes("stub")) {
        return new Response(MPD, { status: 200, headers: { "content-type": "application/dash+xml" } });
      }
      return new Response("upstream unreachable", { status: 502 });
    }),
  );
});

const { default: handler } = await import("../../api/downloadify.js");

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

async function resolveDubs() {
  const res = makeRes();
  await handler(
    { method: "POST", body: { action: "resolvezxc", type: "movie", id: "12345", server: "centaurus" }, headers: { "x-forwarded-for": "203.0.113.9" } },
    res,
  );
  const parsed = typeof res.body === "string" ? JSON.parse(res.body) : res.body;
  expect(parsed.ok, `resolve failed: ${JSON.stringify(parsed)}`).toBe(true);
  return parsed.audioTracks.map((t) => t.label);
}

describe("ZXC dub list — the original track", () => {
  it("drops the provider's `original` row from the dub list", async () => {
    // Reacher S1E1 shape: the native track is Korean and ko/0 is flagged original.
    dubs = [
      { lanCode: "ko", type: "0", lanName: "Original Audio", original: true },
      { lanCode: "en", type: "0", lanName: "English dub" },
      { lanCode: "hi", type: "0", lanName: "Hindi dub" },
      { lanCode: "es", type: "1", lanName: "Spanish sub" },
    ];
    const labels = await resolveDubs();
    expect(labels).toEqual(["English dub", "Hindi dub"]);
    expect(labels.join(" ")).not.toMatch(/original/i);
  });

  it("keeps a real dub when the original is a DIFFERENT language", async () => {
    dubs = [
      { lanCode: "ko", type: "0", lanName: "Original Audio", original: true },
      { lanCode: "en", type: "0", lanName: "English dub" },
    ];
    expect(await resolveDubs()).toEqual(["English dub"]);
  });

  it("excludes the en/0 row when the ORIGINAL ITSELF is English", async () => {
    dubs = [
      { lanCode: "en", type: "0", lanName: "Original Audio", original: true },
      { lanCode: "en", type: "0", lanName: "English dub" },
      { lanCode: "fr", type: "0", lanName: "French dub" },
    ];
    expect(await resolveDubs()).toEqual(["French dub"]);
  });

  it("never lists a type-1 (subtitle-only) row as audio", async () => {
    dubs = [
      { lanCode: "en", type: "0", lanName: "Original Audio", original: true },
      { lanCode: "ar", type: "1", lanName: "Arabic sub" },
      { lanCode: "ku", type: "1", lanName: "Kurdish sub" },
      { lanCode: "ta", type: "0", lanName: "Tamil dub" },
    ];
    expect(await resolveDubs()).toEqual(["Tamil dub"]);
  });

  it("surfaces the full 11-dub catalogue instead of truncating at 8", async () => {
    // Reacher advertises 11 type-0 rows; the old ZXC_MAX_DUBS=8 cut the tail,
    // silently losing Telugu and ptbr.
    dubs = [{ lanCode: "ko", type: "0", lanName: "Original Audio", original: true }];
    for (const [code, name] of [
      ["en", "English"], ["hi", "Hindi"], ["id", "Indonesian"], ["ru", "Russian"], ["es", "Spanish"],
      ["tl", "Tagalog"], ["ta", "Tamil"], ["te", "Telugu"], ["esla", "esla"], ["ptbr", "ptbr"],
    ]) {
      dubs.push({ lanCode: code, type: "0", lanName: `${name} dub` });
    }
    const labels = await resolveDubs();
    expect(labels).toHaveLength(10);
    expect(labels).toContain("Telugu dub");
    expect(labels).toContain("ptbr dub");
  });

  it("still lists every dub when the provider marks no row as original", async () => {
    // Defensive: no `original` flag at all (older payloads) must not empty the list.
    dubs = [
      { lanCode: "en", type: "0", lanName: "English dub" },
      { lanCode: "fr", type: "0", lanName: "French dub" },
    ];
    expect(await resolveDubs()).toEqual(["English dub", "French dub"]);
  });
});
