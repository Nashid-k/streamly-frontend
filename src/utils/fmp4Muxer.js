// src/utils/fmp4Muxer.js — dependency-free multi-track fMP4 muxer.
//
// CineSrc keeps audio as a SEPARATE HLS rendition from video: the video
// variant's init segment carries only a `vide` track, and each audio group has
// its own `soun` init + own 4-second fragments. A naive downloader stitches
// just the video stream and produces a SILENT mp4. This module merges the two
// CMAF streams into one regular fragmented MP4 that players read naturally:
//
//   · init  = ftyp(video) + moov{ mvhd(video) + trak(video) + trak(audio) +
//             mvex{ trex(video) + trex(audio) } }
//   · audio's tkhd/trex/tfhd track id is remapped 1 → 2 so it no longer
//     collides with the video track
//   · each output segment = video moof+mdat then audio moof+mdat (both keep
//     their absolute tfdt baseMediaDecodeTime, so A/V sync is exact)
//   · styp/sidx/prft are stripped; moof+mdat stay adjacent so trun's implicit
//     data offset still points at the mdat
//
// Pure bytes in/bytes out — no DOM, no fetch — so it unit-tests cleanly in
// jsdom and runs identically inside the serverless function.

function ascii(buf, off) {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3]);
}

function readU32(buf, off) {
  return (
    ((buf[off] & 0xff) << 24) |
    ((buf[off + 1] & 0xff) << 16) |
    ((buf[off + 2] & 0xff) << 8) |
    (buf[off + 3] & 0xff)
  ) >>> 0;
}

function readU64(buf, off) {
  return readU32(buf, off) * 4294967296 + readU32(buf, off + 4);
}

function writeU32(buf, off, value) {
  const n = value >>> 0;
  buf[off] = (n >>> 24) & 0xff;
  buf[off + 1] = (n >>> 16) & 0xff;
  buf[off + 2] = (n >>> 8) & 0xff;
  buf[off + 3] = n & 0xff;
}

function clone(buf, start, size) {
  return buf.slice(start, start + size);
}

function boxSize(buf, off) {
  if (off + 4 > buf.length) return 0;
  const n = readU32(buf, off);
  if (n === 1) return Number(readU64(buf, off + 8));
  if (n === 0) return buf.length - off;
  return n;
}

function boxType(buf, off) {
  if (off + 8 > buf.length) return "";
  return ascii(buf, off + 4);
}

/* Iterate the boxes within [scopeStart, scopeEnd), calling cb(box). All
   callers pass the CONTAINER's payload range (start+8) so the walk sees the
   children, not the container header. */
function eachBox(buf, scopeStart, scopeEnd, cb) {
  let off = scopeStart;
  while (off + 8 <= scopeEnd) {
    const size = boxSize(buf, off);
    if (size < 8 || off + size > scopeEnd) break;
    cb({ type: boxType(buf, off), start: off, size, end: off + size });
    off += size;
  }
}

function boxChildren(buf, parent) {
  const out = [];
  eachBox(buf, parent.start + 8, parent.end, (box) => out.push(box));
  return out;
}

function findBox(buf, scopeStart, scopeEnd, type) {
  let found = null;
  eachBox(buf, scopeStart, scopeEnd, (box) => {
    if (!found && box.type === type) found = box;
  });
  return found;
}

function listBoxes(buf, scopeStart, scopeEnd, type) {
  const out = [];
  eachBox(buf, scopeStart, scopeEnd, (box) => {
    if (!type || box.type === type) out.push(box);
  });
  return out;
}

/* tkhd: size(4) type(4) version_flags(4) creation(4|8) modification(4|8)
   track_ID(4) → v0 at +20, v1 at +24. */
function tkhdTrackId(buf, off) {
  const version = buf[off + 8] & 0xff;
  return readU32(buf, off + (version === 1 ? 24 : 20));
}

/* trex / tfhd: size(4) type(4) version_flags(4) track_ID(4) → always +12. */
function trackIdAt12(buf, off) {
  return readU32(buf, off + 12);
}

function writeAt12(buf, off, id) {
  writeU32(buf, off + 12, id);
}

function writeTkhdId(buf, off, id) {
  const version = buf[off + 8] & 0xff;
  writeU32(buf, off + (version === 1 ? 24 : 20), id);
}

