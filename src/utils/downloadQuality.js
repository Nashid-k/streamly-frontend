// Shared download-quality helpers for the browser-only download flow.
// Pure string/math helpers — no DOM, no fetch — so they unit-test cleanly
// in jsdom and can run inside the Vercel function too.

const KIND_TS = "ts";
export const KIND_FMP4 = "fmp4";

// Resolve a possibly-relative URI against the playlist's base URL.
function resolveUrl(base, ref) {
  if (!base) return ref;
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

/* Parse EXT-X-STREAM-INF attributes into a key/value map.
   "BANDWIDTH=3060000,RESOLUTION=1920x1080,CODECS=\"avc1.640028,mp4a.40.2\"" */
function parseAttr(line) {
  const out = {};
  // Match key="value" OR key=value, separated by commas (values can contain
  // commas, so split on the attr boundary instead of naively on ",").
  const re = /([A-Z0-9_-]+)=("([^"]*)"|([^,]*))/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    out[m[1]] = m[3] !== undefined ? m[3] : m[4];
  }
  return out;
}

/* Cosmetics heuristic for HDR. Airtight detection needs the VVC/HEVC
   profile+10-bit signals in CODECS and video-range metadata is only partially
   surfaced in playlists, so we treat Dolby Vision start codes (dvh1/dvhe), HEVC
   strings carrying a 10-bit tier/profile suffix (.10 / L93.B0) and explicit
   hdr10/pq markers as HDR-capable. Everything else (avc1/vp9 8-bit, av01 without
   markers) reads as SDR. */
export function isHdrCodecs(codecs = "") {
  const c = codecs.trim();
  if (!c) return false;
  if (/\b(dvh1|dvhe|dvh[0-9])\b/i.test(c)) return true;
  if (/\bhdr10\b|\b_PQ\b|\.BT\.2020/i.test(c)) return true;
  if (/^hev1\./.test(c) && /\.(10|l93\.b0|l92\.b0)(\.|$)/i.test(c)) return true;
  return false;
}

// Resolution rung only. No bitrate, no transport.
export function resolutionLabel(width, height) {
  const h = Number(height) || 0;
  const w = Number(width) || 0;
  // Rank by the shorter edge so 2560x1440 reads as 2K, 3840x2160 as 4K.
  const px = h && w ? Math.min(h, w) : Math.max(h, w);
  if (px >= 2160) return "4K";
  if (px >= 1440) return "2K";
  if (px >= 1080) return "1080p";
  if (px >= 720) return "720p";
  return "480p";
}

/* HDR/SDR/60fps are only ever shown when the playlist actually says so.
   Anything unproven (no VIDEO-RANGE, no colour transfer, no codec string, no
   FRAME-RATE) gets no tag rather than a guess. */
export function rangeTag(v = {}) {
  const vr = String(v.videoRange || "").toUpperCase();
  const ct = String(v.colorTransfer || "").toLowerCase();
  if (vr === "PQ" || vr === "HLG" || /smpte2084|arib-std-b67/.test(ct)) return "HDR";
  if (v.hdr === true || isHdrCodecs(v.codecs || "")) return "HDR";
  if (vr === "SDR") return "SDR";
  // AVC cannot carry HDR, so a plain avc1/avc3 string is a proven SDR ladder.
  if (/^avc[13]\./i.test(String(v.codecs || "").trim())) return "SDR";
  return "";
}

// 60fps covers 59.94 and 60 (>=55); 24/25/30/50 are the assumed default and stay mute.
export function fpsTag(framerate) {
  const f = Number(framerate) || 0;
  return f >= 55 ? "60fps" : "";
}

export function variantLabel(v) {
  const res = resolutionLabel(v.width, v.height);
  const tags = [rangeTag(v), fpsTag(v.framerate)].filter(Boolean);
  return tags.length > 0 ? `${res} ${tags.join(" · ")}` : res;
}

