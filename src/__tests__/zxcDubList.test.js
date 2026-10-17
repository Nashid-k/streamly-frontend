// The provider's `original` row is served by the ZXC master itself, so the dub
// list must EXCLUDE it — otherwise the Audio menu shows "Original Audio" (ko,
// Korean for Reacher) as a dub row stacked on the player-flavoured Original row,
// and the true native language is lost. It also covers the movie case where en/0
// appears twice (once original, once "English dub") — same audio twice.
//
// This test drives the REAL handler over a stubbed global fetch (same approach
// as streamHandler.test.js) so the production dedup path is what runs.
import { describe, expect, it, beforeEach, vi } from "vitest";

// Hermetic DNS: the SSRF pass resolves the provider origin through
// resolveUpstream, whose OS lookup cannot answer for that host in this
// environment. Every name resolves public here; the SSRF rules themselves are
// covered by ssrfGuard.test.js, and the fetch mock below is what this suite
// exercises. Same pattern as streamHandler.test.js.
const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup, default: { lookup } }));

let dubs = [];
let links = [];
// Counts provider round trips so a test can prove the dub list is NOT built by
// minting + transcoding every advertised dub (the old request-amplification
// that got the ip throttled and cascaded into TV metadata 429s).
let calls = { mint: 0, servers: 0, mpd: 0 };

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
  lookup.mockReset();
  lookup.mockResolvedValue([{ address: "93.184.216.34" }]);
  dubs = [];
  calls = { mint: 0, servers: 0, mpd: 0 };
  // The handler caches resolved payloads, MPDs and title metadata at module
  // scope, so clear all three or the round-trip counts below would depend on
  // test order.
  clearZxcResolveCache();
  clearZxcMpdCache();
  clearZxcTitleMetaCache();
  // A public literal IP so the SSRF guard passes without DNS: this suite is
  // about the dub-dedup path, not about the guard (covered by ssrf.test.js).
  // NOTE: the mint URL below is derived from the module seed (zxcContractSeed),
  // so a provider rename self-heals here instead of needing this file edited.
  links = [{ link: Buffer.from("https://93.184.216.34/stub.mpd").toString("base64"), type: "dash", resolution: 1080 }];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) => {
      const url = String(typeof input === "string" ? input : input?.url || input);
      if (url.includes(MINT_PATH)) { calls.mint += 1; return json({ token: "tok", ts: "1700000000" }); }
      if (url.includes("/backend/tmdb/details/")) return json({ title: "Stub", release_date: "2024-01-01", imdb_id: "" });
      if (url.includes("/backend_/sources/")) { calls.servers += 1; return json({ success: true, links, dubs }); }
      if (url.endsWith(".mpd") || url.includes("stub")) {
        calls.mpd += 1;
        return new Response(MPD, { status: 200, headers: { "content-type": "application/dash+xml" } });
      }
      return new Response("upstream unreachable", { status: 502 });
    }),
  );
});

const { default: handler, zxcContractSeed, clearZxcMpdCache, clearZxcTitleMetaCache, clearZxcResolveCache } = await import("../../api/stream.js");

// Derived from the module seed so a provider rename can never strand this suite.
const MINT_PATH = zxcContractSeed().mintPath;

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

async function callResolve() {
  const res = makeRes();
  await handler(
    { method: "POST", body: { action: "resolvezxc", type: "movie", id: "550" }, headers: {}, socket: { remoteAddress: "127.0.0.1" } },
    res,
  );
  return JSON.parse(res.body);
}

async function resolveDubs() {
  const payload = await callResolve();
  return payload.audioTracks.map((t) => t.label);
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

  it("reports the provider's original-track code so row 0 is not mislabelled", async () => {
    /* Jailer 937020: the provider flags `ml` as original but TMDB says the film is
       Tamil, so the master we play (Malayalam) was labelled "Tamil" and swallowed
       the real Tamil dub row. The player needs the SOURCE's code for row 0. */
    dubs = [
      { lanCode: "ml", type: "0", lanName: "Original Audio", original: true },
      { lanCode: "ta", type: "0", lanName: "Tamil dub" },
    ];
    const payload = await callResolve();
    expect(payload.audioOriginalLang).toBe("ml");
  });

  it("omits the original language when no row is flagged", async () => {
    dubs = [{ lanCode: "en", type: "0", lanName: "English dub" }];
    expect((await callResolve()).audioOriginalLang).toBe("");
  });

  it("lists advertised dubs with NO per-dub mint/transcode (unverified parity)", async () => {
    // The provider's own player lists `data.dubs` as-is; a dub that is dead
    // fails at play time. Verifying each dub here used to cost N extra
    // mint+servers+MPD round trips, so the ip got throttled and a live row was
    // dropped on a transient 429. One base resolve must stay one of each.
    dubs = [
      { lanCode: "en", type: "0", lanName: "Original Audio", original: true },
      { lanCode: "fr", type: "0", lanName: "French dub" },
      { lanCode: "hi", type: "0", lanName: "Hindi dub" },
      { lanCode: "ta", type: "0", lanName: "Tamil dub" },
    ];
    const labels = await resolveDubs();
    expect(labels).toEqual(["French dub", "Hindi dub", "Tamil dub"]);
    expect(calls.mint).toBe(1);
    expect(calls.servers).toBe(1);
    expect(calls.mpd).toBe(1);
  });
});