function concatBytes(...parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function rebuildBox(type, payloads) {
  let size = 8;
  for (const p of payloads) size += p.length;
  const out = new Uint8Array(size);
  writeU32(out, 0, size);
  let off = 4;
  for (const ch of type) out[off++] = ch.charCodeAt(0);
  for (const p of payloads) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/* Remap every tkhd id inside a trak's payload. */
function remapTrakIds(trakBytes, from, to) {
  const copy = clone(trakBytes, 0, trakBytes.length);
  let off = 8;
  while (off + 8 <= copy.length) {
    if (boxType(copy, off) === "tkhd" && tkhdTrackId(copy, off) === from) writeTkhdId(copy, off, to);
    const size = boxSize(copy, off);
    if (size < 8) break;
    off += size;
  }
  return copy;
}

/* Remap every trex id inside a mvex payload. */
function remapMvexTrex(mvexBytes, from, to) {
  const copy = clone(mvexBytes, 0, mvexBytes.length);
  let off = 0;
  while (off + 8 <= copy.length) {
    if (boxType(copy, off) === "trex" && trackIdAt12(copy, off) === from) writeAt12(copy, off, to);
    const size = boxSize(copy, off);
    if (size < 8) break;
    off += size;
  }
  return copy;
}

/* Highest track id across the moov, or 0 when none. */
function maxTrackId(buf, moovBox) {
  let maxId = 0;
  for (const trak of boxChildren(buf, moovBox)) {
    const tkhd = findBox(buf, trak.start + 8, trak.end, "tkhd");
    if (tkhd) maxId = Math.max(maxId, tkhdTrackId(buf, tkhd.start));
  }
  return maxId;
}

/* Merge the video + audio init segments into one ftyp + moov.
   Returns { init, audioTrackId } where audioTrackId is the remapped id the
   per-fragment audio bytes must carry. */
export function buildMuxedInit(videoInit, audioInit) {
  if (!videoInit || !videoInit.length || !audioInit || !audioInit.length) {
    throw new Error("CineSrc init segments missing (cannot mux audio).");
  }
  const vFtyp = findBox(videoInit, 0, videoInit.length, "ftyp");
  const vMoov = findBox(videoInit, 0, videoInit.length, "moov");
  const aMoov = findBox(audioInit, 0, audioInit.length, "moov");
  if (!vFtyp || !vMoov || !aMoov) {
    throw new Error("CineSrc init segments are not valid MP4 (missing ftyp/moov).");
  }

  const vMvhd = findBox(videoInit, vMoov.start + 8, vMoov.end, "mvhd");
  const vTrak = findBox(videoInit, vMoov.start + 8, vMoov.end, "trak");
  const aTrak = findBox(audioInit, aMoov.start + 8, aMoov.end, "trak");
  if (!vTrak || !aTrak || !vMvhd) {
    throw new Error("CineSrc init segments are not valid MP4 (missing tracks).");
  }

  const videoId = tkhdTrackId(videoInit, vTrak.start) || 1;
  let audioId = tkhdTrackId(audioInit, aTrak.start) || 1;
  const originalAudioId = audioId;
  if (audioId === videoId) audioId = videoId + 1;
  audioId = Math.max(audioId, maxTrackId(videoInit, vMoov) + 1, maxTrackId(audioInit, aMoov) + 1);

  const videoTrack = clone(videoInit, vTrak.start, vTrak.size);
  const audioTrack =
    originalAudioId === audioId
      ? clone(audioInit, aTrak.start, aTrak.size)
      : remapTrakIds(clone(audioInit, aTrak.start, aTrak.size), originalAudioId, audioId);

  // Merge mvex: keep the video trex rows, then the audio trex rows (remapped).
  const trexParts = [];
  const vMvex = findBox(videoInit, vMoov.start + 8, vMoov.end, "mvex");
  const aMvex = findBox(audioInit, aMoov.start + 8, aMoov.end, "mvex");
  if (vMvex) {
    for (const trex of boxChildren(videoInit, vMvex)) trexParts.push(clone(videoInit, trex.start, trex.size));
  }
  if (aMvex) {
    for (const trex of boxChildren(audioInit, aMvex)) {
      const from = trackIdAt12(audioInit, trex.start);
      const row = from === audioId ? clone(audioInit, trex.start, trex.size) : remapMvexTrex(clone(audioInit, trex.start, trex.size), from, audioId);
      trexParts.push(row);
    }
  }
  const mvex = trexParts.length > 0 ? rebuildBox("mvex", trexParts) : null;

  const moovPayloads = [clone(videoInit, vMvhd.start, vMvhd.size), videoTrack, audioTrack];
  if (mvex) moovPayloads.push(mvex);
  const moov = rebuildBox("moov", moovPayloads);

  return {
    init: concatBytes(clone(videoInit, vFtyp.start, vFtyp.size), moov),
    audioTrackId: audioId,
  };
}

/* Strip a segment down to its moof+mdat pairs (drop styp/sidx/prft). Returns
   an array of { type, bytes } in original order. */
export function extractTrackBytes(segmentBytes) {
  const out = [];
  eachBox(segmentBytes, 0, segmentBytes.length, (box) => {
    if (box.type === "moof" || box.type === "mdat") out.push({ type: box.type, bytes: clone(segmentBytes, box.start, box.size) });
  });
  return out;
}

/* Remap every tfhd track id inside a moof payload. Returns a copy. */
export function remapMoofTrackId(moofBytes, to) {
  const copy = clone(moofBytes, 0, moofBytes.length);
  const walk = (start, end) => {
    for (const traf of listBoxes(copy, start, end, "traf")) {
      for (const child of boxChildren(copy, traf)) {
        if (child.type === "tfhd") writeAt12(copy, child.start, to);
      }
    }
  };
  // The payload is a moof box (children from +8) or a file starting at a moof.
  if (boxType(copy, 0) === "moof") walk(8, copy.length);
  else {
    for (const moof of boxChildren(copy, { start: 0, end: copy.length })) {
      if (moof.type === "moof") walk(moof.start + 8, moof.end);
    }
  }
  return copy;
}

/* Combine one video + one audio segment (raw HLS m4s payloads) into the
   interleaved bytes for output position `index`:
   [video moof+mdat…, audio moof+mdat…]. */
export function muxSegment(videoBytes, audioBytes, audioTrackId) {
  const out = [];
  for (const part of extractTrackBytes(videoBytes)) out.push(part.bytes);
  for (const part of extractTrackBytes(audioBytes)) {
    out.push(part.type === "moof" ? remapMoofTrackId(part.bytes, audioTrackId) : part.bytes);
  }
  return concatBytes(...out);
}