// Master playlist -> media variant list. A playlist with no STREAM-INF rows
// is itself the single rendition (its URI is the current source).
export function parseMasterPlaylist(text, baseUrl) {
  const lines = String(text || "").split(/\r?\n/);
  const variants = [];
  let pending = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-STREAM-INF:")) {
      const attrs = parseAttr(line.slice("#EXT-X-STREAM-INF:".length));
      pending = {
        uri: null,
        bandwidth: Number(attrs.BANDWIDTH) || 0,
        width: Number(attrs.RESOLUTION?.split("x")[0]) || 0,
        height: Number(attrs.RESOLUTION?.split("x")[1]) || 0,
        framerate: Number(attrs["FRAME-RATE"]) || 0,
        codecs: attrs.CODECS || "",
        hdr: isHdrCodecs(attrs.CODECS || ""),
        videoRange: String(attrs["VIDEO-RANGE"] || "").toUpperCase(),
        colorTransfer: String(attrs["COLOR-TRANSFER"] || "").toLowerCase(),
        audio: attrs.AUDIO || null,
        video: attrs.VIDEO || null,
      };
      continue;
    }
    if (line.startsWith("#")) continue;
    if (pending) {
      pending.uri = resolveUrl(baseUrl, line);
      variants.push(pending);
      pending = null;
    }
  }
  if (variants.length === 0 && baseUrl) {
    variants.push({
      uri: baseUrl,
      bandwidth: 0,
      width: 0,
      height: 0,
      framerate: 0,
      codecs: "",
      hdr: false,
      videoRange: "",
      colorTransfer: "",
    });
  }
  return variants;
}

// Child/media playlist -> concrete segment list.
// fMP4 playlists carry an EXT-X-MAP init segment (needed to prepend).
export function parseMediaPlaylist(text, baseUrl) {
  const lines = String(text || "").split(/\r?\n/);
  const segments = [];
  let initUrl = null;
  let kind = KIND_TS;
  let duration = 0;
  let byterange = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#EXT-X-MAP:")) {
      const attrs = parseAttr(line.slice("#EXT-X-MAP:".length));
      initUrl = resolveUrl(baseUrl, attrs.URI || "");
      kind = KIND_FMP4;
      continue;
    }
    if (line.startsWith("#EXT-X-BYTERANGE:")) {
      byterange = line.slice("#EXT-X-BYTERANGE:".length).trim();
      continue;
    }
    if (line.startsWith("#EXTINF:")) {
      const m = line.match(/#EXTINF:\s*([\d.]+)/);
      const dur = m ? Number(m[1]) : 0;
      duration += Number.isFinite(dur) ? dur : 0;
      continue;
    }
    if (line.startsWith("#")) continue;
    segments.push({
      url: resolveUrl(baseUrl, line),
      duration,
      byterange,
    });
  }
  return { kind, initUrl, segments, duration, count: segments.length };
}

/* EXT-X-MEDIA audio renditions (RFC 8216 §4.3.4.1) from a master playlist. Some
   providers keep audio as a SEPARATE stream whose own media playlist + init +
   fragments the master's STREAM-INF rows never point at; `default`/`autoselect`
   follow the HLS spec. No production caller left (the downloader is video-only
   since the muxing provider was removed) — kept as a tested pure parser. */
export function parseAudioGroups(text, baseUrl) {
  const lines = String(text || "").split(/\r?\n/);
  const out = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith("#EXT-X-MEDIA:")) continue;
    const attrs = parseAttr(line.slice("#EXT-X-MEDIA:".length));
    if (String(attrs.TYPE || "").toUpperCase() !== "AUDIO") continue;
    const uri = attrs.URI || "";
    out.push({
      groupId: attrs["GROUP-ID"] || "",
      name: attrs.NAME || attrs.LANGUAGE || "",
      language: attrs.LANGUAGE || "",
      default: attrs.DEFAULT === "YES",
      autoselect: attrs.AUTOSELECT === "YES",
      uri,
      url: uri ? resolveUrl(baseUrl, uri) : "",
    });
  }
  return out;
}

export function estimateBytes(bandwidth, seconds) {
  if (!bandwidth || !seconds) return 0;
  return Math.round((bandwidth / 8) * seconds);
}

export function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / Math.pow(1024, i);
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function safeFileName(name) {
  return String(name || "download")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}