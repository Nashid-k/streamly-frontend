import { describe, expect, it } from "vitest";
import { buildMuxedInit, extractTrackBytes, muxSegment, remapMoofTrackId } from "../utils/fmp4Muxer";

// ── tiny ISO-BMFF builders (structural fidelity only — the muxer reads box
//    headers + track ids, not coded media samples, so filler payloads are fine) ──

const u32 = (n) => {
  const out = new Uint8Array(4);
  out[0] = (n >>> 24) & 0xff;
  out[1] = (n >>> 16) & 0xff;
  out[2] = (n >>> 8) & 0xff;
  out[3] = n & 0xff;
  return out;
};

const ascii = (s) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));

function box(type, ...parts) {
  let size = 8;
  for (const p of parts) size += p.length;
  return new Uint8Array([...u32(size), ...ascii(type), ...parts.flatMap((p) => [...p])]);
}

const ftyp = () => box("ftyp", ascii("isom").slice(0, 4), u32(0x200), ascii("isom").slice(0, 4), ascii("iso6").slice(0, 4));
const mvhd = () => box("mvhd", new Uint8Array([0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
// tkhd v0: size(4) type(4) vf(4) creation(4) modification(4) track_ID(4) …
const tkhd = (id) => box("tkhd", new Uint8Array([0, 0, 0, 0]), u32(0), u32(0), u32(id), u32(0));
const trak = (handler, trackId) => box("trak", tkhd(trackId), box("mdia", ascii("filled").slice(0, 4)));
const trex = (id) => box("trex", new Uint8Array([0, 0, 0, 0]), u32(id), u32(0));
const mvex = (...rows) => box("mvex", ...rows);
const moov = (...children) => box("moov", ...children);

// video init: track id 1, vide handler
const VIDEO_INIT = new Uint8Array([...ftyp(), ...moov(mvhd(), trak("vide", 1), mvex(trex(1)))]);
// audio init: track id 1, soun handler (the collision that forces the remap)
const AUDIO_INIT = new Uint8Array([...ftyp(), ...moov(mvhd(), trak("soun", 1), mvex(trex(1)))]);

const styp = () => box("styp", ascii("msdh").slice(0, 4), u32(0));
const mfhd = () => box("mfhd", u32(0), u32(1));
const tfhd = (id) => box("tfhd", u32(0), u32(id));
const trun = () => box("trun", u32(0), u32(1));
const moof = (trackId) => box("moof", mfhd(), box("traf", tfhd(trackId), trun()));
const mdat = (n) => box("mdat", new Uint8Array(n).fill(0x41));

const VIDEO_SEG = new Uint8Array([...styp(), ...moof(1), ...mdat(24)]);
const AUDIO_SEG = new Uint8Array([...styp(), ...moof(1), ...mdat(12)]);

// ── box-walking readers (independent of the module under test) ──
function boxList(buf, start, end) {
  const out = [];
  let off = start;
  while (off + 8 <= end) {
    const size = ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0;
    if (size < 8 || off + size > end) break;
    const type = String.fromCharCode(buf[off + 4], buf[off + 5], buf[off + 6], buf[off + 7]);
    out.push({ type, start: off, size, end: off + size });
    off += size;
  }
  return out;
}

function within(buf, parent, type) {
  const b = boxList(buf, parent.start + 8, parent.end).find((x) => x.type === type);
  if (!b) throw new Error(`no ${type} box`);
  return b;
}

function topLevel(buf, type) {
  const b = boxList(buf, 0, buf.length).find((x) => x.type === type);
  if (!b) throw new Error(`no top-level ${type} box`);
  return b;
}

function firstTkhdId(buf, trakBox) {
  const t = within(buf, trakBox, "tkhd");
  return ((buf[t.start + 20] << 24) | (buf[t.start + 21] << 16) | (buf[t.start + 22] << 8) | buf[t.start + 23]) >>> 0;
}

function firstTrexId(buf, mvexBox) {
  const t = within(buf, mvexBox, "trex");
  return ((buf[t.start + 12] << 24) | (buf[t.start + 13] << 16) | (buf[t.start + 14] << 8) | buf[t.start + 15]) >>> 0;
}

function firstTfhdId(buf, moofBox) {
  const traf = within(buf, moofBox, "traf");
  const th = within(buf, traf, "tfhd");
  return ((buf[th.start + 12] << 24) | (buf[th.start + 13] << 16) | (buf[th.start + 14] << 8) | buf[th.start + 15]) >>> 0;
}

describe("fmp4Muxer.buildMuxedInit", () => {
  it("merges ftyp + moov with one video and one audio track", () => {
    const { init, audioTrackId } = buildMuxedInit(VIDEO_INIT, AUDIO_INIT);
    const top = boxList(init, 0, init.length);
    expect(top.map((b) => b.type)).toEqual(["ftyp", "moov"]);
    // Every box size sums to the file length (no dangling bytes).
    const declared = top.reduce((sum, b) => sum + b.size, 0);
    expect(declared).toBe(init.length);

    const moovBox = topLevel(init, "moov");
    const children = boxList(init, moovBox.start + 8, moovBox.end);
    expect(children.map((c) => c.type)).toEqual(["mvhd", "trak", "trak", "mvex"]);

    const [videoTrak, audioTrak] = children.filter((c) => c.type === "trak");
    expect(firstTkhdId(init, videoTrak)).toBe(1);
    expect(firstTkhdId(init, audioTrak)).toBe(2);
    expect(audioTrackId).toBe(2);

    const mvexBox = children.find((c) => c.type === "mvex");
    const trexRows = boxList(init, mvexBox.start + 8, mvexBox.end).filter((c) => c.type === "trex");
    expect(trexRows).toHaveLength(2);
    expect(firstTrexId(init, mvexBox)).toBe(1);
  });

  it("remaps the audio trex row to the fresh track id", () => {
    const { init } = buildMuxedInit(VIDEO_INIT, AUDIO_INIT);
    const moovBox = topLevel(init, "moov");
    const mvexBox = within(init, moovBox, "mvex");
    const trexRows = boxList(init, mvexBox.start + 8, mvexBox.end).filter((c) => c.type === "trex");
    const ids = trexRows.map((r) =>
      ((init[r.start + 12] << 24) | (init[r.start + 13] << 16) | (init[r.start + 14] << 8) | init[r.start + 15]) >>> 0,
    );
    expect(ids).toEqual([1, 2]);
  });

  it("rejects a non-MP4 init segment instead of producing corrupt output", () => {
    expect(() => buildMuxedInit(new Uint8Array([1, 2, 3]), AUDIO_INIT)).toThrow(/init segments/);
    expect(() => buildMuxedInit(VIDEO_INIT, null)).toThrow(/init segments/);
  });
});

describe("fmp4Muxer.muxSegment", () => {
  it("interleaves video moof+mdat then audio moof+mdat, remapping the audio track id", () => {
    const out = muxSegment(VIDEO_SEG, AUDIO_SEG, 2);
    const boxes = boxList(out, 0, out.length);
    expect(boxes.map((b) => b.type)).toEqual(["moof", "mdat", "moof", "mdat"]);

    const videoMoof = boxes[0];
    const videoMdat = boxes[1];
    const audioMoof = boxes[2];
    const audioMdat = boxes[3];

    expect(firstTfhdId(out, videoMoof)).toBe(1);
    expect(firstTfhdId(out, audioMoof)).toBe(2);
    // mdat payloads survive untouched (video 24, audio 12).
    expect(videoMdat.size - 8).toBe(24);
    expect(audioMdat.size - 8).toBe(12);
    // styp/sidx were stripped — nothing outside the four boxes.
    expect(boxes.reduce((sum, b) => sum + b.size, 0)).toBe(out.length);
  });

  it("strips styp/prft so the output starts directly at the first moof", () => {
    const out = muxSegment(VIDEO_SEG, AUDIO_SEG, 2);
    const type = String.fromCharCode(out[4], out[5], out[6], out[7]);
    expect(type).toBe("moof");
    expect(boxList(out, 0, out.length).some((b) => b.type === "styp" || b.type === "sidx")).toBe(false);
  });
});

describe("fmp4Muxer.extractTrackBytes / remapMoofTrackId", () => {
  it("keeps only moof+mdat pairs", () => {
    const parts = extractTrackBytes(VIDEO_SEG);
    expect(parts.map((p) => p.type)).toEqual(["moof", "mdat"]);
  });

  it("remaps every tfhd of a moof independently of mdat payload", () => {
    const moofBytes = new Uint8Array([...moof(1)]);
    const remapped = remapMoofTrackId(moofBytes, 3);
    const top = topLevel(remapped, "moof");
    expect(firstTfhdId(remapped, top)).toBe(3);
    expect(String.fromCharCode(...remapped.subarray(4, 8))).toBe("moof");
  });
});