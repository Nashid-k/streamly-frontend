// Unit tests for server/dashToHls.js — the pure MPD -> HLS fMP4 transcoder that
// backs the ZXC/VIDSTUCK DASH servers (andromeda, centaurus).
//
// Why this exists: the native player is HLS-only by design, so a DASH provider
// has to be turned into an HLS manifest server-side. These tests pin the parts
// that are easy to get subtly wrong and impossible to eyeball — template
// escaping, `r="-1"` expansion, timescale math, and the fMP4 `#EXT-X-MAP` that
// makes the output actually muxable.
import { describe, it, expect } from "vitest";

import {
  substituteTemplate,
  parseMpd,
  buildMediaPlaylist,
  buildMasterPlaylist,
  manifestToVariants,
} from "../../server/dashToHls.js";

/* A static CMAF MPD shaped like the ones the real providers serve: absolute
   SegmentTemplate URLs, no BaseURL, one SegmentTimeline per representation. */
const STATIC_MPD = `<?xml version="1.0" encoding="utf-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT20S" minBufferTime="PT4S" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011">
  <Period id="P1" duration="PT20S">
    <AdaptationSet contentType="video" mimeType="video/mp4" segmentAlignment="true" startWithSAP="1">
      <Representation id="v-1080" bandwidth="2200000" width="1920" height="1080" frameRate="24000/1001" codecs="hev1.1.6.L150.90">
        <SegmentTemplate timescale="24000" initialization="https://cdn.example/init-$RepresentationID$.m4s" media="https://cdn.example/$RepresentationID$/seg-$Number%05d$.m4s" startNumber="1">
          <SegmentTimeline>
            <S t="0" d="120000" r="3"/>
            <S d="120000" r="0"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
      <Representation id="v-480" bandwidth="500000" width="854" height="480" frameRate="24" codecs="avc1.4d401e">
        <SegmentTemplate timescale="24000" initialization="https://cdn.example/init-$RepresentationID$.m4s" media="https://cdn.example/$RepresentationID$/seg-$Number%05d$.m4s" startNumber="1">
          <SegmentTimeline>
            <S t="0" d="120000" r="3"/>
            <S d="120000" r="0"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="audio/mp4" lang="eng" segmentAlignment="true">
      <Representation id="a-eng" bandwidth="128000" audioSamplingRate="48000" codecs="mp4a.40.2">
        <SegmentTemplate timescale="48000" initialization="https://cdn.example/init-$RepresentationID$.m4s" media="https://cdn.example/$RepresentationID$/a-$Number%05d$.m4s" startNumber="1">
          <SegmentTimeline>
            <S t="0" d="240000" r="3"/>
            <S d="240000" r="0"/>
          </SegmentTimeline>
        </SegmentTemplate>
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

describe("substituteTemplate", () => {
  it("fills the DASH template identifiers", () => {
    expect(
      substituteTemplate("https://cdn/$RepresentationID$/seg-$Number%05d$.m4s", {
        representationId: "v1",
        number: 42,
      }),
    ).toBe("https://cdn/v1/seg-00042.m4s");
  });

  it("fills $Number$ without a width", () => {
    expect(substituteTemplate("$Number$.m4s", { number: 7 })).toBe("7.m4s");
  });

  it("stashes an escaped $$ so it survives the identifier passes", () => {
    // A literal "$$" must not be eaten by the $Number$ / $Bandwidth$ rules.
    expect(substituteTemplate("$$$Number$$", { number: 3 })).toBe("$$Number$");
  });

  it("never leaves an unsubstituted identifier behind", () => {
    const out = substituteTemplate("$RepresentationID$/$Bandwidth$/$SubNumber$", {
      representationId: "v",
      bandwidth: 500000,
    });
    expect(out).not.toMatch(/\$[A-Za-z]/);
  });
});

describe("parseMpd", () => {
  it("rejects a non-MPD payload instead of inventing a ladder", () => {
    expect(parseMpd("#EXTM3U\n#EXT-X-VERSION:3\n")).toBeNull();
    expect(parseMpd("<html>nope</html>")).toBeNull();
  });

  it("reads video and audio representations with their bandwidths", () => {
    const m = parseMpd(STATIC_MPD);
    expect(m).not.toBeNull();
    expect(m.video).toHaveLength(2);
    expect(m.audio).toHaveLength(1);
    expect(m.video.map((v) => v.id).sort()).toEqual(["v-1080", "v-480"]);
    expect(m.audio[0].id).toBe("a-eng");
  });

  it("keeps the media duration", () => {
    const m = parseMpd(STATIC_MPD);
    // PT20S is the whole title; the summed timeline must not exceed it.
    expect(m.durationSeconds).toBeGreaterThan(0);
    expect(m.durationSeconds).toBeCloseTo(20, 1);
  });
});

describe("buildMediaPlaylist", () => {
  const manifest = parseMpd(STATIC_MPD);
  const rep = manifest.video.find((v) => v.id === "v-1080");

  it("emits an fMP4 media playlist hls.js can mux", () => {
    const text = buildMediaPlaylist(rep);
    expect(text.startsWith("#EXTM3U")).toBe(true);
    // fMP4 needs the init map + a version that admits it.
    expect(text).toMatch(/#EXT-X-MAP:URI="[^"]+init-v-1080\.m4s"/);
    expect(text).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(text).toContain("#EXT-X-ENDLIST");
  });

  it("resolves every segment URL to a concrete absolute link", () => {
    const text = buildMediaPlaylist(rep);
    const segments = text.split("\n").filter((l) => l.startsWith("http"));
    expect(segments).toHaveLength(5); // r="3" -> 4, plus the trailing r="0"
    for (const s of segments) {
      expect(s).toMatch(/^https:\/\/cdn\.example\/v-1080\/seg-\d{5}\.m4s$/);
    }
  });

  it("leaves no unsubstituted $Identifier$ in the output", () => {
    const text = buildMediaPlaylist(rep);
    expect(text).not.toMatch(/\$(Number|RepresentationID|Bandwidth|SubNumber)\b/);
  });

  it("sets TARGETDURATION at or above the longest EXTINF", () => {
    const text = buildMediaPlaylist(rep);
    const target = Number(/#EXT-X-TARGETDURATION:(\d+)/.exec(text)[1]);
    const durations = [...text.matchAll(/#EXTINF:([\d.]+)/g)].map((m) => Math.ceil(Number(m[1])));
    expect(durations.length).toBeGreaterThan(0);
    expect(target).toBeGreaterThanOrEqual(Math.max(...durations));
  });
});

describe("buildMasterPlaylist", () => {
  const urlFor = (id) => `https://relay.test/playlist?rep=${id}`;

  it("advertises one STREAM-INF per video rendition with its resolution", () => {
    const text = buildMasterPlaylist(parseMpd(STATIC_MPD), urlFor);
    const rungs = [...text.matchAll(/#EXT-X-STREAM-INF:[^\n]*RESOLUTION=(\d+x\d+)/g)].map((m) => m[1]);
    expect(rungs.sort()).toEqual(["1920x1080", "854x480"]);
  });

  it("gives every rung a bandwidth so hls.js can pick a starting level", () => {
    const text = buildMasterPlaylist(parseMpd(STATIC_MPD), urlFor);
    const rows = [...text.matchAll(/#EXT-X-STREAM-INF:([^\n]+)/g)];
    expect(rows.length).toBe(2);
    for (const r of rows) expect(r[1]).toMatch(/BANDWIDTH=\d+/);
  });

  it("groups the audio rendition and points every rung at a real URL", () => {
    const text = buildMasterPlaylist(parseMpd(STATIC_MPD), urlFor);
    expect(text).toContain('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac"');
    expect(text).toContain("AUDIO=\"aac\"");
    // Each STREAM-INF is followed by its own addressable playlist URL.
    for (const id of ["v-1080", "v-480", "a-eng"]) {
      expect(text).toContain(`https://relay.test/playlist?rep=${id}`);
    }
  });

  it("still emits a playable row for an audio-only MPD", () => {
    const audioOnly = parseMpd(STATIC_MPD.replace(/contentType="video"/, "contentType=\"videoX\""));
    // The video set is skipped, so only the audio representation survives.
    expect(audioOnly.video).toHaveLength(0);
    const text = buildMasterPlaylist(audioOnly, urlFor);
    expect(text).toContain("#EXT-X-STREAM-INF");
    expect(text).toContain("https://relay.test/playlist?rep=a-eng");
  });
});

describe("manifestToVariants", () => {
  it("maps representations to the resolver's variant contract", () => {
    const variants = manifestToVariants(parseMpd(STATIC_MPD));
    expect(variants).toHaveLength(2);
    for (const v of variants) {
      expect(v).toMatchObject({
        representationId: expect.any(String),
        uri: expect.any(String),
        bandwidth: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number),
        framerate: expect.any(Number),
        codecs: expect.any(String),
      });
    }
  });

  it("orders the ladder tallest first for the quality menu", () => {
    const heights = manifestToVariants(parseMpd(STATIC_MPD)).map((v) => v.height);
    expect(heights).toEqual([1080, 480]);
  });
});
